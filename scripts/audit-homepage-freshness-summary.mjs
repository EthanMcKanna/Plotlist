const AUDIT_NOW_ENV = process.env.PLOTLIST_HOME_FRESHNESS_AUDIT_NOW;
const MIN_CURRENT_DEMAND_TITLES = 10;
const MIN_ACTIVE_CURRENT_DEMAND_TITLES = 10;
const MIN_CURRENT_DEMAND_PLATFORMS = 5;
const MIN_CURRENT_DEMAND_PRIMARY_GENRES = 5;
const MIN_CURRENT_DEMAND_NONFICTION_ITEMS = 1;

function getStricterMinimum(envName, defaultValue) {
  const rawValue = process.env[envName];
  if (!rawValue) return defaultValue;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < defaultValue) {
    throw new Error(
      `${envName} must be an integer greater than or equal to ${defaultValue}`,
    );
  }

  return value;
}

const minCurrentDemandTitles = getStricterMinimum(
  "PLOTLIST_HOME_MIN_CURRENT_DEMAND_TITLES",
  MIN_CURRENT_DEMAND_TITLES,
);
const minActiveCurrentDemandTitles = getStricterMinimum(
  "PLOTLIST_HOME_MIN_ACTIVE_CURRENT_DEMAND_TITLES",
  MIN_ACTIVE_CURRENT_DEMAND_TITLES,
);
const minCurrentDemandPlatforms = getStricterMinimum(
  "PLOTLIST_HOME_MIN_CURRENT_DEMAND_PLATFORMS",
  MIN_CURRENT_DEMAND_PLATFORMS,
);
const minCurrentDemandPrimaryGenres = getStricterMinimum(
  "PLOTLIST_HOME_MIN_CURRENT_DEMAND_PRIMARY_GENRES",
  MIN_CURRENT_DEMAND_PRIMARY_GENRES,
);
const minCurrentDemandNonfictionItems = getStricterMinimum(
  "PLOTLIST_HOME_MIN_CURRENT_DEMAND_NONFICTION_ITEMS",
  MIN_CURRENT_DEMAND_NONFICTION_ITEMS,
);

function getAuditNow() {
  if (!AUDIT_NOW_ENV) return new Date();

  const timestamp = Date.parse(AUDIT_NOW_ENV);
  if (!Number.isFinite(timestamp)) {
    throw new Error(
      `PLOTLIST_HOME_FRESHNESS_AUDIT_NOW is not a valid date: ${AUDIT_NOW_ENV}`,
    );
  }

  return new Date(timestamp);
}

function formatFinding(finding) {
  return [
    finding.issue,
    finding.title ? `title=${finding.title}` : null,
    finding.group ? `group=${finding.group}` : null,
    finding.sourceId ? `source=${finding.sourceId}` : null,
    finding.detail,
  ].filter(Boolean).join(" | ");
}

function formatWarning(warning) {
  return [
    warning.issue,
    warning.effectiveAt ? `effectiveAt=${warning.effectiveAt}` : null,
    typeof warning.daysUntil === "number"
      ? `daysUntil=${warning.daysUntil}`
      : null,
    warning.detail,
  ].filter(Boolean).join(" | ");
}

const { auditHomeEditorialSeeds } = await import("../lib/homeEditorialSeeds.ts");
const { getHomepageFeedRefreshFreshnessSummary } = await import(
  "../lib/homepageFeedRefresh.ts"
);

const auditNow = getAuditNow();
const editorialAudit = auditHomeEditorialSeeds(auditNow.getTime());
const freshness = getHomepageFeedRefreshFreshnessSummary(
  auditNow.getTime(),
  editorialAudit,
);
const chart = freshness.currentDemandDailyChart;
const coverage = freshness.currentDemandCoverage;
const failures = [];

if (!editorialAudit.healthy) {
  failures.push(
    ...editorialAudit.findings.map((finding) =>
      `Editorial seed audit finding: ${formatFinding(finding)}`,
    ),
  );
}

if (!chart.sourceId) {
  failures.push("Current-demand chart sourceId is missing");
}
if (!chart.sourceCheckedAt) {
  failures.push("Current-demand chart sourceCheckedAt is missing");
}
if (!chart.sourceUrl) {
  failures.push("Current-demand chart sourceUrl is missing");
}
if (chart.titleCount < minCurrentDemandTitles) {
  failures.push(
    `Current-demand chart has ${chart.titleCount} title(s); expected at least ${minCurrentDemandTitles}`,
  );
}
if (chart.titles.length !== chart.titleCount) {
  failures.push(
    `Current-demand chart titleCount (${chart.titleCount}) does not match titles length (${chart.titles.length})`,
  );
}
if (!chart.staleAt) {
  failures.push("Current-demand chart staleAt is missing");
}
if (chart.daysUntilStale === null) {
  failures.push("Current-demand chart daysUntilStale is missing");
} else if (chart.daysUntilStale < 0) {
  failures.push(
    `Current-demand chart became stale ${Math.abs(chart.daysUntilStale)} day(s) ago`,
  );
}
if ((coverage.activeTitleCount ?? 0) < minActiveCurrentDemandTitles) {
  failures.push(
    `Current-demand coverage has ${coverage.activeTitleCount ?? 0} active title(s); expected at least ${minActiveCurrentDemandTitles}`,
  );
}
if ((coverage.platformCount ?? 0) < minCurrentDemandPlatforms) {
  failures.push(
    `Current-demand coverage spans ${coverage.platformCount ?? 0} platform(s); expected at least ${minCurrentDemandPlatforms}`,
  );
}
if ((coverage.primaryGenreCount ?? 0) < minCurrentDemandPrimaryGenres) {
  failures.push(
    `Current-demand coverage spans ${coverage.primaryGenreCount ?? 0} primary genre(s); expected at least ${minCurrentDemandPrimaryGenres}`,
  );
}
if ((coverage.nonfictionCount ?? 0) < minCurrentDemandNonfictionItems) {
  failures.push(
    `Current-demand coverage has ${coverage.nonfictionCount ?? 0} nonfiction/reality/news/talk title(s); expected at least ${minCurrentDemandNonfictionItems}`,
  );
}
if (coverage.findingCount !== editorialAudit.findings.length) {
  failures.push(
    `Freshness findingCount (${coverage.findingCount}) does not match editorial findings (${editorialAudit.findings.length})`,
  );
}
if (coverage.warningCount !== editorialAudit.warnings.length) {
  failures.push(
    `Freshness warningCount (${coverage.warningCount}) does not match editorial warnings (${editorialAudit.warnings.length})`,
  );
}

if (failures.length > 0) {
  console.error("Home freshness summary audit failed:");
  console.error(`Source: ${chart.sourceUrl ?? "missing"}`);
  console.error(`Checked-in source id: ${chart.sourceId ?? "missing"}`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Home freshness summary audit passed.");
console.log(`Source: ${chart.sourceUrl}`);
console.log(`Checked-in source id: ${chart.sourceId}`);
console.log(`Checked at: ${chart.sourceCheckedAt}`);
console.log(`Stale at: ${chart.staleAt}`);
console.log(`Days until stale: ${chart.daysUntilStale}`);
console.log(
  `Coverage: ${coverage.activeTitleCount} active current-demand titles across ${coverage.platformCount} platform(s), ${coverage.primaryGenreCount} primary genre(s), and ${coverage.nonfictionCount} nonfiction/reality/news/talk title(s)`,
);
console.log(`Titles: ${chart.titles.join(" | ")}`);

if (editorialAudit.warnings.length > 0) {
  console.warn("Home freshness summary warnings:");
  editorialAudit.warnings.forEach((warning) =>
    console.warn(`- ${formatWarning(warning)}`),
  );
}
