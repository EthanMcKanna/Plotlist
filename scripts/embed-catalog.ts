/**
 * Recommendations v2 catalog backfill (docs/recommendations-v2.md).
 *
 * Pulls candidate shows from prod D1, enriches them from TMDB
 * (keywords/credits/content_ratings), builds embedding docs, embeds them with
 * gemini-embedding-2, assigns facets, and uploads vectors to Vectorize +
 * state/facets to D1. Every phase checkpoints into a local SQLite DB
 * (output/embed-catalog.sqlite) and is safe to re-run / resume.
 *
 * Usage:
 *   npx tsx scripts/embed-catalog.ts --wave 1            # run all phases
 *   npx tsx scripts/embed-catalog.ts --wave 1 --phase enrich
 *   npx tsx scripts/embed-catalog.ts --wave 1 --dry-run  # cost estimate only
 *   npx tsx scripts/embed-catalog.ts --calibrate         # facet score report
 *   npx tsx scripts/embed-catalog.ts --verify "show_..." # sanity-check neighbors
 *
 * Spend guards: --max-spend-usd (default 12) caps cumulative estimated Gemini
 * spend across ALL runs (tracked in the checkpoint DB).
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  buildShowEmbeddingDocV2,
  computeBaseInputHash,
  computeEmbeddingInputHash,
  extractEnrichmentFromTmdbDetails,
  isShowWorthEmbedding,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_VERSION,
  type EmbeddingShowEnrichment,
} from "../lib/plotlist/embeddingDoc";
import { FACET_DEFS, FACETS_PER_SHOW_MAX, facetEmbeddingText } from "../lib/plotlist/facets";
import { embedTexts, estimateEmbeddingTokens, GEMINI_EMBED_BATCH_LIMIT } from "../api/_lib/gemini";

// ── Config ──────────────────────────────────────────────────────────────────

const ACCOUNT_ID = "81f9092cf8df87e41d0c4d5ac9cc7244";
const D1_DATABASE_ID = "8864a293-ae24-4153-9d76-71c228d40207";
const VECTORIZE_INDEX = "plotlist-shows-v2";
const CHECKPOINT_PATH = path.join(process.cwd(), "output", "embed-catalog.sqlite");
const USD_PER_MILLION_TOKENS = 0.2; // gemini-embedding-2 text, sync tier

const TMDB_CONCURRENCY = 24;
// Tier-1 per-minute quotas are tight: two batch calls in flight with a pause
// between them stays under the limit; 429s cool down inside callWithRetry.
const GEMINI_CONCURRENCY = 2;
const GEMINI_BATCH_PAUSE_MS = 2500;
const VECTORIZE_UPSERT_BATCH = 250;

const args = process.argv.slice(2);
function argValue(flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
const WAVE = Number(argValue("--wave") ?? 1);
const PHASE = argValue("--phase") ?? "all";
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;
const DRY_RUN = args.includes("--dry-run");
const CALIBRATE = args.includes("--calibrate");
const VERIFY_ID = argValue("--verify");
const MAX_SPEND_USD = Number(argValue("--max-spend-usd") ?? 12);

// ── Credentials ─────────────────────────────────────────────────────────────

function loadDevVars(): Record<string, string> {
  const file = path.join(process.cwd(), ".dev.vars");
  if (!existsSync(file)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}
const devVars = loadDevVars();
const TMDB_API_KEY = process.env.TMDB_API_KEY ?? devVars.TMDB_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? devVars.GEMINI_API_KEY;

const CF_AUTH_PATH = path.join(homedir(), "Library/Preferences/.cf/auth.jsonc");
let cfToken: { token: string; expiresAt: number } | null = null;

function cloudflareToken() {
  const now = Date.now();
  if (cfToken && cfToken.expiresAt - now > 5 * 60 * 1000) {
    return cfToken.token;
  }
  const read = () => {
    const raw = JSON.parse(readFileSync(CF_AUTH_PATH, "utf8"));
    return {
      token: raw.oauth_token as string,
      expiresAt: Date.parse(raw.expiration_time ?? "") || 0,
    };
  };
  cfToken = read();
  if (cfToken.expiresAt - now <= 5 * 60 * 1000) {
    // `cf auth whoami` refreshes the OAuth token in place (plain `cf accounts`
    // can serve from cache without refreshing).
    execSync("cf auth whoami", { stdio: "ignore" });
    cfToken = read();
  }
  return cfToken.token;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  { attempts = 5, label = "request" }: { attempts?: number; label?: string } = {},
): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return await response.json();
      const body = await response.text();
      if (response.status === 404) {
        const error: any = new Error(`${label} 404`);
        error.status = 404;
        throw error;
      }
      lastError = new Error(`${label} failed (${response.status}): ${body.slice(0, 200)}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error: any) {
      if (error?.status === 404) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await sleep(Math.min(1200 * 2 ** (attempt - 1), 20_000) + Math.random() * 400);
  }
  throw lastError ?? new Error(`${label} failed`);
}

async function d1Query(sql: string, params: unknown[] = []): Promise<any[]> {
  const payload = await fetchJsonWithRetry(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${cloudflareToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
    { label: "d1 query" },
  );
  if (!payload.success) {
    throw new Error(`d1 query failed: ${JSON.stringify(payload.errors).slice(0, 300)}`);
  }
  return payload.result?.[0]?.results ?? [];
}

function sqlString(value: string | null | undefined) {
  if (value === null || value === undefined) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

// ── Checkpoint DB ───────────────────────────────────────────────────────────

mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
const db = new DatabaseSync(CHECKPOINT_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS catalog (
    show_id TEXT PRIMARY KEY,
    tmdb_id INTEGER,
    title TEXT,
    original_title TEXT,
    year INTEGER,
    overview TEXT,
    genre_ids TEXT,
    original_language TEXT,
    origin_countries TEXT,
    popularity REAL,
    vote_average REAL,
    vote_count INTEGER,
    attached INTEGER DEFAULT 0,
    wave INTEGER,
    enrichment TEXT,
    enriched_at INTEGER,
    doc TEXT,
    input_hash TEXT,
    vector BLOB,
    embedded_at INTEGER,
    facet_scores BLOB,
    facets TEXT,
    uploaded_vector_at INTEGER,
    uploaded_state_at INTEGER,
    uploaded_facets_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS catalog_wave_idx ON catalog (wave);
  CREATE TABLE IF NOT EXISTS facet_vectors (
    key TEXT PRIMARY KEY,
    vector BLOB,
    embedding_version TEXT
  );
`);

function metaGet(key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as any;
  return row?.value ?? null;
}
function metaSet(key: string, value: string) {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function spentTokens(): number {
  return Number(metaGet("gemini_tokens") ?? 0);
}
function addSpentTokens(tokens: number) {
  metaSet("gemini_tokens", String(spentTokens() + tokens));
}
function spentUsd() {
  return (spentTokens() / 1_000_000) * USD_PER_MILLION_TOKENS;
}
function assertBudget(extraTokens: number) {
  const projected = ((spentTokens() + extraTokens) / 1_000_000) * USD_PER_MILLION_TOKENS;
  if (projected > MAX_SPEND_USD) {
    throw new Error(
      `Spend guard: projected $${projected.toFixed(2)} exceeds --max-spend-usd ${MAX_SPEND_USD}. ` +
        `Spent so far: $${spentUsd().toFixed(2)}.`,
    );
  }
}

function vecToBlob(vector: number[]) {
  return Buffer.from(new Float32Array(vector).buffer);
}
function blobToVec(blob: Uint8Array): number[] {
  return Array.from(
    new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Phase: pull ─────────────────────────────────────────────────────────────

async function phasePull() {
  console.log("[pull] loading user-attached show ids…");
  const attachedRows = await d1Query(`
    SELECT show_id FROM watch_states
    UNION SELECT show_id FROM reviews
    UNION SELECT show_id FROM watch_logs
    UNION SELECT show_id FROM list_items
  `);
  const attached = new Set<string>(attachedRows.map((row: any) => row.show_id));
  const prefRows = await d1Query("SELECT favorite_show_ids FROM user_taste_preferences");
  for (const row of prefRows) {
    try {
      for (const id of JSON.parse(row.favorite_show_ids ?? "[]")) attached.add(id);
    } catch {
      // Malformed favorites JSON — skip the row.
    }
  }
  console.log(`[pull] ${attached.size} user-attached shows`);

  const insert = db.prepare(`
    INSERT INTO catalog (
      show_id, tmdb_id, title, original_title, year, overview, genre_ids,
      original_language, origin_countries, popularity, vote_average, vote_count,
      attached, wave
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(show_id) DO UPDATE SET
      tmdb_id = excluded.tmdb_id,
      title = excluded.title,
      original_title = excluded.original_title,
      year = excluded.year,
      overview = excluded.overview,
      genre_ids = excluded.genre_ids,
      original_language = excluded.original_language,
      origin_countries = excluded.origin_countries,
      popularity = excluded.popularity,
      vote_average = excluded.vote_average,
      vote_count = excluded.vote_count,
      attached = excluded.attached,
      wave = excluded.wave
  `);

  let cursor = metaGet("pull_cursor") ?? "";
  let total = Number(metaGet("pull_count") ?? 0);
  for (;;) {
    const rows = await d1Query(
      `SELECT id, external_id, title, original_title, year, overview, genre_ids,
              original_language, origin_countries, tmdb_popularity, tmdb_vote_average, tmdb_vote_count
       FROM shows
       WHERE external_source = 'tmdb' AND id > ?
       ORDER BY id
       LIMIT 2000`,
      [cursor],
    );
    if (rows.length === 0) break;
    db.exec("BEGIN");
    for (const row of rows) {
      const isAttached = attached.has(row.id) ? 1 : 0;
      const popularity = row.tmdb_popularity ?? 0;
      const voteCount = row.tmdb_vote_count ?? 0;
      const worth = isShowWorthEmbedding({
        overview: row.overview,
        tmdbPopularity: popularity,
        tmdbVoteCount: voteCount,
      });
      const wave = isAttached || popularity >= 2 || voteCount >= 5 ? 1 : worth ? 2 : 0;
      insert.run(
        row.id,
        Number(row.external_id) || null,
        row.title,
        row.original_title,
        row.year,
        row.overview,
        row.genre_ids,
        row.original_language,
        row.origin_countries,
        popularity,
        row.tmdb_vote_average,
        voteCount,
        isAttached,
        wave,
      );
    }
    db.exec("COMMIT");
    total += rows.length;
    cursor = rows[rows.length - 1].id;
    metaSet("pull_cursor", cursor);
    metaSet("pull_count", String(total));
    process.stdout.write(`\r[pull] ${total} shows`);
  }
  console.log(`\n[pull] done (${total} rows pulled)`);
  const counts = db
    .prepare("SELECT wave, COUNT(*) AS count FROM catalog GROUP BY wave ORDER BY wave")
    .all() as any[];
  for (const row of counts) console.log(`[pull] wave ${row.wave}: ${row.count}`);
}

// ── Phase: enrich ───────────────────────────────────────────────────────────

async function phaseEnrich() {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY missing (env or .dev.vars)");
  const rows = db
    .prepare(
      `SELECT show_id, tmdb_id FROM catalog
       WHERE wave = ? AND wave > 0 AND enriched_at IS NULL AND tmdb_id IS NOT NULL
       ORDER BY popularity DESC`,
    )
    .all(WAVE) as any[];
  console.log(`[enrich] ${rows.length} shows to enrich (wave ${WAVE})`);
  if (DRY_RUN) return;

  const save = db.prepare("UPDATE catalog SET enrichment = ?, enriched_at = ? WHERE show_id = ?");
  let done = 0;
  let failed = 0;
  await mapWithConcurrency(rows, TMDB_CONCURRENCY, async (row) => {
    try {
      const payload = await fetchJsonWithRetry(
        `https://api.themoviedb.org/3/tv/${row.tmdb_id}?api_key=${TMDB_API_KEY}&append_to_response=keywords,credits,content_ratings`,
        {},
        { label: "tmdb", attempts: 4 },
      );
      const enrichment = extractEnrichmentFromTmdbDetails(payload);
      save.run(JSON.stringify(enrichment), Date.now(), row.show_id);
    } catch {
      failed += 1;
      // 404s and hard failures still embed from the base row.
      save.run("{}", Date.now(), row.show_id);
    }
    done += 1;
    if (done % 500 === 0) process.stdout.write(`\r[enrich] ${done}/${rows.length} (${failed} failed)`);
  });
  console.log(`\n[enrich] done (${done}, ${failed} without enrichment)`);
}

// ── Phase: embed ────────────────────────────────────────────────────────────

function buildDocForRow(row: any) {
  const enrichment: EmbeddingShowEnrichment = row.enrichment ? JSON.parse(row.enrichment) : {};
  return buildShowEmbeddingDocV2(
    {
      title: row.title,
      originalTitle: row.original_title,
      year: row.year,
      overview: row.overview,
      genreIds: row.genre_ids ? JSON.parse(row.genre_ids) : [],
      originalLanguage: row.original_language,
      originCountries: row.origin_countries ? JSON.parse(row.origin_countries) : [],
    },
    enrichment,
  );
}

async function phaseEmbed() {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing (env or .dev.vars)");
  const rows = db
    .prepare(
      `SELECT * FROM catalog
       WHERE wave = ? AND enriched_at IS NOT NULL
         AND (embedded_at IS NULL OR input_hash IS NULL)
       ORDER BY popularity DESC
       ${LIMIT ? `LIMIT ${LIMIT}` : ""}`,
    )
    .all(WAVE) as any[];

  const docs = rows.map((row) => ({ row, doc: buildDocForRow(row) }));
  const totalTokens = docs.reduce((sum, item) => sum + estimateEmbeddingTokens(item.doc), 0);
  console.log(
    `[embed] ${docs.length} docs, ~${(totalTokens / 1e6).toFixed(2)}M tokens ≈ $${((totalTokens / 1e6) * USD_PER_MILLION_TOKENS).toFixed(2)} ` +
      `(cumulative so far: $${spentUsd().toFixed(2)})`,
  );
  if (DRY_RUN || docs.length === 0) return;
  assertBudget(totalTokens);

  const save = db.prepare(
    "UPDATE catalog SET doc = ?, input_hash = ?, vector = ?, embedded_at = ? WHERE show_id = ?",
  );

  const batches: Array<typeof docs> = [];
  for (let offset = 0; offset < docs.length; offset += GEMINI_EMBED_BATCH_LIMIT) {
    batches.push(docs.slice(offset, offset + GEMINI_EMBED_BATCH_LIMIT));
  }
  let embedded = 0;
  await mapWithConcurrency(batches, GEMINI_CONCURRENCY, async (batch) => {
    const texts = batch.map((item) => item.doc);
    const vectors = await embedTexts(texts, {
      apiKey: GEMINI_API_KEY,
      taskType: "RETRIEVAL_DOCUMENT",
      maxAttempts: 10,
    });
    await sleep(GEMINI_BATCH_PAUSE_MS);
    const now = Date.now();
    db.exec("BEGIN");
    for (let index = 0; index < batch.length; index += 1) {
      const { row, doc } = batch[index];
      save.run(doc, computeEmbeddingInputHash(doc), vecToBlob(vectors[index]), now, row.show_id);
    }
    db.exec("COMMIT");
    addSpentTokens(texts.reduce((sum, text) => sum + estimateEmbeddingTokens(text), 0));
    embedded += batch.length;
    process.stdout.write(
      `\r[embed] ${embedded}/${docs.length} ($${spentUsd().toFixed(2)} cumulative)`,
    );
  });
  console.log(`\n[embed] done`);
}

// ── Phase: facets ───────────────────────────────────────────────────────────

async function ensureFacetVectors() {
  const existing = db
    .prepare("SELECT COUNT(*) AS count FROM facet_vectors WHERE embedding_version = ?")
    .get(EMBEDDING_VERSION) as any;
  if (existing.count === FACET_DEFS.length) return;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  console.log(`[facets] embedding ${FACET_DEFS.length} facet queries…`);
  const vectors = await embedTexts(
    FACET_DEFS.map((facet) => facetEmbeddingText(facet)),
    { apiKey: GEMINI_API_KEY, taskType: "RETRIEVAL_QUERY" },
  );
  addSpentTokens(
    FACET_DEFS.reduce((sum, facet) => sum + estimateEmbeddingTokens(facetEmbeddingText(facet)), 0),
  );
  const save = db.prepare(
    "INSERT INTO facet_vectors (key, vector, embedding_version) VALUES (?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET vector = excluded.vector, embedding_version = excluded.embedding_version",
  );
  db.exec("BEGIN");
  FACET_DEFS.forEach((facet, index) => save.run(facet.key, vecToBlob(vectors[index]), EMBEDDING_VERSION));
  db.exec("COMMIT");
}

function dotUnit(a: Float32Array, b: Float32Array) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index];
  return sum;
}

async function phaseFacets() {
  await ensureFacetVectors();
  const facetRows = db.prepare("SELECT key, vector FROM facet_vectors").all() as any[];
  const facetOrder = FACET_DEFS.map((facet) => facet.key);
  const facetVecs = facetOrder.map((key) => {
    const row = facetRows.find((candidate) => candidate.key === key);
    if (!row) throw new Error(`missing facet vector ${key}`);
    const blob: Uint8Array = row.vector;
    return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  });

  // Pass 1: raw cosine of every embedded show against every facet.
  const pending = db
    .prepare("SELECT show_id, vector FROM catalog WHERE embedded_at IS NOT NULL AND facet_scores IS NULL")
    .all() as any[];
  console.log(`[facets] scoring ${pending.length} shows against ${facetOrder.length} facets…`);
  const saveScores = db.prepare("UPDATE catalog SET facet_scores = ? WHERE show_id = ?");
  let scored = 0;
  db.exec("BEGIN");
  for (const row of pending) {
    const blob: Uint8Array = row.vector;
    const vec = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
    const scores = new Float32Array(facetOrder.length);
    for (let index = 0; index < facetVecs.length; index += 1) {
      scores[index] = dotUnit(vec, facetVecs[index]);
    }
    saveScores.run(Buffer.from(scores.buffer), row.show_id);
    scored += 1;
    if (scored % 2000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      process.stdout.write(`\r[facets] scored ${scored}/${pending.length}`);
    }
  }
  db.exec("COMMIT");
  console.log(`\n[facets] raw scores done`);

  // Pass 2: per-facet z-score calibration over the whole embedded catalog,
  // then keep each show's top matches. Calibration makes "0.62 cosine on
  // cozy-comfort" and "0.62 on shonen-action" comparable.
  const all = db
    .prepare("SELECT show_id, facet_scores, facets FROM catalog WHERE facet_scores IS NOT NULL")
    .all() as any[];
  const count = all.length;
  const sums = new Float64Array(facetOrder.length);
  const sumSquares = new Float64Array(facetOrder.length);
  for (const row of all) {
    const blob: Uint8Array = row.facet_scores;
    const scores = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
    for (let index = 0; index < scores.length; index += 1) {
      sums[index] += scores[index];
      sumSquares[index] += scores[index] * scores[index];
    }
  }
  const means = Array.from(sums, (sum) => sum / count);
  const stds = means.map((mean, index) =>
    Math.sqrt(Math.max(sumSquares[index] / count - mean * mean, 1e-8)),
  );

  // Persist calibration so the worker's incremental refresh scores new shows
  // on the same scale (uploaded to ingest_sync_meta in the upload phase).
  metaSet(
    "facet_calibration",
    JSON.stringify({
      embeddingVersion: EMBEDDING_VERSION,
      sampleSize: count,
      facets: Object.fromEntries(
        facetOrder.map((key, index) => [
          key,
          { mean: Number(means[index].toFixed(6)), std: Number(stds[index].toFixed(6)) },
        ]),
      ),
    }),
  );

  if (CALIBRATE) {
    console.log("[facets] per-facet raw-score distribution (mean ± std):");
    facetOrder.forEach((key, index) =>
      console.log(`  ${key.padEnd(28)} ${means[index].toFixed(4)} ± ${stds[index].toFixed(4)}`),
    );
  }

  // Recalibration can change already-uploaded assignments (wave 2 shifts the
  // z-stats wave 1 was scored with), so clear the upload mark on any change.
  const saveFacets = db.prepare(
    "UPDATE catalog SET facets = ?, uploaded_facets_at = CASE WHEN ? = 1 THEN NULL ELSE uploaded_facets_at END WHERE show_id = ?",
  );
  let assigned = 0;
  db.exec("BEGIN");
  for (const row of all) {
    const blob: Uint8Array = row.facet_scores;
    const scores = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
    const calibrated: Array<{ key: string; score: number }> = [];
    for (let index = 0; index < scores.length; index += 1) {
      const z = (scores[index] - means[index]) / stds[index];
      // Logistic squash centered so ~top 12% of the catalog clears 0.5.
      const score = 1 / (1 + Math.exp(-(1.1 * z - 1.3)));
      if (score >= 0.5) calibrated.push({ key: facetOrder[index], score: Number(score.toFixed(4)) });
    }
    calibrated.sort((left, right) => right.score - left.score);
    const nextFacets = JSON.stringify(calibrated.slice(0, FACETS_PER_SHOW_MAX));
    saveFacets.run(nextFacets, nextFacets !== row.facets ? 1 : 0, row.show_id);
    assigned += 1;
    if (assigned % 5000 === 0) {
      db.exec("COMMIT");
      db.exec("BEGIN");
    }
  }
  db.exec("COMMIT");
  console.log(`[facets] assigned facets for ${assigned} shows`);
}

// ── Phase: upload ───────────────────────────────────────────────────────────

function roundVec(vector: number[], places = 5) {
  const factor = 10 ** places;
  return vector.map((value) => Math.round(value * factor) / factor);
}

async function uploadVectors() {
  const rows = db
    .prepare(
      `SELECT show_id, vector, year, original_language, popularity, vote_average, vote_count
       FROM catalog WHERE embedded_at IS NOT NULL AND uploaded_vector_at IS NULL
       ORDER BY popularity DESC`,
    )
    .all() as any[];
  console.log(`[upload] ${rows.length} vectors to upsert into ${VECTORIZE_INDEX}`);
  const mark = db.prepare("UPDATE catalog SET uploaded_vector_at = ? WHERE show_id = ?");
  for (let offset = 0; offset < rows.length; offset += VECTORIZE_UPSERT_BATCH) {
    const batch = rows.slice(offset, offset + VECTORIZE_UPSERT_BATCH);
    const ndjson = batch
      .map((row) =>
        JSON.stringify({
          id: row.show_id,
          values: roundVec(blobToVec(row.vector)),
          metadata: {
            lang: row.original_language ?? "",
            year: row.year ?? 0,
            pop: row.popularity ?? 0,
            va: row.vote_average ?? 0,
            vc: row.vote_count ?? 0,
          },
        }),
      )
      .join("\n");
    await fetchJsonWithRetry(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${cloudflareToken()}`,
          "content-type": "application/x-ndjson",
        },
        body: ndjson,
      },
      { label: "vectorize upsert" },
    );
    const now = Date.now();
    db.exec("BEGIN");
    for (const row of batch) mark.run(now, row.show_id);
    db.exec("COMMIT");
    process.stdout.write(`\r[upload] vectors ${Math.min(offset + batch.length, rows.length)}/${rows.length}`);
  }
  if (rows.length > 0) console.log("\n[upload] vectors done");
}

async function uploadState() {
  const rows = db
    .prepare(
      `SELECT show_id, tmdb_id, input_hash, embedded_at, title, original_title, year,
              overview, genre_ids, original_language, origin_countries
       FROM catalog
       WHERE embedded_at IS NOT NULL AND uploaded_state_at IS NULL`,
    )
    .all() as any[];
  console.log(`[upload] ${rows.length} embedding-state rows to write to D1`);
  const mark = db.prepare("UPDATE catalog SET uploaded_state_at = ? WHERE show_id = ?");
  const CHUNK = 400;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const batch = rows.slice(offset, offset + CHUNK);
    const values = batch
      .map((row) => {
        const baseHash = computeBaseInputHash({
          title: row.title,
          originalTitle: row.original_title,
          year: row.year,
          overview: row.overview,
          genreIds: row.genre_ids ? JSON.parse(row.genre_ids) : [],
          originalLanguage: row.original_language,
          originCountries: row.origin_countries ? JSON.parse(row.origin_countries) : [],
        });
        return (
          `(${sqlString(`embst_${row.show_id}`)}, ${sqlString(row.show_id)}, ${row.tmdb_id ?? "NULL"}, ` +
          `${sqlString(EMBEDDING_VERSION)}, ${sqlString(row.input_hash)}, ${sqlString(baseHash)}, 'embedded', 0, NULL, ${row.embedded_at}, ${Date.now()})`
        );
      })
      .join(",");
    await d1Query(
      `INSERT INTO show_embedding_state
         (id, show_id, tmdb_id, embedding_version, input_hash, base_input_hash, status, fail_count, last_error, embedded_at, updated_at)
       VALUES ${values}
       ON CONFLICT(show_id) DO UPDATE SET
         embedding_version = excluded.embedding_version,
         input_hash = excluded.input_hash,
         base_input_hash = excluded.base_input_hash,
         status = 'embedded',
         fail_count = 0,
         last_error = NULL,
         embedded_at = excluded.embedded_at,
         updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    db.exec("BEGIN");
    for (const row of batch) mark.run(now, row.show_id);
    db.exec("COMMIT");
    process.stdout.write(`\r[upload] state ${Math.min(offset + batch.length, rows.length)}/${rows.length}`);
  }
  if (rows.length > 0) console.log("\n[upload] state done");
}

async function uploadFacetDefs() {
  await ensureFacetVectors();
  const rows = db.prepare("SELECT key, vector FROM facet_vectors").all() as any[];
  const byKey = new Map(rows.map((row) => [row.key, row]));
  console.log(`[upload] seeding ${FACET_DEFS.length} facet_defs rows into D1`);
  for (let index = 0; index < FACET_DEFS.length; index += 4) {
    const chunk = FACET_DEFS.slice(index, index + 4);
    const values = chunk
      .map((facet, chunkIndex) => {
        const row = byKey.get(facet.key);
        if (!row) throw new Error(`missing facet vector ${facet.key}`);
        const vectorJson = JSON.stringify(roundVec(blobToVec(row.vector)));
        return (
          `(${sqlString(`facet_${facet.key}`)}, ${sqlString(facet.key)}, ${sqlString(facet.group)}, ` +
          `${sqlString(facet.title)}, ${sqlString(facet.description)}, ${sqlString(EMBEDDING_VERSION)}, ` +
          `${sqlString(vectorJson)}, ${index + chunkIndex}, ${Date.now()})`
        );
      })
      .join(",");
    await d1Query(
      `INSERT INTO facet_defs
         (id, key, group_key, title, description, embedding_version, query_vector, sort_order, updated_at)
       VALUES ${values}
       ON CONFLICT(key) DO UPDATE SET
         group_key = excluded.group_key,
         title = excluded.title,
         description = excluded.description,
         embedding_version = excluded.embedding_version,
         query_vector = excluded.query_vector,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at`,
    );
  }
  console.log("[upload] facet_defs done");
}

async function uploadShowFacets() {
  const rows = db
    .prepare(
      `SELECT show_id, facets FROM catalog
       WHERE facets IS NOT NULL AND uploaded_facets_at IS NULL`,
    )
    .all() as any[];
  console.log(`[upload] ${rows.length} shows' facet assignments to write to D1`);
  const mark = db.prepare("UPDATE catalog SET uploaded_facets_at = ? WHERE show_id = ?");
  // 80 shows × ≤8 facets × ~110 chars stays safely under D1's 100KB statement cap.
  const CHUNK = 80;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const batch = rows.slice(offset, offset + CHUNK);
    const values: string[] = [];
    for (const row of batch) {
      const facets: Array<{ key: string; score: number }> = JSON.parse(row.facets);
      facets.forEach((facet, rank) => {
        values.push(
          `(${sqlString(`shfct_${row.show_id}_${facet.key}`)}, ${sqlString(row.show_id)}, ` +
            `${sqlString(facet.key)}, ${facet.score}, ${rank + 1}, ${Date.now()})`,
        );
      });
    }
    if (values.length > 0) {
      await d1Query(
        `INSERT INTO show_facets (id, show_id, facet_key, score, rank, updated_at)
         VALUES ${values.join(",")}
         ON CONFLICT(show_id, facet_key) DO UPDATE SET
           score = excluded.score,
           rank = excluded.rank,
           updated_at = excluded.updated_at`,
      );
    }
    const now = Date.now();
    db.exec("BEGIN");
    for (const row of batch) mark.run(now, row.show_id);
    db.exec("COMMIT");
    process.stdout.write(`\r[upload] facets ${Math.min(offset + batch.length, rows.length)}/${rows.length}`);
  }
  if (rows.length > 0) console.log("\n[upload] show_facets done");
}

async function uploadCalibration() {
  const calibration = metaGet("facet_calibration");
  if (!calibration) return;
  await d1Query(
    `INSERT INTO ingest_sync_meta (key, value, updated_at) VALUES ('facet_calibration', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [calibration, Date.now()],
  );
  console.log("[upload] facet calibration stats written to ingest_sync_meta");
}

async function phaseUpload() {
  if (DRY_RUN) {
    console.log("[upload] skipped (dry run)");
    return;
  }
  await uploadVectors();
  await uploadState();
  await uploadFacetDefs();
  await uploadShowFacets();
  await uploadCalibration();
}

// ── Phase: verify ───────────────────────────────────────────────────────────

async function phaseVerify(showId: string) {
  const row = db.prepare("SELECT * FROM catalog WHERE show_id = ? OR title = ?").get(showId, showId) as any;
  if (!row?.vector) throw new Error(`no local vector for ${showId}`);
  console.log(`[verify] neighbors of "${row.title}" (${row.year}):`);
  const payload = await fetchJsonWithRetry(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${cloudflareToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ vector: blobToVec(row.vector), topK: 15, returnMetadata: "none" }),
    },
    { label: "vectorize query" },
  );
  const matches = payload.result?.matches ?? [];
  const lookup = db.prepare("SELECT title, year, facets FROM catalog WHERE show_id = ?");
  for (const match of matches) {
    const hit = lookup.get(match.id) as any;
    const facets = hit?.facets
      ? JSON.parse(hit.facets).slice(0, 3).map((facet: any) => facet.key).join(", ")
      : "";
    console.log(
      `  ${match.score.toFixed(4)}  ${hit?.title ?? match.id} (${hit?.year ?? "?"})  [${facets}]`,
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `embed-catalog: wave=${WAVE} phase=${PHASE} dryRun=${DRY_RUN} maxSpend=$${MAX_SPEND_USD} ` +
      `version=${EMBEDDING_VERSION} dims=${EMBEDDING_DIMENSIONS}`,
  );
  if (VERIFY_ID) {
    await phaseVerify(VERIFY_ID);
    return;
  }
  if (CALIBRATE) {
    await phaseFacets();
    return;
  }
  const phases = PHASE === "all" ? ["pull", "enrich", "embed", "facets", "upload"] : [PHASE];
  for (const phase of phases) {
    if (phase === "pull") await phasePull();
    else if (phase === "enrich") await phaseEnrich();
    else if (phase === "embed") await phaseEmbed();
    else if (phase === "facets") await phaseFacets();
    else if (phase === "upload") await phaseUpload();
    else throw new Error(`unknown phase ${phase}`);
  }
  console.log(`done. cumulative Gemini spend ≈ $${spentUsd().toFixed(2)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
