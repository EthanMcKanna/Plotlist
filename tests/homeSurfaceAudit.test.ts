import { describe, expect, it } from "@jest/globals";

import {
  auditHomeSurface,
  auditHomeSurfaceRender,
  buildHomeSurfaceAuditSections,
  CORE_HOME_SURFACE_SECTION_KEYS,
  getHomeSurfaceAuditComposition,
  type HomeSurfaceAuditItem,
  type HomeSurfaceAuditInputs,
  type HomeSurfaceAuditSection,
} from "../lib/homeSurfaceAudit";

const CHECKED_AT = Date.UTC(2026, 4, 28);

function item(index: number, overrides: Partial<HomeSurfaceAuditItem> = {}): HomeSurfaceAuditItem {
  return {
    key: `show-${index}`,
    title: `Show ${index}`,
    posterUrl: `https://images.example.com/${index}.jpg`,
    year: 2026,
    signal: `Netflix May ${index}`,
    ...overrides,
  };
}

function section(key: string, start: number, count = 3): HomeSurfaceAuditSection {
  return {
    key,
    label: key,
    items: Array.from({ length: count }, (_, index) => item(start + index)),
    minItems: 3,
  };
}

function room(key: string, label: string, start: number) {
  return {
    key,
    label,
    items: [item(start), item(start + 1), item(start + 2)],
  };
}

function renderedHomepage(
  overrides: Partial<HomeSurfaceAuditInputs> = {},
): HomeSurfaceAuditInputs {
  return {
    hero: [item(1), item(2), item(3)],
    curated: [
      {
        key: "conversation",
        title: "Trending",
        items: [item(10), item(11), item(12)],
      },
    ],
    forYou: [item(20), item(21), item(22)],
    heat: [item(30), item(31), item(32)],
    fresh: [item(40), item(41), item(42), item(43)],
    critics: [item(50), item(51), item(52), item(53)],
    quick: [item(60), item(61), item(62), item(63)],
    rooms: [
      room("netflix", "Netflix", 70),
      room("apple_tv", "Apple TV+", 80),
      room("max", "Max", 90),
      room("hulu", "Hulu", 100),
      room("prime_video", "Prime Video", 110),
    ],
    ...overrides,
  };
}

describe("home surface audit", () => {
  it("builds auditable sections from the rendered homepage model", () => {
    const input = renderedHomepage();
    const sections = buildHomeSurfaceAuditSections(input);

    expect(CORE_HOME_SURFACE_SECTION_KEYS).toEqual([
      "hero",
      "for-you",
      "heat",
      "fresh",
      "quality",
      "quick",
    ]);
    expect(sections.map((entry) => entry.key)).toEqual([
      "hero",
      "curated:conversation",
      "for-you",
      "heat",
      "fresh",
      "quality",
      "quick",
      "room:netflix",
      "room:apple_tv",
      "room:max",
      "room:hulu",
      "room:prime_video",
    ]);

    const report = auditHomeSurfaceRender(input, CHECKED_AT);

    expect(report.healthy).toBe(true);
    expect(report.composition).toMatchObject({
      activeSectionCount: 12,
      repeatedTitleCount: 0,
      duplicateLeadCount: 0,
      missingArtworkCount: 0,
      providerRoomCount: 5,
      providerRoomRepeatedTitleCount: 0,
      staleSectionKeys: [],
    });
  });

  it("fails the rendered homepage audit when streaming rooms recycle the same title too often", () => {
    const shared = item(900, { title: "Shared Everywhere" });
    const report = auditHomeSurfaceRender(
      renderedHomepage({
        rooms: [
          {
            key: "netflix",
            label: "Netflix",
            items: [shared, item(70), item(71)],
          },
          {
            key: "hulu",
            label: "Hulu",
            items: [shared, item(80), item(81)],
          },
          {
            key: "prime_video",
            label: "Prime Video",
            items: [shared, item(90), item(91)],
          },
          room("apple_tv", "Apple TV+", 100),
        ],
      }),
      CHECKED_AT,
    );

    expect(report.healthy).toBe(false);
    expect(report.composition.providerRoomRepeatedTitleCount).toBe(1);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "provider_room_repeated_titles",
          title: "Shared Everywhere",
        }),
      ]),
    );
  });

  it("fails the rendered homepage audit when streaming rooms collapse", () => {
    const report = auditHomeSurfaceRender(
      renderedHomepage({
        rooms: [room("apple_tv", "Apple TV+", 70), room("max", "Max", 80)],
      }),
      CHECKED_AT,
    );

    expect(report.healthy).toBe(false);
    expect(report.composition.providerRoomCount).toBe(2);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "too_few_provider_rooms",
        }),
      ]),
    );
  });

  it("fails the rendered homepage audit when a core rail disappears", () => {
    const report = auditHomeSurfaceRender(
      renderedHomepage({ critics: [] }),
      CHECKED_AT,
    );

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "missing_required_section",
          sectionKey: "quality",
        }),
        expect.objectContaining({
          issue: "empty_section",
          sectionKey: "quality",
        }),
      ]),
    );
  });

  it("rejects chart-only items in the rendered personal shelf", () => {
    const report = auditHomeSurfaceRender(
      renderedHomepage({
        forYou: [
          item(20, { signal: "Netflix May 28" }),
          item(21, { signal: "Apple TV+ May 29" }),
          item(22, { title: "Chart Only", signal: "Chart mover" }),
        ],
      }),
      CHECKED_AT,
    );

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "chart_only_personal_item",
          sectionKey: "for-you",
          title: "Chart Only",
        }),
      ]),
    );
  });

  it("passes a broad, fresh, visually complete homepage surface", () => {
    const sections = [
      section("hero", 1),
      section("personal", 10),
      section("conversation", 20),
      section("fresh", 30),
      section("quality", 40),
      section("quick", 50),
    ];

    const report = auditHomeSurface(sections, CHECKED_AT);

    expect(report.healthy).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.composition).toMatchObject({
      activeSectionCount: 6,
      itemCount: 18,
      repeatedTitleCount: 0,
      duplicateLeadCount: 0,
      missingArtworkCount: 0,
      currentSignalCount: 18,
      explicitCurrentSignalCount: 18,
      staleSectionKeys: [],
    });
    expect(report.composition.currentSignalCountBySection).toMatchObject({
      hero: 3,
      personal: 3,
      conversation: 3,
      fresh: 3,
      quality: 3,
      quick: 3,
    });
    expect(report.composition.explicitCurrentSignalCountBySection).toMatchObject({
      hero: 3,
      personal: 3,
      conversation: 3,
      fresh: 3,
      quality: 3,
      quick: 3,
    });
  });

  it("flags chart-only demand inside fresh release-window sections", () => {
    const sections = [
      section("hero", 1),
      section("personal", 10),
      section("conversation", 20),
      {
        ...section("fresh", 30),
        label: "New",
        items: [
          item(30, { signal: "Netflix May 30" }),
          item(31, { title: "Chart Only", signal: "Chart mover" }),
          item(32, { signal: "S2 May 28" }),
        ],
      },
      section("quality", 40),
      section("quick", 50),
    ];

    const report = auditHomeSurface(sections, CHECKED_AT);

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual([
      expect.objectContaining({
        issue: "non_release_fresh_item",
        sectionKey: "fresh",
        title: "Chart Only",
      }),
    ]);
  });

  it("rejects provider-only copy inside fresh release-window sections", () => {
    const sections = [
      section("hero", 1),
      section("personal", 10),
      section("conversation", 20),
      {
        ...section("fresh", 30),
        label: "New",
        items: [
          item(30, { signal: "Netflix May 30" }),
          item(31, { title: "Provider Only", signal: "Netflix" }),
          item(32, { signal: "S2 May 28" }),
        ],
      },
      section("quality", 40),
      section("quick", 50),
    ];

    const report = auditHomeSurface(sections, CHECKED_AT);

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual([
      expect.objectContaining({
        issue: "non_release_fresh_item",
        sectionKey: "fresh",
        title: "Provider Only",
      }),
    ]);
  });

  it("allows chart demand context outside fresh release-window sections", () => {
    const sections = [
      section("hero", 1),
      section("personal", 10),
      {
        ...section("heat", 20),
        label: "Happening now",
        items: [
          item(20, { title: "Chart Mover", signal: "Chart mover" }),
          item(21, { signal: "Netflix May 21" }),
          item(22, { signal: "Prime May 22" }),
        ],
      },
      section("fresh", 30),
      section("quality", 40),
      section("quick", 50),
    ];

    const report = auditHomeSurface(sections, CHECKED_AT);

    expect(report.healthy).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("keeps chart-only demand out of personal shelf sections", () => {
    const sections = [
      section("hero", 1),
      {
        ...section("for-you", 10),
        label: "For you",
        items: [
          item(10, { signal: "8.3 TMDB" }),
          item(11, { signal: "Apple TV+ May 29" }),
          item(12, { title: "Chart Only", signal: "Chart mover" }),
        ],
      },
      section("heat", 20),
      section("fresh", 30),
      section("quality", 40),
      section("quick", 50),
    ];

    const report = auditHomeSurface(sections, CHECKED_AT);

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual([
      expect.objectContaining({
        issue: "chart_only_personal_item",
        sectionKey: "for-you",
        title: "Chart Only",
      }),
    ]);
  });

  it("can require platform diversity across the final homepage signals", () => {
    const sections = [
      section("hero", 1),
      section("personal", 10),
      section("conversation", 20),
      section("fresh", 30),
      section("quality", 40),
      section("quick", 50),
    ].map((entry) => ({
      ...entry,
      items: entry.items.map((show) => ({
        ...show,
        signal: "Netflix May 29",
      })),
    }));

    const report = auditHomeSurface(sections, CHECKED_AT, {
      minSignalPlatformCount: 3,
      maxSignalPlatformShare: 0.65,
    });

    expect(report.healthy).toBe(false);
    expect(report.composition.signalPlatformCount).toBe(1);
    expect(report.composition.signalPlatformCounts).toEqual({ netflix: 18 });
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "too_few_signal_platforms" }),
        expect.objectContaining({ issue: "signal_platform_overrepresented" }),
      ]),
    );
  });

  it("can require current daily-chart coverage across the final homepage surface", () => {
    const report = auditHomeSurfaceRender(
      renderedHomepage({
        hero: [
          item(1, { title: "Spider-Noir" }),
          item(2, { title: "Widow's Bay" }),
          item(3, { title: "Hacks" }),
        ],
        heat: [
          item(30, { title: "The Boroughs" }),
          item(31, { title: "The Four Seasons" }),
          item(32, { title: "Off Campus" }),
        ],
      }),
      CHECKED_AT,
      {
        demandChartTitles: [
          "Spider-Noir",
          "Widow's Bay",
          "Hacks",
          "The Boroughs",
          "The Four Seasons",
          "Off Campus",
          "Star City",
        ],
        minDemandChartTitleCount: 7,
      },
    );

    expect(report.healthy).toBe(false);
    expect(report.composition.demandChartTitleCount).toBe(6);
    expect(report.composition.missingDemandChartTitles).toEqual(["Star City"]);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "too_few_demand_chart_titles",
          relatedTitles: ["Star City"],
          detail: expect.stringContaining("Missing: Star City."),
        }),
      ]),
    );

    const passingReport = auditHomeSurfaceRender(
      renderedHomepage({
        hero: [
          item(1, { title: "Spider-Noir" }),
          item(2, { title: "Widow's Bay" }),
          item(3, { title: "Hacks" }),
        ],
        heat: [
          item(30, { title: "The Boroughs" }),
          item(31, { title: "The Four Seasons" }),
          item(32, { title: "Off Campus" }),
          item(33, { title: "Star City" }),
        ],
      }),
      CHECKED_AT,
      {
        demandChartTitles: [
          "Spider-Noir",
          "Widow's Bay",
          "Hacks",
          "The Boroughs",
          "The Four Seasons",
          "Off Campus",
          "Star City",
        ],
        minDemandChartTitleCount: 7,
      },
    );

    expect(passingReport.composition.demandChartTitleCount).toBe(7);
    expect(passingReport.composition.missingDemandChartTitles).toEqual([]);
    expect(passingReport.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "too_few_demand_chart_titles",
        }),
      ]),
    );
  });

  it("counts streaming-room labels toward the platform diversity proof", () => {
    const report = auditHomeSurfaceRender(
      renderedHomepage({
        heat: [
          item(30, { signal: "Netflix May 29" }),
          item(31, { signal: "MGM+ S4 airing now" }),
          item(32, { signal: "Apple TV+ May 29" }),
          item(33, { signal: "Peacock May 7" }),
        ],
      }),
      CHECKED_AT,
      {
        minSignalPlatformCount: 6,
        maxSignalPlatformShare: 1,
      },
    );

    expect(report.healthy).toBe(true);
    expect(report.composition.signalPlatformCount).toBeGreaterThanOrEqual(6);
    expect(report.composition.signalPlatformCounts?.mgm_plus).toBe(1);
    expect(report.composition.signalPlatformCounts?.peacock).toBe(1);
  });

  it("can require the core discovery categories to stay alive", () => {
    const sections = [
      section("hero", 1),
      section("for-you", 10),
      section("heat", 20),
      section("fresh", 30),
      { ...section("quality", 40), items: [] },
      section("quick", 50),
    ];

    const report = auditHomeSurface(sections, CHECKED_AT, {
      requiredActiveSectionKeys: ["heat", "fresh", "quality", "quick"],
    });

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "missing_required_section",
          sectionKey: "quality",
        }),
        expect.objectContaining({
          issue: "empty_section",
          sectionKey: "quality",
        }),
      ]),
    );
  });

  it("flags a homepage that has thin sections, repeated leads, missing art, and stale picks", () => {
    const repeatedLead = item(1, {
      title: "The Same Show",
      posterUrl: null,
      backdropUrl: null,
      year: 2020,
      signal: null,
    });
    const sections: HomeSurfaceAuditSection[] = [
      {
        key: "hero",
        label: "Hero",
        items: [
          repeatedLead,
          item(2, { title: "The Same Show", year: 2020, signal: null }),
          item(3, { title: "The Same Show", year: 2020, signal: null }),
        ],
        minItems: 3,
      },
      {
        key: "personal",
        label: "Personal",
        items: [item(4, { title: "The Same Show", year: 2020, signal: null })],
        minItems: 3,
      },
      {
        key: "empty",
        label: "Empty",
        items: [],
        minItems: 3,
      },
    ];

    const report = auditHomeSurface(sections, CHECKED_AT, {
      minActiveSections: 4,
      minCurrentSignalItems: 2,
    });

    expect(report.healthy).toBe(false);
    expect(report.findings.map((finding) => finding.issue)).toEqual(
      expect.arrayContaining([
        "too_few_sections",
        "underfilled_section",
        "empty_section",
        "repeated_titles",
        "duplicate_leads",
        "missing_artwork",
        "too_few_current_items",
        "too_few_explicit_current_items",
        "stale_section",
      ]),
    );
    expect(report.composition).toMatchObject({
      repeatedTitleCount: 1,
      duplicateLeadCount: 1,
      missingArtworkCount: 1,
      currentSignalCount: 0,
      explicitCurrentSignalCount: 0,
      underfilledSectionKeys: ["personal", "empty"],
      staleSectionKeys: ["hero", "personal"],
    });
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "underfilled_section",
          sectionKey: "personal",
          relatedTitles: ["The Same Show"],
        }),
        expect.objectContaining({
          issue: "missing_artwork",
          relatedTitles: ["The Same Show"],
        }),
        expect.objectContaining({
          issue: "stale_section",
          sectionKey: "hero",
          relatedTitles: ["The Same Show"],
        }),
        expect.objectContaining({
          issue: "stale_section",
          sectionKey: "personal",
          relatedTitles: ["The Same Show"],
        }),
      ]),
    );
  });

  it("counts explicit demand signals as current even when the show year is older", () => {
    const composition = getHomeSurfaceAuditComposition(
      [
        {
          key: "live",
          label: "Live",
          items: [
            item(1, { year: 2019, signal: "Season finale airing tonight" }),
            item(2, { year: 2018, signal: null }),
          ],
        },
      ],
      CHECKED_AT,
      { minItemsPerSection: 1 },
    );

    expect(composition.currentSignalCount).toBe(1);
    expect(composition.explicitCurrentSignalCount).toBe(1);
  });

  it("does not count generic score signals as current for stale shows", () => {
    const composition = getHomeSurfaceAuditComposition(
      [
        {
          key: "generic",
          label: "Generic",
          items: [
            item(1, { year: 2019, signal: "8.3 TMDB" }),
            item(2, { year: 2021, signal: "1.2k reviews" }),
            item(3, { year: 2026, signal: "8.1 TMDB" }),
          ],
        },
      ],
      CHECKED_AT,
      { minItemsPerSection: 1 },
    );

    expect(composition.currentSignalCount).toBe(1);
    expect(composition.explicitCurrentSignalCount).toBe(0);
  });

  it("flags stale sections even when the full homepage has enough current items", () => {
    const sections: HomeSurfaceAuditSection[] = [
      section("hero", 1),
      section("fresh", 10),
      {
        key: "prestige",
        label: "Prestige",
        minItems: 3,
        minCurrentItems: 1,
        items: [
          item(20, { year: 2014, signal: "8.3 TMDB" }),
          item(21, { year: 2015, signal: "1.2k reviews" }),
          item(22, { year: 2017, signal: "Trending" }),
        ],
      },
      section("quick", 30),
      section("provider", 40),
      section("friends", 50),
    ];

    const report = auditHomeSurface(sections, CHECKED_AT, {
      minActiveSections: 6,
      minCurrentSignalItems: 5,
    });

    expect(report.healthy).toBe(false);
    expect(report.composition.currentSignalCount).toBe(15);
    expect(report.composition.currentSignalCountBySection.prestige).toBe(0);
    expect(report.findings).toEqual([
      expect.objectContaining({
        issue: "stale_section",
        sectionKey: "prestige",
        relatedTitles: ["Show 20", "Show 21", "Show 22"],
      }),
    ]);
  });

  it("does not let stale dated release copy satisfy current-section audits", () => {
    const report = auditHomeSurface(
      [
        {
          key: "old-release",
          label: "Old release",
          minItems: 1,
          minCurrentItems: 1,
          items: [
            item(20, {
              year: 2021,
              signal: "Netflix May 4",
            }),
          ],
        },
      ],
      Date.UTC(2026, 8, 1),
      {
        minActiveSections: 1,
        minItemsPerSection: 1,
        minCurrentSignalItems: 0,
        minExplicitCurrentSignalItems: 0,
      },
    );

    expect(report.healthy).toBe(false);
    expect(report.composition.currentSignalCount).toBe(0);
    expect(report.composition.explicitCurrentSignalCount).toBe(0);
    expect(report.findings).toEqual([
      expect.objectContaining({
        issue: "stale_section",
        sectionKey: "old-release",
        relatedTitles: ["Show 20"],
      }),
    ]);
  });

  it("flags a homepage that is recent but lacks explicit release or demand context", () => {
    const sections = [
      section("hero", 1),
      section("personal", 10),
      section("conversation", 20),
      section("fresh", 30),
      section("quality", 40),
      section("quick", 50),
    ].map((entry) => ({
      ...entry,
      items: entry.items.map((show) => ({ ...show, signal: null })),
    }));

    const report = auditHomeSurface(sections, CHECKED_AT);

    expect(report.healthy).toBe(false);
    expect(report.composition.currentSignalCount).toBe(18);
    expect(report.composition.explicitCurrentSignalCount).toBe(0);
    expect(report.findings).toEqual([
      expect.objectContaining({
        issue: "too_few_explicit_current_items",
      }),
    ]);
  });
});
