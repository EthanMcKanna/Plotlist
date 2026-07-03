import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function getPackageScripts() {
  return JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ).scripts as Record<string, string>;
}

function getReadme() {
  return readFileSync(join(process.cwd(), "README.md"), "utf8");
}

function getGitignore() {
  return readFileSync(join(process.cwd(), ".gitignore"), "utf8");
}

function getHomepageReadinessDoc() {
  return readFileSync(
    join(process.cwd(), "docs", "homepage-production-readiness.md"),
    "utf8",
  );
}

describe("homepage release gate", () => {
  it("keeps the homepage build and freshness audits in one release command", () => {
    const scripts = getPackageScripts();

    expect(scripts["check:homepage"]).toBe(
      "npm run build && npm run audit:home-preview-bundle && npm run audit:homepage-freshness-summary && npm run audit:home-current-demand",
    );
    expect(scripts["check:homepage"]).toContain("npm run build");
    expect(scripts["check:homepage"]).toContain("npm run audit:home-preview-bundle");
    expect(scripts["check:homepage"]).toContain(
      "npm run audit:homepage-freshness-summary",
    );
    expect(scripts["check:homepage"]).toContain("npm run audit:home-current-demand");
  });

  it("keeps app checks, production audit, and homepage gate wired into the release check", () => {
    const scripts = getPackageScripts();

    expect(scripts["audit:prod"]).toBe("npm audit --omit=dev");
    expect(scripts["check:release"]).toBe(
      "npm run check && npm run audit:prod && npm run check:homepage",
    );
    expect(scripts["check:release"]).toContain("npm run check");
    expect(scripts["check:release"]).toContain("npm run audit:prod");
    expect(scripts["check:release"]).toContain("npm run check:homepage");
  });

  it("documents the homepage-specific release gate", () => {
    const readme = getReadme();

    expect(readme).toContain("npm run check:homepage");
    expect(readme).toContain("npm run check:release");
    expect(readme).toContain("npm run audit:prod");
    expect(readme).toContain("audit the homepage freshness summary");
    expect(readme).toContain("audit the live homepage current-demand chart");
    expect(readme).toContain("production dependency audit");
  });

  it("keeps generated homepage release and Browser QA artifacts local-only", () => {
    const gitignore = getGitignore();

    expect(gitignore).toContain("dist/");
    expect(gitignore).toContain(".playwright-cli/");
    expect(gitignore).toContain(".expo/");
    expect(gitignore).toContain(".vercel/");
  });

  it("keeps a concise homepage readiness runbook checked in", () => {
    const runbook = getHomepageReadinessDoc();

    expect(runbook).toContain("npm run check:release");
    expect(runbook).toContain("HOME_EDITORIAL_RESEARCH_SOURCES");
    expect(runbook).toContain("tests/homeEditorialSeeds.test.ts");
    expect(runbook).toContain("auditHomeEditorialSeeds");
    expect(runbook).toContain("under-sourced");
    expect(runbook).toContain("Rotten Tomatoes");
    expect(runbook).toContain("FlixPatrol");
    expect(runbook).toContain("Reelgood");
    expect(runbook).toContain("/dev/home-preview?reduceMotion=1");
    expect(runbook).toContain("focused signed-in stack");
    expect(runbook).toContain("Search");
    expect(runbook).toContain("tests/homeTopBar.test.ts");
    expect(runbook).toContain("/profile");
    expect(runbook).toContain("/search");
    expect(runbook).toContain("/calendar");
    expect(runbook).toContain("Phone number");
    expect(runbook).toContain("justwatch_us_daily_streaming_charts_jul2");
    expect(runbook).toContain("primary genres");
    expect(runbook).toContain("nonfiction/reality/news/talk lanes");
    expect(runbook).toContain("FROM,");
    expect(runbook).toContain("I Will Find You");
    expect(runbook).toContain("House of the Dragon, X-Men '97, Maximum Pleasure Guaranteed, Elle");
    expect(runbook).toContain("The Agency.");
    expect(runbook).toContain("PLOTLIST_HOME_MIN_CURRENT_DEMAND_TITLES");
    expect(runbook).toContain("PLOTLIST_HOME_MIN_ACTIVE_CURRENT_DEMAND_TITLES");
    expect(runbook).toContain("PLOTLIST_HOME_MIN_CURRENT_DEMAND_PLATFORMS");
    expect(runbook).toContain("PLOTLIST_HOME_MIN_CURRENT_DEMAND_PRIMARY_GENRES");
    expect(runbook).toContain("PLOTLIST_HOME_MIN_CURRENT_DEMAND_NONFICTION_ITEMS");
    expect(runbook).toContain("cannot be weakened by environment drift");
    expect(runbook).toContain("production homepage Browser handles");
    expect(runbook).toContain("home-surface-list");
    expect(runbook).toContain("home-section-*");
    expect(runbook).toContain("/api/internal/cron/homepage-feed-refresh");
  });
});
