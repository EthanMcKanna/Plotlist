// Pure decisions behind the "watched it all" / "watched up to here" write
// paths, kept out of rpc.ts so they can be unit-tested without a database.

export type CachedDetailFreshness = "missing" | "stale" | "fresh";

// How much to trust the cached TMDB details a status change reads. A show
// with no cached row at all has nothing to backfill from, so the caller must
// fetch inline; an expired row is still good enough to act on (a slightly old
// released-through pointer beats making the user wait on TMDB) and only asks
// for a background refresh; a live row needs nothing.
export function classifyCachedDetailFreshness(
  context: { detailCacheId: string | null; detailExpiresAt: number | null },
  now: number,
): CachedDetailFreshness {
  if (!context.detailCacheId) return "missing";
  if (context.detailExpiresAt !== null && context.detailExpiresAt <= now) return "stale";
  return "fresh";
}

export type EpisodePositionRow = { seasonNumber: number; episodeNumber: number };

// The progress rows a user holds after a backfill: what they already had plus
// what the backfill just wrote, deduped by position. Lets the caller resolve
// the watch tier without re-reading the table it just wrote to.
export function mergeEpisodeProgressRows(
  existing: ReadonlyArray<EpisodePositionRow>,
  added: ReadonlyArray<EpisodePositionRow>,
): EpisodePositionRow[] {
  const seen = new Set<string>();
  const merged: EpisodePositionRow[] = [];
  for (const row of [...existing, ...added]) {
    const key = `${row.seasonNumber}:${row.episodeNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ seasonNumber: row.seasonNumber, episodeNumber: row.episodeNumber });
  }
  return merged;
}
