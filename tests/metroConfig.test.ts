import { describe, expect, it } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const devPreviewRoute = join(process.cwd(), "app", "dev", "home-preview.tsx");
const homeRoute = join(process.cwd(), "app", "(tabs)", "home.tsx");
const homePreviewDataStub = join(
  process.cwd(),
  "lib",
  "homePreviewData.production.ts",
);

function getMetroBlockListResult(nodeEnv: string | undefined) {
  const env: Record<string, string | undefined> = { ...process.env };
  if (nodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = nodeEnv;
  }

  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `
        const config = require("./metro.config.js");
        const devPreviewRoute = ${JSON.stringify(devPreviewRoute)};
        const homeRoute = ${JSON.stringify(homeRoute)};
        const homePreviewDataStub = ${JSON.stringify(homePreviewDataStub)};
        const resolvedPreviewData = typeof config.resolver.resolveRequest === "function"
          ? config.resolver.resolveRequest(
              {
                resolveRequest: (_context, moduleName) => ({
                  type: "sourceFile",
                  filePath: "fallback:" + moduleName,
                }),
              },
              "../../lib/homePreviewData",
              "web"
            ).filePath
          : null;
        console.log(JSON.stringify({
          devPreviewBlocked: config.resolver.blockList.test(devPreviewRoute),
          homeBlocked: config.resolver.blockList.test(homeRoute),
          previewDataResolvedToStub: resolvedPreviewData === homePreviewDataStub,
        }));
      `,
    ],
    { cwd: process.cwd(), env: env as NodeJS.ProcessEnv, encoding: "utf8" },
  ).trim();

  return JSON.parse(output.split("\n").at(-1) ?? "{}") as {
    devPreviewBlocked: boolean;
    homeBlocked: boolean;
  };
}

describe("metro config", () => {
  it("keeps dev preview routes out of production and default exports", () => {
    expect(getMetroBlockListResult("production")).toEqual({
      devPreviewBlocked: true,
      homeBlocked: false,
      previewDataResolvedToStub: true,
    });
    expect(getMetroBlockListResult(undefined)).toEqual({
      devPreviewBlocked: true,
      homeBlocked: false,
      previewDataResolvedToStub: true,
    });
  });

  it("keeps dev preview routes available for local Expo development", () => {
    expect(getMetroBlockListResult("development")).toEqual({
      devPreviewBlocked: false,
      homeBlocked: false,
      previewDataResolvedToStub: false,
    });
  });
});
