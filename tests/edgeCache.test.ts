import { describe, expect, it } from "@jest/globals";

import { getRpcEdgeCacheTtl } from "../api/_lib/edge-cache";

describe("edge cache allowlist", () => {
  it("caches the user-independent browse and search RPCs", () => {
    expect(getRpcEdgeCacheTtl("query", "shows:search")).toBe(300);
    expect(getRpcEdgeCacheTtl("query", "users:getShowsById")).toBe(300);
    expect(getRpcEdgeCacheTtl("query", "likes:listForTarget")).toBe(60);
    expect(getRpcEdgeCacheTtl("action", "shows:searchCatalog")).toBe(300);
    expect(getRpcEdgeCacheTtl("action", "embeddings:getSimilarShows")).toBe(600);
    expect(getRpcEdgeCacheTtl("action", "embeddings:getSmartLists")).toBe(600);
    expect(getRpcEdgeCacheTtl("action", "embeddings:searchByVibe")).toBe(600);
    expect(getRpcEdgeCacheTtl("action", "embeddings:getFacetBrowse")).toBe(3600);
    expect(getRpcEdgeCacheTtl("action", "embeddings:getFacetPreviews")).toBe(3600);
    expect(getRpcEdgeCacheTtl("action", "embeddings:getFacetShows")).toBe(600);
    expect(getRpcEdgeCacheTtl("action", "embeddings:getShowTasteSocialProof")).toBe(3600);
  });

  it("never caches viewer-dependent RPCs", () => {
    // Skips the block-author choke point, so its output must stay per-request.
    expect(getRpcEdgeCacheTtl("action", "embeddings:getListsFromSimilarTasteUsers")).toBeNull();
    expect(getRpcEdgeCacheTtl("action", "embeddings:getSimilarTasteUsers")).toBeNull();
    expect(getRpcEdgeCacheTtl("query", "comments:listForTarget")).toBeNull();
    expect(getRpcEdgeCacheTtl("query", "feed:list")).toBeNull();
  });
});
