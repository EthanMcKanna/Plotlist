import { describe, expect, it } from "@jest/globals";

import {
  getHomeCatalogCacheCleanupCutoff,
  HOME_CATALOG_STALE_IF_ERROR_GRACE_MS,
  isHomeCatalogCacheFresh,
  isHomeCatalogCacheUsableAfterError,
} from "../lib/homeCatalogCache";

describe("home catalog cache resilience", () => {
  it("keeps fresh catalog entries on the normal fast path", () => {
    const now = Date.UTC(2026, 4, 28, 16);

    expect(isHomeCatalogCacheFresh(now + 1, now)).toBe(true);
    expect(isHomeCatalogCacheFresh(now, now)).toBe(false);
  });

  it("allows a bounded stale-if-error window for homepage catalog rails", () => {
    const now = Date.UTC(2026, 4, 28, 16);

    expect(isHomeCatalogCacheUsableAfterError(now - 1, now)).toBe(true);
    expect(
      isHomeCatalogCacheUsableAfterError(
        now - HOME_CATALOG_STALE_IF_ERROR_GRACE_MS - 1,
        now,
      ),
    ).toBe(false);
  });

  it("delays list-cache cleanup until stale fallback can no longer help", () => {
    const now = Date.UTC(2026, 4, 28, 16);

    expect(getHomeCatalogCacheCleanupCutoff(now)).toBe(
      now - HOME_CATALOG_STALE_IF_ERROR_GRACE_MS,
    );
  });
});
