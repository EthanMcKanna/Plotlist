import { describe, expect, it } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readWranglerConfig() {
  const raw = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
  // The config is plain JSON today; strip line comments defensively so the
  // test keeps working if JSONC comments are added later.
  return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ""));
}

describe("wrangler config", () => {
  it("serves the exported Expo web build as a single-page app behind the API", () => {
    const config = readWranglerConfig();

    expect(config.assets.directory).toBe("./dist");
    expect(config.assets.not_found_handling).toBe("single-page-application");
    expect(config.assets.run_worker_first).toEqual(
      expect.arrayContaining(["/api/*", "/files/*"]),
    );
  });

  it("stays within the Workers free plan limit of five cron schedules", () => {
    const config = readWranglerConfig();

    expect(config.triggers.crons.length).toBeGreaterThan(0);
    expect(config.triggers.crons.length).toBeLessThanOrEqual(5);
  });

  it("registers every schedule handled by the scheduled dispatcher", () => {
    const config = readWranglerConfig();
    const dispatcher = readFileSync(join(process.cwd(), "worker/scheduled.ts"), "utf8");

    for (const cron of config.triggers.crons as string[]) {
      expect(dispatcher).toContain(`"${cron}"`);
    }
  });

  it("binds the database, uploads bucket, and static assets", () => {
    const config = readWranglerConfig();

    expect(config.d1_databases[0].binding).toBe("DB");
    expect(config.d1_databases[0].migrations_dir).toBe("drizzle");
    expect(config.r2_buckets[0].binding).toBe("UPLOADS");
    expect(config.assets.binding).toBe("ASSETS");
  });

  it("keeps every manual cron endpoint backed by a checked-in API route", () => {
    const workerEntry = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    const cronRoutes = workerEntry.match(/\/api\/internal\/cron\/[a-z0-9-]+/g) ?? [];

    expect(cronRoutes.length).toBeGreaterThan(0);
    for (const route of new Set(cronRoutes)) {
      const routePath = `${route.replace(/^\/api\//, "api/")}.ts`;
      expect(existsSync(join(process.cwd(), routePath))).toBe(true);
    }
  });
});
