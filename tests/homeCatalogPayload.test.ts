import { describe, expect, it } from "@jest/globals";

import {
  buildProviderSectionsFromCatalog,
  getHomeShowSignal,
  normalizeHomeCatalogPayload,
  shouldUseBatchedHomeCatalog,
  sortProviderRoomItemsForFreshness,
  sortProviderRoomsForFreshness,
  toRailItem,
} from "../lib/useHomeData";

const CURRENT_YEAR = new Date().getUTCFullYear();

function show(title: string, overrides: Record<string, unknown> = {}) {
  return {
    title,
    posterUrl: `https://img.example.com/${encodeURIComponent(title)}.jpg`,
    backdropUrl: `https://img.example.com/${encodeURIComponent(title)}-wide.jpg`,
    year: CURRENT_YEAR,
    externalSource: "tmdb",
    externalId: title.toLowerCase().replace(/\s+/g, "-"),
    genreIds: [18],
    tmdbPopularity: 100,
    tmdbVoteAverage: 7.8,
    tmdbVoteCount: 160,
    ...overrides,
  };
}

describe("home catalog payload", () => {
  it("normalizes a batched homepage catalog response into stable rail buckets", () => {
    const payload = normalizeHomeCatalogPayload({
      risingNow: [show("Rising"), null, { name: "Missing title" }],
      trendingDay: [show("Daily Heat")],
      providers: {
        netflix: [show("Netflix Lead")],
        hulu: "not an array",
      },
    });

    expect(payload.risingNow?.map((item) => item.title)).toEqual(["Rising"]);
    expect(payload.trendingDay?.map((item) => item.title)).toEqual(["Daily Heat"]);
    expect(payload.providers?.netflix?.map((item) => item.title)).toEqual([
      "Netflix Lead",
    ]);
    expect(payload.providers?.hulu).toEqual([]);
    expect(payload.providers?.peacock).toEqual([]);
    expect(payload.providers?.prime_video).toEqual([]);
    expect(payload.providers?.paramount_plus).toEqual([]);
    expect(payload.providers?.mgm_plus).toEqual([]);
    expect(payload.diagnostics).toEqual({
      failedCategories: [],
      staleCategories: [],
    });
  });

  it("preserves sanitized batched catalog diagnostics for client QA", () => {
    const payload = normalizeHomeCatalogPayload({
      diagnostics: {
        failedCategories: [
          " hulu ",
          "hulu",
          "trending_day",
          null,
          "",
        ],
        staleCategories: [
          "netflix",
          "prime_video",
          "netflix",
          42,
        ],
      },
    });

    expect(payload.diagnostics).toEqual({
      failedCategories: ["hulu", "trending_day"],
      staleCategories: ["netflix", "prime_video"],
    });
  });

  it("overlays active researched freshness signals onto live catalog matches", () => {
    expect(
      getHomeShowSignal(
        show("FROM", {
          year: 2022,
          tmdbVoteAverage: 8.2,
          homeSignal: null,
        }),
        "2026-05-30",
      ),
    ).toBe("MGM+ S4 airing now");
    expect(
      getHomeShowSignal(
        show("FROM", {
          year: 2022,
          tmdbVoteAverage: 8.2,
          homeSignal: null,
        }),
        "2026-06-29",
      ),
    ).toBe("8.2 TMDB");
  });

  it("projects rail item signals with the supplied homepage timestamp", () => {
    const from = show("FROM", {
      year: 2022,
      tmdbVoteAverage: 8.2,
      homeSignal: null,
    });

    expect(toRailItem(from, "2026-05-30")?.signal).toBe("MGM+ S4 airing now");
    expect(toRailItem(from, "2026-06-29")?.signal).toBe("8.2 TMDB");
  });

  it("builds ordered provider rooms only from substantial, recent, editorial candidates", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        netflix: [
          show("Berlin and the Lady with an Ermine"),
          show("Low Confidence Curiosity", {
            tmdbPopularity: 50,
            tmdbVoteAverage: 5.4,
            tmdbVoteCount: 13,
          }),
          show("Netflix One"),
          show("Netflix Two"),
          show("Netflix Three"),
          show("Netflix Four"),
          show("Reality Noise", { genreIds: [10764] }),
        ],
        apple_tv: [
          show("Apple One"),
          show("Apple Two"),
          show("Apple Three"),
          show("Apple Four"),
        ],
        hulu: [show("Hulu One"), show("Hulu Two"), show("Hulu Three")],
        prime_video: [
          show("Old One", { year: CURRENT_YEAR - 9 }),
          show("Old Two", { year: CURRENT_YEAR - 9 }),
          show("Old Three", { year: CURRENT_YEAR - 9 }),
          show("Old Four", { year: CURRENT_YEAR - 9 }),
        ],
      },
      { includeEditorialSeeds: false },
    );

    expect(rooms.map((room) => room.key)).toEqual(["netflix", "apple_tv"]);
    expect(rooms[0].items).toHaveLength(4);
    expect(rooms[0].items.map((item) => item.title)).not.toContain(
      "Reality Noise",
    );
    expect(rooms[0].items.map((item) => item.title)).not.toContain(
      "Berlin and the Lady with an Ermine",
    );
    expect(rooms[0].items.map((item) => item.title)).not.toContain(
      "Low Confidence Curiosity",
    );
  });

  it("orders streaming rooms by current freshness instead of static provider order", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        netflix: [
          show("Netflix One"),
          show("Netflix Two"),
          show("Netflix Three"),
          show("Netflix Four"),
        ],
        hulu: [
          show("Hulu Return", {
            homeSignal: "S2 May 28",
            editorialTier: "verified_current",
          }),
          show("Hulu Two"),
          show("Hulu Three"),
          show("Hulu Four"),
        ],
      },
      { now: "2026-05-30", includeEditorialSeeds: false },
    );

    expect(rooms.map((room) => room.key).slice(0, 2)).toEqual([
      "hulu",
      "netflix",
    ]);
    expect(rooms[0]?.items[0]?.title).toBe("Hulu Return");
  });

  it("keeps chart-proven unrated premieres visible in provider rooms", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {},
      { now: "2026-05-30T12:00:00.000Z" },
    );
    const disneyPlus = rooms.find((room) => room.key === "disney_plus");

    expect(disneyPlus?.items[0]).toMatchObject({
      title: "Sofia the First: Royal Magic",
      homeSignal: "Disney+ May 25",
      editorialTier: "verified_current",
      tmdbVoteAverage: 0,
      tmdbVoteCount: 0,
    });
  });

  it("prioritizes the provider room with the freshest lead over stacked older signals", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        netflix: [
          show("Netflix Return", {
            homeSignal: "S2 May 28",
            editorialTier: "verified_current",
          }),
          show("Netflix Follow-Up", {
            homeSignal: "S2 May 27",
            editorialTier: "verified_current",
          }),
          show("Netflix Three"),
          show("Netflix Four"),
        ],
        apple_tv: [
          show("Apple Launch", {
            homeSignal: "Apple TV+ May 29",
            editorialTier: "verified_current",
          }),
          show("Apple Two"),
          show("Apple Three"),
          show("Apple Four"),
        ],
      },
      { now: "2026-05-30", includeEditorialSeeds: false },
    );

    expect(rooms.map((room) => room.key).slice(0, 2)).toEqual([
      "apple_tv",
      "netflix",
    ]);
    expect(rooms[0]?.items[0]?.title).toBe("Apple Launch");
  });

  it("re-scores visible provider rooms after surface de-duping changes their leads", () => {
    const rooms = sortProviderRoomsForFreshness(
      [
        {
          key: "apple_tv",
          label: "Apple TV+",
          logoUrl: "apple.png",
          tint: "#A8A8A8",
          items: [
            show("Apple Older", {
              homeSignal: "Apple TV+ Apr 29",
              editorialTier: "verified_current",
            }),
            show("Apple Two"),
            show("Apple Three"),
            show("Apple Four"),
          ],
        },
        {
          key: "hulu",
          label: "Hulu",
          logoUrl: "hulu.png",
          tint: "#1CE783",
          items: [
            show("Hulu Return", {
              homeSignal: "S2 May 28",
              editorialTier: "verified_current",
            }),
            show("Hulu Two"),
            show("Hulu Three"),
            show("Hulu Four"),
          ],
        },
      ],
      "2026-05-30",
    );

    expect(rooms.map((room) => room.key)).toEqual(["hulu", "apple_tv"]);
    expect(rooms[0]?.items[0]?.title).toBe("Hulu Return");
  });

  it("does not let stale dated room leads outrank live supporting context", () => {
    const rooms = sortProviderRoomsForFreshness(
      [
        {
          key: "apple_tv",
          label: "Apple TV+",
          logoUrl: "apple.png",
          tint: "#A8A8A8",
          items: [
            show("Apple Older", {
              homeSignal: "Apple TV+ Apr 29",
              editorialTier: "verified_current",
            }),
            show("Apple Two"),
            show("Apple Three"),
            show("Apple Four"),
          ],
        },
        {
          key: "hulu",
          label: "Hulu",
          logoUrl: "hulu.png",
          tint: "#1CE783",
          items: [
            show("Hulu Catalog Lead"),
            show("Hulu Return", {
              homeSignal: "S2 May 28",
              editorialTier: "verified_current",
            }),
            show("The Bear", {
              homeSignal: "FX/Hulu Jun 25",
              editorialTier: "verified_current",
            }),
            show("Hulu Four"),
          ],
        },
      ],
      "2026-05-30",
    );

    expect(rooms.map((room) => room.key)).toEqual(["hulu", "apple_tv"]);
    expect(rooms[0]?.items[0]?.title).toBe("Hulu Catalog Lead");
  });

  it("promotes fresh visible provider items ahead of generic catalog fillers", () => {
    const items = sortProviderRoomItemsForFreshness(
      [
        show("Generic Provider Lead"),
        show("Current Return", {
          homeSignal: "S2 May 28",
          editorialTier: "verified_current",
        }),
        show("Future Prestige", {
          homeSignal: "FX/Hulu Jun 25",
          editorialTier: "verified_current",
        }),
        show("Provider Four"),
      ],
      "2026-05-30",
    );

    expect(items.map((item) => item.title).slice(0, 3)).toEqual([
      "Current Return",
      "Future Prestige",
      "Generic Provider Lead",
    ]);
  });

  it("blends researched provider seeds ahead of raw availability noise", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        netflix: [
          show("The WONDERfools", {
            year: CURRENT_YEAR,
            tmdbPopularity: 124,
            tmdbVoteAverage: 9.2,
            tmdbVoteCount: 108,
          }),
          show("The Apothecary Diaries", {
            year: 2023,
            genreIds: [16],
            tmdbPopularity: 186,
            tmdbVoteAverage: 8.6,
            tmdbVoteCount: 565,
          }),
          show("JUJUTSU KAISEN", {
            year: 2020,
            genreIds: [16],
            tmdbPopularity: 151,
            tmdbVoteAverage: 8.6,
            tmdbVoteCount: 4440,
          }),
        ],
        hulu: [
          show("JUJUTSU KAISEN", {
            year: 2020,
            genreIds: [16],
            tmdbPopularity: 151,
            tmdbVoteAverage: 8.6,
            tmdbVoteCount: 4440,
          }),
          show("Tracker", {
            year: 2024,
            tmdbPopularity: 70,
            tmdbVoteAverage: 7.2,
            tmdbVoteCount: 600,
          }),
          show("The Apothecary Diaries", {
            year: 2023,
            genreIds: [16],
            tmdbPopularity: 186,
            tmdbVoteAverage: 8.6,
            tmdbVoteCount: 565,
          }),
        ],
      },
      { now: "2026-05-28" },
    );

    const netflix = rooms.find((room) => room.key === "netflix");
    expect(netflix?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Adolescence",
        "Lord of the Flies",
        "The Apothecary Diaries",
        "JUJUTSU KAISEN",
      ]),
    );
    expect(netflix?.items.map((item) => item.title)).not.toContain("The WONDERfools");

    const max = rooms.find((room) => room.key === "max");
    expect(max?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "House of the Dragon",
        "Rick and Morty",
        "The Pitt",
      ]),
    );
    expect(
      max?.items.find((item) => item.title === "House of the Dragon")?.homeSignal,
    ).toBe("Returns Jun 21");

    const hulu = rooms.find((room) => room.key === "hulu");
    expect(hulu?.items[0]?.title).toBe("Deli Boys");
    expect(hulu?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Deli Boys",
        "The Testaments",
        "The Bear",
        "Abbott Elementary",
      ]),
    );
    expect(hulu?.items.map((item) => item.title)).not.toContain("The Simpsons");

    const roomsOnAppleLaunchDay = buildProviderSectionsFromCatalog(
      {},
      { now: "2026-05-29" },
    );
    expect(roomsOnAppleLaunchDay.map((room) => room.key)).toEqual(
      expect.arrayContaining([
        "netflix",
        "apple_tv",
        "max",
        "hulu",
        "prime_video",
      ]),
    );
    const appleTv = roomsOnAppleLaunchDay.find((room) => room.key === "apple_tv");
    expect(appleTv?.items[0]?.title).toBe("Star City");
    expect(appleTv?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(["Star City", "Widow's Bay"]),
    );

    const huluEditorialRoom = roomsOnAppleLaunchDay.find((room) => room.key === "hulu");
    expect(huluEditorialRoom?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Deli Boys",
        "The Testaments",
        "The Bear",
        "Abbott Elementary",
      ]),
    );
    expect(
      buildProviderSectionsFromCatalog({}, { now: "2026-05-26" })
        .find((room) => room.key === "hulu")
        ?.items.map((item) => item.title) ?? [],
    ).not.toContain("The Testaments");
    expect(
      huluEditorialRoom?.items.find((item) => item.title === "The Testaments")?.homeSignal,
    ).toBe("Finale May 27");
    expect(
      huluEditorialRoom?.items.find((item) => item.title === "The Bear")?.homeSignal,
    ).toBe("FX/Hulu Jun 25");

    const primeEditorialRoom = roomsOnAppleLaunchDay.find(
      (room) => room.key === "prime_video",
    );
    expect(primeEditorialRoom?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(["Spider-Noir", "The Boys", "Off Campus"]),
    );

    const roomsOnNetflixReturnDay = buildProviderSectionsFromCatalog(
      {},
      { now: "2026-05-30" },
    );
    const netflixReturnRoom = roomsOnNetflixReturnDay.find(
      (room) => room.key === "netflix",
    );
    expect(netflixReturnRoom?.items[0]?.title).toBe("Rafa");
    expect(netflixReturnRoom?.items.find((item) => item.title === "Rafa")?.homeSignal).toBe(
      "Netflix May 29",
    );
    expect(netflixReturnRoom?.items.map((item) => item.title)).toContain(
      "Murder Mindfully",
    );
    expect(
      roomsOnAppleLaunchDay
        .find((room) => room.key === "netflix")
        ?.items.map((item) => item.title) ?? [],
    ).not.toContain("Murder Mindfully");
    expect(
      roomsOnAppleLaunchDay
        .find((room) => room.key === "netflix")
        ?.items.map((item) => item.title) ?? [],
    ).toContain("Rafa");
    expect(
      buildProviderSectionsFromCatalog({}, { now: "2026-05-28" })
        .find((room) => room.key === "netflix")
        ?.items.map((item) => item.title) ?? [],
    ).not.toContain("Rafa");
    expect(
      buildProviderSectionsFromCatalog({}, { now: "2026-06-22" })
        .find((room) => room.key === "netflix")
        ?.items.map((item) => item.title) ?? [],
    ).not.toContain("Murder Mindfully");

    const roomsWithParamountCatalog = buildProviderSectionsFromCatalog(
      {
        paramount_plus: [
          show("Dutton Ranch", {
            homeSignal: "Paramount+ May 15",
            editorialTier: "verified_current",
          }),
          show("Paramount One"),
          show("Paramount Two"),
          show("Paramount Three"),
        ],
      },
      { now: "2026-05-29", includeEditorialSeeds: false },
    );
    const paramountPlus = roomsWithParamountCatalog.find(
      (room) => room.key === "paramount_plus",
    );
    expect(paramountPlus?.label).toBe("Paramount+");
    expect(paramountPlus?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Dutton Ranch",
        "Paramount One",
        "Paramount Two",
        "Paramount Three",
      ]),
    );

    const roomsWithMgmCatalog = buildProviderSectionsFromCatalog(
      {
        mgm_plus: [
          show("Godfather of Harlem", {
            year: 2019,
            tmdbPopularity: 26,
            tmdbVoteAverage: 8,
            tmdbVoteCount: 740,
          }),
          show("Robin Hood", {
            year: 2025,
            tmdbPopularity: 12,
            tmdbVoteAverage: 7.5,
            tmdbVoteCount: 142,
          }),
          show("The Institute", {
            year: 2025,
            tmdbPopularity: 8,
            tmdbVoteAverage: 7.6,
            tmdbVoteCount: 151,
          }),
          show("Billy the Kid", {
            year: 2022,
            tmdbPopularity: 10,
            tmdbVoteAverage: 7.4,
            tmdbVoteCount: 157,
          }),
        ],
      },
      { now: "2026-05-30" },
    );
    const mgmPlus = roomsWithMgmCatalog.find(
      (room) => room.key === "mgm_plus",
    );
    expect(mgmPlus?.label).toBe("MGM+");
    expect(mgmPlus?.items[0]?.title).toBe("FROM");
    expect(mgmPlus?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "FROM",
        "Robin Hood",
        "The Institute",
      ]),
    );
    expect(mgmPlus?.items).toHaveLength(4);

    const roomsWithPeacockBackCatalog = buildProviderSectionsFromCatalog(
      {
        peacock: [
          show("Law & Order: Special Victims Unit", {
            year: 1999,
            tmdbPopularity: 337,
            tmdbVoteAverage: 7.9,
            tmdbVoteCount: 4219,
          }),
          show("Law & Order", {
            year: 1990,
            tmdbPopularity: 278,
            tmdbVoteAverage: 7.3,
            tmdbVoteCount: 687,
          }),
          show("Chicago Fire", {
            year: 2012,
            tmdbPopularity: 118,
            tmdbVoteAverage: 8.4,
            tmdbVoteCount: 2390,
          }),
          show("Chicago P.D.", {
            year: 2014,
            tmdbPopularity: 110,
            tmdbVoteAverage: 8.4,
            tmdbVoteCount: 2585,
          }),
          show("Off Campus", {
            homeSignal: "Prime May 13",
            editorialTier: "verified_current",
          }),
          show("Spider-Noir", {
            homeSignal: "Prime May 27",
            editorialTier: "verified_current",
          }),
          show("FROM", {
            homeSignal: "MGM+ S4 airing now",
            editorialTier: "verified_current",
          }),
        ],
      },
      { now: "2026-05-30" },
    );
    expect(
      roomsWithPeacockBackCatalog.find((room) => room.key === "peacock"),
    ).toBeUndefined();

    const roomsWithPeacockCatalog = buildProviderSectionsFromCatalog(
      {
        peacock: [
          show("Peacock One", {
            year: CURRENT_YEAR,
            tmdbPopularity: 88,
            tmdbVoteAverage: 7.4,
            tmdbVoteCount: 320,
          }),
          show("Peacock Two", {
            year: CURRENT_YEAR - 1,
            tmdbPopularity: 62,
            tmdbVoteAverage: 7.6,
            tmdbVoteCount: 260,
          }),
          show("Peacock Three", {
            year: CURRENT_YEAR,
            tmdbPopularity: 45,
            tmdbVoteAverage: 7.3,
            tmdbVoteCount: 180,
          }),
        ],
      },
      { now: "2026-05-30" },
    );
    const peacock = roomsWithPeacockCatalog.find(
      (room) => room.key === "peacock",
    );
    expect(peacock?.label).toBe("Peacock");
    expect(peacock?.items[0]?.title).toBe("M.I.A.");
    expect(peacock?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "M.I.A.",
        "Peacock One",
        "Peacock Two",
      ]),
    );
  });

  it("keeps streaming rooms globally diverse when enough provider alternatives exist", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        netflix: [
          show("Shared Hit", { tmdbPopularity: 190, tmdbVoteAverage: 8.4 }),
          show("Netflix One"),
          show("Netflix Two"),
          show("Netflix Three"),
          show("Netflix Four"),
        ],
        hulu: [
          show("Shared Hit", { tmdbPopularity: 190, tmdbVoteAverage: 8.4 }),
          show("Hulu One"),
          show("Hulu Two"),
          show("Hulu Three"),
          show("Hulu Four"),
        ],
      },
      { includeEditorialSeeds: false },
    );

    const netflix = rooms.find((room) => room.key === "netflix");
    const hulu = rooms.find((room) => room.key === "hulu");

    expect(netflix?.items.map((item) => item.title)).toContain("Shared Hit");
    expect(hulu?.items.map((item) => item.title)).not.toContain("Shared Hit");

    const visibleTitles = rooms.flatMap((room) =>
      room.items.slice(0, 4).map((item) => item.title),
    );
    expect(new Set(visibleTitles).size).toBe(visibleTitles.length);
  });

  it("keeps stale raw provider prestige out when a room has enough current picks", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        max: [
          show("Old Prestige Filler", {
            year: CURRENT_YEAR - 7,
            tmdbPopularity: 220,
            tmdbVoteAverage: 8.4,
            tmdbVoteCount: 3600,
          }),
          show("Current Max One"),
          show("Current Max Two"),
          show("Current Max Three"),
          show("Current Max Four"),
        ],
      },
      { includeEditorialSeeds: false },
    );

    const max = rooms.find((room) => room.key === "max");
    expect(max?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Current Max One",
        "Current Max Two",
        "Current Max Three",
        "Current Max Four",
      ]),
    );
    expect(max?.items.map((item) => item.title)).not.toContain("Old Prestige Filler");
  });

  it("allows a cross-provider repeat only when needed to keep a room substantial", () => {
    const rooms = buildProviderSectionsFromCatalog(
      {
        netflix: [
          show("Shared Hit", { tmdbPopularity: 190, tmdbVoteAverage: 8.4 }),
          show("Shared Backup", { tmdbPopularity: 170, tmdbVoteAverage: 8.2 }),
          show("Netflix One"),
          show("Netflix Two"),
          show("Netflix Three"),
          show("Netflix Four"),
        ],
        hulu: [
          show("Shared Hit", { tmdbPopularity: 190, tmdbVoteAverage: 8.4 }),
          show("Shared Backup", { tmdbPopularity: 170, tmdbVoteAverage: 8.2 }),
          show("Hulu One"),
          show("Hulu Two"),
          show("Hulu Three"),
        ],
      },
      { includeEditorialSeeds: false },
    );

    const hulu = rooms.find((room) => room.key === "hulu");
    const huluTitles = hulu?.items.map((item) => item.title) ?? [];
    expect(huluTitles).toHaveLength(4);
    expect(huluTitles).toEqual(expect.arrayContaining(["Hulu One", "Hulu Two", "Hulu Three"]));
    expect(
      huluTitles.filter((title) => title === "Shared Hit" || title === "Shared Backup"),
    ).toHaveLength(1);
  });

  it("uses the batched catalog only when it will not probe an older deployed API from local web", () => {
    expect(
      shouldUseBatchedHomeCatalog(
        "https://plotlist.app",
        "https://plotlist.app",
      ),
    ).toBe(true);
    expect(
      shouldUseBatchedHomeCatalog(
        "https://plotlist.app",
        "http://127.0.0.1:3000",
      ),
    ).toBe(false);
    expect(
      shouldUseBatchedHomeCatalog(
        "http://localhost:3001",
        "http://127.0.0.1:3000",
      ),
    ).toBe(true);
    expect(shouldUseBatchedHomeCatalog("https://plotlist.app", null)).toBe(true);
  });
});
