# Recommendations v2 — semantic foundation

Status: shipped 2026-07. This replaces the never-run v1 embedding scaffolding
(`show_embeddings` / `show_embedding_jobs`, model `gemini-embedding-2-preview`,
0 rows ever written) with a real, catalog-wide semantic layer.

## Goals

1. Every meaningful show in the catalog has a rich, intentional embedding.
2. A single foundation powers: similar shows, personalized For-You ranking,
   home rails, facet/category browsing ("shows sorted by groups"), vibe
   search, and taste profiles — no per-feature model hacks.
3. Cheap to keep fresh (incremental, hash-driven), cheap to re-rank (ANN via
   Vectorize, metadata in D1), and versioned so re-embeds are non-events.

## Architecture

```
TMDB ingest (existing minute cron)
      │  upsert shows + tmdb_details_cache
      ▼
show_embedding_state (D1)         ← doc hash decides staleness
      │  stale rows drained by EMBEDDING_REFRESH_CRON (worker)
      │  bulk backfill by scripts/embed-catalog.mjs (local, resumable)
      ▼
embedding doc (lib/plotlist/embeddingDoc.ts)
      │  gemini-embedding-2, taskType RETRIEVAL_DOCUMENT,
      │  outputDimensionality 1536, L2-normalized client-side
      ▼
Vectorize index `plotlist-shows-v2` (1536 dims, cosine)   ← the ONLY vector store
      +
show_facets (D1)                  ← top facets per show, from facet_defs taxonomy
      ▼
api/_lib/recs.ts                  ← profiles, ranking, rails, similar, vibe search
```

### Why this shape

- **Vectorize, not D1 vectors**: brute-force cosine over 100k+ × 1536 floats
  cannot run in a Worker (128 MB memory, 30s CPU); JSON vectors in D1 would
  also eat gigabytes of the 10 GB cap. Vectorize is on the paid plan already,
  does real ANN, and `getByIds` returns raw values when we need to do local
  math (centroids, attribution).
- **One vector per show**: document embeddings compared doc↔doc for
  similarity and query↔doc (RETRIEVAL_QUERY) for search/profile text. The old
  two-column design (similarity + retrieval) doubled cost for no measurable
  gain.
- **1536 dims**: Vectorize's max; MRL truncation from 3072→1536 loses ~1% on
  retrieval benchmarks. Vectors are re-normalized after truncation (Gemini
  only pre-normalizes the full 3072).
- **Facets as first-class data**: a curated 119-entry taxonomy across 8 groups
  (`lib/plotlist/facets.ts`) is embedded once (RETRIEVAL_QUERY side) and every
  show gets its top facets stored in D1. This gives deterministic, indexable
  category browsing and human-readable reasons ("Cozy Crime") without
  running vector math at request time. Per-facet z-score calibration stats
  from the backfill are stored in `ingest_sync_meta.facet_calibration` so the
  worker's incremental refresh scores new shows on the same scale.

## Embedding document

Built by `buildShowEmbeddingDocV2` from the `shows` row plus TMDB enrichment
(`keywords`, `credits`, `content_ratings` — added to the ingest warm list).
Structured, labeled lines; ~250–350 tokens typical:

```
Title: Breaking Bad (2008–2013, ended)
Type: scripted crime drama
Genres: Crime, Drama, Thriller
Keywords: drug cartel, high school teacher, terminal illness, antihero, meth, new mexico
Created by: Vince Gilligan
Cast: Bryan Cranston, Aaron Paul, Anna Gunn, Dean Norris
Network: AMC · Language: English · Country: US
Format: 5 seasons, 62 episodes, ~47 min
Audience: adults (TV-MA)
Premise: A chemistry teacher diagnosed with cancer partners with a former
student to cook methamphetamine...
```

Rules:
- Field labels always present in the same order → stable geometry.
- Keywords capped at 14, cast at 6, overview at ~1200 chars.
- Shows without enrichment still embed from the base row (title/genres/
  overview/language/year) — never block on TMDB.
- `input_hash` = fnv1a of the doc text + embedding version; any change marks
  the row stale.

## Versioning

- `EMBEDDING_VERSION = "shows-v2-ge2-1536"` (model + dims baked in).
- A version bump = new Vectorize index + full re-embed via the backfill
  script, then flip `EMBEDDING_VERSION`/index binding. Old index deleted after
  verification. D1 state rows are per-version, so a bump naturally re-queues
  everything.

## Coverage & cost (measured 2026-07-09)

- 226,558 shows in D1. Embedding priority:
  - **Wave 1**: user-attached + popularity ≥ 2 or vote_count ≥ 5 (~55k)
  - **Wave 2**: remainder with a real overview (≥ 40 chars) (~70k)
  - Skip: metadata-only stubs (regional talk/news with no overview) — they
    would only add noise near the origin.
- gemini-embedding-2 text: $0.20/1M tokens sync. Measured ~156 tokens/doc →
  wave 1 ≈ **$1.35**, full build well under $5; facets ≈ pennies. Incremental
  refresh (worker) is capped by a daily token guard
  (`embedding_daily_tokens:<date>` watermark in `ingest_sync_meta`,
  2M tokens/day ≈ $0.40/day worst case).
- Vectorize storage: ~190M stored dims ≈ $0.10/mo.

## Personalization

`api/_lib/recs.ts` builds a **taste profile** per user:

- Signals (weight): favorites from onboarding (+1.6), rating ≥ 8 (+1.5),
  completed (+1.0), watching (+1.2), diary-logged (+0.6 each, capped),
  planned (+0.35), rating ≤ 4 (−1.2), dropped (−0.8).
- Recency decay: half-life 180 days on the signal timestamp.
- Profile = L2-normalized weighted centroid of show vectors (Vectorize
  `getByIds`) minus 0.35 × negative centroid.
- Cached in `user_taste_profiles` keyed by signal fingerprint (fnv1a of the
  sorted signal set + version) — recompute only when signals change.

**Candidate generation** = union of: Vectorize ANN top-100 on the profile
vector, trending pool (existing home catalog lists), and facet rails from the
user's top facets. **Ranking** blends: semantic score, Bayesian quality prior
(vote_average shrunk toward 7.0 by vote_count), freshness, streaming-provider
match (`users.streaming_providers`), popularity-tier mixing, seen/negative/
blocked filtering, and greedy genre+facet diversity (MMR-style without
needing candidate vectors).

**Reasons** stay honest: per-seed attribution (cosine of rec vs the user's
top positive seeds via one `getByIds` call) → "Because you watched X";
facet matches → "Dark crime thriller".

## Request-time surfaces

- `embeddings:getSimilarShows` — hybrid: ANN neighbors of the show's vector
  (Vectorize `queryById`) blended with TMDB's co-watch recommendations;
  agreement between the two ranks first. Falls back to TMDB-only when the
  show isn't embedded yet. Non-local picks are still batch-ingested so cards
  navigate instantly.
- `embeddings:getPersonalizedRecommendations` / `getHomeRecommendationRails`
  — profile-driven as above; anonymous users get the quality/trending path.
- `embeddings:getSmartLists` — facet-driven browse rows from `show_facets`.
- `shows:searchByVibe` — embeds free text (RETRIEVAL_QUERY) and returns ANN
  matches; powers "shows about grief but funny".
- `embeddings:getProfileTasteExperience` — real top genres/facets/summary
  from the profile.

## Freshness

- `markShowsEmbeddingStale` runs inside the ingest upsert path: recompute the
  doc hash from the fresh row; if changed (or row missing) upsert a stale
  `show_embedding_state` row.
- `EMBEDDING_REFRESH_CRON` (worker, every 5 min) drains up to 40 stale rows:
  enrich → doc → embed (one `batchEmbedContents` call) → Vectorize upsert →
  facet assign (cosine vs `facet_defs` vectors in-process) → state update.
- TMDB 404s / repeated failures park rows in `status='failed'` with backoff.

## Operational notes

- Backfill: `node scripts/embed-catalog.mjs --wave 1` (resumable; checkpoints
  in `scratch/embed-catalog.sqlite`; `--dry-run` prints token/cost estimates;
  hard `--max-spend-usd` guard).
- Worker secret: `GEMINI_API_KEY` (wrangler secret). Local dev: `.dev.vars`.
- Vectorize has no local simulator parity for all ops — request-time code
  degrades gracefully (similar shows → TMDB path, For You → trending path)
  when the binding or vectors are missing.
