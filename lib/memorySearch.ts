// Pure logic for memory search: "that show with the time loop I watched last
// winter" over the viewer's own watch history. Extracts a fuzzy time window
// from the query with cheap heuristics (no LLM call), strips the temporal /
// first-person framing so the embedding sees only the content description,
// and ranks candidates with an in-window boost. Server-side data access lives
// in api/_lib/memory-search.ts; this module stays jest-importable.

import { normalizeSemanticScores } from "./plotlist/recsRanking";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_UTC_OFFSET_MINUTES = 14 * 60;

// Watch timestamps near a window's edges still count — people's memory of
// "last winter" is fuzzy by a few weeks.
export const MEMORY_WINDOW_GRACE_MS = 21 * MS_PER_DAY;
export const MEMORY_RESULT_LIMIT = 10;
// Boost added to the normalized semantic score when the user actually watched
// the show inside the remembered window. Normalized scores span [0.35, 0.95],
// so this is decisive between close matches without letting a weak match win
// on recency alone.
const IN_WINDOW_BOOST = 0.3;

export type MemoryTimeWindow = {
  startMs: number;
  endMs: number; // exclusive
  label: string;
};

export type ParsedMemoryQuery = {
  semanticQuery: string;
  window: MemoryTimeWindow | null;
};

// Local-time view: shift by the user's offset, then use UTC accessors —
// mirrors lib/watchInsights.ts.
function localDate(timestamp: number, offsetMinutes: number): Date {
  return new Date(timestamp + offsetMinutes * 60_000);
}

function clampOffset(value: number | null | undefined): number {
  const offset = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(-MAX_UTC_OFFSET_MINUTES, Math.min(MAX_UTC_OFFSET_MINUTES, offset));
}

// A local wall-clock (year, monthIndex, day) → the UTC epoch of that local
// instant (start of day), given the user's offset.
function localStartMs(year: number, monthIndex: number, day: number, offsetMinutes: number) {
  return Date.UTC(year, monthIndex, day) - offsetMinutes * 60_000;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

const SEASONS: Record<string, { startMonth: number; months: number }> = {
  // Northern-hemisphere meteorological seasons; winter belongs to the year it
  // starts in (winter 2025 = Dec 2025 – Feb 2026).
  winter: { startMonth: 11, months: 3 },
  spring: { startMonth: 2, months: 3 },
  summer: { startMonth: 5, months: 3 },
  fall: { startMonth: 8, months: 3 },
  autumn: { startMonth: 8, months: 3 },
};

type WindowMatch = { pattern: RegExp; window: MemoryTimeWindow };

function buildWindowMatchers(now: number, offsetMinutes: number): WindowMatch[] {
  const local = localDate(now, offsetMinutes);
  const year = local.getUTCFullYear();
  const monthIndex = local.getUTCMonth();
  const matchers: WindowMatch[] = [];
  const start = (y: number, m: number, d = 1) => localStartMs(y, m, d, offsetMinutes);

  // Seasons: "last winter" / "this past summer" / "over the fall" → the most
  // recent occurrence that has started. The temporal qualifier is required —
  // a bare season name is usually a content description ("cozy winter show"),
  // not a time reference.
  for (const [name, season] of Object.entries(SEASONS)) {
    let startYear = year;
    if (season.startMonth > monthIndex) startYear -= 1;
    let startMs = start(startYear, season.startMonth);
    let endMs = start(startYear, season.startMonth + season.months);
    // "Last <season>" while inside that season points at the previous one.
    const insideNow = now >= startMs && now < endMs;
    if (insideNow) {
      startYear -= 1;
      startMs = start(startYear, season.startMonth);
      endMs = start(startYear, season.startMonth + season.months);
    }
    matchers.push({
      pattern: new RegExp(
        `\\b(?:last|this past|this|over the|during the|back in the)\\s+${name}\\b`,
        "i",
      ),
      window: { startMs, endMs, label: `${name} ${startYear}` },
    });
  }

  // Month names: "last march" / "in march" → most recent occurrence that has
  // started (current month counts).
  MONTH_NAMES.forEach((name, index) => {
    const startYear = index > monthIndex ? year - 1 : year;
    matchers.push({
      pattern: new RegExp(`\\b(?:last|this past|in|during|back in)\\s+${name}\\b`, "i"),
      window: {
        startMs: start(startYear, index),
        endMs: start(startYear, index + 1),
        label: `${name.charAt(0).toUpperCase()}${name.slice(1)} ${startYear}`,
      },
    });
  });

  // Holidays: most recent mid-December → early January span.
  const holidayYear = monthIndex === 11 ? year : year - 1;
  matchers.push({
    pattern: /\b(?:(?:over|during|around|at|for)\s+)?(?:the\s+)?(?:holidays|christmas(?:\s+break)?|new\s+year(?:'?s)?(?:\s+eve)?)\b/i,
    window: {
      startMs: start(holidayYear, 11, 15),
      endMs: start(holidayYear + 1, 0, 8),
      label: `the ${holidayYear} holidays`,
    },
  });

  // Calendar units.
  matchers.push(
    {
      pattern: /\blast\s+year\b/i,
      window: { startMs: start(year - 1, 0), endMs: start(year, 0), label: `${year - 1}` },
    },
    {
      pattern: /\bthis\s+year\b/i,
      window: { startMs: start(year, 0), endMs: now + MS_PER_DAY, label: `${year}` },
    },
    {
      pattern: /\blast\s+month\b/i,
      window: {
        startMs: start(year, monthIndex - 1),
        endMs: start(year, monthIndex),
        label: "last month",
      },
    },
    {
      pattern: /\bthis\s+month\b/i,
      window: {
        startMs: start(year, monthIndex),
        endMs: now + MS_PER_DAY,
        label: "this month",
      },
    },
    {
      pattern: /\blast\s+week\b/i,
      window: { startMs: now - 14 * MS_PER_DAY, endMs: now + MS_PER_DAY, label: "last week" },
    },
    {
      pattern: /\b(?:recently|lately|the\s+other\s+day|a\s+few\s+weeks\s+ago)\b/i,
      window: { startMs: now - 60 * MS_PER_DAY, endMs: now + MS_PER_DAY, label: "recently" },
    },
  );

  // Explicit years: "in 2023" / "back in 2019" — preposition required so
  // titles like "1899" never match.
  matchers.push({
    pattern: /\b(?:in|during|back in|from)\s+((?:19[89]|20[0-4])\d)\b/i,
    window: { startMs: 0, endMs: 0, label: "" }, // filled at match time
  });

  return matchers;
}

const YEAR_PATTERN = /\b(?:in|during|back in|from)\s+((?:19[89]|20[0-4])\d)\b/i;

// First-person watching phrases carry no content signal for the embedding:
// "that show ... I watched" → "that show ...".
const FRAMING_PATTERNS = [
  /\b(?:that|which)?\s*(?:i|we)\s+(?:was|were|got|had)?\s*(?:watch(?:ed|ing)?|saw|seen|binge[d]?(?:-watched)?|stream(?:ed|ing)?|finish(?:ed)?|start(?:ed)?)\b/gi,
];

function cleanupSemanticQuery(text: string): string {
  let cleaned = text;
  for (const pattern of FRAMING_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  cleaned = cleaned
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[,;:\s]+$/g, "")
    .trim();
  return cleaned;
}

export function parseMemoryQuery(
  rawText: string,
  options: { now?: number; utcOffsetMinutes?: number } = {},
): ParsedMemoryQuery {
  const now = options.now ?? Date.now();
  const offsetMinutes = clampOffset(options.utcOffsetMinutes);
  const text = rawText.replace(/\s+/g, " ").trim();

  let window: MemoryTimeWindow | null = null;
  let stripped = text;

  const yearMatch = text.match(YEAR_PATTERN);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    window = {
      startMs: localStartMs(year, 0, 1, offsetMinutes),
      endMs: localStartMs(year + 1, 0, 1, offsetMinutes),
      label: `${year}`,
    };
    stripped = text.replace(YEAR_PATTERN, " ");
  } else {
    for (const matcher of buildWindowMatchers(now, offsetMinutes)) {
      if (matcher.window.label === "") continue; // year matcher handled above
      const match = stripped.match(matcher.pattern);
      if (!match) continue;
      window = matcher.window;
      stripped = stripped.replace(matcher.pattern, " ");
      break;
    }
  }

  const semanticQuery = cleanupSemanticQuery(stripped) || text;
  return { semanticQuery, window };
}

export type MemoryCandidate = {
  showId: string;
  semanticScore: number;
  lastWatchedAt: number | null;
  // Most recent watch timestamp inside the (grace-padded) window, when known.
  inWindowWatchedAt?: number | null;
};

export type RankedMemoryCandidate = MemoryCandidate & { finalScore: number };

export function rankMemoryCandidates(
  candidates: MemoryCandidate[],
  window: MemoryTimeWindow | null,
  limit = MEMORY_RESULT_LIMIT,
): RankedMemoryCandidate[] {
  const normalized = normalizeSemanticScores(
    candidates.map((candidate) => ({ ...candidate })),
  );
  return normalized
    .map((candidate) => {
      const inWindow =
        window !== null &&
        typeof candidate.inWindowWatchedAt === "number" &&
        candidate.inWindowWatchedAt !== null;
      return {
        ...candidate,
        finalScore: candidate.semanticScore + (inWindow ? IN_WINDOW_BOOST : 0),
      };
    })
    .sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        (right.lastWatchedAt ?? 0) - (left.lastWatchedAt ?? 0) ||
        left.showId.localeCompare(right.showId),
    )
    .slice(0, limit);
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// "Watched Jan 2026" / "Watched this month" for result rows.
export function formatWatchedLabel(
  watchedAt: number | null,
  options: { now?: number; utcOffsetMinutes?: number } = {},
): string | null {
  if (watchedAt === null || !Number.isFinite(watchedAt)) return null;
  const now = options.now ?? Date.now();
  const offsetMinutes = clampOffset(options.utcOffsetMinutes);
  const watched = localDate(watchedAt, offsetMinutes);
  const current = localDate(now, offsetMinutes);
  if (
    watched.getUTCFullYear() === current.getUTCFullYear() &&
    watched.getUTCMonth() === current.getUTCMonth()
  ) {
    return "Watched this month";
  }
  return `Watched ${SHORT_MONTHS[watched.getUTCMonth()]} ${watched.getUTCFullYear()}`;
}
