import { describe, expect, it, jest } from "@jest/globals";

import {
  buildHomepageEditorialSurfaceFallbacks,
  buildHomepageFeedRefreshCronSummary,
  buildHomepageFeedSurfaceAuditInput,
  buildHomepageProviderRoomAuditInputs,
  getHomepageFeedRefreshActionItems,
  getHomepageFeedRefreshFreshnessSummary,
  summarizeHomepageFeedRefresh,
  topUpHomepageSurfaceAuditItems,
} from "../lib/homepageFeedRefresh";
import {
  buildHomepageFeedRefreshRouteSummary,
  getHomepageFeedRefreshRouteActionLog,
  getHomepageFeedRefreshRouteStatusLog,
} from "../lib/homepageFeedRefreshRoute";
import { buildHomeCuratedEdits } from "../lib/homeCuratedEdits";
import {
  auditHomeSurfaceRender,
  type HomeSurfaceAuditItem,
} from "../lib/homeSurfaceAudit";
import { buildColdStartHomeShelfItems } from "../lib/homeStarterShelf";
import type { HomeRailHealthReport } from "../lib/homeRailHealth";
import {
  getHomeEditorialPlatformKeyByTitle,
  HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES,
} from "../lib/homeEditorialSeeds";

function health(overrides: Partial<HomeRailHealthReport> = {}): HomeRailHealthReport {
  return {
    healthy: true,
    issues: [],
    itemCount: 8,
    uniqueItemCount: 8,
    duplicateCount: 0,
    missingArtworkCount: 0,
    recentItemCount: 8,
    echoesGenericSource: false,
    ...overrides,
  };
}

function surfaceItem(
  title: string,
  signal: string | null = "Netflix May 29",
): HomeSurfaceAuditItem {
  return {
    key: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    posterUrl: `https://img.example.com/${title}.jpg`,
    year: 2026,
    signal,
  };
}

describe("homepage feed refresh summary", () => {
  it("builds the cron summary with one timestamp across catalog and surface audits", () => {
    const refreshedAt = new Date("2026-05-30T12:00:00Z").getTime();
    const summary = buildHomepageFeedRefreshCronSummary({}, refreshedAt);

    expect(summary.body.refreshedAt).toBe(refreshedAt);
    expect(summary.body.editorialAudit?.checkedAt).toBe(refreshedAt);
    expect(summary.body.surfaceAudit?.checkedAt).toBe(refreshedAt);
    expect(summary.body.results.map((result) => result.category)).toEqual([
      "trending_day",
      "trending_week",
      "rising_now",
      "breakout_premieres",
      "critics_choice",
      "quick_picks",
      "airing_today",
      "netflix",
      "apple_tv",
      "max",
      "disney_plus",
      "hulu",
      "peacock",
      "prime_video",
      "paramount_plus",
      "mgm_plus",
    ]);
    expect(summary.body.degradedCategories.map((category) => category.category)).toEqual(
      summary.body.results.map((result) => result.category),
    );
  });

  it("includes the cold-start personal shelf in the cron surface audit", () => {
    const refreshedAt = new Date("2026-05-30T12:00:00Z").getTime();
    const summary = buildHomepageFeedRefreshCronSummary({}, refreshedAt);

    expect(
      summary.body.surfaceAudit?.composition.currentSignalCountBySection["for-you"] ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(summary.body.surfaceAudit?.composition.underfilledSectionKeys).not.toContain(
      "for-you",
    );
    expect(summary.body.surfaceAudit?.composition.staleSectionKeys).not.toContain(
      "for-you",
    );
    expect(summary.body.surfaceAudit?.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "missing_required_section",
          sectionKey: "for-you",
        }),
      ]),
    );
    expect(summary.body.actionItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "surface",
          code: "missing_required_section",
          sectionKey: "for-you",
        }),
      ]),
    );
  });

  it("returns a successful cron response when every homepage category is healthy", () => {
    const summary = summarizeHomepageFeedRefresh(
      [
        { category: "trending_day", itemCount: 8, health: health() },
        { category: "breakout_premieres", itemCount: 8, health: health() },
      ],
      123,
    );

    expect(summary).toMatchObject({
      statusCode: 200,
      body: {
        refreshedAt: 123,
        healthy: true,
        status: "healthy",
        degradedCategoryCount: 0,
        actionItemCount: 0,
        criticalActionItemCount: 0,
        warningActionItemCount: 0,
        primaryActionItem: null,
        degradedCategories: [],
        actionItems: [],
      },
    });
  });

  it("exposes the current-demand chart freshness window in every summary", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      new Date("2026-06-06T12:00:00Z").getTime(),
      {
        healthy: true,
        checkedAt: new Date("2026-06-06T12:00:00Z").getTime(),
        activeTitleCount: 14,
        activeCurrentDemandCount: 10,
        activeCurrentDemandPlatformCount: 7,
        activeCurrentDemandPrimaryGenreCount: 5,
        activeCurrentDemandNonfictionCount: 1,
        warnings: [],
        findings: [],
      },
    );

    expect(summary.statusCode).toBe(200);
    expect(summary.body.freshness).toEqual({
      currentDemandDailyChart: {
        sourceId: "justwatch_us_daily_streaming_charts_jun1",
        sourceCheckedAt: "2026-06-01",
        sourceLabel: "JustWatch daily US TV streaming chart",
        sourceUrl: "https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows",
        maxAgeDays: 7,
        staleAt: "2026-06-09",
        daysUntilStale: 3,
        titleCount: 10,
        titles: HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES,
      },
      currentDemandCoverage: {
        activeTitleCount: 10,
        platformCount: 7,
        primaryGenreCount: 5,
        nonfictionCount: 1,
        findingCount: 0,
        warningCount: 0,
      },
    });
    expect(
      getHomepageFeedRefreshFreshnessSummary(
        new Date("2026-06-06T12:00:00Z").getTime(),
        summary.body.editorialAudit,
      ).currentDemandDailyChart.daysUntilStale,
    ).toBe(3);
  });

  it("fails loudly when any homepage category is stale, duplicated, or generic", () => {
    const summary = summarizeHomepageFeedRefresh(
      [
        { category: "trending_day", itemCount: 8, health: health() },
        {
          category: "breakout_premieres",
          itemCount: 3,
          health: health({
            healthy: false,
            issues: ["too_few_items", "duplicate_items"],
            itemCount: 3,
            uniqueItemCount: 2,
            duplicateCount: 1,
            recentItemCount: 2,
          }),
        },
        {
          category: "critics_choice",
          itemCount: 6,
          health: health({
            healthy: false,
            issues: ["stale_items"],
            itemCount: 6,
            uniqueItemCount: 6,
            recentItemCount: 1,
          }),
        },
      ],
      456,
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body).toMatchObject({
      refreshedAt: 456,
      healthy: false,
      status: "critical",
      degradedCategoryCount: 2,
      actionItemCount: 3,
      criticalActionItemCount: 3,
      warningActionItemCount: 0,
      primaryActionItem: expect.objectContaining({
        owner: "catalog",
        severity: "critical",
        code: "too_few_items",
        category: "breakout_premieres",
      }),
      degradedCategories: [
        {
          category: "breakout_premieres",
          itemCount: 3,
          issues: ["too_few_items", "duplicate_items"],
          uniqueItemCount: 2,
          missingArtworkCount: 0,
          recentItemCount: 2,
        },
        {
          category: "critics_choice",
          itemCount: 6,
          issues: ["stale_items"],
          uniqueItemCount: 6,
          missingArtworkCount: 0,
          recentItemCount: 1,
        },
      ],
      actionItems: [
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "too_few_items",
          category: "breakout_premieres",
        }),
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "duplicate_items",
          category: "breakout_premieres",
        }),
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "stale_items",
          category: "critics_choice",
        }),
      ],
    });
  });

  it("fails loudly when editorial fallbacks need review", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      789,
      {
        healthy: false,
        checkedAt: 789,
        activeTitleCount: 0,
        activeCurrentDemandCount: 0,
        activeCurrentDemandPlatformCount: 0,
        activeCurrentDemandPrimaryGenreCount: 0,
        activeCurrentDemandNonfictionCount: 0,
        warnings: [],
        findings: [
          {
            issue: "group_window_expired",
            group: "newOrBack",
            detail: "Review expired 2026-07-12",
          },
        ],
      },
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.healthy).toBe(false);
    expect(summary.body.editorialAudit?.findings).toEqual([
      expect.objectContaining({ issue: "group_window_expired" }),
    ]);
    expect(summary.body.actionItems).toEqual([
      expect.objectContaining({
        owner: "editorial",
        severity: "critical",
        code: "group_window_expired",
        group: "newOrBack",
      }),
    ]);
  });

  it("surfaces editorial coverage forecasts without failing a healthy cron response", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      111,
      {
        healthy: true,
        checkedAt: 111,
        activeTitleCount: 12,
        activeCurrentDemandCount: 10,
        activeCurrentDemandPlatformCount: 6,
        activeCurrentDemandPrimaryGenreCount: 5,
        activeCurrentDemandNonfictionCount: 1,
        warnings: [
          {
            issue: "current_demand_coverage_expires_soon",
            effectiveAt: "2026-07-13",
            daysUntil: 23,
            expiringTitles: ["The Bear", "Cape Fear"],
            findings: [
              {
                issue: "current_demand_too_few_active_titles",
                detail: "Current-demand shelf will expire",
              },
            ],
            detail:
              "Current-demand editorial coverage is projected to miss current_demand_too_few_active_titles on 2026-07-13; refresh researched homepage seeds before then.",
          },
        ],
        findings: [],
      },
    );

    expect(summary.statusCode).toBe(200);
    expect(summary.body.healthy).toBe(true);
    expect(summary.body.status).toBe("warning");
    expect(summary.body.actionItemCount).toBe(1);
    expect(summary.body.criticalActionItemCount).toBe(0);
    expect(summary.body.warningActionItemCount).toBe(1);
    expect(summary.body.primaryActionItem).toEqual(
      expect.objectContaining({
        owner: "editorial",
        severity: "warning",
        code: "current_demand_coverage_expires_soon",
      }),
    );
    expect(summary.body.actionItems).toEqual([
      expect.objectContaining({
        owner: "editorial",
        severity: "warning",
        code: "current_demand_coverage_expires_soon",
        effectiveAt: "2026-07-13",
        relatedTitles: ["The Bear", "Cape Fear"],
      }),
    ]);
  });

  it("keeps daily chart warning action items tied to their snapshot source", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      222,
      {
        healthy: true,
        checkedAt: 222,
        activeTitleCount: 12,
        activeCurrentDemandCount: 10,
        activeCurrentDemandPlatformCount: 6,
        activeCurrentDemandPrimaryGenreCount: 5,
        activeCurrentDemandNonfictionCount: 1,
        warnings: [
          {
            issue: "daily_chart_snapshot_expires_soon",
            effectiveAt: "2026-06-09",
            daysUntil: 2,
            expiringTitles: ["Spider-Noir", "Widow's Bay"],
            findings: [
              {
                issue: "daily_chart_snapshot_stale",
                sourceId: "justwatch_us_daily_streaming_charts_jun1",
                detail: "Current JustWatch daily chart snapshot will exceed its freshness window",
              },
            ],
            detail:
              "Refresh justwatch_us_daily_streaming_charts_jun1 by 2026-06-09 so current-demand ranking does not go stale. Affected daily-chart titles: Spider-Noir, Widow's Bay.",
          },
        ],
        findings: [],
      },
    );

    expect(summary.statusCode).toBe(200);
    expect(summary.body.healthy).toBe(true);
    expect(summary.body.actionItems).toEqual([
      expect.objectContaining({
        owner: "editorial",
        severity: "warning",
        code: "daily_chart_snapshot_expires_soon",
        effectiveAt: "2026-06-09",
        sourceId: "justwatch_us_daily_streaming_charts_jun1",
        sourceCheckedAt: "2026-06-01",
        sourceLabel: "JustWatch daily US TV streaming chart",
        sourceUrl: "https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows",
        relatedTitles: ["Spider-Noir", "Widow's Bay"],
      }),
    ]);
  });

  it("builds compact route logs for warning action items without dropping freshness metadata", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      new Date("2026-06-06T12:00:00Z").getTime(),
      {
        healthy: true,
        checkedAt: new Date("2026-06-06T12:00:00Z").getTime(),
        activeTitleCount: 12,
        activeCurrentDemandCount: 10,
        activeCurrentDemandPlatformCount: 6,
        activeCurrentDemandPrimaryGenreCount: 5,
        activeCurrentDemandNonfictionCount: 1,
        warnings: [
          {
            issue: "daily_chart_snapshot_expires_soon",
            effectiveAt: "2026-06-09",
            daysUntil: 2,
            expiringTitles: ["Spider-Noir", "Widow's Bay"],
            findings: [
              {
                issue: "daily_chart_snapshot_stale",
                sourceId: "justwatch_us_daily_streaming_charts_jun1",
              },
            ],
            detail:
              "Refresh justwatch_us_daily_streaming_charts_jun1 by 2026-06-09 so current-demand ranking does not go stale.",
          },
        ],
        findings: [],
      },
    );

    expect(getHomepageFeedRefreshRouteActionLog(summary)).toEqual({
      statusCode: 200,
      status: "warning",
      healthy: true,
      refreshedAt: new Date("2026-06-06T12:00:00Z").getTime(),
      degradedCategoryCount: 0,
      actionItemCount: 1,
      criticalActionItemCount: 0,
      warningActionItemCount: 1,
      primaryActionItem: expect.objectContaining({
        owner: "editorial",
        code: "daily_chart_snapshot_expires_soon",
      }),
      actionItems: [
        expect.objectContaining({
          owner: "editorial",
          code: "daily_chart_snapshot_expires_soon",
        }),
      ],
      catalogDiagnostics: {
        failedCategories: [],
        staleCategories: [],
      },
      freshness: {
        currentDemandDailyChart: {
          sourceId: "justwatch_us_daily_streaming_charts_jun1",
          sourceCheckedAt: "2026-06-01",
          sourceLabel: "JustWatch daily US TV streaming chart",
          sourceUrl: "https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows",
          maxAgeDays: 7,
          staleAt: "2026-06-09",
          daysUntilStale: 3,
          titleCount: 10,
        },
        currentDemandCoverage: {
          activeTitleCount: 10,
          platformCount: 6,
          primaryGenreCount: 5,
          nonfictionCount: 1,
          findingCount: 0,
          warningCount: 1,
        },
      },
    });
  });

  it("builds compact route status logs even when the freshness cron is healthy", () => {
    const refreshedAt = new Date("2026-06-01T12:00:00Z").getTime();
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      refreshedAt,
      {
        healthy: true,
        checkedAt: refreshedAt,
        activeTitleCount: 14,
        activeCurrentDemandCount: 10,
        activeCurrentDemandPlatformCount: 7,
        activeCurrentDemandPrimaryGenreCount: 5,
        activeCurrentDemandNonfictionCount: 1,
        warnings: [],
        findings: [],
      },
    );

    expect(getHomepageFeedRefreshRouteStatusLog(summary)).toEqual({
      statusCode: 200,
      status: "healthy",
      healthy: true,
      refreshedAt,
      degradedCategoryCount: 0,
      actionItemCount: 0,
      criticalActionItemCount: 0,
      warningActionItemCount: 0,
      primaryActionItem: null,
      catalogDiagnostics: {
        failedCategories: [],
        staleCategories: [],
      },
      freshness: {
        currentDemandDailyChart: {
          sourceId: "justwatch_us_daily_streaming_charts_jun1",
          sourceCheckedAt: "2026-06-01",
          sourceLabel: "JustWatch daily US TV streaming chart",
          sourceUrl: "https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows",
          maxAgeDays: 7,
          staleAt: "2026-06-09",
          daysUntilStale: 8,
          titleCount: 10,
        },
        currentDemandCoverage: {
          activeTitleCount: 10,
          platformCount: 7,
          primaryGenreCount: 5,
          nonfictionCount: 1,
          findingCount: 0,
          warningCount: 0,
        },
      },
    });
    expect(getHomepageFeedRefreshRouteActionLog(summary)).toBeNull();
  });

  it("keeps stale-if-error catalog fallback visible without failing healthy rails", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      321,
      undefined,
      undefined,
      undefined,
      {
        actionItems: [
          {
            owner: "catalog",
            severity: "warning",
            code: "catalog_list_stale",
            category: "hulu",
            message:
              "hulu is serving stale cached homepage catalog data after a refresh failure; refresh TMDB/cache before the stale-if-error window expires.",
          },
        ],
      },
    );

    expect(summary.statusCode).toBe(200);
    expect(summary.body.healthy).toBe(true);
    expect(summary.body.status).toBe("warning");
    expect(summary.body.primaryActionItem).toEqual(
      expect.objectContaining({
        owner: "catalog",
        severity: "warning",
        code: "catalog_list_stale",
        category: "hulu",
      }),
    );
    expect(getHomepageFeedRefreshRouteActionLog(summary)).toEqual(
      expect.objectContaining({
        catalogDiagnostics: {
          failedCategories: [],
          staleCategories: ["hulu"],
        },
      }),
    );
  });

  it("treats critical external action items as unhealthy even when rails look populated", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      321,
      undefined,
      undefined,
      undefined,
      {
        actionItems: [
          {
            owner: "catalog",
            severity: "critical",
            code: "catalog_list_failed",
            category: "hulu",
            message:
              "hulu failed to refresh inside the batched homepage catalog; inspect TMDB, cache, and database logs before trusting this rail.",
          },
        ],
      },
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.healthy).toBe(false);
    expect(summary.body.status).toBe("critical");
    expect(summary.body.criticalActionItemCount).toBe(1);
    expect(summary.body.primaryActionItem).toEqual(
      expect.objectContaining({
        owner: "catalog",
        severity: "critical",
        code: "catalog_list_failed",
        category: "hulu",
      }),
    );
  });

  it("keeps the cron response actionable when the batched catalog action fails", () => {
    const refreshedAt = new Date("2026-06-01T12:00:00Z").getTime();
    const summary = buildHomepageFeedRefreshCronSummary(
      {},
      refreshedAt,
      { catalogActionFailed: true },
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.healthy).toBe(false);
    expect(summary.body.refreshedAt).toBe(refreshedAt);
    expect(summary.body.surfaceAudit?.healthy).toBe(true);
    expect(summary.body.editorialAudit?.healthy).toBe(true);
    expect(summary.body.primaryActionItem).toEqual(
      expect.objectContaining({
        owner: "catalog",
        severity: "critical",
        code: "catalog_action_failed",
      }),
    );
    expect(summary.body.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "catalog_action_failed",
          message: expect.stringContaining("Homepage catalog action failed"),
        }),
      ]),
    );
  });

  it("keeps per-category batched catalog diagnostics ahead of derived empty-rail symptoms", () => {
    const refreshedAt = new Date("2026-05-30T12:00:00Z").getTime();
    const summary = buildHomepageFeedRefreshCronSummary(
      {
        diagnostics: {
          failedCategories: ["trending_day", "hulu"],
          staleCategories: ["netflix"],
        },
      },
      refreshedAt,
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.primaryActionItem).toEqual(
      expect.objectContaining({
        owner: "catalog",
        severity: "critical",
        code: "catalog_list_failed",
        category: "trending_day",
      }),
    );
    expect(summary.body.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "catalog_list_failed",
          category: "hulu",
          message:
            "hulu failed to refresh inside the batched homepage catalog; inspect TMDB, cache, and database logs before trusting this rail.",
        }),
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "too_few_items",
          category: "trending_day",
        }),
        expect.objectContaining({
          owner: "catalog",
          severity: "warning",
          code: "catalog_list_stale",
          category: "netflix",
          message:
            "netflix is serving stale cached homepage catalog data after a refresh failure; refresh TMDB/cache before the stale-if-error window expires.",
        }),
      ]),
    );
    expect(getHomepageFeedRefreshRouteActionLog(summary)).toEqual(
      expect.objectContaining({
        catalogDiagnostics: {
          failedCategories: ["trending_day", "hulu"],
          staleCategories: ["netflix"],
        },
      }),
    );
  });

  it("converts catalog-loader rejection into a structured cron summary", async () => {
    const refreshedAt = new Date("2026-05-30T12:00:00Z").getTime();
    const catalogError = new Error("database unavailable");
    const onCatalogError = jest.fn();
    const summary = await buildHomepageFeedRefreshRouteSummary({
      refreshedAt,
      loadCatalog: async () => {
        throw catalogError;
      },
      onCatalogError,
    });

    expect(onCatalogError).toHaveBeenCalledWith(catalogError);
    expect(summary.statusCode).toBe(503);
    expect(summary.body.healthy).toBe(false);
    expect(summary.body.refreshedAt).toBe(refreshedAt);
    expect(summary.body.primaryActionItem).toEqual(
      expect.objectContaining({
        owner: "catalog",
        severity: "critical",
        code: "catalog_action_failed",
      }),
    );
    expect(summary.body.actionItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "catalog",
          severity: "critical",
          code: "catalog_action_failed",
        }),
      ]),
    );
  });

  it("emits route action logs when a production homepage refresh needs attention", async () => {
    const refreshedAt = new Date("2026-05-30T12:00:00Z").getTime();
    const onSummary = jest.fn();
    const onActionItems = jest.fn();
    const summary = await buildHomepageFeedRefreshRouteSummary({
      refreshedAt,
      loadCatalog: async () => ({}),
      onSummary,
      onActionItems,
    });

    expect(summary.statusCode).toBe(503);
    expect(onSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        status: "critical",
        healthy: false,
        refreshedAt,
        degradedCategoryCount: expect.any(Number),
        freshness: expect.objectContaining({
          currentDemandDailyChart: expect.objectContaining({
            sourceId: "justwatch_us_daily_streaming_charts_jun1",
          }),
        }),
      }),
    );
    expect(onActionItems).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        status: "critical",
        healthy: false,
        refreshedAt,
        criticalActionItemCount: expect.any(Number),
        primaryActionItem: expect.objectContaining({
          severity: "critical",
        }),
        freshness: expect.objectContaining({
          currentDemandDailyChart: expect.objectContaining({
            sourceId: "justwatch_us_daily_streaming_charts_jun1",
          }),
        }),
      }),
    );
  });

  it("fails loudly when the curated edit composition degrades", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      987,
      undefined,
      {
        healthy: false,
        checkedAt: 987,
        composition: {
          editCount: 2,
          leadTitleCount: 1,
          repeatedTitleCount: 1,
          underfilledEditKeys: ["thin"],
        },
        findings: [
          { issue: "too_few_edits", detail: "Expected at least 3 curated edits" },
          { issue: "duplicate_leads", detail: "Curated edit cards should not repeat lead titles" },
        ],
      },
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.healthy).toBe(false);
    expect(summary.body.curatedEditAudit?.findings).toEqual([
      expect.objectContaining({ issue: "too_few_edits" }),
      expect.objectContaining({ issue: "duplicate_leads" }),
    ]);
    expect(summary.body.actionItems).toEqual([
      expect.objectContaining({
        owner: "curation",
        severity: "critical",
        code: "too_few_edits",
      }),
      expect.objectContaining({
        owner: "curation",
        severity: "critical",
        code: "duplicate_leads",
      }),
    ]);
  });

  it("fails loudly when the final homepage surface becomes repetitive or thin", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      654,
      undefined,
      undefined,
      {
        healthy: false,
        checkedAt: 654,
        composition: {
          sectionCount: 3,
          activeSectionCount: 2,
          itemCount: 5,
          uniqueTitleCount: 3,
          repeatedTitleCount: 1,
          leadTitleCount: 1,
          duplicateLeadCount: 1,
          missingArtworkCount: 1,
          currentSignalCount: 1,
          explicitCurrentSignalCount: 1,
          currentSignalCountBySection: { personal: 1 },
          explicitCurrentSignalCountBySection: { personal: 1 },
          providerRoomCount: 0,
          providerRoomRepeatedTitleCount: 0,
          signalPlatformCount: 0,
          signalPlatformCounts: {},
          underfilledSectionKeys: ["personal"],
          staleSectionKeys: [],
        },
        findings: [
          { issue: "too_few_sections", detail: "Expected at least 6 active homepage sections" },
          { issue: "repeated_titles", title: "The Same Show", detail: "The Same Show repeats" },
        ],
      },
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.healthy).toBe(false);
    expect(summary.body.surfaceAudit?.findings).toEqual([
      expect.objectContaining({ issue: "too_few_sections" }),
      expect.objectContaining({ issue: "repeated_titles" }),
    ]);
    expect(summary.body.actionItems).toEqual([
      expect.objectContaining({
        owner: "surface",
        severity: "critical",
        code: "too_few_sections",
      }),
      expect.objectContaining({
        owner: "surface",
        severity: "critical",
        code: "repeated_titles",
        title: "The Same Show",
      }),
    ]);
  });

  it("keeps missing daily-chart titles machine-readable in surface action items", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      655,
      undefined,
      undefined,
      {
        healthy: false,
        checkedAt: 655,
        composition: {
          sectionCount: 9,
          activeSectionCount: 9,
          itemCount: 36,
          uniqueTitleCount: 34,
          repeatedTitleCount: 0,
          leadTitleCount: 9,
          duplicateLeadCount: 0,
          missingArtworkCount: 0,
          currentSignalCount: 28,
          explicitCurrentSignalCount: 18,
          currentSignalCountBySection: {},
          explicitCurrentSignalCountBySection: {},
          providerRoomCount: 5,
          providerRoomRepeatedTitleCount: 0,
          signalPlatformCount: 6,
          signalPlatformCounts: {},
          demandChartTitleCount: 8,
          missingDemandChartTitles: ["Spider-Noir", "Star City"],
          underfilledSectionKeys: [],
          staleSectionKeys: [],
        },
        findings: [
          {
            issue: "too_few_demand_chart_titles",
            relatedTitles: ["Spider-Noir", "Star City"],
            detail:
              "Homepage represents 8 current daily-chart title(s); expected at least 10. Missing: Spider-Noir, Star City.",
          },
        ],
      },
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.actionItems).toEqual([
      expect.objectContaining({
        owner: "surface",
        severity: "critical",
        code: "too_few_demand_chart_titles",
        relatedTitles: ["Spider-Noir", "Star City"],
        message: expect.stringContaining("Missing: Spider-Noir, Star City."),
      }),
    ]);
  });

  it("collapses nested audit failures into operator-ready action items", () => {
    const actions = getHomepageFeedRefreshActionItems({
      degradedCategories: [
        {
          category: "quick_picks",
          itemCount: 2,
          issues: ["too_few_items"],
          uniqueItemCount: 2,
          missingArtworkCount: 1,
          recentItemCount: 1,
        },
      ],
      editorialAudit: {
        healthy: false,
        checkedAt: 111,
        activeTitleCount: 6,
        activeCurrentDemandCount: 3,
        activeCurrentDemandPlatformCount: 3,
        activeCurrentDemandPrimaryGenreCount: 3,
        activeCurrentDemandNonfictionCount: 0,
        warnings: [],
        findings: [
          {
            issue: "current_demand_missing_demand_source",
            group: "newOrBack",
            title: "Star City",
            detail: "Needs an independent demand source",
          },
        ],
      },
      surfaceAudit: {
        healthy: false,
        checkedAt: 111,
        composition: {
          sectionCount: 8,
          activeSectionCount: 8,
          itemCount: 30,
          uniqueTitleCount: 25,
          repeatedTitleCount: 0,
          leadTitleCount: 8,
          duplicateLeadCount: 0,
          missingArtworkCount: 0,
          currentSignalCount: 20,
          explicitCurrentSignalCount: 15,
          currentSignalCountBySection: {},
          explicitCurrentSignalCountBySection: {},
          providerRoomCount: 4,
          providerRoomRepeatedTitleCount: 1,
          signalPlatformCount: 0,
          signalPlatformCounts: {},
          underfilledSectionKeys: [],
          staleSectionKeys: ["fresh"],
        },
        findings: [
          {
            issue: "provider_room_repeated_titles",
            title: "The Bear",
            detail: "The Bear appears in too many rooms",
          },
          {
            issue: "stale_section",
            sectionKey: "fresh",
            relatedTitles: ["Old Favorite", "Archive Pick"],
            detail: "Fresh has no current picks",
          },
        ],
      },
    });

    expect(actions).toEqual([
      expect.objectContaining({
        owner: "catalog",
        severity: "critical",
        code: "too_few_items",
        category: "quick_picks",
      }),
      expect.objectContaining({
        owner: "surface",
        severity: "critical",
        code: "provider_room_repeated_titles",
        title: "The Bear",
      }),
      expect.objectContaining({
        owner: "surface",
        severity: "critical",
        code: "stale_section",
        sectionKey: "fresh",
        relatedTitles: ["Old Favorite", "Archive Pick"],
      }),
      expect.objectContaining({
        owner: "editorial",
        severity: "critical",
        code: "current_demand_missing_demand_source",
        title: "Star City",
        message: "Needs an independent demand source",
      }),
    ]);
  });

  it("keeps required homepage rail failures visible in the cron response", () => {
    const summary = summarizeHomepageFeedRefresh(
      [{ category: "trending_day", itemCount: 8, health: health() }],
      321,
      undefined,
      undefined,
      {
        healthy: false,
        checkedAt: 321,
        composition: {
          sectionCount: 6,
          activeSectionCount: 5,
          itemCount: 22,
          uniqueTitleCount: 22,
          repeatedTitleCount: 0,
          leadTitleCount: 5,
          duplicateLeadCount: 0,
          missingArtworkCount: 0,
          currentSignalCount: 18,
          explicitCurrentSignalCount: 12,
          currentSignalCountBySection: { "for-you": 3, heat: 4, fresh: 4, quick: 4 },
          explicitCurrentSignalCountBySection: {
            "for-you": 2,
            heat: 4,
            fresh: 4,
            quick: 2,
          },
          providerRoomCount: 0,
          providerRoomRepeatedTitleCount: 0,
          signalPlatformCount: 0,
          signalPlatformCounts: {},
          underfilledSectionKeys: [],
          staleSectionKeys: [],
        },
        findings: [
          {
            issue: "missing_required_section",
            sectionKey: "quality",
            detail: "quality must be present with at least one show",
          },
          {
            issue: "chart_only_personal_item",
            sectionKey: "for-you",
            title: "Chart Only",
            detail: "For you should not use chart-only demand",
          },
        ],
      },
    );

    expect(summary.statusCode).toBe(503);
    expect(summary.body.healthy).toBe(false);
    expect(summary.body.surfaceAudit?.findings).toEqual([
      expect.objectContaining({
        issue: "missing_required_section",
        sectionKey: "quality",
      }),
      expect.objectContaining({
        issue: "chart_only_personal_item",
        sectionKey: "for-you",
      }),
    ]);
  });

  it("builds provider-room audit inputs from researched fallbacks when provider payloads are empty", () => {
    const rooms = buildHomepageProviderRoomAuditInputs(
      new Map(),
      new Date("2026-05-29T12:00:00Z").getTime(),
    );
    const appleTv = rooms.find((room) => room.key === "apple_tv");
    const disneyPlus = rooms.find((room) => room.key === "disney_plus");

    expect(appleTv?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(["Star City", "Widow's Bay"]),
    );
    expect(disneyPlus?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Andor",
        "Sofia the First: Royal Magic",
        "Best of the World with Antoni Porowski",
      ]),
    );
    expect(rooms.filter((room) => room.items.length > 0).length).toBeGreaterThanOrEqual(4);
  });

  it("includes MGM+ provider room audit input when the live provider payload is substantial", () => {
    const checkedAt = new Date("2026-06-01T12:00:00Z").getTime();
    const rooms = buildHomepageProviderRoomAuditInputs(
      new Map([
        [
          "mgm_plus",
          [
            surfaceItem("Godfather of Harlem"),
            surfaceItem("Robin Hood"),
            surfaceItem("The Institute"),
            surfaceItem("Billy the Kid"),
          ],
        ],
      ]),
      checkedAt,
    );
    const mgmPlus = rooms.find((room) => room.key === "mgm_plus");

    expect(mgmPlus?.label).toBe("MGM+");
    expect(mgmPlus?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(["FROM", "Godfather of Harlem", "Robin Hood"]),
    );
  });

  it("includes Peacock provider room audit input when the live provider payload is substantial", () => {
    const checkedAt = new Date("2026-06-01T12:00:00Z").getTime();
    const rooms = buildHomepageProviderRoomAuditInputs(
      new Map([
        [
          "peacock",
          [
            surfaceItem("Law & Order: Special Victims Unit", "Peacock May 7"),
            surfaceItem("Law & Order", "Peacock May 7"),
            surfaceItem("Chicago Fire", "Peacock May 7"),
            surfaceItem("Chicago P.D.", "Peacock May 7"),
          ],
        ],
      ]),
      checkedAt,
    );
    const peacock = rooms.find((room) => room.key === "peacock");

    expect(peacock?.label).toBe("Peacock");
    expect(peacock?.items.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Love Island USA",
        "M.I.A.",
        "Law & Order: Special Victims Unit",
      ]),
    );
  });

  it("models researched fallbacks for core rails when live catalog rails are empty", () => {
    const checkedAt = new Date("2026-06-01T12:00:00Z").getTime();
    const fallback = buildHomepageEditorialSurfaceFallbacks(checkedAt);
    const heat = topUpHomepageSurfaceAuditItems([], fallback.heat, 20);
    const fresh = topUpHomepageSurfaceAuditItems([], fallback.fresh, 12);
    const critics = topUpHomepageSurfaceAuditItems([], fallback.critics, 5);
    const quick = topUpHomepageSurfaceAuditItems([], fallback.quick, 5);
    const forYou = buildColdStartHomeShelfItems({
      forYou: [],
      heat,
      fresh,
      critics,
      quick,
      limit: 8,
      now: checkedAt,
    });
    const curatedEdits = buildHomeCuratedEdits({
      heat,
      fresh,
      critics,
      quick,
      now: checkedAt,
    });
    const rooms = buildHomepageProviderRoomAuditInputs(new Map(), checkedAt);
    const surfaceInput = buildHomepageFeedSurfaceAuditInput({
      forYou,
      heat,
      fresh,
      critics,
      quick,
      curatedEdits,
      rooms,
      now: checkedAt,
    });
    const report = auditHomeSurfaceRender(
      surfaceInput,
      checkedAt,
      {
        maxTitleAppearances: 3,
        minActiveSections: 9,
        minProviderRooms: 4,
        minSignalPlatformCount: 5,
        maxSignalPlatformShare: 0.5,
        requiredActiveSectionKeys: ["hero", "for-you", "heat", "fresh", "quality", "quick"],
      },
    );

    const heatTitles = heat.map((item) => item.title);
    const heatPlatforms = new Set(
      heat
        .map((item) => getHomeEditorialPlatformKeyByTitle(item.title, checkedAt))
        .filter(Boolean),
    );

    expect(heatTitles).toEqual(
      expect.arrayContaining([
        "Spider-Noir",
        "Hacks",
        "The Four Seasons",
        "Star City",
        "Love Island USA",
        "Dragon Striker",
      ]),
    );
    expect(surfaceInput.hero?.slice(0, 5).map((item) => item.title)).toEqual([
      "Spider-Noir",
      "The Four Seasons",
      "Widow's Bay",
      "Love Island USA",
      "Dutton Ranch",
    ]);
    expect(surfaceInput.hero?.map((item) => item.title)).not.toContain(
      "Lord of the Flies",
    );
    const visibleSurfaceTitles = new Set(
      [
        ...(surfaceInput.hero ?? []),
        ...(surfaceInput.forYou ?? []),
        ...(surfaceInput.heat ?? []),
        ...(surfaceInput.fresh ?? []),
        ...(surfaceInput.curated ?? []).flatMap((edit) => edit.items),
        ...(surfaceInput.rooms ?? []).flatMap((room) => room.items),
      ].map((item) => item.title),
    );
    HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART_TITLES.forEach((title) => {
      expect(visibleSurfaceTitles.has(title)).toBe(true);
    });
    expect(surfaceInput.forYou?.length).toBeGreaterThanOrEqual(3);
    expect(report.composition.currentSignalCountBySection["for-you"]).toBeGreaterThanOrEqual(1);
    expect(
      surfaceInput.heat?.some((item) =>
        surfaceInput.hero?.some((heroItem) => heroItem.title === item.title),
      ),
    ).toBe(false);
    expect([
      ...(surfaceInput.hero ?? []),
      ...(surfaceInput.heat ?? []),
      ...(surfaceInput.rooms?.find((room) => room.key === "disney_plus")?.items ?? []),
    ].map((item) => item.title)).toContain("Dragon Striker");
    expect(
      surfaceInput.rooms?.find((room) => room.key === "netflix")?.items.map((item) => item.title),
    ).toContain("Murder Mindfully");
    expect(
      surfaceInput.rooms?.find((room) => room.key === "prime_video")?.items.map(
        (item) => item.title,
      ),
    ).toContain("Elle");
    expect(surfaceInput.quick?.find((item) => item.title === "Hacks")?.signal).toBe(
      "Finale May 28",
    );
    expect(surfaceInput.curated?.find((edit) => edit.key === "short")?.items[0]?.title).toBe(
      "Hacks",
    );
    expect(surfaceInput.rooms?.find((room) => room.key === "max")?.items[0]?.title).toBe(
      "Rick and Morty",
    );
    expect(surfaceInput.rooms?.find((room) => room.key === "max")?.items.map(
      (item) => item.title,
    )).toEqual(expect.arrayContaining(["House of the Dragon", "Rick and Morty"]));
    expect(surfaceInput.rooms?.find((room) => room.key === "max")?.items[0]?.title).not.toBe(
      surfaceInput.curated?.find((edit) => edit.key === "short")?.items[0]?.title,
    );
    expect(surfaceInput.rooms?.find((room) => room.key === "hulu")?.items[0]?.title).toBe(
      "Deli Boys",
    );
    expect(surfaceInput.rooms?.find((room) => room.key === "hulu")?.items.map(
      (item) => item.title,
    )).toEqual(expect.arrayContaining(["Deli Boys", "The Testaments", "Not Suitable for Work"]));
    expect(
      surfaceInput.rooms?.find((room) => room.key === "disney_plus")?.items.map(
        (item) => item.title,
      ),
    ).toEqual(expect.arrayContaining(["Dragon Striker", "The Simpsons"]));
    expect(heatPlatforms.size).toBeGreaterThanOrEqual(5);
    expect(heat.every((item) => item.signal?.trim())).toBe(true);
    expect(curatedEdits.length).toBeGreaterThanOrEqual(3);
    expect(report.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "missing_required_section" }),
        expect.objectContaining({ issue: "empty_section" }),
        expect.objectContaining({ issue: "underfilled_section" }),
        expect.objectContaining({ issue: "repeated_titles" }),
        expect.objectContaining({ issue: "duplicate_leads" }),
        expect.objectContaining({ issue: "too_few_sections" }),
        expect.objectContaining({ issue: "too_few_signal_platforms" }),
      ]),
    );
    expect(report.healthy).toBe(true);
  });

  it("models provider room freshness after final surface de-duping", () => {
    const checkedAt = new Date("2026-05-30T12:00:00Z").getTime();
    const input = buildHomepageFeedSurfaceAuditInput({
      heat: [
        surfaceItem("Heat One"),
        surfaceItem("Heat Two"),
        surfaceItem("Heat Three"),
      ],
      fresh: [
        surfaceItem("Fresh One"),
        surfaceItem("Fresh Two"),
        surfaceItem("Fresh Three"),
      ],
      critics: [
        surfaceItem("Critic One"),
        surfaceItem("Critic Two"),
        surfaceItem("Critic Three"),
      ],
      quick: [
        surfaceItem("Quick One"),
        surfaceItem("Quick Two"),
        surfaceItem("Quick Three"),
      ],
      curatedEdits: [],
      now: checkedAt,
      rooms: [
        {
          key: "apple_tv",
          label: "Apple TV+",
          items: [
            surfaceItem("Widow's Bay", "Apple TV+ Apr 29"),
            surfaceItem("Apple Two", null),
            surfaceItem("Apple Three", null),
          ],
        },
        {
          key: "hulu",
          label: "Hulu",
          items: [
            surfaceItem("Tracker", null),
            surfaceItem("Deli Boys", "S2 May 28"),
            surfaceItem("The Bear", "FX/Hulu Jun 25"),
          ],
        },
      ],
    });

    expect(input.rooms?.map((room) => room.key)).toEqual([
      "hulu",
      "apple_tv",
    ]);
    expect(input.rooms?.[0]?.items.map((item) => item.title)).toEqual([
      "Deli Boys",
      "The Bear",
      "Tracker",
    ]);
  });

  it("lets personal shelf titles consume the audit budget before downstream discovery rails", () => {
    const checkedAt = new Date("2026-05-30T12:00:00Z").getTime();
    const input = buildHomepageFeedSurfaceAuditInput({
      forYou: [
        surfaceItem("Shelf Anchor"),
        surfaceItem("Personal One"),
        surfaceItem("Personal Two"),
        surfaceItem("Personal Three"),
      ],
      heat: [
        surfaceItem("Heat One"),
        surfaceItem("Heat Two"),
        surfaceItem("Heat Three"),
        surfaceItem("Heat Four"),
        surfaceItem("Heat Five"),
        surfaceItem("Heat Six"),
        surfaceItem("Shelf Anchor"),
      ],
      fresh: [
        surfaceItem("Fresh One"),
        surfaceItem("Fresh Two"),
        surfaceItem("Fresh Three"),
        surfaceItem("Fresh Four"),
        surfaceItem("Fresh Five"),
        surfaceItem("Fresh Six"),
        surfaceItem("Shelf Anchor"),
      ],
      critics: [
        surfaceItem("Critic One"),
        surfaceItem("Critic Two"),
        surfaceItem("Critic Three"),
        surfaceItem("Critic Four"),
      ],
      quick: [
        surfaceItem("Quick One"),
        surfaceItem("Quick Two"),
        surfaceItem("Quick Three"),
        surfaceItem("Quick Four"),
      ],
      curatedEdits: [],
      rooms: [],
      now: checkedAt,
    });

    expect(input.forYou?.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Shelf Anchor",
        "Personal One",
        "Personal Two",
        "Personal Three",
      ]),
    );
    expect(input.heat?.map((item) => item.title)).not.toContain("Shelf Anchor");
    expect(input.fresh?.map((item) => item.title)).not.toContain("Shelf Anchor");
    expect(input.fresh?.length).toBeGreaterThanOrEqual(4);
  });

  it("tops up thin live audit rails without repeating fallback titles", () => {
    const fallback = buildHomepageEditorialSurfaceFallbacks("2026-05-29T12:00:00Z");
    const topped = topUpHomepageSurfaceAuditItems(
      [surfaceItem("Live Pick"), surfaceItem("Star City")],
      fallback.heat,
      5,
    );

    expect(topped[0].title).toBe("Live Pick");
    expect(topped.map((item) => item.title).filter((title) => title === "Star City")).toHaveLength(1);
    expect(new Set(topped.map((item) => item.title)).size).toBe(topped.length);
    expect(topped.length).toBe(5);
  });

  it("fails the surface audit when streaming rooms expire out of the refresh pipeline", () => {
    const checkedAt = new Date("2026-09-30T12:00:00Z").getTime();
    const rooms = buildHomepageProviderRoomAuditInputs(new Map(), checkedAt);
    const report = auditHomeSurfaceRender(
      {
        hero: [
          surfaceItem("Hero One"),
          surfaceItem("Hero Two"),
          surfaceItem("Hero Three"),
        ],
        heat: [surfaceItem("Heat One"), surfaceItem("Heat Two"), surfaceItem("Heat Three")],
        fresh: [
          surfaceItem("Fresh One"),
          surfaceItem("Fresh Two"),
          surfaceItem("Fresh Three"),
          surfaceItem("Fresh Four"),
        ],
        critics: [
          surfaceItem("Quality One"),
          surfaceItem("Quality Two"),
          surfaceItem("Quality Three"),
          surfaceItem("Quality Four"),
        ],
        quick: [
          surfaceItem("Quick One"),
          surfaceItem("Quick Two"),
          surfaceItem("Quick Three"),
          surfaceItem("Quick Four"),
        ],
        rooms,
      },
      checkedAt,
      {
        minActiveSections: 9,
        minProviderRooms: 4,
        requiredActiveSectionKeys: ["hero", "heat", "fresh", "quality", "quick"],
      },
    );

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "too_few_provider_rooms" }),
      ]),
    );
  });
});
