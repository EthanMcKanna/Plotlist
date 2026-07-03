import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  "audit-homepage-freshness-summary.mjs",
);
const TSX_PATH = join(process.cwd(), "node_modules", ".bin", "tsx");

function runAudit(
  now = "2026-07-02T12:00:00.000Z",
  env: Record<string, string> = {},
) {
  return execFileSync(TSX_PATH, [SCRIPT_PATH], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PLOTLIST_HOME_FRESHNESS_AUDIT_NOW: now,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runAuditExpectingFailure(
  now = "2026-07-11T12:00:00.000Z",
  env: Record<string, string> = {},
) {
  try {
    runAudit(now, env);
    throw new Error("Expected homepage freshness summary audit to fail");
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr;
    return Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? "");
  }
}

describe("homepage freshness summary audit script", () => {
  it("verifies the checked-in freshness summary contract offline", () => {
    const output = runAudit();

    expect(output).toContain("Home freshness summary audit passed.");
    expect(output).toContain(
      "Checked-in source id: justwatch_us_daily_streaming_charts_jul2",
    );
    expect(output).toContain("Stale at: 2026-07-10");
    expect(output).toContain(
      "Titles: Widow's Bay | The Bear | I Will Find You | FROM | House of the Dragon | X-Men '97 | Maximum Pleasure Guaranteed | Elle | Silo | The Agency",
    );
    expect(output).toContain(
      "Coverage: 19 active current-demand titles across 10 platform(s), 8 primary genre(s), and 2 nonfiction/reality/news/talk title(s)",
    );
  });

  it("fails when the checked-in current-demand summary has gone stale", () => {
    const output = runAuditExpectingFailure();

    expect(output).toContain("Home freshness summary audit failed:");
    expect(output).toContain("daily_chart_snapshot_stale");
    expect(output).toContain(
      "JustWatch daily chart snapshot is 9 days old",
    );
  });

  it("fails when current-demand primary-genre breadth drops below the release minimum", () => {
    const output = runAuditExpectingFailure(
      "2026-07-02T12:00:00.000Z",
      {
        PLOTLIST_HOME_MIN_CURRENT_DEMAND_PRIMARY_GENRES: "9",
      },
    );

    expect(output).toContain("Home freshness summary audit failed:");
    expect(output).toContain(
      "Current-demand coverage spans 8 primary genre(s); expected at least 9",
    );
  });

  it("fails when current-demand nonfiction coverage drops below the release minimum", () => {
    const output = runAuditExpectingFailure(
      "2026-07-02T12:00:00.000Z",
      {
        PLOTLIST_HOME_MIN_CURRENT_DEMAND_NONFICTION_ITEMS: "3",
      },
    );

    expect(output).toContain("Home freshness summary audit failed:");
    expect(output).toContain(
      "Current-demand coverage has 2 nonfiction/reality/news/talk title(s); expected at least 3",
    );
  });

  it("does not allow release minima overrides to weaken the homepage gate", () => {
    const output = runAuditExpectingFailure(
      "2026-07-02T12:00:00.000Z",
      {
        PLOTLIST_HOME_MIN_CURRENT_DEMAND_PRIMARY_GENRES: "4",
      },
    );

    expect(output).toContain(
      "PLOTLIST_HOME_MIN_CURRENT_DEMAND_PRIMARY_GENRES must be an integer greater than or equal to 5",
    );
  });
});
