import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = join(process.cwd(), "scripts", "audit-home-current-demand.mjs");
const LIVE_TITLES = [
  "Widow's Bay",
  "The Bear",
  "I Will Find You",
  "FROM",
  "House of the Dragon",
  "X-Men '97",
  "Maximum Pleasure Guaranteed",
  "Elle",
  "Silo",
  "The Agency",
];
const PRIMARY_TAIL_SWAP_LIVE_TITLES = [
  "Widow's Bay",
  "The Bear",
  "I Will Find You",
  "FROM",
  "House of the Dragon",
  "X-Men '97",
  "Maximum Pleasure Guaranteed",
  "Elle",
  "The Agency",
  "Silo",
];
const PRIMARY_ADJACENT_SWAP_LIVE_TITLES = [
  "Widow's Bay",
  "The Bear",
  "I Will Find You",
  "House of the Dragon",
  "FROM",
  "X-Men '97",
  "Maximum Pleasure Guaranteed",
  "Elle",
  "Silo",
  "The Agency",
];
const SOURCE_BACKED_CHURN_LIVE_TITLES = [
  "Widow's Bay",
  "The Bear",
  "I Will Find You",
  "FROM",
  "House of the Dragon",
  "X-Men '97",
  "Maximum Pleasure Guaranteed",
  "Elle",
  "Silo",
  "Cape Fear",
];

function buildJustWatchFixtureHtml({
  titles = LIVE_TITLES,
  updatedAt = "2026-07-02T05:24:07.286Z",
}: {
  titles?: string[];
  updatedAt?: string;
}) {
  const edgeEntries = titles
    .map(
      (_title, index) =>
        `"StreamingChart.edges.${index}":{"node":{"type":"id","generated":false,"id":"show-${index}"}}`,
    )
    .join(",");
  const contentEntries = titles
    .map(
      (title, index) =>
        `"show-${index}.content()":{"title":"${title.replace(/"/g, '\\"')}"}`,
    )
    .join(",");

  return `{${edgeEntries},"StreamingChart.edges.0.streamingChartInfo":{"rank":1,"updatedAt":"${updatedAt}"},${contentEntries}}`;
}

function withFixture(html: string, run: (fixturePath: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "plotlist-home-demand-"));
  const fixturePath = join(dir, "justwatch.html");
  writeFileSync(fixturePath, html);
  try {
    run(fixturePath);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

function runAudit(
  fixturePath: string,
  now = "2026-07-02T12:00:00.000Z",
) {
  return execFileSync("node", [SCRIPT_PATH], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PLOTLIST_HOME_DEMAND_AUDIT_HTML_FILE: fixturePath,
      PLOTLIST_HOME_DEMAND_AUDIT_NOW: now,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runAuditExpectingFailure(
  fixturePath: string,
  now = "2026-07-02T12:00:00.000Z",
) {
  try {
    runAudit(fixturePath, now);
    throw new Error("Expected current-demand audit to fail");
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr;
    return Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? "");
  }
}

describe("home current-demand audit script", () => {
  it("can verify the checked-in JustWatch order from an offline fixture", () => {
    withFixture(buildJustWatchFixtureHtml({}), (fixturePath) => {
      const output = runAudit(fixturePath);

      expect(output).toContain("Home current-demand audit passed.");
      expect(output).toContain("Live chart updated at: 2026-07-02T05:24:07.286Z");
      expect(output).toContain(
        "Titles: Widow's Bay | The Bear | I Will Find You",
      );
    });
  });

  it("accepts same-day rank jitter when the covered primary titles only swap the tail", () => {
    withFixture(
      buildJustWatchFixtureHtml({ titles: PRIMARY_TAIL_SWAP_LIVE_TITLES }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain("The Agency | Silo");
      },
    );
  });

  it("accepts observed same-day adjacent rank jitter without allowing arbitrary order drift", () => {
    withFixture(
      buildJustWatchFixtureHtml({ titles: PRIMARY_ADJACENT_SWAP_LIVE_TITLES }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Widow's Bay | The Bear | I Will Find You | House of the Dragon | FROM",
        );
      },
    );
  });

  it("accepts active source-backed current-demand titles that were not pre-enumerated chart variants", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: SOURCE_BACKED_CHURN_LIVE_TITLES,
        updatedAt: "2026-07-03T01:17:37.863Z",
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath, "2026-07-03T12:00:00.000Z");

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain("Silo | Cape Fear");
      },
    );
  });

  it("fails when the live daily source itself has not updated recently", () => {
    withFixture(
      buildJustWatchFixtureHtml({ updatedAt: "2026-06-29T05:15:38.177Z" }),
      (fixturePath) => {
        const output = runAuditExpectingFailure(
          fixturePath,
          "2026-07-02T12:00:00.000Z",
        );

        expect(output).toContain("The live JustWatch chart updatedAt is 3 day(s) old");
      },
    );
  });

  it("fails before fetching when the checked-in snapshot is stale", () => {
    withFixture(buildJustWatchFixtureHtml({}), (fixturePath) => {
      const output = runAuditExpectingFailure(
        fixturePath,
        "2026-07-11T12:00:00.000Z",
      );

      expect(output).toContain(
        "The checked-in JustWatch chart snapshot is 9 day(s) old",
      );
    });
  });

  it("fails when the live chart includes a title outside the accepted sourced set", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: [
          "Widow's Bay",
          "The Bear",
          "Unexpected Hit",
          "FROM",
          "House of the Dragon",
          "X-Men '97",
          "Maximum Pleasure Guaranteed",
          "Elle",
          "Silo",
          "The Agency",
        ],
      }),
      (fixturePath) => {
        const output = runAuditExpectingFailure(fixturePath);

        expect(output).toContain(
          '#3: live chart title "Unexpected Hit" is not in the accepted source-backed current-demand set',
        );
      },
    );
  });
});
