import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";

import { api } from "../lib/plotlist/api";
import { HOME_REFRESH_QUERY_NAMES, isHomeSurfaceQueryKey } from "../lib/homeRefreshScope";

// Every file that mounts a react-query hook on the home surface. The pull-
// to-refresh scope must cover what these read, or a refresh silently stops
// updating a rail.
const HOME_SURFACE_FILES = [
  "app/(tabs)/home.tsx",
  "lib/useHomeData.ts",
  "components/ContinueWatchingRail.tsx",
  "components/TonightStrip.tsx",
];

function queriesMountedIn(relativePath: string): string[] {
  const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
  const names = new Set<string>();
  const pattern = /use(?:Paginated)?Query\(\s*api\.(\w+)\.(\w+)/g;
  for (const match of source.matchAll(pattern)) {
    const ref = (api as any)[match[1]]?.[match[2]];
    if (ref?.__kind === "query") {
      names.add(ref.__name);
    }
  }
  return [...names];
}

describe("home pull-to-refresh scope", () => {
  it("covers every query the home surface mounts", () => {
    for (const file of HOME_SURFACE_FILES) {
      const mounted = queriesMountedIn(file);
      expect(mounted.length).toBeGreaterThan(0);
      for (const name of mounted) {
        expect(HOME_REFRESH_QUERY_NAMES.has(name)).toBe(true);
      }
    }
  });

  it("matches plain and paginated keys for home queries only", () => {
    expect(isHomeSurfaceQueryKey(["plotlist-rpc", "query", "users:me", {}])).toBe(true);
    expect(
      isHomeSurfaceQueryKey([
        "plotlist-rpc",
        "paginated",
        "feed:listForUser",
        { paginationOpts: { cursor: null, numItems: 20 } },
      ]),
    ).toBe(true);
    expect(
      isHomeSurfaceQueryKey([
        "plotlist-rpc",
        "query",
        "episodeProgress:getUpNext",
        { utcOffsetMinutes: -300 },
      ]),
    ).toBe(true);

    // Other screens' queries stay warm across a home refresh.
    expect(isHomeSurfaceQueryKey(["plotlist-rpc", "query", "shows:get", { showId: "s1" }])).toBe(
      false,
    );
    expect(
      isHomeSurfaceQueryKey(["plotlist-rpc", "query", "watchStats:getInsights", {}]),
    ).toBe(false);
    expect(
      isHomeSurfaceQueryKey(["plotlist-rpc", "action", "shows:getHomeCatalog", {}]),
    ).toBe(false);
    expect(isHomeSurfaceQueryKey(["other-cache", "query", "users:me", {}])).toBe(false);
    expect(isHomeSurfaceQueryKey(["plotlist-rpc"])).toBe(false);
  });
});
