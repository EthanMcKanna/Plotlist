import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  episodeProgress,
  reviews,
  showIngestState,
  shows,
  tmdbDetailsCache,
  traktAccounts,
  traktDeviceAuths,
  traktImports,
  watchLogs,
  watchStates,
  type traktImportPhaseValues,
} from "../../db/schema";
import {
  computeImportProgressPercent,
  computeRewatchFlags,
  emptyTraktSnapshot,
  normalizeEpisodeRatings,
  normalizeHistoryItems,
  normalizeShowRatings,
  normalizeWatchedShows,
  normalizeWatchlistItems,
  traktLogId,
  traktReviewId,
  type TraktImportOptions,
  type TraktShowRef,
  type TraktSnapshot,
} from "../../lib/traktImport";
import {
  computeShowProgressFacts,
  readLastAiredEpisode,
  resolveStatusAfterEpisodeChange,
  type LegacyWatchStatus,
  type ShowProgressFacts,
} from "../../lib/watchStatusTransitions";
import { normalizeEpisodeSeasonSummaries } from "../../lib/episodeProgressState";
import { getUploadsBucket } from "../../worker/storage";
import { db } from "./db";
import { ApiError } from "./errors";
import { createId } from "./ids";
import { chunkForSqlParams } from "./sql-dialect";
import {
  TraktAuthError,
  TraktRetryLaterError,
  getEpisodeRatings,
  getHistoryEpisodesPage,
  getShowRatings,
  getUserSettings,
  getWatchedShows,
  getWatchlistShows,
  isTraktConfigured,
  pollDeviceToken,
  refreshAccessToken,
  requestDeviceCode,
} from "./trakt";
// Benign import cycle (call-time use only): rpc.ts wires our handlers while
// we reuse its TMDB payload normalizer, mirroring show-ingest.ts.
import { normalizeTmdbShowDetails } from "./rpc";
import { mapDetailsToShowRow, REFRESH_TIER_MS } from "./show-ingest";

// Resumable Trakt import engine. A job advances in bounded "slices" — the
// client pumps slices while the import screen is open, and the minute cron
// picks up any job whose lease has lapsed, so imports finish even if the app
// closes. Every write is idempotent (conflict-ignoring inserts, deterministic
// ids, skip-if-present checks), which makes crash recovery and re-imports
// safe by construction.

type TraktImportPhase = (typeof traktImportPhaseValues)[number];
type TraktImportJob = typeof traktImports.$inferSelect;
type TraktAccount = typeof traktAccounts.$inferSelect;

const LEASE_MS = 60_000;
// Short client slices keep the pump's progress updates frequent; the cron
// takes bigger bites since nobody is watching its latency.
const CLIENT_SLICE_BUDGET_MS = 3_500;
const CRON_SLICE_BUDGET_MS = 20_000;
const MAX_JOB_FAILURES = 5;

const HISTORY_PAGE_LIMIT = 100;
const HISTORY_PAGES_PER_STEP = 8;
const HISTORY_MAX_EVENTS = 25_000;
const MATCH_SHOWS_PER_STEP = 24;
const MATCH_FETCH_CONCURRENCY = 8;
const PROGRESS_SHOWS_PER_STEP = 12;
const DIARY_EVENTS_PER_STEP = 200;
const RATINGS_PER_STEP = 40;
const WATCHLIST_PER_STEP = 100;
const UNMATCHED_REPORT_LIMIT = 200;

const DEVICE_AUTH_RETENTION_MS = 24 * 60 * 60 * 1000;
const JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const STALLED_JOB_MS = 2 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

// ─── Snapshot storage (R2) ───

function snapshotKeyForJob(jobId: string) {
  // Lives outside the public "uploads/" prefix, so /files/ can never serve it.
  return `trakt-import/${jobId}.json`;
}

async function readSnapshot(key: string): Promise<TraktSnapshot | null> {
  const object = await getUploadsBucket().get(key);
  if (!object) {
    return null;
  }
  const text = await new Response(object.body).text();
  const parsed = JSON.parse(text) as TraktSnapshot;
  return parsed?.version === 1 ? parsed : null;
}

async function writeSnapshot(key: string, snapshot: TraktSnapshot) {
  await getUploadsBucket().put(key, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function deleteSnapshot(key: string | null) {
  if (!key) return;
  try {
    await getUploadsBucket().delete(key);
  } catch {
    // Cleanup cron retries before the job row is dropped.
  }
}

// ─── Device authentication ───

export type TraktDeviceAuthView = {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  intervalSeconds: number;
};

async function latestDeviceAuth(userId: string) {
  const rows = await db
    .select()
    .from(traktDeviceAuths)
    .where(eq(traktDeviceAuths.userId, userId))
    .orderBy(desc(traktDeviceAuths.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function startTraktDeviceAuth(userId: string): Promise<TraktDeviceAuthView> {
  const now = Date.now();
  const existing = await latestDeviceAuth(userId);
  // Reuse a live pending code so a double-tap doesn't burn codes (and Trakt
  // rate limits) — the user may already have the previous code on screen.
  if (existing && existing.status === "pending" && existing.expiresAt > now + 60_000) {
    return {
      userCode: existing.userCode,
      verificationUrl: existing.verificationUrl,
      expiresAt: existing.expiresAt,
      intervalSeconds: existing.intervalSeconds,
    };
  }

  const code = await requestDeviceCode();
  await db.insert(traktDeviceAuths).values({
    id: createId("traktauth"),
    userId,
    deviceCode: code.deviceCode,
    userCode: code.userCode,
    verificationUrl: code.verificationUrl,
    intervalSeconds: code.intervalSeconds,
    expiresAt: now + code.expiresInSeconds * 1_000,
    status: "pending",
    lastPolledAt: null,
    createdAt: now,
  });
  return {
    userCode: code.userCode,
    verificationUrl: code.verificationUrl,
    expiresAt: now + code.expiresInSeconds * 1_000,
    intervalSeconds: code.intervalSeconds,
  };
}

export type TraktDeviceAuthPollView =
  | { state: "none" }
  | { state: "pending" }
  | { state: "denied" }
  | { state: "expired" }
  | { state: "connected"; username: string | null };

export async function pollTraktDeviceAuth(userId: string): Promise<TraktDeviceAuthPollView> {
  const now = Date.now();
  const auth = await latestDeviceAuth(userId);
  if (!auth || auth.status === "denied") {
    return auth ? { state: "denied" } : { state: "none" };
  }
  if (auth.status === "approved") {
    const account = await getTraktAccount(userId);
    return { state: "connected", username: account?.traktUsername ?? null };
  }
  if (auth.status === "expired" || auth.expiresAt <= now) {
    if (auth.status === "pending") {
      await db
        .update(traktDeviceAuths)
        .set({ status: "expired" })
        .where(eq(traktDeviceAuths.id, auth.id));
    }
    return { state: "expired" };
  }

  // Server-side throttle: no matter how eagerly the client polls us, Trakt
  // sees at most one token poll per required interval.
  const minGapMs = auth.intervalSeconds * 1_000;
  if (auth.lastPolledAt && now - auth.lastPolledAt < minGapMs) {
    return { state: "pending" };
  }
  await db
    .update(traktDeviceAuths)
    .set({ lastPolledAt: now })
    .where(eq(traktDeviceAuths.id, auth.id));

  const result = await pollDeviceToken(auth.deviceCode);
  switch (result.state) {
    case "approved": {
      const settings = await getUserSettings(result.grant.accessToken).catch(() => ({
        username: null,
        slug: null,
      }));
      await db
        .insert(traktAccounts)
        .values({
          id: createId("traktacct"),
          userId,
          traktUsername: settings.username,
          traktSlug: settings.slug,
          accessToken: result.grant.accessToken,
          refreshToken: result.grant.refreshToken,
          tokenExpiresAt: result.grant.expiresAt,
          connectedAt: now,
          lastImportedAt: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: traktAccounts.userId,
          set: {
            traktUsername: settings.username,
            traktSlug: settings.slug,
            accessToken: result.grant.accessToken,
            refreshToken: result.grant.refreshToken,
            tokenExpiresAt: result.grant.expiresAt,
            connectedAt: now,
            updatedAt: now,
          },
        });
      await db
        .update(traktDeviceAuths)
        .set({ status: "approved" })
        .where(eq(traktDeviceAuths.id, auth.id));
      return { state: "connected", username: settings.username };
    }
    case "pending":
      return { state: "pending" };
    case "slow_down": {
      // Back off an extra interval before the next real poll.
      await db
        .update(traktDeviceAuths)
        .set({ lastPolledAt: now + minGapMs })
        .where(eq(traktDeviceAuths.id, auth.id));
      return { state: "pending" };
    }
    case "denied":
      await db
        .update(traktDeviceAuths)
        .set({ status: "denied" })
        .where(eq(traktDeviceAuths.id, auth.id));
      return { state: "denied" };
    case "expired":
    default:
      await db
        .update(traktDeviceAuths)
        .set({ status: "expired" })
        .where(eq(traktDeviceAuths.id, auth.id));
      return { state: "expired" };
  }
}

async function getTraktAccount(userId: string): Promise<TraktAccount | null> {
  const rows = await db
    .select()
    .from(traktAccounts)
    .where(eq(traktAccounts.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function disconnectTraktAccount(userId: string) {
  await cancelTraktImportJob(userId).catch(() => {});
  await db.delete(traktAccounts).where(eq(traktAccounts.userId, userId));
  await db.delete(traktDeviceAuths).where(eq(traktDeviceAuths.userId, userId));
  return { success: true };
}

// Proactively refresh the access token when it is close to expiring so a
// long-running import never trips over a mid-flight expiry.
async function ensureFreshAccessToken(account: TraktAccount, now: number): Promise<string> {
  const needsRefresh =
    typeof account.tokenExpiresAt === "number" &&
    account.tokenExpiresAt <= now + TOKEN_REFRESH_MARGIN_MS;
  if (!needsRefresh || !account.refreshToken) {
    return account.accessToken;
  }
  try {
    const grant = await refreshAccessToken(account.refreshToken);
    await db
      .update(traktAccounts)
      .set({
        accessToken: grant.accessToken,
        refreshToken: grant.refreshToken ?? account.refreshToken,
        tokenExpiresAt: grant.expiresAt,
        updatedAt: now,
      })
      .where(eq(traktAccounts.id, account.id));
    return grant.accessToken;
  } catch (error) {
    if (error instanceof TraktAuthError) {
      throw error;
    }
    // Transient refresh failure: the current token may still work.
    return account.accessToken;
  }
}

// ─── Job lifecycle ───

async function latestJobForUser(userId: string): Promise<TraktImportJob | null> {
  const rows = await db
    .select()
    .from(traktImports)
    .where(eq(traktImports.userId, userId))
    .orderBy(desc(traktImports.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function activeJobForUser(userId: string): Promise<TraktImportJob | null> {
  const rows = await db
    .select()
    .from(traktImports)
    .where(
      and(
        eq(traktImports.userId, userId),
        inArray(traktImports.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(traktImports.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function startTraktImportJob(
  userId: string,
  options: TraktImportOptions,
): Promise<TraktImportJob> {
  if (!options.history && !options.ratings && !options.watchlist) {
    throw new ApiError(400, "nothing_to_import", "Pick at least one thing to import");
  }
  const account = await getTraktAccount(userId);
  if (!account) {
    throw new ApiError(400, "trakt_not_connected", "Connect your Trakt account first");
  }
  const active = await activeJobForUser(userId);
  if (active) {
    return active;
  }

  const now = Date.now();
  const jobId = createId("traktimp");
  await db.insert(traktImports).values({
    id: jobId,
    userId,
    status: "queued",
    phase: "fetch",
    options,
    cursor: {},
    counts: {},
    unmatched: null,
    snapshotKey: null,
    error: null,
    failCount: 0,
    leaseUntil: null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  });
  const rows = await db.select().from(traktImports).where(eq(traktImports.id, jobId)).limit(1);
  return rows[0]!;
}

export async function cancelTraktImportJob(userId: string) {
  const active = await activeJobForUser(userId);
  if (!active) {
    return { canceled: false };
  }
  const now = Date.now();
  await db
    .update(traktImports)
    .set({ status: "canceled", completedAt: now, leaseUntil: null, updatedAt: now })
    .where(and(eq(traktImports.id, active.id), inArray(traktImports.status, ["queued", "running"])));
  await deleteSnapshot(active.snapshotKey);
  return { canceled: true };
}

// ─── Status view ───

export type TraktImportJobView = {
  id: string;
  status: TraktImportJob["status"];
  phase: TraktImportPhase;
  options: TraktImportOptions;
  counts: Record<string, number>;
  unmatched: Array<{ title: string; year: number | null; reason: string }>;
  error: string | null;
  progressPercent: number | null;
  createdAt: number;
  completedAt: number | null;
};

function toJobView(job: TraktImportJob): TraktImportJobView {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    options: job.options,
    counts: job.counts ?? {},
    unmatched: job.unmatched ?? [],
    error: job.error,
    progressPercent: computeImportProgressPercent({
      phase: job.phase,
      options: job.options,
      counts: job.counts ?? {},
      cursor: job.cursor ?? {},
    }),
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

export type TraktImportStatusView = {
  configured: boolean;
  account: {
    username: string | null;
    connectedAt: number;
    lastImportedAt: number | null;
  } | null;
  activeImport: TraktImportJobView | null;
  lastImport: TraktImportJobView | null;
};

export async function getTraktImportStatus(userId: string): Promise<TraktImportStatusView> {
  if (!isTraktConfigured()) {
    return { configured: false, account: null, activeImport: null, lastImport: null };
  }
  const [account, latest] = await Promise.all([
    getTraktAccount(userId),
    latestJobForUser(userId),
  ]);
  const activeImport =
    latest && (latest.status === "queued" || latest.status === "running") ? latest : null;
  return {
    configured: true,
    account: account
      ? {
          username: account.traktUsername,
          connectedAt: account.connectedAt,
          lastImportedAt: account.lastImportedAt,
        }
      : null,
    activeImport: activeImport ? toJobView(activeImport) : null,
    lastImport: !activeImport && latest ? toJobView(latest) : null,
  };
}

// ─── Slice runner ───

// Claim the job for one slice. The conditional update is atomic in SQLite,
// so the client pump and the cron can never both hold the lease.
async function claimJobLease(jobId: string, now: number): Promise<TraktImportJob | null> {
  const claimed = await db
    .update(traktImports)
    .set({ status: "running", leaseUntil: now + LEASE_MS, updatedAt: now })
    .where(
      and(
        eq(traktImports.id, jobId),
        inArray(traktImports.status, ["queued", "running"]),
        or(isNull(traktImports.leaseUntil), lte(traktImports.leaseUntil, now)),
      ),
    )
    .returning();
  const job = claimed[0] ?? null;
  if (job && !job.startedAt) {
    await db
      .update(traktImports)
      .set({ startedAt: now })
      .where(eq(traktImports.id, job.id));
    job.startedAt = now;
  }
  return job;
}

// Persist a step's cursor/counters. Guarded on status so a concurrent cancel
// wins: when the update matches nothing the slice must stop immediately.
async function persistJobStep(job: TraktImportJob): Promise<boolean> {
  const now = Date.now();
  const updated = await db
    .update(traktImports)
    .set({
      phase: job.phase,
      cursor: job.cursor,
      counts: job.counts,
      snapshotKey: job.snapshotKey,
      failCount: 0,
      error: null,
      leaseUntil: now + LEASE_MS,
      updatedAt: now,
    })
    .where(and(eq(traktImports.id, job.id), eq(traktImports.status, "running")))
    .returning({ id: traktImports.id });
  return updated.length > 0;
}

async function releaseJobLease(jobId: string, leaseUntil: number | null) {
  await db
    .update(traktImports)
    .set({ leaseUntil, updatedAt: Date.now() })
    .where(and(eq(traktImports.id, jobId), inArray(traktImports.status, ["queued", "running"])));
}

async function failJob(job: TraktImportJob, error: unknown, now: number) {
  const message =
    error instanceof Error ? error.message.slice(0, 500) : "Import failed unexpectedly";
  const isAuthError = error instanceof TraktAuthError;
  const failCount = job.failCount + 1;
  const terminal = isAuthError || failCount >= MAX_JOB_FAILURES;
  if (terminal) {
    await db
      .update(traktImports)
      .set({
        status: "failed",
        error: isAuthError ? "trakt_reconnect_required" : message,
        failCount,
        leaseUntil: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(eq(traktImports.id, job.id), inArray(traktImports.status, ["queued", "running"])));
    await deleteSnapshot(job.snapshotKey);
    return;
  }
  // Transient: back off, keep the job alive for the next tick.
  const backoffMs = Math.min(5 * 60_000, 30_000 * 2 ** failCount);
  await db
    .update(traktImports)
    .set({
      error: message,
      failCount,
      leaseUntil: now + backoffMs,
      updatedAt: now,
    })
    .where(and(eq(traktImports.id, job.id), inArray(traktImports.status, ["queued", "running"])));
}

type SliceContext = {
  job: TraktImportJob;
  snapshot: TraktSnapshot;
  accessToken: string;
  deadline: number;
  now: () => number;
};

function outOfBudget(ctx: SliceContext) {
  return ctx.now() >= ctx.deadline;
}

// Run one bounded slice of the given job. Returns true when the job reached a
// terminal state during this slice.
async function runSliceForJob(jobId: string, budgetMs: number): Promise<boolean> {
  const startedAt = Date.now();
  const job = await claimJobLease(jobId, startedAt);
  if (!job) {
    return false;
  }

  try {
    const account = await getTraktAccount(job.userId);
    if (!account) {
      throw new TraktAuthError("Trakt account was disconnected");
    }
    const accessToken = await ensureFreshAccessToken(account, startedAt);
    const snapshot = job.snapshotKey
      ? ((await readSnapshot(job.snapshotKey)) ?? emptyTraktSnapshot(startedAt))
      : emptyTraktSnapshot(startedAt);

    const ctx: SliceContext = {
      job,
      snapshot,
      accessToken,
      deadline: startedAt + budgetMs,
      now: Date.now,
    };

    while (!outOfBudget(ctx)) {
      const phaseDone = await runPhaseStep(ctx);
      if (phaseDone === "canceled") {
        return true;
      }
      if (phaseDone === "completed") {
        await finalizeJob(ctx);
        return true;
      }
    }
    await releaseJobLease(job.id, null);
    return false;
  } catch (error) {
    const now = Date.now();
    if (error instanceof TraktRetryLaterError) {
      // Not a failure: Trakt asked us to come back later.
      await releaseJobLease(job.id, now + error.retryAfterMs);
      return false;
    }
    console.error("[trakt-import] slice failed", job.id, error);
    await failJob(job, error, now);
    return false;
  }
}

// Advance the current phase by one bounded step. Returns "step" while there
// is more work, "completed" once every phase is done, "canceled" when a
// concurrent cancel/disconnect won.
async function runPhaseStep(ctx: SliceContext): Promise<"step" | "completed" | "canceled"> {
  const { job } = ctx;
  switch (job.phase) {
    case "fetch": {
      const done = await stepFetch(ctx);
      if (done) {
        job.phase = "match";
        job.counts.showsTotal = Object.keys(ctx.snapshot.showRefs).length;
        await writeSnapshot(ensureSnapshotKey(ctx), ctx.snapshot);
      }
      break;
    }
    case "match": {
      const done = await stepMatch(ctx);
      if (done) {
        job.phase = job.options.history ? "progress" : job.options.ratings ? "ratings" : "watchlist";
      }
      break;
    }
    case "progress": {
      const done = await stepProgress(ctx);
      if (done) {
        job.phase = "diary";
      }
      break;
    }
    case "diary": {
      const done = await stepDiary(ctx);
      if (done) {
        job.phase = job.options.ratings ? "ratings" : job.options.watchlist ? "watchlist" : "finalize";
      }
      break;
    }
    case "ratings": {
      const done = await stepRatings(ctx);
      if (done) {
        job.phase = job.options.watchlist ? "watchlist" : "finalize";
      }
      break;
    }
    case "watchlist": {
      const done = await stepWatchlist(ctx);
      if (done) {
        job.phase = "finalize";
      }
      break;
    }
    case "finalize":
      return "completed";
  }

  if (job.phase === "finalize") {
    return "completed";
  }
  const persisted = await persistJobStep(job);
  return persisted ? "step" : "canceled";
}

function ensureSnapshotKey(ctx: SliceContext): string {
  if (!ctx.job.snapshotKey) {
    ctx.job.snapshotKey = snapshotKeyForJob(ctx.job.id);
  }
  return ctx.job.snapshotKey;
}

// ─── Phase: fetch ───

async function stepFetch(ctx: SliceContext): Promise<boolean> {
  const { job, snapshot } = ctx;
  const now = ctx.now();

  if (!(job.cursor.baseFetched ?? 0)) {
    const refs = snapshot.showRefs;
    if (job.options.history) {
      const watchedRaw = await getWatchedShows(ctx.accessToken);
      snapshot.watched = normalizeWatchedShows(watchedRaw, refs, now);
      job.counts.watchedShowsTotal = snapshot.watched.length;
      job.counts.episodesTotal = snapshot.watched.reduce(
        (sum, show) => sum + show.episodes.length,
        0,
      );
    }
    if (job.options.ratings) {
      const [showRatingsRaw, episodeRatingsRaw] = [
        await getShowRatings(ctx.accessToken),
        await getEpisodeRatings(ctx.accessToken),
      ];
      snapshot.showRatings = normalizeShowRatings(showRatingsRaw, refs, now);
      snapshot.episodeRatings = normalizeEpisodeRatings(episodeRatingsRaw, refs, now);
      job.counts.showRatingsTotal = snapshot.showRatings.length;
      job.counts.episodeRatingsTotal = snapshot.episodeRatings.length;
    }
    if (job.options.watchlist) {
      const watchlistRaw = await getWatchlistShows(ctx.accessToken);
      snapshot.watchlist = normalizeWatchlistItems(watchlistRaw, refs, now);
      job.counts.watchlistTotal = snapshot.watchlist.length;
    }
    job.cursor.baseFetched = 1;
    job.cursor.historyPage = 1;
    await writeSnapshot(ensureSnapshotKey(ctx), snapshot);
    return !job.options.history;
  }

  // History pages, a few per step, resumable across slices.
  if (!job.options.history || (job.cursor.historyDone ?? 0)) {
    return true;
  }
  let page = job.cursor.historyPage ?? 1;
  let pageCount = job.cursor.historyPageCount ?? Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < HISTORY_PAGES_PER_STEP; i += 1) {
    if (page > pageCount || snapshot.history.length >= HISTORY_MAX_EVENTS) {
      break;
    }
    const result = await getHistoryEpisodesPage(ctx.accessToken, page, HISTORY_PAGE_LIMIT);
    pageCount = result.pageCount;
    const events = normalizeHistoryItems(result.items, snapshot.showRefs, ctx.now());
    snapshot.history.push(...events);
    page += 1;
    if (result.items.length < HISTORY_PAGE_LIMIT) {
      break;
    }
    if (outOfBudget(ctx)) {
      break;
    }
  }
  const truncated = snapshot.history.length >= HISTORY_MAX_EVENTS;
  const done = page > pageCount || truncated;
  snapshot.historyTruncated = truncated;
  job.cursor.historyPage = page;
  job.cursor.historyPageCount = Number.isFinite(pageCount) ? pageCount : 1;
  job.counts.historyPagesFetched = page - 1;
  job.counts.historyTruncated = truncated ? 1 : 0;
  if (done) {
    // A snapshot write that outran a failed cursor write can leave refetched
    // pages appended twice; event ids make the dedupe exact.
    const seenIds = new Set<number>();
    snapshot.history = snapshot.history.filter((event) =>
      seenIds.has(event.id) ? false : (seenIds.add(event.id), true),
    );
    job.cursor.historyDone = 1;
  }
  job.counts.historyTotal = snapshot.history.length;
  await writeSnapshot(ensureSnapshotKey(ctx), snapshot);
  return done;
}

// ─── Phase: match ───

async function tmdbFetchJson(path: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not configured");
  }
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`TMDB request failed with ${response.status}`);
  }
  return await response.json();
}

// Materialize one TMDB show into the local catalog the same way ingest does:
// shows row upsert, warmed details cache, and an ingest-state row so the
// refresh cron keeps it fresh at the user-attached tier from here on.
async function ingestShowByTmdbId(tmdbId: number, now: number): Promise<string | null> {
  const details = (await tmdbFetchJson(`/tv/${tmdbId}`, {
    append_to_response: "external_ids",
  })) as Parameters<typeof mapDetailsToShowRow>[0] | null;
  if (!details || typeof (details as { id?: unknown }).id !== "number") {
    return null;
  }
  const row = mapDetailsToShowRow(details, now);
  await db
    .insert(shows)
    .values(row)
    .onConflictDoUpdate({
      target: [shows.externalSource, shows.externalId],
      set: {
        title: sql`excluded.title`,
        originalTitle: sql`excluded.original_title`,
        year: sql`excluded.year`,
        overview: sql`excluded.overview`,
        posterUrl: sql`coalesce(excluded.poster_url, "shows"."poster_url")`,
        backdropUrl: sql`coalesce(excluded.backdrop_url, "shows"."backdrop_url")`,
        genreIds: sql`excluded.genre_ids`,
        originalLanguage: sql`excluded.original_language`,
        originCountries: sql`excluded.origin_countries`,
        tmdbPopularity: sql`excluded.tmdb_popularity`,
        tmdbVoteAverage: sql`excluded.tmdb_vote_average`,
        tmdbVoteCount: sql`excluded.tmdb_vote_count`,
        imdbId: sql`CASE WHEN excluded.imdb_id LIKE 'tt%' THEN excluded.imdb_id ELSE coalesce("shows"."imdb_id", excluded.imdb_id) END`,
        searchText: sql`excluded.search_text`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  const inserted = await db
    .select({ id: shows.id })
    .from(shows)
    .where(and(eq(shows.externalSource, "tmdb"), eq(shows.externalId, String(tmdbId))))
    .limit(1);
  const showId = inserted[0]?.id ?? null;
  if (!showId) {
    return null;
  }

  await db
    .insert(tmdbDetailsCache)
    .values({
      id: createId("tmdbdetails"),
      externalSource: "tmdb",
      externalId: String(tmdbId),
      payload: normalizeTmdbShowDetails(details),
      fetchedAt: now,
      expiresAt: now + REFRESH_TIER_MS.userAttached,
    })
    .onConflictDoUpdate({
      target: [tmdbDetailsCache.externalSource, tmdbDetailsCache.externalId],
      set: {
        payload: sql`excluded.payload`,
        fetchedAt: sql`excluded.fetched_at`,
        expiresAt: sql`excluded.expires_at`,
      },
    });
  const popularity = (details as { popularity?: unknown }).popularity;
  await db
    .insert(showIngestState)
    .values({
      id: createId("ingest"),
      tmdbId,
      popularity: typeof popularity === "number" ? popularity : null,
      status: "ingested",
      nextRefreshAt: now + REFRESH_TIER_MS.userAttached,
      lastIngestedAt: now,
      failCount: 0,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: showIngestState.tmdbId });
  return showId;
}

async function resolveTmdbIdFromExternalIds(ref: TraktShowRef): Promise<number | null> {
  const candidates: Array<{ id: string; source: string }> = [];
  if (ref.imdbId) {
    candidates.push({ id: ref.imdbId, source: "imdb_id" });
  }
  if (ref.tvdbId !== null) {
    candidates.push({ id: String(ref.tvdbId), source: "tvdb_id" });
  }
  for (const candidate of candidates) {
    const payload = (await tmdbFetchJson(`/find/${candidate.id}`, {
      external_source: candidate.source,
    })) as { tv_results?: Array<{ id?: number }> } | null;
    const tmdbId = payload?.tv_results?.[0]?.id;
    if (typeof tmdbId === "number") {
      return tmdbId;
    }
  }
  return null;
}

async function stepMatch(ctx: SliceContext): Promise<boolean> {
  const { job, snapshot } = ctx;
  const keys = Object.keys(snapshot.showRefs).sort();
  const start = job.cursor.matchIndex ?? 0;
  if (start >= keys.length) {
    return true;
  }
  const now = ctx.now();
  const batchKeys = keys.slice(start, start + MATCH_SHOWS_PER_STEP);
  const refs = batchKeys.map((key) => snapshot.showRefs[key]);

  // Fast path: shows already in the local catalog by TMDB id.
  const tmdbIdByKey = new Map<string, number>();
  for (const ref of refs) {
    if (ref.tmdbId !== null) {
      tmdbIdByKey.set(ref.key, ref.tmdbId);
    }
  }
  const localByTmdbId = new Map<string, string>();
  const tmdbIds = Array.from(new Set(Array.from(tmdbIdByKey.values()))).map(String);
  for (const chunk of chunkForSqlParams(tmdbIds, 1, 80)) {
    const rows = await db
      .select({ id: shows.id, externalId: shows.externalId })
      .from(shows)
      .where(and(eq(shows.externalSource, "tmdb"), inArray(shows.externalId, chunk)));
    for (const row of rows) {
      localByTmdbId.set(row.externalId, row.id);
    }
  }

  // Whatever is left needs TMDB: id discovery for tmdb-less refs, then a
  // details fetch to materialize missing shows into the catalog.
  const pending = refs.filter(
    (ref) => !(ref.tmdbId !== null && localByTmdbId.has(String(ref.tmdbId))),
  );
  for (let i = 0; i < pending.length; i += MATCH_FETCH_CONCURRENCY) {
    const group = pending.slice(i, i + MATCH_FETCH_CONCURRENCY);
    await Promise.all(
      group.map(async (ref) => {
        try {
          let tmdbId = ref.tmdbId;
          if (tmdbId === null) {
            tmdbId = await resolveTmdbIdFromExternalIds(ref);
            if (tmdbId === null) {
              snapshot.mapping[ref.key] = null;
              snapshot.unmatchedReasons[ref.key] =
                ref.imdbId || ref.tvdbId !== null ? "no_tmdb_match" : "no_ids";
              return;
            }
          }
          const existing = localByTmdbId.get(String(tmdbId));
          const showId = existing ?? (await ingestShowByTmdbId(tmdbId, now));
          if (showId) {
            snapshot.mapping[ref.key] = showId;
          } else {
            snapshot.mapping[ref.key] = null;
            snapshot.unmatchedReasons[ref.key] = "not_on_tmdb";
          }
        } catch (error) {
          // Transient failure for one show must not sink the batch; the
          // report calls it out so the user can retry.
          console.error("[trakt-import] match failed", ref.key, error);
          snapshot.mapping[ref.key] = null;
          snapshot.unmatchedReasons[ref.key] = "lookup_failed";
        }
      }),
    );
  }
  for (const ref of refs) {
    if (snapshot.mapping[ref.key] === undefined) {
      const tmdbId = tmdbIdByKey.get(ref.key);
      snapshot.mapping[ref.key] =
        tmdbId !== undefined ? (localByTmdbId.get(String(tmdbId)) ?? null) : null;
    }
  }

  job.cursor.matchIndex = start + batchKeys.length;
  const resolved = Object.values(snapshot.mapping);
  job.counts.showsMatched = resolved.filter((value) => value !== null).length;
  job.counts.showsUnmatched = resolved.filter((value) => value === null).length;
  await writeSnapshot(ensureSnapshotKey(ctx), snapshot);
  return job.cursor.matchIndex >= keys.length;
}

// ─── Phase: progress ───

// Local mirror of the season-summary/ended readers in rpc.ts (kept tiny and
// tolerant of both normalized and raw TMDB payload key styles).
function readSeasonSummariesFromPayload(payload: unknown) {
  const raw = (payload as { seasons?: unknown })?.seasons;
  if (!Array.isArray(raw)) return [];
  return normalizeEpisodeSeasonSummaries(
    raw
      .map((season) => {
        const seasonNumber =
          (season?.seasonNumber as number | undefined) ??
          (season?.season_number as number | undefined);
        const episodeCount =
          (season?.episodeCount as number | undefined) ??
          (season?.episode_count as number | undefined) ??
          0;
        const airDate =
          (season?.airDate as string | null | undefined) ??
          (season?.air_date as string | null | undefined) ??
          null;
        if (typeof seasonNumber !== "number" || seasonNumber < 1) {
          return null;
        }
        return { seasonNumber, episodeCount: Math.max(0, episodeCount), airDate };
      })
      .filter((season): season is NonNullable<typeof season> => Boolean(season)),
  );
}

function isEndedPayload(payload: unknown): boolean {
  const status = (payload as { status?: unknown })?.status;
  return typeof status === "string" && /^(ended|canceled|cancelled)$/i.test(status.trim());
}

async function loadImportProgressFacts(
  userId: string,
  show: { id: string; externalSource: string; externalId: string },
): Promise<ShowProgressFacts> {
  const [progressRows, detailRows] = await Promise.all([
    db
      .select({
        seasonNumber: episodeProgress.seasonNumber,
        episodeNumber: episodeProgress.episodeNumber,
      })
      .from(episodeProgress)
      .where(and(eq(episodeProgress.userId, userId), eq(episodeProgress.showId, show.id))),
    db
      .select()
      .from(tmdbDetailsCache)
      .where(
        and(
          eq(tmdbDetailsCache.externalSource, show.externalSource),
          eq(tmdbDetailsCache.externalId, show.externalId),
        ),
      )
      .limit(1),
  ]);
  const payload = detailRows[0]?.payload;
  return computeShowProgressFacts({
    watchedEpisodes: progressRows,
    seasons: readSeasonSummariesFromPayload(payload),
    isEnded: isEndedPayload(payload),
    lastAiredEpisode: readLastAiredEpisode(payload),
  });
}

// Same contract as the app's post-mark reconciliation: land the show on the
// tier its progress supports, resuming watchlist/paused/dropped shows into
// the watch tier, and never inventing a status the state machine wouldn't.
async function reconcileShowStatusAfterImport(
  userId: string,
  showId: string,
  now: number,
): Promise<boolean> {
  const [stateRows, showRows] = await Promise.all([
    db
      .select()
      .from(watchStates)
      .where(and(eq(watchStates.userId, userId), eq(watchStates.showId, showId)))
      .limit(1),
    db.select().from(shows).where(eq(shows.id, showId)).limit(1),
  ]);
  const currentStatus = (stateRows[0]?.status ?? null) as LegacyWatchStatus | null;
  const show = showRows[0];

  let facts: ShowProgressFacts = {
    hasWatchedAny: true,
    hasReleasedAfterFrontier: true,
    isEnded: false,
    gapEpisodes: [],
    releasedCount: 0,
  };
  if (show && show.externalSource === "tmdb") {
    try {
      facts = await loadImportProgressFacts(userId, show);
      if (!facts.hasWatchedAny) {
        facts = { ...facts, hasWatchedAny: true };
      }
    } catch {
      // Best-effort refinement; the progress rows already landed.
    }
  }

  const status = resolveStatusAfterEpisodeChange({
    direction: "marked",
    currentStatus,
    facts,
  });
  if (!status || status === currentStatus) {
    return false;
  }
  await db
    .insert(watchStates)
    .values({ id: createId("state"), userId, showId, status, updatedAt: now })
    .onConflictDoUpdate({
      target: [watchStates.userId, watchStates.showId],
      set: { status, updatedAt: now },
    });
  return true;
}

async function stepProgress(ctx: SliceContext): Promise<boolean> {
  const { job, snapshot } = ctx;
  const start = job.cursor.progressIndex ?? 0;
  if (start >= snapshot.watched.length) {
    return true;
  }
  const now = ctx.now();
  const batch = snapshot.watched.slice(start, start + PROGRESS_SHOWS_PER_STEP);

  for (const watchedShow of batch) {
    const showId = snapshot.mapping[watchedShow.key];
    if (!showId) {
      job.counts.episodesSkippedUnmatched =
        (job.counts.episodesSkippedUnmatched ?? 0) + watchedShow.episodes.length;
      continue;
    }
    let created = 0;
    for (const chunk of chunkForSqlParams(watchedShow.episodes, 6, 80)) {
      const inserted = await db
        .insert(episodeProgress)
        .values(
          chunk.map((episode) => ({
            id: createId("episode"),
            userId: job.userId,
            showId,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            watchedAt: episode.lastWatchedAt ?? now,
          })),
        )
        .onConflictDoNothing({
          target: [
            episodeProgress.userId,
            episodeProgress.showId,
            episodeProgress.seasonNumber,
            episodeProgress.episodeNumber,
          ],
        })
        .returning({ id: episodeProgress.id });
      created += inserted.length;
    }
    job.counts.episodesImported = (job.counts.episodesImported ?? 0) + created;
    job.counts.episodesExisting =
      (job.counts.episodesExisting ?? 0) + (watchedShow.episodes.length - created);
    if (created > 0) {
      const changed = await reconcileShowStatusAfterImport(job.userId, showId, now);
      if (changed) {
        job.counts.statusesUpdated = (job.counts.statusesUpdated ?? 0) + 1;
      }
    }
    if (outOfBudget(ctx)) {
      job.cursor.progressIndex = start + batch.indexOf(watchedShow) + 1;
      return false;
    }
  }

  job.cursor.progressIndex = start + batch.length;
  return job.cursor.progressIndex >= snapshot.watched.length;
}

// ─── Phase: diary ───

async function stepDiary(ctx: SliceContext): Promise<boolean> {
  const { job, snapshot } = ctx;
  const start = job.cursor.diaryIndex ?? 0;
  if (start >= snapshot.history.length) {
    return true;
  }
  const now = ctx.now();
  // Recomputed per step from the full event list; cheap, deterministic, and
  // stateless across resumes.
  const rewatchFlags = computeRewatchFlags(snapshot.history);
  const batch = snapshot.history.slice(start, start + DIARY_EVENTS_PER_STEP);

  const rows: Array<typeof watchLogs.$inferInsert> = [];
  for (const event of batch) {
    const showId = snapshot.mapping[event.key];
    if (!showId) {
      job.counts.logsSkippedUnmatched = (job.counts.logsSkippedUnmatched ?? 0) + 1;
      continue;
    }
    rows.push({
      id: traktLogId(event.id),
      userId: job.userId,
      showId,
      watchedAt: event.watchedAt,
      note: null,
      seasonNumber: event.seasonNumber,
      episodeNumber: event.episodeNumber,
      episodeTitle: event.episodeTitle,
      datePrecision: "exact",
      watchedOn: null,
      createdAt: now,
      rating: null,
      reaction: null,
      isRewatch: rewatchFlags.get(event.id) ?? false,
    });
  }

  let created = 0;
  for (const chunk of chunkForSqlParams(rows, 14, 84)) {
    // Deterministic ids + primary-key conflict handling make re-imports
    // no-ops. Imported viewings never fan out to follower feeds.
    const inserted = await db
      .insert(watchLogs)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: watchLogs.id });
    created += inserted.length;
  }
  job.counts.logsImported = (job.counts.logsImported ?? 0) + created;
  job.counts.logsExisting = (job.counts.logsExisting ?? 0) + (rows.length - created);

  job.cursor.diaryIndex = start + batch.length;
  return job.cursor.diaryIndex >= snapshot.history.length;
}

// ─── Phase: ratings ───

async function importShowRatingsStep(ctx: SliceContext): Promise<boolean> {
  const { job, snapshot } = ctx;
  const start = job.cursor.showRatingIndex ?? 0;
  if (start >= snapshot.showRatings.length) {
    return true;
  }
  const now = ctx.now();
  const batch = snapshot.showRatings.slice(start, start + RATINGS_PER_STEP);

  const candidates = batch
    .map((item) => ({ item, showId: snapshot.mapping[item.key] }))
    .filter((entry): entry is { item: (typeof batch)[number]; showId: string } => {
      if (!entry.showId) {
        job.counts.ratingsSkippedUnmatched = (job.counts.ratingsSkippedUnmatched ?? 0) + 1;
        return false;
      }
      return true;
    });

  // A rating the user already set in Plotlist always wins over the import.
  const existingShowIds = new Set<string>();
  for (const chunk of chunkForSqlParams(candidates.map((entry) => entry.showId), 1, 80)) {
    const rows = await db
      .select({ showId: reviews.showId })
      .from(reviews)
      .where(
        and(
          eq(reviews.authorId, job.userId),
          inArray(reviews.showId, chunk),
          isNull(reviews.seasonNumber),
          isNull(reviews.episodeNumber),
        ),
      );
    for (const row of rows) {
      existingShowIds.add(row.showId);
    }
  }

  const rows: Array<typeof reviews.$inferInsert> = [];
  for (const entry of candidates) {
    if (existingShowIds.has(entry.showId)) {
      job.counts.ratingsExisting = (job.counts.ratingsExisting ?? 0) + 1;
      continue;
    }
    rows.push({
      id: traktReviewId({ traktKey: entry.item.key }),
      authorId: job.userId,
      showId: entry.showId,
      rating: entry.item.rating,
      reviewText: null,
      spoiler: false,
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      createdAt: entry.item.ratedAt ?? now,
      updatedAt: null,
    });
  }
  let created = 0;
  for (const chunk of chunkForSqlParams(rows, 11, 88)) {
    const inserted = await db
      .insert(reviews)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: reviews.id });
    created += inserted.length;
  }
  job.counts.ratingsImported = (job.counts.ratingsImported ?? 0) + created;

  job.cursor.showRatingIndex = start + batch.length;
  return job.cursor.showRatingIndex >= snapshot.showRatings.length;
}

async function importEpisodeRatingsStep(ctx: SliceContext): Promise<boolean> {
  const { job, snapshot } = ctx;
  const start = job.cursor.episodeRatingIndex ?? 0;
  if (start >= snapshot.episodeRatings.length) {
    return true;
  }
  const now = ctx.now();
  const batch = snapshot.episodeRatings.slice(start, start + RATINGS_PER_STEP);

  const candidates = batch
    .map((item) => ({ item, showId: snapshot.mapping[item.key] }))
    .filter((entry): entry is { item: (typeof batch)[number]; showId: string } => {
      if (!entry.showId) {
        job.counts.ratingsSkippedUnmatched = (job.counts.ratingsSkippedUnmatched ?? 0) + 1;
        return false;
      }
      return true;
    });

  const existingKeys = new Set<string>();
  for (const chunk of chunkForSqlParams(
    Array.from(new Set(candidates.map((entry) => entry.showId))),
    1,
    80,
  )) {
    const rows = await db
      .select({
        showId: reviews.showId,
        seasonNumber: reviews.seasonNumber,
        episodeNumber: reviews.episodeNumber,
      })
      .from(reviews)
      .where(and(eq(reviews.authorId, job.userId), inArray(reviews.showId, chunk)));
    for (const row of rows) {
      if (row.seasonNumber !== null && row.episodeNumber !== null) {
        existingKeys.add(`${row.showId}|${row.seasonNumber}|${row.episodeNumber}`);
      }
    }
  }

  const rows: Array<typeof reviews.$inferInsert> = [];
  for (const entry of candidates) {
    const key = `${entry.showId}|${entry.item.seasonNumber}|${entry.item.episodeNumber}`;
    if (existingKeys.has(key)) {
      job.counts.ratingsExisting = (job.counts.ratingsExisting ?? 0) + 1;
      continue;
    }
    rows.push({
      id: traktReviewId({
        traktKey: entry.item.key,
        seasonNumber: entry.item.seasonNumber,
        episodeNumber: entry.item.episodeNumber,
      }),
      authorId: job.userId,
      showId: entry.showId,
      rating: entry.item.rating,
      reviewText: null,
      spoiler: false,
      seasonNumber: entry.item.seasonNumber,
      episodeNumber: entry.item.episodeNumber,
      episodeTitle: null,
      createdAt: entry.item.ratedAt ?? now,
      updatedAt: null,
    });
  }
  let created = 0;
  for (const chunk of chunkForSqlParams(rows, 11, 88)) {
    const inserted = await db
      .insert(reviews)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: reviews.id });
    created += inserted.length;
  }
  job.counts.ratingsImported = (job.counts.ratingsImported ?? 0) + created;

  job.cursor.episodeRatingIndex = start + batch.length;
  return job.cursor.episodeRatingIndex >= snapshot.episodeRatings.length;
}

async function stepRatings(ctx: SliceContext): Promise<boolean> {
  const showsDone = await importShowRatingsStep(ctx);
  if (!showsDone || outOfBudget(ctx)) {
    return false;
  }
  return await importEpisodeRatingsStep(ctx);
}

// ─── Phase: watchlist ───

async function stepWatchlist(ctx: SliceContext): Promise<boolean> {
  const { job, snapshot } = ctx;
  const start = job.cursor.watchlistIndex ?? 0;
  if (start >= snapshot.watchlist.length) {
    return true;
  }
  const now = ctx.now();
  const batch = snapshot.watchlist.slice(start, start + WATCHLIST_PER_STEP);

  const rows: Array<typeof watchStates.$inferInsert> = [];
  for (const item of batch) {
    const showId = snapshot.mapping[item.key];
    if (!showId) {
      job.counts.watchlistSkippedUnmatched = (job.counts.watchlistSkippedUnmatched ?? 0) + 1;
      continue;
    }
    rows.push({
      id: createId("state"),
      userId: job.userId,
      showId,
      status: "watchlist",
      updatedAt: item.listedAt ?? now,
    });
  }
  let created = 0;
  for (const chunk of chunkForSqlParams(rows, 5, 80)) {
    // Any existing status wins — including the watching/finished tiers the
    // progress phase just derived, and user-intent statuses like dropped.
    const inserted = await db
      .insert(watchStates)
      .values(chunk)
      .onConflictDoNothing({ target: [watchStates.userId, watchStates.showId] })
      .returning({ id: watchStates.id });
    created += inserted.length;
  }
  job.counts.watchlistAdded = (job.counts.watchlistAdded ?? 0) + created;
  job.counts.watchlistExisting = (job.counts.watchlistExisting ?? 0) + (rows.length - created);

  job.cursor.watchlistIndex = start + batch.length;
  return job.cursor.watchlistIndex >= snapshot.watchlist.length;
}

// ─── Finalize ───

async function finalizeJob(ctx: SliceContext) {
  const { job, snapshot } = ctx;
  const now = ctx.now();
  const unmatched = Object.entries(snapshot.unmatchedReasons)
    .slice(0, UNMATCHED_REPORT_LIMIT)
    .map(([key, reason]) => ({
      title: snapshot.showRefs[key]?.title ?? key,
      year: snapshot.showRefs[key]?.year ?? null,
      reason,
    }));

  await db
    .update(traktImports)
    .set({
      status: "completed",
      phase: "finalize",
      cursor: job.cursor,
      counts: job.counts,
      unmatched,
      error: null,
      leaseUntil: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(traktImports.id, job.id), eq(traktImports.status, "running")));
  await db
    .update(traktAccounts)
    .set({ lastImportedAt: now, updatedAt: now })
    .where(eq(traktAccounts.userId, job.userId));
  await deleteSnapshot(job.snapshotKey);
}

// ─── Entry points ───

// Client pump: advance the caller's own active job by one short slice so the
// import races ahead while the screen is open.
export async function runTraktImportTickForUser(userId: string) {
  const active = await activeJobForUser(userId);
  if (active) {
    await runSliceForJob(active.id, CLIENT_SLICE_BUDGET_MS);
  }
  return await getTraktImportStatus(userId);
}

// Cron pump: advance the most-stale runnable job so imports finish even when
// nobody has the app open. One job per tick keeps the minute cron predictable.
export async function runTraktImportCronTick(): Promise<{ ran: boolean; jobId?: string }> {
  if (!isTraktConfigured()) {
    return { ran: false };
  }
  const now = Date.now();
  const rows = await db
    .select({ id: traktImports.id })
    .from(traktImports)
    .where(
      and(
        inArray(traktImports.status, ["queued", "running"]),
        or(isNull(traktImports.leaseUntil), lte(traktImports.leaseUntil, now)),
      ),
    )
    .orderBy(traktImports.updatedAt)
    .limit(1);
  const job = rows[0];
  if (!job) {
    return { ran: false };
  }
  await runSliceForJob(job.id, CRON_SLICE_BUDGET_MS);
  return { ran: true, jobId: job.id };
}

// Kick a freshly started job forward immediately (called right after
// startTraktImportJob) so the first status poll already shows progress.
export async function runInitialSliceForJob(jobId: string) {
  await runSliceForJob(jobId, CLIENT_SLICE_BUDGET_MS);
}

// ─── Cleanup (6-hourly cron) ───

export async function cleanupTraktImportArtifacts(now = Date.now()) {
  const [expiredAuths] = await Promise.all([
    db
      .delete(traktDeviceAuths)
      .where(lte(traktDeviceAuths.expiresAt, now - DEVICE_AUTH_RETENTION_MS))
      .returning({ id: traktDeviceAuths.id }),
  ]);

  // Jobs that stopped moving entirely (e.g. a code path that can no longer
  // run) fail closed instead of pinning "importing…" forever.
  const stalled = await db
    .update(traktImports)
    .set({
      status: "failed",
      error: "stalled",
      leaseUntil: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(traktImports.status, ["queued", "running"]),
        lte(traktImports.updatedAt, now - STALLED_JOB_MS),
      ),
    )
    .returning({ id: traktImports.id, snapshotKey: traktImports.snapshotKey });
  for (const job of stalled) {
    await deleteSnapshot(job.snapshotKey);
  }

  const oldJobs = await db
    .select({ id: traktImports.id, snapshotKey: traktImports.snapshotKey })
    .from(traktImports)
    .where(
      and(
        inArray(traktImports.status, ["completed", "failed", "canceled"]),
        lte(traktImports.updatedAt, now - JOB_RETENTION_MS),
      ),
    );
  for (const job of oldJobs) {
    await deleteSnapshot(job.snapshotKey);
  }
  for (const chunk of chunkForSqlParams(oldJobs.map((job) => job.id), 1, 80)) {
    await db.delete(traktImports).where(inArray(traktImports.id, chunk));
  }

  return {
    removedDeviceAuths: expiredAuths.length,
    stalledJobs: stalled.length,
    removedJobs: oldJobs.length,
  };
}
