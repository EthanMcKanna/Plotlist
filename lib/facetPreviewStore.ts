// Session-lived cache of facet poster previews (embeddings:getFacetPreviews),
// shared by every surface that renders category artwork (GenreExplorer cards,
// the /explore tile grid) so a group fetched on one surface is instant on the
// other. Artwork behind a category barely changes day to day, so there is no
// invalidation — the cache lives until the JS context does.

import type { FacetDef } from "./plotlist/facets";

const facetPreviewCache = new Map<string, string[]>();

export function getCachedFacetPosters(facetKey: string): string[] {
  return facetPreviewCache.get(facetKey) ?? [];
}

// Keys that still need a fetch, capped to the RPC's max batch size.
export function missingFacetPreviewKeys(facets: FacetDef[], limit = 40): string[] {
  return facets
    .filter((facet) => !facetPreviewCache.has(facet.key))
    .map((facet) => facet.key)
    .slice(0, limit);
}

// Store an RPC response. Requested keys the server skipped are recorded as
// empty so they don't refetch forever. Returns true when anything changed.
export function storeFacetPreviews(rows: unknown, requestedKeys: string[]): boolean {
  let changed = false;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row && typeof row.key === "string") {
        facetPreviewCache.set(
          row.key,
          Array.isArray(row.posters) ? row.posters : [],
        );
        changed = true;
      }
    }
  }
  for (const key of requestedKeys) {
    if (!facetPreviewCache.has(key)) {
      facetPreviewCache.set(key, []);
      changed = true;
    }
  }
  return changed;
}

// Test hook — the cache is module state.
export function clearFacetPreviewCacheForTests() {
  facetPreviewCache.clear();
}
