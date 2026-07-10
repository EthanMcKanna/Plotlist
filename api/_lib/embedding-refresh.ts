// Incremental embedding refresh for recommendations v2.
//
// Two halves:
//   1. markStaleEmbeddingsFromIngest — called from the bulk ingest tick with
//      freshly upserted show rows; compares base-field hashes and nominates
//      changed/new shows as status='stale' (no network, no Gemini cost).
//   2. runEmbeddingRefreshTick — EMBEDDING_REFRESH_CRON drains stale rows:
//      TMDB enrichment fetch → full doc → hash compare → embed only real
//      changes → Vectorize upsert → facet assignment → state update.
//
// A UTC-day token budget in ingest_sync_meta caps worst-case Gemini spend.
// See docs/recommendations-v2.md.

import { and, asc, eq, inArray } from "drizzle-orm";

import {
  facetDefs,
  ingestSyncMeta,
  showEmbeddingState,
  showFacets,
  shows,
} from "../../db/schema";
import { db } from "./db";
import { createId } from "./ids";
import { embedTexts, estimateEmbeddingTokens } from "./gemini";
import { getVectorizeIndex } from "../../worker/vectorize";
import {
  buildShowEmbeddingDocV2,
  computeBaseInputHash,
  computeEmbeddingInputHash,
  extractEnrichmentFromTmdbDetails,
  isShowWorthEmbedding,
  EMBEDDING_VERSION,
  type EmbeddingShowInput,
} from "../../lib/plotlist/embeddingDoc";
import { FACETS_PER_SHOW_MAX } from "../../lib/plotlist/facets";
import { chunkForSqlParams } from "./sql-dialect";

const DAILY_TOKEN_BUDGET = 2_000_000; // ≈ $0.40/day worst case at $0.20/1M
const ENRICH_CONCURRENCY = 8;
const MAX_FAILS_BEFORE_PARK = 4;

type ShowRow = typeof shows.$inferSelect;

function showToEmbeddingInput(show: ShowRow): EmbeddingShowInput {
  return {
    title: show.title,
    originalTitle: show.originalTitle,
    year: show.year,
    overview: show.overview,
    genreIds: show.genreIds ?? [],
    originalLanguage: show.originalLanguage,
    originCountries: show.originCountries ?? [],
  };
}

// Called from the ingest tick after shows are upserted. Rows must be
// re-resolved by external id — ON CONFLICT upserts keep the original show id,
// so freshly built rows can carry ids that never landed. Cheap: two batched
// reads plus writes only for genuinely new/changed shows.
export async function markStaleEmbeddingsFromIngest(externalIds: string[]) {
  if (externalIds.length === 0) return { nominated: 0 };

  const canonical: ShowRow[] = [];
  for (const chunk of chunkForSqlParams(externalIds, 1)) {
    canonical.push(
      ...(await db
        .select()
        .from(shows)
        .where(and(eq(shows.externalSource, "tmdb"), inArray(shows.externalId, chunk)))),
    );
  }
  const worth = canonical.filter((show) =>
    isShowWorthEmbedding({
      overview: show.overview,
      tmdbPopularity: show.tmdbPopularity,
      tmdbVoteCount: show.tmdbVoteCount,
    }),
  );
  if (worth.length === 0) return { nominated: 0 };

  const existing: Array<typeof showEmbeddingState.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(worth.map((show) => show.id), 1)) {
    existing.push(
      ...(await db
        .select()
        .from(showEmbeddingState)
        .where(inArray(showEmbeddingState.showId, chunk))),
    );
  }
  const stateByShowId = new Map(existing.map((state) => [state.showId, state]));

  const now = Date.now();
  const statements: unknown[] = [];
  for (const show of worth) {
    const baseHash = computeBaseInputHash(showToEmbeddingInput(show));
    const state = stateByShowId.get(show.id);
    if (state && state.baseInputHash === baseHash && state.embeddingVersion === EMBEDDING_VERSION) {
      continue;
    }
    if (state && state.status === "failed" && state.failCount >= MAX_FAILS_BEFORE_PARK) {
      continue;
    }
    if (state) {
      statements.push(
        db
          .update(showEmbeddingState)
          .set({ status: "stale", baseInputHash: baseHash, updatedAt: now })
          .where(eq(showEmbeddingState.id, state.id)),
      );
    } else {
      statements.push(
        db.insert(showEmbeddingState).values({
          id: createId("embst"),
          showId: show.id,
          tmdbId: Number(show.externalId) || null,
          embeddingVersion: EMBEDDING_VERSION,
          inputHash: "",
          baseInputHash: baseHash,
          status: "stale",
          failCount: 0,
          lastError: null,
          embeddedAt: null,
          updatedAt: now,
        }),
      );
    }
  }
  for (let offset = 0; offset < statements.length; offset += 40) {
    const group = statements.slice(offset, offset + 40);
    await db.batch(group as any);
  }
  return { nominated: statements.length };
}

async function readDailyTokens(dayKey: string) {
  const rows = await db.select().from(ingestSyncMeta).where(eq(ingestSyncMeta.key, dayKey)).limit(1);
  return Number(rows[0]?.value ?? 0);
}

async function addDailyTokens(dayKey: string, tokens: number) {
  const current = await readDailyTokens(dayKey);
  const next = String(current + tokens);
  const now = Date.now();
  if (current === 0) {
    await db
      .insert(ingestSyncMeta)
      .values({ key: dayKey, value: next, updatedAt: now })
      .onConflictDoUpdate({
        target: ingestSyncMeta.key,
        set: { value: next, updatedAt: now },
      });
  } else {
    await db
      .update(ingestSyncMeta)
      .set({ value: next, updatedAt: now })
      .where(eq(ingestSyncMeta.key, dayKey));
  }
}

type FacetCalibration = {
  embeddingVersion: string;
  facets: Record<string, { mean: number; std: number }>;
};

async function loadFacetCalibration(): Promise<FacetCalibration | null> {
  const rows = await db
    .select()
    .from(ingestSyncMeta)
    .where(eq(ingestSyncMeta.key, "facet_calibration"))
    .limit(1);
  if (!rows[0]?.value) return null;
  try {
    const parsed = JSON.parse(rows[0].value) as FacetCalibration;
    return parsed.embeddingVersion === EMBEDDING_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function dotUnit(a: number[], b: number[]) {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) sum += a[index] * b[index];
  return sum;
}

// Same calibration formula as scripts/embed-catalog.ts phaseFacets.
function calibratedFacetScore(raw: number, stats: { mean: number; std: number }) {
  const z = (raw - stats.mean) / Math.max(stats.std, 1e-6);
  return 1 / (1 + Math.exp(-(1.1 * z - 1.3)));
}

async function assignFacetsForShow(
  showId: string,
  vector: number[],
  facetRows: Array<typeof facetDefs.$inferSelect>,
  calibration: FacetCalibration | null,
) {
  const scored: Array<{ key: string; score: number }> = [];
  for (const facet of facetRows) {
    const raw = dotUnit(vector, facet.queryVector);
    const stats = calibration?.facets[facet.key];
    const score = stats ? calibratedFacetScore(raw, stats) : raw;
    if (score >= 0.5) scored.push({ key: facet.key, score: Number(score.toFixed(4)) });
  }
  scored.sort((left, right) => right.score - left.score);
  const top = scored.slice(0, FACETS_PER_SHOW_MAX);

  const now = Date.now();
  await db.delete(showFacets).where(eq(showFacets.showId, showId));
  if (top.length > 0) {
    await db.insert(showFacets).values(
      top.map((facet, rank) => ({
        id: `shfct_${showId}_${facet.key}`,
        showId,
        facetKey: facet.key,
        score: facet.score,
        rank: rank + 1,
        updatedAt: now,
      })),
    );
  }
}

async function fetchTmdbEnrichment(tmdbId: number) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY missing");
  const response = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&append_to_response=keywords,credits,content_ratings`,
  );
  if (response.status === 404) {
    const error: any = new Error("tmdb 404");
    error.status = 404;
    throw error;
  }
  if (!response.ok) {
    throw new Error(`tmdb enrichment failed (${response.status})`);
  }
  return extractEnrichmentFromTmdbDetails(await response.json());
}

export async function runEmbeddingRefreshTick(maxShows = 40) {
  const index = getVectorizeIndex();
  if (!index) return { skipped: "no vectorize binding" };
  if (!process.env.GEMINI_API_KEY) return { skipped: "no gemini key" };

  const dayKey = `embedding_daily_tokens:${new Date().toISOString().slice(0, 10)}`;
  const usedTokens = await readDailyTokens(dayKey);
  if (usedTokens >= DAILY_TOKEN_BUDGET) {
    return { skipped: "daily token budget exhausted", usedTokens };
  }

  const staleRows = await db
    .select()
    .from(showEmbeddingState)
    .where(eq(showEmbeddingState.status, "stale"))
    .orderBy(asc(showEmbeddingState.updatedAt))
    .limit(maxShows);
  if (staleRows.length === 0) return { processed: 0 };

  const showRows = await db
    .select()
    .from(shows)
    .where(inArray(shows.id, staleRows.map((state) => state.showId)));
  const showById = new Map(showRows.map((show) => [show.id, show]));
  const now = Date.now();

  // Enrich with bounded concurrency.
  const jobs = staleRows
    .map((state) => ({ state, show: showById.get(state.showId) }))
    .filter((job): job is { state: (typeof staleRows)[number]; show: ShowRow } => Boolean(job.show));
  const docs = new Array<string | null>(jobs.length).fill(null);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(ENRICH_CONCURRENCY, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const jobIndex = cursor;
        cursor += 1;
        const job = jobs[jobIndex];
        try {
          const tmdbId = job.state.tmdbId ?? (Number(job.show.externalId) || null);
          const enrichment = tmdbId ? await fetchTmdbEnrichment(tmdbId) : {};
          docs[jobIndex] = buildShowEmbeddingDocV2(showToEmbeddingInput(job.show), enrichment);
        } catch (error: any) {
          if (error?.status === 404) {
            await db
              .update(showEmbeddingState)
              .set({
                status: "failed",
                failCount: job.state.failCount + 1,
                lastError: "tmdb 404",
                updatedAt: now,
              })
              .where(eq(showEmbeddingState.id, job.state.id));
          } else {
            // Base row still embeds fine without enrichment.
            docs[jobIndex] = buildShowEmbeddingDocV2(showToEmbeddingInput(job.show));
          }
        }
      }
    }),
  );

  const toEmbed: Array<{ job: (typeof jobs)[number]; doc: string; hash: string }> = [];
  let unchanged = 0;
  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex += 1) {
    const doc = docs[jobIndex];
    if (!doc) continue;
    const hash = computeEmbeddingInputHash(doc);
    const job = jobs[jobIndex];
    if (hash === job.state.inputHash && job.state.embeddedAt) {
      unchanged += 1;
      await db
        .update(showEmbeddingState)
        .set({ status: "embedded", updatedAt: now })
        .where(eq(showEmbeddingState.id, job.state.id));
      continue;
    }
    toEmbed.push({ job, doc, hash });
  }

  let embedded = 0;
  if (toEmbed.length > 0) {
    const tokens = toEmbed.reduce((sum, entry) => sum + estimateEmbeddingTokens(entry.doc), 0);
    if (usedTokens + tokens > DAILY_TOKEN_BUDGET) {
      return { skipped: "daily token budget would be exceeded", usedTokens, pending: toEmbed.length };
    }
    const vectors = await embedTexts(
      toEmbed.map((entry) => entry.doc),
      { taskType: "RETRIEVAL_DOCUMENT" },
    );
    await addDailyTokens(dayKey, tokens);

    const [facetRows, calibration] = await Promise.all([
      db.select().from(facetDefs),
      loadFacetCalibration(),
    ]);

    await index.upsert(
      toEmbed.map((entry, entryIndex) => ({
        id: entry.job.show.id,
        values: vectors[entryIndex],
        metadata: {
          lang: entry.job.show.originalLanguage ?? "",
          year: entry.job.show.year ?? 0,
          pop: entry.job.show.tmdbPopularity ?? 0,
          va: entry.job.show.tmdbVoteAverage ?? 0,
          vc: entry.job.show.tmdbVoteCount ?? 0,
        },
      })),
    );

    for (let entryIndex = 0; entryIndex < toEmbed.length; entryIndex += 1) {
      const entry = toEmbed[entryIndex];
      await assignFacetsForShow(entry.job.show.id, vectors[entryIndex], facetRows, calibration);
      await db
        .update(showEmbeddingState)
        .set({
          status: "embedded",
          inputHash: entry.hash,
          embeddingVersion: EMBEDDING_VERSION,
          failCount: 0,
          lastError: null,
          embeddedAt: now,
          updatedAt: now,
        })
        .where(eq(showEmbeddingState.id, entry.job.state.id));
      embedded += 1;
    }
  }

  return { processed: jobs.length, embedded, unchanged };
}
