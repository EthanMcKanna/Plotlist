import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  "audit-home-preview-bundle.mjs",
);
const REQUIRED_HOME_BUNDLE_HANDLES = [
  "home-surface-list",
  "getHomeSectionTestID",
  "home-section",
  "homeSection",
  "homeSectionId",
  "home-topbar-profile",
  "home-topbar-search",
  "home-topbar-calendar",
];

function withDistFixture(contents: string, run: (distDir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "plotlist-home-bundle-"));
  const jsDir = join(dir, "_expo", "static", "js", "web");
  mkdirSync(jsDir, { recursive: true });
  writeFileSync(join(jsDir, "index.js"), contents);
  try {
    run(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

function runAudit(distDir: string) {
  return execFileSync("node", [SCRIPT_PATH], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PLOTLIST_HOME_PREVIEW_BUNDLE_DIST_DIR: distDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runAuditExpectingFailure(distDir: string) {
  try {
    runAudit(distDir);
    throw new Error("Expected preview bundle audit to fail");
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr;
    return Buffer.isBuffer(stderr) ? stderr.toString("utf8") : String(stderr ?? "");
  }
}

describe("home preview bundle audit script", () => {
  it("passes when preview fixtures are absent and production Browser handles remain", () => {
    withDistFixture(REQUIRED_HOME_BUNDLE_HANDLES.join("\n"), (distDir) => {
      expect(runAudit(distDir)).toContain("Home preview bundle audit passed.");
    });
  });

  it("fails when production homepage Browser handles are missing", () => {
    withDistFixture(
      REQUIRED_HOME_BUNDLE_HANDLES.filter(
        (handle) => handle !== "home-section",
      ).join("\n"),
      (distDir) => {
        expect(runAuditExpectingFailure(distDir)).toContain(
          "production home bundle is missing home-section",
        );
      },
    );
  });

  it("fails when dev-preview fixtures leak into the production bundle", () => {
    withDistFixture(
      `${REQUIRED_HOME_BUNDLE_HANDLES.join("\n")}\ndev-home-preview`,
      (distDir) => {
        expect(runAuditExpectingFailure(distDir)).toContain(
          "contains dev-home-preview",
        );
      },
    );
  });
});
