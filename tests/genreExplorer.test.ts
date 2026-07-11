import { describe, expect, it } from "@jest/globals";

import {
  GENRE_EXPLORER_GROUPS,
  filterFacets,
  formatShowCount,
  getFacetsForGroup,
  getGenreExplorerGroup,
  withAlpha,
} from "../lib/genreExplorer";
import { FACET_DEFS, FACET_GROUPS } from "../lib/plotlist/facets";

describe("genre explorer groups", () => {
  it("covers every facet group exactly once with taxonomy titles", () => {
    const keys = GENRE_EXPLORER_GROUPS.map((group) => group.key);
    expect([...keys].sort()).toEqual(Object.keys(FACET_GROUPS).sort());
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of GENRE_EXPLORER_GROUPS) {
      expect(group.title).toBe(FACET_GROUPS[group.key].title);
    }
  });

  it("uses 6-digit hex accents so withAlpha can tint them", () => {
    for (const group of GENRE_EXPLORER_GROUPS) {
      expect(group.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(group.icon).toBeTruthy();
    }
  });

  it("partitions the full taxonomy across groups", () => {
    const partitioned = GENRE_EXPLORER_GROUPS.flatMap((group) =>
      getFacetsForGroup(group.key),
    );
    expect(partitioned).toHaveLength(FACET_DEFS.length);
    expect(new Set(partitioned.map((facet) => facet.key)).size).toBe(
      FACET_DEFS.length,
    );
  });

  it("falls back to the first group for lookups", () => {
    expect(getGenreExplorerGroup("mood").key).toBe("mood");
    expect(getGenreExplorerGroup("origin").accent).toMatch(/^#/);
  });
});

describe("filterFacets", () => {
  it("returns everything for a blank query", () => {
    expect(filterFacets(FACET_DEFS, "")).toHaveLength(FACET_DEFS.length);
    expect(filterFacets(FACET_DEFS, "   ")).toHaveLength(FACET_DEFS.length);
  });

  it("matches titles case-insensitively", () => {
    const results = filterFacets(FACET_DEFS, "nordic");
    expect(results.map((facet) => facet.key)).toContain("nordic-noir");
  });

  it("matches descriptions too", () => {
    const results = filterFacets(FACET_DEFS, "scandinavian");
    expect(results.map((facet) => facet.key)).toContain("nordic-noir");
  });

  it("returns empty for nonsense", () => {
    expect(filterFacets(FACET_DEFS, "zzzzzz-not-a-genre")).toHaveLength(0);
  });
});

describe("formatShowCount", () => {
  it("formats small, thousand, and ten-thousand counts", () => {
    expect(formatShowCount(0)).toBe("");
    expect(formatShowCount(-5)).toBe("");
    expect(formatShowCount(812)).toBe("812");
    expect(formatShowCount(1000)).toBe("1k");
    expect(formatShowCount(7340)).toBe("7.3k");
    expect(formatShowCount(12400)).toBe("12k");
  });
});

describe("withAlpha", () => {
  it("converts hex accents to rgba", () => {
    expect(withAlpha("#F472B6", 0.5)).toBe("rgba(244,114,182,0.5)");
    expect(withAlpha("#38BDF8", 0.16)).toBe("rgba(56,189,248,0.16)");
  });
});
