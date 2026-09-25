import { beforeEach, describe, expect, it } from "@jest/globals";

import { initDb } from "../api/_lib/db";
import {
  getFacetShows,
  getHomeRecommendationRailsV2,
  getPersonalizedRecommendationsV2,
} from "../api/_lib/recs-handlers";
import { getTasteProfile } from "../api/_lib/recs";
import { FACET_DEFS } from "../lib/plotlist/facets";
import { initVectorizeIndex } from "../worker/vectorize";
import { createD1Binding, createMigratedSqlite, sqliteAvailable, type SqliteDatabase } from "./fixtures/sqliteD1";

const NOW = 1_790_000_000_000;
const describeSqlite = sqliteAvailable ? describe : describe.skip;
const FACETS = FACET_DEFS.slice(0, 4).map((facet) => facet.key);

let sqlite: SqliteDatabase;
let calls: { query: number; getByIds: number };

// Deterministic 3-d vectors: shows cluster by index so the user's taste (the
// first shows) pulls a stable neighborhood of candidates.
function vectorFor(index: number) {
  const angle = (index / 80) * Math.PI;
  return [Math.cos(angle), Math.sin(angle), ((index * 37) % 11) / 20];
}

function seed() {
  const vectors = new Map<string, number[]>();
  const insertShow = sqlite.prepare(
    "insert into shows (id, external_source, external_id, title, search_text, created_at, updated_at, year, poster_url, genre_ids, tmdb_popularity, tmdb_vote_average, tmdb_vote_count) values (?, 'tmdb', ?, ?, 's', ?, ?, ?, ?, '[18]', ?, ?, ?)",
  );
  const insertFacet = sqlite.prepare(
    "insert into show_facets (id, show_id, facet_key, score, rank, updated_at) values (?, ?, ?, ?, 1, ?)",
  );
  for (let index = 0; index < 120; index += 1) {
    const id = `show_${String(index).padStart(3, "0")}`;
    insertShow.run(id, String(index), `Show ${index}`, NOW, NOW, 2010 + (index % 15), `https://p/${id}.jpg`, 100 - index / 2, 6 + (index % 30) / 10, 500 + index * 13);
    vectors.set(id, vectorFor(index));
    // Every show carries two facets, so each facet rail's candidates overlap
    // heavily with the vector neighborhood For You ranks from.
    insertFacet.run(`sf_${index}_a`, id, FACETS[index % 4], 0.5 + (index % 7) / 14, NOW);
    insertFacet.run(`sf_${index}_b`, id, FACETS[(index + 1) % 4], 0.4 + (index % 5) / 10, NOW);
  }
  const insertWatch = sqlite.prepare(
    "insert into watch_states (id, user_id, show_id, status, updated_at) values (?, 'viewer', ?, 'completed', ?)",
  );
  for (let index = 0; index < 8; index += 1) {
    insertWatch.run(`ws_${index}`, `show_${String(index * 3).padStart(3, "0")}`, NOW - index);
  }

  initVectorizeIndex({
    async query(vector, options) {
      calls.query += 1;
      const norm = (values: number[]) => Math.hypot(...values) || 1;
      const matches = Array.from(vectors.entries())
        .map(([id, values]) => ({
          id,
          score: values.reduce((sum, value, i) => sum + value * vector[i], 0) / (norm(values) * norm(vector)),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, options?.topK ?? 10);
      return { matches };
    },
    async getByIds(ids) {
      calls.getByIds += 1;
      return ids.filter((id) => vectors.has(id)).map((id) => ({ id, values: vectors.get(id)! }));
    },
    async upsert() {},
    async deleteByIds() {},
  });
}

beforeEach(() => {
  if (!sqliteAvailable) return;
  sqlite = createMigratedSqlite();
  initDb(createD1Binding(sqlite));
  calls = { query: 0, getByIds: 0 };
  seed();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describeSqlite("getHomeRecommendationRailsV2", () => {
  it("returns only facet rails, still deduped against the For You picks", async () => {
    const limit = 8;
    const rails = await getHomeRecommendationRailsV2("viewer", limit);
    const forYou = await getPersonalizedRecommendationsV2("viewer", limit);
    const profile = await getTasteProfile("viewer");

    expect(rails).not.toBeNull();
    expect(forYou).not.toBeNull();
    expect(rails!.every((rail) => rail.key.startsWith("facet:"))).toBe(true);
    // Rails follow the profile's facet order.
    const expectedKeys = profile!.topFacets.slice(0, 3).map((facet) => `facet:${facet.key}`);
    expect(rails!.map((rail) => rail.key)).toEqual(
      expectedKeys.filter((key) => rails!.some((rail) => rail.key === key)),
    );

    const forYouIds = new Set(forYou!.map((item) => item._id));
    const seen = profile!.seenShowIds;
    const railIds = rails!.flatMap((rail) => (rail.items as Array<{ _id: string }>).map((item) => item._id));
    expect(railIds.filter((id) => forYouIds.has(id) || seen.has(id))).toEqual([]);
    expect(new Set(railIds).size).toBe(railIds.length);

    // The dedupe is doing real work here: the leading facet's raw list
    // contains For You picks that the rail skipped.
    const raw = await getFacetShows(rails![0].key.slice("facet:".length), limit * 2);
    expect(raw!.items.some((item) => forYouIds.has(item._id))).toBe(true);
  });

  it("builds the taste profile once and skips reason attribution", async () => {
    await getTasteProfile("viewer"); // warm the profile cache
    await flush();
    calls = { query: 0, getByIds: 0 };

    await getHomeRecommendationRailsV2("viewer", 8);
    // One candidate query for the For You dedupe pool; no vector reads — a
    // second profile build or "Because you watched" attribution would add
    // getByIds calls.
    expect(calls).toEqual({ query: 1, getByIds: 0 });
  });
});

describeSqlite("getPersonalizedRecommendationsV2", () => {
  it("attributes reasons from the candidate facets it already loaded", async () => {
    const items = await getPersonalizedRecommendationsV2("viewer", 10);
    expect(items).not.toBeNull();
    expect(items!.map((item) => item.rank)).toEqual(items!.map((_, index) => index + 1));
    const reasons = items!.map((item) => item.reason).filter(Boolean) as string[];
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(reason).toMatch(/^Because you watched Show \d+$|— one of your things$/);
    }
  });
});
