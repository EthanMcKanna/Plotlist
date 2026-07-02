import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_LIVE_CHART_AGE_DAYS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SEEDS_PATH = join(process.cwd(), "lib", "homeEditorialSeeds.ts");
const CHART_CONST_NAME = "HOME_EDITORIAL_JUSTWATCH_DAILY_TV_CHART";
const AUDIT_NOW_ENV = process.env.PLOTLIST_HOME_DEMAND_AUDIT_NOW;
const LIVE_CHART_HTML_FILE_ENV =
  process.env.PLOTLIST_HOME_DEMAND_AUDIT_HTML_FILE;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeJsonStringFragment(value) {
  return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
}

function extractStringProperty(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return match?.[1] ?? null;
}

function extractNumberProperty(block, key) {
  const match = block.match(new RegExp(`${key}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function extractTitleArray(block, key) {
  const titlesBlock = block.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? "";
  return [...titlesBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function extractQuotedStrings(block) {
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function extractNestedTitleArrays(block, key) {
  const nestedBlock = block.match(
    new RegExp(`${key}:\\s*\\[([\\s\\S]*)\\]\\s*,?\\s*$`),
  )?.[1] ?? "";
  return [...nestedBlock.matchAll(/\[([\s\S]*?)\]/g)]
    .map((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((titleMatch) => titleMatch[1]))
    .filter((titles) => titles.length > 0);
}

function decodeObjectKey(value) {
  return value.startsWith('"') ? JSON.parse(value) : value;
}

function getStartOfUtcDay(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return NaN;
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function extractCurrentDemandValidityByTitle(source) {
  const validityBlock = source.match(
    /const HOME_EDITORIAL_CURRENT_DEMAND_VALIDITY_BY_TITLE[\s\S]*?= \{([\s\S]*?)\n\};/,
  )?.[1] ?? "";
  return new Map(
    [...validityBlock.matchAll(/^\s{2}((?:"(?:\\.|[^"])*")|[A-Za-z][A-Za-z0-9_]*):\s*\{([^}]*)\},/gm)]
      .map((match) => [
        decodeObjectKey(match[1]),
        {
          validFrom: extractStringProperty(match[2], "validFrom"),
          validThrough: extractStringProperty(match[2], "validThrough"),
        },
      ]),
  );
}

function isTitleActiveOn(title, validityByTitle, now) {
  const validity = validityByTitle.get(title);
  if (!validity) return true;

  const currentDay = getStartOfUtcDay(now.toISOString());
  if (!Number.isFinite(currentDay)) return false;
  if (
    validity.validFrom &&
    currentDay < getStartOfUtcDay(validity.validFrom)
  ) {
    return false;
  }
  if (
    validity.validThrough &&
    currentDay > getStartOfUtcDay(validity.validThrough)
  ) {
    return false;
  }
  return true;
}

function extractSourceBackedCurrentDemandTitles(source, now) {
  const demandSourceIds = new Set(
    extractQuotedStrings(
      source.match(
        /export const HOME_EDITORIAL_DEMAND_SOURCE_IDS[^=]*= \[([\s\S]*?)\];/,
      )?.[1] ?? "",
    ),
  );
  const validityByTitle = extractCurrentDemandValidityByTitle(source);
  const titles = new Set();

  [...source.matchAll(/^\s{2}((?:"(?:\\.|[^"])*")|[A-Za-z][A-Za-z0-9_]*):\s*\{([\s\S]*?)^\s{2}\},/gm)]
    .forEach((match) => {
      const title = decodeObjectKey(match[1]);
      const block = match[2];
      if (extractStringProperty(block, "rationale") !== "current_demand") return;
      if (!isTitleActiveOn(title, validityByTitle, now)) return;
      const sourceIds = extractTitleArray(block, "sourceIds");
      if (sourceIds.some((sourceId) => demandSourceIds.has(sourceId))) {
        titles.add(title);
      }
    });

  return [...titles];
}

function extractChartSnapshot(source) {
  const chartMatch = source.match(
    new RegExp(
      `export const ${CHART_CONST_NAME} = \\{([\\s\\S]*?)\\n\\} as const;`,
    ),
  );
  if (!chartMatch) {
    throw new Error(`Could not find ${CHART_CONST_NAME} in ${SEEDS_PATH}`);
  }

  const chartBlock = chartMatch[1];
  const checkedAt = extractStringProperty(chartBlock, "checkedAt");
  const maxAgeDays = extractNumberProperty(chartBlock, "maxAgeDays");
  const sourceId = extractStringProperty(chartBlock, "sourceId");
  const titles = extractTitleArray(chartBlock, "titles");
  const alternateTitleOrders = extractNestedTitleArrays(
    chartBlock,
    "alternateTitleOrders",
  );
  if (
    !checkedAt ||
    !sourceId ||
    typeof maxAgeDays !== "number" ||
    !Number.isFinite(maxAgeDays) ||
    titles.length === 0
  ) {
    throw new Error("The checked-in JustWatch chart snapshot is incomplete");
  }

  const sourceMatch = source.match(
    new RegExp(`${escapeRegex(sourceId)}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`),
  );
  if (!sourceMatch) {
    throw new Error(`${sourceId} is missing from HOME_EDITORIAL_RESEARCH_SOURCES`);
  }

  const sourceBlock = sourceMatch[1];
  const sourceUrl = extractStringProperty(sourceBlock, "url");
  const sourceCheckedAt = extractStringProperty(sourceBlock, "checkedAt");
  if (!sourceUrl || !sourceCheckedAt) {
    throw new Error(`${sourceId} is missing url or checkedAt metadata`);
  }
  if (sourceCheckedAt !== checkedAt) {
    throw new Error(
      `${sourceId} checkedAt (${sourceCheckedAt}) does not match chart checkedAt (${checkedAt})`,
    );
  }

  return {
    checkedAt,
    maxAgeDays,
    sourceCheckedAt,
    sourceId,
    sourceUrl,
    titles,
    acceptedTitleOrders: [titles, ...alternateTitleOrders],
  };
}

function extractJustWatchDailyTvChart(html) {
  const edgeMatches = [
    ...html.matchAll(
      /\.edges\.(\d+)"[\s\S]{0,700}?"node":\{"type":"id","generated":false,"id":"([^"]+)"/g,
    ),
  ];
  const topEdges = edgeMatches
    .map((match) => ({
      index: Number(match[1]),
      id: match[2],
    }))
    .filter((edge) => Number.isInteger(edge.index) && edge.index >= 0 && edge.index < 10)
    .sort((left, right) => left.index - right.index)
    .slice(0, 10);

  if (topEdges.length !== 10) {
    throw new Error(`Expected 10 JustWatch chart edges, found ${topEdges.length}`);
  }

  const titles = topEdges.map((edge) => {
    const contentPattern = new RegExp(
      `"\\$?${escapeRegex(edge.id)}\\.content\\([^)]*\\)":\\{"title":"([^"]+)"`,
    );
    const title = html.match(contentPattern)?.[1];
    if (!title) {
      throw new Error(`Could not resolve JustWatch title for ${edge.id}`);
    }
    return decodeJsonStringFragment(title);
  });

  const updatedAt = html.match(
    /\.edges\.0\.streamingChartInfo":\{"rank":1[\s\S]*?"updatedAt":"([^"]+)"/,
  )?.[1];

  return {
    titles,
    updatedAt: updatedAt ?? null,
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "PlotlistHomeDemandAudit/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLiveChartHtml(url) {
  if (LIVE_CHART_HTML_FILE_ENV) {
    return readFile(LIVE_CHART_HTML_FILE_ENV, "utf8");
  }
  return fetchText(url);
}

function compareTitles(expectedTitles, liveTitles) {
  return expectedTitles.flatMap((expected, index) => {
    const live = liveTitles[index];
    return live === expected
      ? []
      : [`#${index + 1}: expected "${expected}", got "${live ?? "missing"}"`];
  });
}

function findTitlesOutsideAcceptedSet(acceptedTitles, liveTitles) {
  return liveTitles.flatMap((title, index) =>
    acceptedTitles.has(title)
      ? []
      : [
          `#${index + 1}: live chart title "${title}" is not in the accepted source-backed current-demand set`,
        ],
  );
}

function getSnapshotFreshnessError(snapshot, now = new Date()) {
  const checkedAtDay = getStartOfUtcDay(snapshot.checkedAt);
  const currentDay = getStartOfUtcDay(now.toISOString());
  if (!Number.isFinite(checkedAtDay) || !Number.isFinite(currentDay)) {
    return "The checked-in JustWatch chart snapshot has an invalid checkedAt date";
  }

  const ageDays = Math.floor((currentDay - checkedAtDay) / MS_PER_DAY);
  if (ageDays < 0) {
    return `The checked-in JustWatch chart snapshot is dated ${Math.abs(ageDays)} day(s) in the future`;
  }
  if (ageDays > snapshot.maxAgeDays) {
    return `The checked-in JustWatch chart snapshot is ${ageDays} day(s) old; refresh within ${snapshot.maxAgeDays} day(s)`;
  }
  return null;
}

function getLiveChartFreshnessError(liveChart, now = new Date()) {
  if (!liveChart.updatedAt) {
    return "The live JustWatch chart is missing updatedAt metadata";
  }

  const updatedAtDay = getStartOfUtcDay(liveChart.updatedAt);
  const currentDay = getStartOfUtcDay(now.toISOString());
  if (!Number.isFinite(updatedAtDay) || !Number.isFinite(currentDay)) {
    return `The live JustWatch chart has an invalid updatedAt date: ${liveChart.updatedAt}`;
  }

  const ageDays = Math.floor((currentDay - updatedAtDay) / MS_PER_DAY);
  if (ageDays < 0) {
    return `The live JustWatch chart updatedAt is dated ${Math.abs(ageDays)} day(s) in the future`;
  }
  if (ageDays > MAX_LIVE_CHART_AGE_DAYS) {
    return `The live JustWatch chart updatedAt is ${ageDays} day(s) old; expected a daily source updated within ${MAX_LIVE_CHART_AGE_DAYS} day(s)`;
  }
  return null;
}

function getAuditNow() {
  if (!AUDIT_NOW_ENV) return new Date();
  const timestamp = Date.parse(AUDIT_NOW_ENV);
  if (!Number.isFinite(timestamp)) {
    throw new Error(
      `PLOTLIST_HOME_DEMAND_AUDIT_NOW is not a valid date: ${AUDIT_NOW_ENV}`,
    );
  }
  return new Date(timestamp);
}

async function main() {
  const source = await readFile(SEEDS_PATH, "utf8");
  const snapshot = extractChartSnapshot(source);
  const auditNow = getAuditNow();
  const acceptedSourceBackedTitles = new Set([
    ...snapshot.acceptedTitleOrders.flat(),
    ...extractSourceBackedCurrentDemandTitles(source, auditNow),
  ]);
  const freshnessError = getSnapshotFreshnessError(
    snapshot,
    auditNow,
  );
  if (freshnessError) {
    console.error("Home current-demand audit failed:");
    console.error(`Source: ${snapshot.sourceUrl}`);
    console.error(`Checked-in source id: ${snapshot.sourceId}`);
    console.error(`- ${freshnessError}`);
    process.exit(1);
  }

  const liveChart = extractJustWatchDailyTvChart(
    await fetchLiveChartHtml(snapshot.sourceUrl),
  );
  const liveFreshnessError = getLiveChartFreshnessError(liveChart, auditNow);
  if (liveFreshnessError) {
    console.error("Home current-demand audit failed:");
    console.error(`Source: ${snapshot.sourceUrl}`);
    console.error(`Checked-in source id: ${snapshot.sourceId}`);
    console.error(`- ${liveFreshnessError}`);
    process.exit(1);
  }

  const matchesAcceptedOrder = snapshot.acceptedTitleOrders.some(
    (titles) => compareTitles(titles, liveChart.titles).length === 0,
  );
  const mismatches = matchesAcceptedOrder
    ? []
    : findTitlesOutsideAcceptedSet(
        acceptedSourceBackedTitles,
        liveChart.titles,
      );

  if (mismatches.length > 0) {
    console.error("Home current-demand audit failed:");
    console.error(`Source: ${snapshot.sourceUrl}`);
    console.error(`Checked-in source id: ${snapshot.sourceId}`);
    mismatches.forEach((mismatch) => console.error(`- ${mismatch}`));
    process.exit(1);
  }

  console.log("Home current-demand audit passed.");
  console.log(`Source: ${snapshot.sourceUrl}`);
  console.log(`Checked-in source id: ${snapshot.sourceId}`);
  console.log(`Checked at: ${snapshot.checkedAt}`);
  if (liveChart.updatedAt) console.log(`Live chart updated at: ${liveChart.updatedAt}`);
  console.log(`Titles: ${liveChart.titles.join(" | ")}`);
}

await main();
