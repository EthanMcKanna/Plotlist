import { beforeEach, describe, expect, it } from "@jest/globals";

import {
  clearFacetPreviewCacheForTests,
  getCachedFacetPosters,
  missingFacetPreviewKeys,
  storeFacetPreviews,
} from "../lib/facetPreviewStore";
import { FACET_DEFS } from "../lib/plotlist/facets";

const [first, second, third] = FACET_DEFS;

describe("facetPreviewStore", () => {
  beforeEach(() => {
    clearFacetPreviewCacheForTests();
  });

  it("reports every key missing on a cold cache and respects the batch cap", () => {
    expect(missingFacetPreviewKeys([first, second, third])).toEqual([
      first.key,
      second.key,
      third.key,
    ]);
    expect(missingFacetPreviewKeys(FACET_DEFS, 40)).toHaveLength(40);
  });

  it("stores rows and stops reporting them missing", () => {
    const changed = storeFacetPreviews(
      [{ key: first.key, posters: ["https://img/a.jpg"] }],
      [first.key],
    );

    expect(changed).toBe(true);
    expect(getCachedFacetPosters(first.key)).toEqual(["https://img/a.jpg"]);
    expect(missingFacetPreviewKeys([first, second])).toEqual([second.key]);
  });

  it("records server-skipped keys as empty so they never refetch", () => {
    storeFacetPreviews([], [second.key]);

    expect(getCachedFacetPosters(second.key)).toEqual([]);
    expect(missingFacetPreviewKeys([second])).toEqual([]);
  });

  it("tolerates malformed responses without caching garbage", () => {
    const changed = storeFacetPreviews(
      [{ key: third.key, posters: "not-an-array" }, { nope: true }, null],
      [third.key],
    );

    expect(changed).toBe(true);
    expect(getCachedFacetPosters(third.key)).toEqual([]);
  });
});
