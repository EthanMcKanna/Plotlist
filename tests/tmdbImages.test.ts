import { describe, expect, it } from "@jest/globals";

import { resizeTmdbImageUrl } from "../lib/tmdbImages";

describe("resizeTmdbImageUrl", () => {
  it("swaps the size segment on TMDB image URLs", () => {
    expect(
      resizeTmdbImageUrl("https://image.tmdb.org/t/p/w500/abc123.jpg", "w185"),
    ).toBe("https://image.tmdb.org/t/p/w185/abc123.jpg");
    expect(
      resizeTmdbImageUrl("https://image.tmdb.org/t/p/original/abc.jpg", "w300"),
    ).toBe("https://image.tmdb.org/t/p/w300/abc.jpg");
  });

  it("leaves non-TMDB URLs untouched", () => {
    expect(resizeTmdbImageUrl("https://plotlist.app/files/uploads/a.jpg", "w185")).toBe(
      "https://plotlist.app/files/uploads/a.jpg",
    );
  });

  it("passes through null and undefined", () => {
    expect(resizeTmdbImageUrl(null, "w185")).toBeNull();
    expect(resizeTmdbImageUrl(undefined, "w185")).toBeUndefined();
  });
});
