export const HOME_CATALOG_STALE_IF_ERROR_GRACE_MS = 48 * 60 * 60 * 1000;

export function isHomeCatalogCacheFresh(expiresAt: number, now = Date.now()) {
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function isHomeCatalogCacheUsableAfterError(
  expiresAt: number,
  now = Date.now(),
) {
  return (
    Number.isFinite(expiresAt) &&
    expiresAt + HOME_CATALOG_STALE_IF_ERROR_GRACE_MS > now
  );
}

export function getHomeCatalogCacheCleanupCutoff(now = Date.now()) {
  return now - HOME_CATALOG_STALE_IF_ERROR_GRACE_MS;
}
