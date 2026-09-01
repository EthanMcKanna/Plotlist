import { describe, expect, it } from "@jest/globals";

import { parseLibrarySort, sortLibraryEntries } from "../lib/librarySort";

const entry = (
  id: string,
  updatedAt: number,
  show: { title?: string | null; year?: number | null } | null,
) => ({ id, state: { updatedAt }, show });

describe("parseLibrarySort", () => {
  it("accepts the client's sort values and falls back to recency", () => {
    expect(parseLibrarySort("title")).toBe("title");
    expect(parseLibrarySort("year")).toBe("year");
    expect(parseLibrarySort("date")).toBe("date");
    expect(parseLibrarySort("bogus")).toBe("date");
    expect(parseLibrarySort(undefined)).toBe("date");
    expect(parseLibrarySort(42)).toBe("date");
  });
});

describe("sortLibraryEntries", () => {
  const entries = [
    entry("older-b", 100, { title: "Bravo", year: 2019 }),
    entry("no-show", 400, null),
    entry("newest-a", 500, { title: "alpha", year: 2021 }),
    entry("untitled", 300, { title: null, year: 2023 }),
    entry("mid-c", 200, { title: "Charlie", year: null }),
    entry("dup-a", 50, { title: "Alpha", year: 2021 }),
  ];

  it("orders by recency by default without mutating the input", () => {
    const copy = [...entries];
    expect(sortLibraryEntries(entries, "date").map((item) => item.id)).toEqual([
      "newest-a",
      "no-show",
      "untitled",
      "mid-c",
      "older-b",
      "dup-a",
    ]);
    expect(entries).toEqual(copy);
  });

  it("orders titles A–Z case-insensitively, ties by recency, missing titles last", () => {
    expect(sortLibraryEntries(entries, "title").map((item) => item.id)).toEqual([
      "newest-a",
      "dup-a",
      "older-b",
      "mid-c",
      "no-show",
      "untitled",
    ]);
  });

  it("orders years newest first, ties by recency, unknown years last", () => {
    expect(sortLibraryEntries(entries, "year").map((item) => item.id)).toEqual([
      "untitled",
      "newest-a",
      "dup-a",
      "older-b",
      "no-show",
      "mid-c",
    ]);
  });
});
