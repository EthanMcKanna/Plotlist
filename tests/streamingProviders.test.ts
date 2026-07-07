import { describe, expect, it } from "@jest/globals";

import {
  STREAMING_PROVIDER_KEYS,
  STREAMING_PROVIDER_PROMINENCE,
  buildStreamingAvailabilityIndex,
  filterSectionsToStreamingProviders,
  leanItemsToStreamingAvailability,
  normalizeStreamingProviderKeys,
  sortSectionsByProviderProminence,
} from "../lib/streamingProviders";

describe("normalizeStreamingProviderKeys", () => {
  it("keeps only known keys, deduped, in registry order", () => {
    expect(
      normalizeStreamingProviderKeys(["hulu", "netflix", "hulu", "not-a-service", 42, null]),
    ).toEqual(["netflix", "hulu"]);
  });

  it("handles non-array input", () => {
    expect(normalizeStreamingProviderKeys(null)).toEqual([]);
    expect(normalizeStreamingProviderKeys("netflix")).toEqual([]);
    expect(normalizeStreamingProviderKeys(undefined)).toEqual([]);
  });

  it("accepts every registry key", () => {
    expect(normalizeStreamingProviderKeys(STREAMING_PROVIDER_KEYS)).toEqual(
      STREAMING_PROVIDER_KEYS,
    );
  });
});

describe("filterSectionsToStreamingProviders", () => {
  const sections = [
    { key: "netflix", label: "Netflix" },
    { key: "hulu", label: "Hulu" },
    { key: "max", label: "Max" },
  ];

  it("filters to the selected services", () => {
    expect(filterSectionsToStreamingProviders(sections, ["hulu", "max"])).toEqual([
      { key: "hulu", label: "Hulu" },
      { key: "max", label: "Max" },
    ]);
  });

  it("returns everything when nothing is selected", () => {
    expect(filterSectionsToStreamingProviders(sections, [])).toEqual(sections);
    expect(filterSectionsToStreamingProviders(sections, null)).toEqual(sections);
  });

  it("falls back to all sections when the selection matches nothing", () => {
    expect(filterSectionsToStreamingProviders(sections, ["peacock"])).toEqual(sections);
  });
});

describe("buildStreamingAvailabilityIndex", () => {
  it("collects tmdb external ids from selected provider catalogs only", () => {
    const index = buildStreamingAvailabilityIndex(
      {
        netflix: [{ externalId: "1" }, { externalSource: "tmdb", externalId: "2" }],
        hulu: [{ externalId: "3" }],
        max: [{ externalSource: "other", externalId: "4" }],
      },
      ["netflix", "max"],
    );
    expect(Array.from(index).sort()).toEqual(["1", "2"]);
  });

  it("is empty with no selection or no catalogs", () => {
    expect(buildStreamingAvailabilityIndex(null, ["netflix"]).size).toBe(0);
    expect(buildStreamingAvailabilityIndex({ netflix: [{ externalId: "1" }] }, []).size).toBe(0);
  });
});

describe("leanItemsToStreamingAvailability", () => {
  const items = [
    { id: "a", externalId: "10" },
    { id: "b", externalId: "20" },
    { id: "c", externalId: "30" },
  ];

  it("floats available items to the front, preserving relative order", () => {
    const leaned = leanItemsToStreamingAvailability(
      items,
      new Set(["20", "30"]),
      (item) => item.externalId,
    );
    expect(leaned.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("is a no-op with no availability data or no matches", () => {
    expect(
      leanItemsToStreamingAvailability(items, new Set(), (item) => item.externalId),
    ).toEqual(items);
    expect(
      leanItemsToStreamingAvailability(items, new Set(["99"]), (item) => item.externalId),
    ).toEqual(items);
  });
});

describe("sortSectionsByProviderProminence", () => {
  const sections = [
    { key: "peacock" },
    { key: "hulu" },
    { key: "netflix" },
    { key: "apple_tv" },
  ];

  it("covers every known provider in the prominence ranking", () => {
    expect([...STREAMING_PROVIDER_PROMINENCE].sort()).toEqual(
      [...STREAMING_PROVIDER_KEYS].sort(),
    );
  });

  it("orders by service prominence when the user has no preference", () => {
    expect(
      sortSectionsByProviderProminence(sections, []).map((section) => section.key),
    ).toEqual(["netflix", "hulu", "apple_tv", "peacock"]);
    expect(
      sortSectionsByProviderProminence(sections, null).map((section) => section.key),
    ).toEqual(["netflix", "hulu", "apple_tv", "peacock"]);
  });

  it("puts the user's chosen services first, most prominent leading", () => {
    expect(
      sortSectionsByProviderProminence(sections, ["peacock", "apple_tv"]).map(
        (section) => section.key,
      ),
    ).toEqual(["apple_tv", "peacock", "netflix", "hulu"]);
  });

  it("ignores unknown keys in the stored preference", () => {
    expect(
      sortSectionsByProviderProminence(sections, ["not-a-service"]).map(
        (section) => section.key,
      ),
    ).toEqual(["netflix", "hulu", "apple_tv", "peacock"]);
  });

  it("keeps unknown section keys after ranked services without dropping them", () => {
    expect(
      sortSectionsByProviderProminence(
        [{ key: "mystery" }, { key: "netflix" }],
        [],
      ).map((section) => section.key),
    ).toEqual(["netflix", "mystery"]);
  });
});
