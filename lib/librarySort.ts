// Sort orders for the library grid (app/me/watchlist.tsx). The server applies
// these before paginating so a title or year order holds across pages —
// sorting only the loaded pages on the client restarted A–Z on every page
// boundary.

export const LIBRARY_SORT_VALUES = ["date", "title", "year"] as const;
export type LibrarySort = (typeof LIBRARY_SORT_VALUES)[number];

export function parseLibrarySort(raw: unknown): LibrarySort {
  return typeof raw === "string" && (LIBRARY_SORT_VALUES as readonly string[]).includes(raw)
    ? (raw as LibrarySort)
    : "date";
}

export type LibrarySortEntry = {
  state: { updatedAt?: number | null };
  show: { title?: string | null; year?: number | null } | null | undefined;
};

function updatedAtOf(entry: LibrarySortEntry) {
  const value = entry.state.updatedAt;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function titleKeyOf(entry: LibrarySortEntry) {
  const title = entry.show?.title;
  return typeof title === "string" ? title.trim().toLowerCase() : "";
}

function yearOf(entry: LibrarySortEntry) {
  const year = entry.show?.year;
  return typeof year === "number" && Number.isFinite(year) ? year : null;
}

/**
 * Returns a new array in the requested order. "date" is most recently updated
 * first; "title" is A–Z (entries without a title sink to the end); "year" is
 * newest release first (unknown years sink to the end). Ties fall back to
 * recency so the order is stable across pages.
 */
export function sortLibraryEntries<T extends LibrarySortEntry>(
  entries: ReadonlyArray<T>,
  sortBy: LibrarySort,
): T[] {
  const sorted = [...entries];
  const byRecency = (left: T, right: T) => updatedAtOf(right) - updatedAtOf(left);
  if (sortBy === "title") {
    sorted.sort((left, right) => {
      const leftKey = titleKeyOf(left);
      const rightKey = titleKeyOf(right);
      if (!leftKey && rightKey) return 1;
      if (leftKey && !rightKey) return -1;
      return leftKey.localeCompare(rightKey) || byRecency(left, right);
    });
    return sorted;
  }
  if (sortBy === "year") {
    sorted.sort((left, right) => {
      const leftYear = yearOf(left);
      const rightYear = yearOf(right);
      if (leftYear === null && rightYear !== null) return 1;
      if (leftYear !== null && rightYear === null) return -1;
      return (rightYear ?? 0) - (leftYear ?? 0) || byRecency(left, right);
    });
    return sorted;
  }
  sorted.sort(byRecency);
  return sorted;
}
