import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = join(process.cwd(), "scripts", "audit-home-current-demand.mjs");
const LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "FROM",
  "The Boroughs",
  "Euphoria",
  "Off Campus",
  "The Four Seasons",
  "Hacks",
  "The Terror",
  "Your Friends & Neighbors",
];
const ALTERNATE_LIVE_TITLES = [
  "FROM",
  "Off Campus",
  "Your Friends & Neighbors",
  "Rick and Morty",
  "The Boys",
  "World War II with Tom Hanks",
  "Condor",
  "The Madison",
  "Invincible",
  "Pluribus",
];
const PRIMARY_TAIL_SWAP_LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "FROM",
  "The Boroughs",
  "Euphoria",
  "Off Campus",
  "The Four Seasons",
  "Hacks",
  "Your Friends & Neighbors",
  "The Terror",
];
const PRIMARY_ADJACENT_SWAP_LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "FROM",
  "Euphoria",
  "The Boroughs",
  "Off Campus",
  "The Four Seasons",
  "Hacks",
  "Your Friends & Neighbors",
  "The Terror",
];
const PRIMARY_RICK_AND_MORTY_TAIL_LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "Euphoria",
  "FROM",
  "The Boroughs",
  "Off Campus",
  "The Four Seasons",
  "Hacks",
  "Your Friends & Neighbors",
  "Rick and Morty",
];
const PRIMARY_RICK_AND_MORTY_TAIL_SECOND_LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "Euphoria",
  "The Boroughs",
  "FROM",
  "Off Campus",
  "The Four Seasons",
  "Hacks",
  "Your Friends & Neighbors",
  "Rick and Morty",
];
const PRIMARY_RICK_AND_MORTY_EIGHTH_LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "Euphoria",
  "The Boroughs",
  "FROM",
  "Off Campus",
  "The Four Seasons",
  "Rick and Morty",
  "Hacks",
  "Your Friends & Neighbors",
];
const PRIMARY_RICK_AND_MORTY_SIXTH_LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "Euphoria",
  "The Boroughs",
  "FROM",
  "Rick and Morty",
  "Off Campus",
  "The Four Seasons",
  "Your Friends & Neighbors",
  "Hacks",
];
const PRIMARY_FROM_NINTH_LIVE_TITLES = [
  "Spider-Noir",
  "Widow's Bay",
  "Euphoria",
  "The Boroughs",
  "The Four Seasons",
  "Off Campus",
  "Rick and Morty",
  "Your Friends & Neighbors",
  "FROM",
  "Hacks",
];
const PRIMARY_JUNE_THIRD_LIVE_TITLES = [
  "Widow's Bay",
  "Spider-Noir",
  "Euphoria",
  "Off Campus",
  "The Boroughs",
  "Love Island USA",
  "The Four Seasons",
  "Rick and Morty",
  "FROM",
  "The Beauty",
];
const PRIMARY_JUNE_THIRD_LATE_SWAP_LIVE_TITLES = [
  "Widow's Bay",
  "Spider-Noir",
  "Euphoria",
  "Off Campus",
  "The Boroughs",
  "Love Island USA",
  "The Four Seasons",
  "Rick and Morty",
  "The Beauty",
  "FROM",
];
const PRIMARY_JUNE_THIRD_FAST_REFRESH_LIVE_TITLES = [
  "Widow's Bay",
  "Spider-Noir",
  "Love Island USA",
  "The Boroughs",
  "Off Campus",
  "The Four Seasons",
  "Euphoria",
  "Not Suitable for Work",
  "FROM",
  "Hacks",
];
const SOURCE_BACKED_CHURN_LIVE_TITLES = [
  "Widow's Bay",
  "Spider-Noir",
  "Cape Fear",
  "The Boroughs",
  "Off Campus",
  "Euphoria",
  "Not Suitable for Work",
  "Love Island USA",
  "Dutton Ranch",
  "Hacks",
];

function buildJustWatchFixtureHtml({
  titles = LIVE_TITLES,
  updatedAt = "2026-06-01T05:24:07.286Z",
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
  now = "2026-06-01T12:00:00.000Z",
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
  now = "2026-06-01T12:00:00.000Z",
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
      expect(output).toContain("Live chart updated at: 2026-06-01T05:24:07.286Z");
      expect(output).toContain(
        "Titles: Spider-Noir | Widow's Bay | FROM",
      );
    });
  });

  it("accepts a same-day JustWatch edge variant when every title is covered", () => {
    withFixture(
      buildJustWatchFixtureHtml({ titles: ALTERNATE_LIVE_TITLES }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: FROM | Off Campus | Your Friends & Neighbors | Rick and Morty",
        );
      },
    );
  });

  it("accepts same-day rank jitter when the covered primary titles only swap the tail", () => {
    withFixture(
      buildJustWatchFixtureHtml({ titles: PRIMARY_TAIL_SWAP_LIVE_TITLES }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Spider-Noir | Widow's Bay | FROM | The Boroughs",
        );
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
          "Titles: Spider-Noir | Widow's Bay | FROM | Euphoria | The Boroughs",
        );
      },
    );
  });

  it("accepts the observed same-day tail variant with a sourced top-10 entrant", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_RICK_AND_MORTY_TAIL_LIVE_TITLES,
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Spider-Noir | Widow's Bay | Euphoria | FROM | The Boroughs",
        );
        expect(output).toContain("Your Friends & Neighbors | Rick and Morty");
      },
    );
  });

  it("accepts the second observed primary-cluster order with the sourced top-10 entrant", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_RICK_AND_MORTY_TAIL_SECOND_LIVE_TITLES,
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Spider-Noir | Widow's Bay | Euphoria | The Boroughs | FROM",
        );
        expect(output).toContain("Your Friends & Neighbors | Rick and Morty");
      },
    );
  });

  it("accepts the observed same-day order where the sourced top-10 entrant rises to eighth", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_RICK_AND_MORTY_EIGHTH_LIVE_TITLES,
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Spider-Noir | Widow's Bay | Euphoria | The Boroughs | FROM",
        );
        expect(output).toContain(
          "The Four Seasons | Rick and Morty | Hacks | Your Friends & Neighbors",
        );
      },
    );
  });

  it("accepts the observed same-day order where the sourced top-10 entrant rises to sixth", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_RICK_AND_MORTY_SIXTH_LIVE_TITLES,
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Spider-Noir | Widow's Bay | Euphoria | The Boroughs | FROM",
        );
        expect(output).toContain(
          "Rick and Morty | Off Campus | The Four Seasons | Your Friends & Neighbors | Hacks",
        );
      },
    );
  });

  it("accepts the observed same-day order where sourced current-demand titles reshuffle the tail", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_FROM_NINTH_LIVE_TITLES,
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath);

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Spider-Noir | Widow's Bay | Euphoria | The Boroughs | The Four Seasons",
        );
        expect(output).toContain("Rick and Morty | Your Friends & Neighbors | FROM | Hacks");
      },
    );
  });

  it("accepts the observed current live order when every chart title is already sourced", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_JUNE_THIRD_LIVE_TITLES,
        updatedAt: "2026-06-03T01:22:04.487Z",
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath, "2026-06-03T12:00:00.000Z");

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Widow's Bay | Spider-Noir | Euphoria | Off Campus | The Boroughs",
        );
        expect(output).toContain("Love Island USA | The Four Seasons | Rick and Morty");
        expect(output).toContain("FROM | The Beauty");
      },
    );
  });

  it("accepts the current live order after the bottom pair rank flips", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_JUNE_THIRD_LATE_SWAP_LIVE_TITLES,
        updatedAt: "2026-06-03T01:22:04.487Z",
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath, "2026-06-03T12:00:00.000Z");

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Widow's Bay | Spider-Noir | Euphoria | Off Campus | The Boroughs",
        );
        expect(output).toContain("Rick and Morty | The Beauty | FROM");
      },
    );
  });

  it("accepts fast live-rank churn when every title remains source-backed", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: PRIMARY_JUNE_THIRD_FAST_REFRESH_LIVE_TITLES,
        updatedAt: "2026-06-03T01:22:04.487Z",
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath, "2026-06-03T12:00:00.000Z");

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Widow's Bay | Spider-Noir | Love Island USA | The Boroughs",
        );
        expect(output).toContain("Not Suitable for Work | FROM | Hacks");
      },
    );
  });

  it("accepts active source-backed current-demand titles that were not pre-enumerated chart variants", () => {
    withFixture(
      buildJustWatchFixtureHtml({
        titles: SOURCE_BACKED_CHURN_LIVE_TITLES,
        updatedAt: "2026-06-07T08:13:00.000Z",
      }),
      (fixturePath) => {
        const output = runAudit(fixturePath, "2026-06-07T12:00:00.000Z");

        expect(output).toContain("Home current-demand audit passed.");
        expect(output).toContain(
          "Titles: Widow's Bay | Spider-Noir | Cape Fear | The Boroughs",
        );
        expect(output).toContain("Love Island USA | Dutton Ranch | Hacks");
      },
    );
  });

  it("fails when the live daily source itself has not updated recently", () => {
    withFixture(
      buildJustWatchFixtureHtml({ updatedAt: "2026-05-31T05:15:38.177Z" }),
      (fixturePath) => {
        const output = runAuditExpectingFailure(
          fixturePath,
          "2026-06-03T12:00:00.000Z",
        );

        expect(output).toContain("The live JustWatch chart updatedAt is 3 day(s) old");
      },
    );
  });

  it("fails before fetching when the checked-in snapshot is stale", () => {
    withFixture(buildJustWatchFixtureHtml({}), (fixturePath) => {
      const output = runAuditExpectingFailure(
        fixturePath,
        "2026-06-10T12:00:00.000Z",
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
          "Spider-Noir",
          "Widow's Bay",
          "Unexpected Hit",
          "The Boroughs",
          "FROM",
          "The Four Seasons",
          "Off Campus",
          "The Terror",
          "Your Friends & Neighbors",
          "Euphoria",
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
