# Ask Plotlist v1 — implementation plan

Self-contained plan for turning Plotlist's bare "vibe search" into **Ask Plotlist**: an
LLM-over-retrieval concierge that answers "what should I watch tonight?" with
constraint-aware, personalized picks and per-pick reasons. This is the flagship
Plotlist Pro feature; free users get a monthly taste of it.

Read this whole file before writing code. Every file path and symbol referenced
below was verified against the repo at the time of writing.

---

## 1. Product spec

### The problem with today's vibe search
`embeddings:searchByVibe` (action) → `vibeSearchShows()` in
[api/_lib/recs-handlers.ts:411](../api/_lib/recs-handlers.ts) embeds the raw query
(`searchShowIdsByVibe`, [api/_lib/recs.ts:289](../api/_lib/recs.ts)) and returns a
ranked poster grid. It ignores constraints ("under 30 min", "finished airing",
"on my services", "nothing depressing"), recommends shows the user already
watched, gives no reasons, and supports no refinement.

### What v1 ships
1. **A new `/ask` screen** ("Ask Plotlist") with:
   - **Tonight mode** (zero typing): three chip rows — *Time* (Quick episode ·
     A full episode · Binge night), *Mood* (Cozy · Funny · Tense · Mind-bending ·
     Background · Surprise me), *Only my services* toggle — plus an optional
     free-text box ("or describe a vibe…").
   - **Results**: 3–6 picks, each with poster, title, year, a one-line
     personalized reason, and badges (`On your watchlist`, `On <provider>`).
   - **Refinement chips** under results: `Funnier · Darker · Cozier · Shorter ·
     Newer · Older · More like #1`. Tapping re-asks within the same session.
2. **Backend pipeline** (one new action `embeddings:askPlotlist`):
   parse → retrieve → filter → explain (details in §3).
3. **Gating**: free users get **3 ask sessions per calendar month** (a session =
   the initial ask plus unlimited refinements for 15 minutes). Pro is unlimited.
   Hitting the limit opens the RevenueCat paywall contextually.
4. **Entry points**: search tab's existing "Vibe" mode routes to `/ask`; a
   static entry card on Home.

### Out of scope for v1 (do not build)
Saved "Smart Lists" from a vibe, memory-search over own history, multi-user
"Blend" mode, chat-style threading, streaming of LLM output.

---

## 2. Codebase orientation (read these first)

- **RPC pattern**: all backend calls go through registries in
  [api/_lib/rpc.ts](../api/_lib/rpc.ts) (`queryHandlers` / `mutationHandlers` /
  `actionHandlers`, dispatched by `runRpcHandler`). Recs handlers live in
  [api/_lib/recs-handlers.ts](../api/_lib/recs-handlers.ts) and are registered in
  rpc.ts under the `embeddings:` namespace. Client refs live in
  [lib/plotlist/api.ts](../lib/plotlist/api.ts) (see `searchByVibe: ref("action", …)`
  at line ~175); hooks in [lib/plotlist/react.ts](../lib/plotlist/react.ts)
  (`useAction`, `useQuery`). Return types are loose (`any`) — no codegen.
- **Pro gating**: [api/_lib/pro.ts](../api/_lib/pro.ts) exports `userHasPro(user)`
  / `requirePro(user)` reading `users.proUntil` (webhook-maintained; never trust
  the client). Client-side Pro state: `useProStatus()` from
  [lib/useProStatus.ts](../lib/useProStatus.ts) combined with `me?.isPro` —
  follow the pattern in [app/settings/index.tsx](../app/settings/index.tsx)
  (`const isPro = proStatus.isPro || me?.isPro === true`). Contextual paywall:
  `presentProPaywall()` from `lib/purchases` (platform-split module; never import
  react-native-purchases directly).
- **Embeddings/retrieval**: [api/_lib/gemini.ts](../api/_lib/gemini.ts)
  (`embedText`, task types), Vectorize index binding in
  [worker/vectorize.ts](../worker/vectorize.ts), query path in
  [api/_lib/recs.ts](../api/_lib/recs.ts). Candidate ranking helpers
  (`rankCandidates`, `normalizeSemanticScores`) already exist and are used by
  `vibeSearchShows`.
- **Rate limiting**: [api/_lib/rate-limit.ts](../api/_lib/rate-limit.ts) —
  `enforceRateLimit(key, limit, windowMs)` upserts into the `rateLimits` table
  and **throws** on excess; `rateLimitKey(scope, …parts)` builds keys. You will
  add a non-throwing variant (§3.4).
- **Signed tokens**: `createCalendarFeedToken` in
  [api/_lib/calendar-feed.ts](../api/_lib/calendar-feed.ts) shows the HMAC
  pattern (`hmacSha256` + `safeEqual` from api/_lib/crypto.ts, secret
  `JWT_SECRET`). Reuse this shape for stateless ask-session tokens.
- **Provider availability**: `extractProviderKeys(details)` in
  [api/_lib/streaming-arrivals.ts](../api/_lib/streaming-arrivals.ts) maps a
  `tmdbDetailsCache.payload` to provider keys (`netflix`, `max`, …); user's
  services are `users.streamingProviders`. Provider labels:
  `STREAMING_PROVIDER_OPTIONS` in [lib/streamingProviders.ts](../lib/streamingProviders.ts).
- **Watch data**: `watchStates` (statuses: watchlist / watching / caught_up /
  paused / finished / completed / dropped), `reviews` (user ratings),
  `users.favoriteShowIds` — all in [db/schema.ts](../db/schema.ts).
- **UI conventions** (violating these has bitten past sessions):
  - Show-detail navigation must use `guardedPush` from
    [lib/navigation.ts](../lib/navigation.ts) (700 ms lock), or `LinkPressable`
    for web-clickable rows.
  - Text inputs: `text-[16px]` (never `text-base`) to avoid iOS zoom.
  - Surfaces: `GlassSurface` / `GlassPressable` from
    [components/NativeGlass.tsx](../components/NativeGlass.tsx) — glass on
    controls only, `variant="surface"` cards render tinted fallback.
  - Dialogs/toasts: `notify` / `notifyError` from [lib/dialogs.ts](../lib/dialogs.ts)
    (web-safe).
  - NativeWind `className` no-ops on Reanimated components; web Pressables need
    the patterns already used in existing components.
  - Do not add data-dependent components to the Home tab's cached rails without
    reading [lib/homeWarmCache.ts](../lib/homeWarmCache.ts) — the Home entry
    card in this plan is deliberately static (no RPC on mount).
- **Checks**: `npm run check` = typecheck (app + api tsconfigs) + eslint + jest
  (`TZ=UTC`, pure-logic tests only — no DB in tests). Put testable pure logic in
  `lib/` (see lib/watchInsights.ts precedent), server-only code in `api/_lib/`.

---

## 3. Backend

### 3.1 Gemini generation helper — `api/_lib/gemini.ts`
Add alongside `embedText`:

```ts
export async function generateJson<T>(args: {
  system: string;
  user: string;
  schema: object;          // Gemini responseSchema (OpenAPI-ish subset)
  maxOutputTokens?: number;
}): Promise<T>
```

- POST `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`
  with the same API key env var `embedTexts` already uses (read the file; reuse
  its key/env handling and error style). If `gemini-2.5-flash-lite` 404s, fall
  back to `gemini-2.5-flash` — verify with a curl before wiring.
- `generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.4 }`.
- Parse `candidates[0].content.parts[0].text` as JSON; on parse failure retry
  once, then throw `ApiError(502, "ask_generation_failed", …)`.
- Log token usage (`usageMetadata`) via `console.info("[ask] llm", …)`.

### 3.2 Pure logic module — `lib/askPlotlist.ts` (unit-testable, no DB/network imports)
- `export type AskConstraints = { maxEpisodeMinutes?: number | null; finishedOnly?: boolean; airingOnly?: boolean; yearMin?: number | null; yearMax?: number | null; excludeTerms?: string[]; onMyServices?: boolean; moods?: string[]; semanticQuery: string; }`
- `buildAskQueryFromChips({time, mood, freeText}) → {semanticText, constraints}` —
  maps Tonight chips to constraints (`Quick episode` → maxEpisodeMinutes 35;
  `Binge night` → prefer finishedOnly) and composes the embedding text.
- `applyConstraintFilters(candidates, constraints)` — post-filter over candidate
  rows shaped `{showId, year, episodeRunTimeMinutes?: number|null, status?: string|null, providerKeys?: string[]|null, onWatchlist: boolean}`.
  Rules: unknown metadata **passes** every filter except `onMyServices` (which
  requires a known provider match); `finishedOnly` matches status
  `Ended`/`Canceled`; `airingOnly` the inverse when status known.
- `REFINEMENT_CHIPS` map: chip id → text appended to the semantic query
  (e.g. `funnier` → `"lighter and funnier than the previous picks"`).
- Prompt builders `buildParsePrompt(rawText)` and
  `buildExplainPrompt({query, constraints, tasteAnchors, candidates})` returning
  `{system, user, schema}` — keeping prompts here makes them testable.
  - Parse schema: the `AskConstraints` fields + `semanticQuery`.
  - Explain schema: `{ picks: [{ showId: string, reason: string }] }`, 3–6 picks,
    reasons ≤ 140 chars, must reference the viewer's taste anchors or the query,
    never invent shows outside the candidate list, never spoil plots.

### 3.3 Pipeline — new file `api/_lib/ask-plotlist.ts`
`export async function askPlotlist(user, input): Promise<AskResult>` where
`input = { text?: string; chips?: {time?, mood?, onMyServices?}; refinement?: string; sessionId?: string; excludeShowIds?: string[] }`.

1. **Compose query**: chips and/or free text via `buildAskQueryFromChips`; if
   `refinement`, append `REFINEMENT_CHIPS[refinement]` and pass the previous
   picks (client sends `excludeShowIds`) as exclusions.
2. **Parse** free text with `generateJson` + `buildParsePrompt` → merge into
   constraints. Skip the parse call entirely when there's no free text (chips
   are already structured) — saves a model call for the Tonight fast path.
3. **Retrieve**: embed `semanticQuery` (`embedText`, task `RETRIEVAL_QUERY` —
   mirror `searchShowIdsByVibe`) and query Vectorize for **topK 80**. Do NOT
   assume Vectorize metadata filters exist — filter after retrieval.
4. **Load context in parallel** (chunk all `inArray`s with `chunkForSqlParams`
   like the rest of api/_lib):
   - `shows` rows for candidates;
   - user's `watchStates` for candidates → drop statuses other than `watchlist`
     (watchlist candidates stay and get `onWatchlist: true`; in Tonight mode give
     them a modest ranking boost);
   - `tmdbDetailsCache` payloads for the top ~40 surviving candidates only
     (payloads are large) → `episode_run_time`, `status`, and
     `extractProviderKeys` for provider badges/filtering;
   - taste anchors: up to 12 titles from `users.favoriteShowIds` ∪ shows the
     user reviewed ≥ 4.5 ∪ most-recent `finished` watch states (title + "loved" /
     rating), for grounding reasons.
5. **Filter** via `applyConstraintFilters`, rank with the existing
   `rankCandidates`/`normalizeSemanticScores` (semanticWeight 0.78 like
   `vibeSearchShows`), keep top 12.
6. **Explain**: `generateJson` + `buildExplainPrompt` over those ≤12 candidates
   (each with title, year, genres, 1-sentence overview truncated to ~160 chars,
   onWatchlist flag) → ordered picks with reasons. Validate every returned
   `showId` is in the candidate set; drop unknowns; if < 3 survive, fall back to
   the top-ranked candidates with a templated reason
   (`"Close match for “<query>”"`) so the endpoint never 500s on LLM flakiness.
7. **Return** `{ sessionId, picks, remaining }` — picks carry
   `{showId, title, year, posterUrl, reason, onWatchlist, providerKeys}`.

### 3.4 Quota + sessions
- Add to [api/_lib/rate-limit.ts](../api/_lib/rate-limit.ts):
  `consumeQuota(key, limit, windowMs): Promise<{allowed: boolean; remaining: number}>`
  — same upsert as `enforceRateLimit` but returns instead of throwing, and does
  not increment past the limit (`count = min(count + 1, limit + 1)` semantics are
  fine; compute `remaining = max(0, limit - count)`).
- Session token: stateless HMAC, payload `{userId, purpose: "ask-session", exp: now + 15min}`
  — copy the pattern from `createCalendarFeedToken` /
  `verifyCalendarFeedToken` into `api/_lib/ask-plotlist.ts`.
- In the handler: Pro users (`userHasPro`) skip quota entirely
  (`remaining: null`). Free users: a valid unexpired `sessionId` (refinement)
  costs nothing; otherwise `consumeQuota(rateLimitKey("ask", user.id), 3, 31 * 24h)`.
  If `!allowed`, throw `ApiError(403, "ask_quota_exceeded", "You've used this month's free asks")`.
  Keep the legacy 30-req/min abuse limit for everyone
  (`enforceRateLimit(rateLimitKey("ask-burst", user.id), 30, 60_000)`).

### 3.5 Handlers + client refs
- `actionHandlers["embeddings:askPlotlist"]` in rpc.ts (auth via
  `requireAuthUser`, then §3.3/§3.4). Also add
  `queryHandlers["embeddings:getAskStatus"]` returning
  `{ isPro, remaining: number | null }` (peek without consuming — read the
  `rateLimits` row directly) so the UI can show the "N free asks left" pill.
- [lib/plotlist/api.ts](../lib/plotlist/api.ts): add
  `askPlotlist: ref("action", "embeddings:askPlotlist")` and
  `getAskStatus: ref("query", "embeddings:getAskStatus")` under `embeddings`.
- **Do not remove `embeddings:searchByVibe`** — TestFlight builds ≤ 203 still
  call it.

---

## 4. Client

### 4.1 New screen — `app/ask.tsx`
Model the screen structure on an existing simple page (e.g.
[app/settings/muted.tsx](../app/settings/muted.tsx) for Screen/FlashList usage).

- Header: "Ask Plotlist" + a one-line subtitle. Free users see a small pill
  ("2 free asks left" from `getAskStatus`); Pro sees nothing.
- Chip rows (Tonight mode) as horizontal wrap of `GlassPressable` chips;
  selected state uses the brand accent `#38BDF8`. "Only my services" is a chip
  toggle. Free-text `TextField` (`text-[16px]`) below with placeholder cycling
  through 3 example prompts.
- Primary button ("Find me something") → `useAction(api.embeddings.askPlotlist)`
  with `{text, chips}`; loading state on the button; results replace chips
  scroll position (keep chips accessible by scrolling up).
- Result rows: poster (36×52 like MutedShowRow) or larger 2:3, title, year,
  reason (2 lines max), badges (small pills: `On your watchlist`,
  provider label). Row press → `guardedPush(\`/show/\${showId}\`)`.
- Refinement chip row after results — on tap, re-call the action with
  `{refinement, sessionId, excludeShowIds: picks.map(p => p.showId)}` and
  replace results.
- Errors: code `ask_quota_exceeded` → `presentProPaywall()`; on
  `"purchased"`/`"restored"` retry the ask automatically. Any other error →
  `notifyError("Couldn't find picks", …)`. (Match error-code sniffing style used
  for `pro_required` in app/settings/index.tsx.)

### 4.2 Entry points
- **Search tab**: in [components/SearchCommandCenter.tsx](../components/SearchCommandCenter.tsx)
  the `vibe` mode already exists (`SearchMode = "shows" | "vibe" | "people"`,
  scope chip at ~line 329). Change the vibe scope chip's behavior to navigate to
  `/ask` (via `guardedPush`) instead of toggling in-place mode; leave the mode
  plumbing itself intact for old code paths. Update its label to "Ask".
- **Home**: a static full-width `GlassPressable` card ("✨ Ask Plotlist — tell
  me what you're in the mood for") near the top of
  [app/(tabs)/home.tsx](../app/(tabs)/home.tsx), rendered unconditionally with
  no data dependencies (safe for the warm-start cache). Find where the tonight
  strip / first rail renders and place it directly after.

### 4.3 Copy for the paywall
The RevenueCat paywall bullet "Unlimited vibe search" should become
"Unlimited Ask Plotlist" — dashboard-side edit, NOT code; flag it in your final
report for the user rather than attempting it.

---

## 5. Tests (extend `tests/`)
Pure-logic tests only (repo convention — jest runs with no DB):
- `tests/askPlotlist.test.ts`: `buildAskQueryFromChips` chip→constraint mapping;
  `applyConstraintFilters` (unknown-metadata passes, `onMyServices` requires
  known match, finished/airing logic, exclude terms); refinement chip text
  composition; prompt builders include taste anchors and forbid out-of-candidate
  picks (assert on prompt text).
- Session-token helpers if you keep them pure enough to import without the db
  module graph; otherwise skip (the calendar-feed token has no test either).
- Run `npm run check` — typecheck (both tsconfigs), eslint, full jest — all must
  pass. Also run `npm run build` (web export) to prove the web bundle survives.

---

## 6. Local verification (do this before deploying)
Per the repo's established workflow (see memory notes in
`docs/` and `.claude/launch.json`):
1. `npm run db:migrate:local` (no new migration expected in this plan — quota
   rides `rateLimits`; skip if nothing new).
2. Start `worker-api` (port 3001) and `expo-web-preview` (port 8090) via the
   preview tools — never Bash.
3. The local D1 has test user `user_mr5ofi0qhk41mm4rq2` (sign in on web:
   phone `555 123 4567`, OTP `123456` — App Review bypass, no SMS). This user
   already has `pro_until` set (Pro). To test the FREE path, temporarily null it:
   `sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite "UPDATE users SET pro_until = NULL WHERE id='user_mr5ofi0qhk41mm4rq2';"`
   …and restore it afterwards.
4. Verify end-to-end in the browser: Tonight chips → picks with reasons; free
   quota pill decrements; 4th ask opens the paywall chooser; refinement doesn't
   consume quota; `Only my services` visibly narrows results; watchlist badge
   appears (the test user has watchlist items); result tap navigates to the show.
5. Watch `worker-api` logs for `[ask]` lines: parse output, candidate counts,
   token usage, timings. An ask should complete in < 4 s p50.

## 7. Deploy
1. `npm run check` green, then commit with a descriptive message
   (repo signs off with `Co-Authored-By: Claude …` — follow git log style).
2. `npm run deploy` (builds web + deploys the worker; migrations remote only if
   you added one). Smoke-test `https://plotlist.app` `/ask` on web with a real
   account.
3. iOS: the feature reaches iPhone users only via a new TestFlight build (no
   OTA updates in this app). Building is OPTIONAL for this task — if asked to,
   follow the exact local-build recipe in the project memory
   (`eas-headless-credentials`): export `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`,
   `GYM_XCARGS="CODE_SIGN_IDENTITY=827B04517B859CC49E4C8CE75376BFDD167C9860"`,
   `SENTRY_AUTH_TOKEN` from `.env.local`, then
   `npx eas-cli build --platform ios --profile production --local --non-interactive --output <ipa>`
   and `npx eas-cli submit --platform ios --profile production --path <ipa> --non-interactive`.
   EAS **cloud** builds fail until 2026-08-01 (free-plan quota) — always build
   locally.

## 8. Acceptance checklist
- [ ] Tonight mode returns 3–6 picks with non-generic, personal reasons in <4s.
- [ ] Constraints respected: "short comedies under 30 minutes that finished
      airing" returns only ended shows, mostly ≤35-min runtimes, comedy-leaning.
- [ ] Already-watched shows never appear; watchlist shows appear with badge.
- [ ] Free: 3 sessions/month, refinements free in-session, paywall on limit,
      purchase unblocks immediately.
- [ ] Pro: no quota UI, unlimited.
- [ ] Old `searchByVibe` action still works (curl it).
- [ ] `npm run check` and `npm run build` green; web deploy verified live.
- [ ] LLM failure degrades to ranked picks with templated reasons (test by
      pointing the model name at garbage locally).
