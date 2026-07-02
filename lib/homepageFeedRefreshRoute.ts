import { buildHomepageFeedRefreshCronSummary } from "./homepageFeedRefresh";

export type HomepageCatalogLoader = () => Promise<unknown>;
export type HomepageFeedRefreshRouteSummary = ReturnType<
  typeof buildHomepageFeedRefreshCronSummary
>;
export type HomepageFeedRefreshRouteActionLog = {
  statusCode: number;
  status: HomepageFeedRefreshRouteSummary["body"]["status"];
  healthy: boolean;
  refreshedAt: number;
  degradedCategoryCount: number;
  actionItemCount: number;
  criticalActionItemCount: number;
  warningActionItemCount: number;
  primaryActionItem: HomepageFeedRefreshRouteSummary["body"]["primaryActionItem"];
  actionItems: HomepageFeedRefreshRouteSummary["body"]["actionItems"];
  catalogDiagnostics: {
    failedCategories: string[];
    staleCategories: string[];
  };
  freshness: {
    currentDemandDailyChart: Omit<
      HomepageFeedRefreshRouteSummary["body"]["freshness"]["currentDemandDailyChart"],
      "titles"
    >;
    currentDemandCoverage: HomepageFeedRefreshRouteSummary["body"]["freshness"]["currentDemandCoverage"];
  };
};

export type HomepageFeedRefreshRouteStatusLog = Omit<
  HomepageFeedRefreshRouteActionLog,
  "actionItems"
>;

function getCatalogActionCategories(
  actionItems: HomepageFeedRefreshRouteSummary["body"]["actionItems"],
  code: "catalog_list_failed" | "catalog_list_stale",
) {
  const categories: string[] = [];
  const seen = new Set<string>();

  for (const item of actionItems) {
    const category = item.category?.trim();
    if (item.owner !== "catalog" || item.code !== code || !category) continue;
    if (seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }

  return categories;
}

export function getHomepageFeedRefreshRouteActionLog(
  summary: HomepageFeedRefreshRouteSummary,
): HomepageFeedRefreshRouteActionLog | null {
  if (summary.body.actionItemCount === 0) return null;

  return {
    ...getHomepageFeedRefreshRouteStatusLog(summary),
    actionItems: summary.body.actionItems.slice(0, 5),
  };
}

export function getHomepageFeedRefreshRouteStatusLog(
  summary: HomepageFeedRefreshRouteSummary,
): HomepageFeedRefreshRouteStatusLog {
  const { freshness } = summary.body;
  return {
    statusCode: summary.statusCode,
    status: summary.body.status,
    healthy: summary.body.healthy,
    refreshedAt: summary.body.refreshedAt,
    degradedCategoryCount: summary.body.degradedCategoryCount,
    actionItemCount: summary.body.actionItemCount,
    criticalActionItemCount: summary.body.criticalActionItemCount,
    warningActionItemCount: summary.body.warningActionItemCount,
    primaryActionItem: summary.body.primaryActionItem,
    catalogDiagnostics: {
      failedCategories: getCatalogActionCategories(
        summary.body.actionItems,
        "catalog_list_failed",
      ),
      staleCategories: getCatalogActionCategories(
        summary.body.actionItems,
        "catalog_list_stale",
      ),
    },
    freshness: {
      currentDemandDailyChart: {
        sourceId: freshness.currentDemandDailyChart.sourceId,
        sourceCheckedAt: freshness.currentDemandDailyChart.sourceCheckedAt,
        sourceLabel: freshness.currentDemandDailyChart.sourceLabel,
        sourceUrl: freshness.currentDemandDailyChart.sourceUrl,
        maxAgeDays: freshness.currentDemandDailyChart.maxAgeDays,
        staleAt: freshness.currentDemandDailyChart.staleAt,
        daysUntilStale: freshness.currentDemandDailyChart.daysUntilStale,
        titleCount: freshness.currentDemandDailyChart.titleCount,
      },
      currentDemandCoverage: freshness.currentDemandCoverage,
    },
  };
}

export async function buildHomepageFeedRefreshRouteSummary(args: {
  loadCatalog: HomepageCatalogLoader;
  refreshedAt?: number;
  onCatalogError?: (error: unknown) => void;
  onSummary?: (payload: HomepageFeedRefreshRouteStatusLog) => void;
  onActionItems?: (payload: HomepageFeedRefreshRouteActionLog) => void;
}) {
  let catalogPayload: unknown = {};
  let catalogActionFailed = false;

  try {
    catalogPayload = await args.loadCatalog();
  } catch (error) {
    catalogActionFailed = true;
    args.onCatalogError?.(error);
  }

  const summary = buildHomepageFeedRefreshCronSummary(
    catalogPayload,
    args.refreshedAt ?? Date.now(),
    { catalogActionFailed },
  );
  args.onSummary?.(getHomepageFeedRefreshRouteStatusLog(summary));
  const actionLog = getHomepageFeedRefreshRouteActionLog(summary);
  if (actionLog) args.onActionItems?.(actionLog);
  return summary;
}
