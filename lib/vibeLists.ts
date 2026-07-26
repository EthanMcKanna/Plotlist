// Pure logic for Smart Lists ("saved vibes"): lists whose membership is
// generated from a saved Ask Plotlist query and refreshed by cron as new
// shows are ingested. Server-side data access lives in api/_lib/vibe-lists.ts;
// this module stays importable by jest (no DB/network imports).

// Membership caps: a smart list seeds with the strongest matches and grows by
// appending new ones — refresh never removes, so the cap keeps living lists
// from sprawling.
export const VIBE_LIST_SEED_LIMIT = 24;
export const VIBE_LIST_MAX_ITEMS = 60;
// A list is due for refresh once its last refresh is older than this. The
// hourly cron spreads work out; new catalog embeds land within ~5 minutes of
// ingest, so half-daily membership updates are plenty.
export const VIBE_LIST_REFRESH_STALE_MS = 12 * 60 * 60 * 1000;
export const VIBE_LIST_REFRESH_BATCH_LIMIT = 20;
// Owner-removed shows are remembered so refresh never re-adds them.
export const VIBE_LIST_MAX_EXCLUDED_IDS = 200;

const VIBE_TITLE_MAX_CHARS = 60;

// "cozy sci-fi with found family" → "Cozy sci-fi with found family".
// Falls back to "My vibe" for degenerate input; list titles cap at 100 chars
// server-side, we stay well under.
export function deriveVibeListTitle(query: string): string {
  const collapsed = query.replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "");
  if (!collapsed) return "My vibe";
  let title = collapsed;
  if (title.length > VIBE_TITLE_MAX_CHARS) {
    const cut = title.slice(0, VIBE_TITLE_MAX_CHARS + 1);
    const lastSpace = cut.lastIndexOf(" ");
    title = (lastSpace > 24 ? cut.slice(0, lastSpace) : cut.slice(0, VIBE_TITLE_MAX_CHARS)).trimEnd();
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}

// Which ranked matches should be appended to a smart list right now.
// Preserves match order, skips current members and owner-removed shows, and
// respects the size cap. Pure so the diff rules are unit-testable.
export function computeVibeListAdditions(args: {
  rankedShowIds: string[];
  existingShowIds: Iterable<string>;
  excludedShowIds?: string[] | null;
  maxItems?: number;
}): string[] {
  const existing = new Set(args.existingShowIds);
  const excluded = new Set(args.excludedShowIds ?? []);
  const maxItems = args.maxItems ?? VIBE_LIST_MAX_ITEMS;
  const room = maxItems - existing.size;
  if (room <= 0) return [];
  const additions: string[] = [];
  for (const showId of args.rankedShowIds) {
    if (additions.length >= room) break;
    if (existing.has(showId) || excluded.has(showId)) continue;
    existing.add(showId);
    additions.push(showId);
  }
  return additions;
}

// Append a removed show to the exclusion memory, newest last, capped.
export function appendVibeExclusion(
  excludedShowIds: string[] | null | undefined,
  showId: string,
): string[] {
  const next = (excludedShowIds ?? []).filter((id) => id !== showId);
  next.push(showId);
  return next.slice(-VIBE_LIST_MAX_EXCLUDED_IDS);
}
