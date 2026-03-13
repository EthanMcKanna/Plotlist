import { SEASON_DETAILS_RATE_LIMIT_ERROR } from "./seasonGuide";

type CacheEntry<T> = {
  payload: T;
  expiresAt: number;
};

export function getFreshCachedSeasonDetails<T>(
  cached: CacheEntry<T> | null | undefined,
  now: number,
) {
  if (!cached || cached.expiresAt <= now) {
    return null;
  }

  return cached.payload;
}

export function normalizeSeasonDetailsError(error: unknown) {
  if (error instanceof Error && error.message === "Rate limit exceeded") {
    return new Error(SEASON_DETAILS_RATE_LIMIT_ERROR);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Unknown season details error");
}

export async function getSeasonDetailsWithCache<T>({
  cached,
  now,
  enforceRateLimit,
  fetchPayload,
}: {
  cached: CacheEntry<T> | null | undefined;
  now: number;
  enforceRateLimit: () => Promise<void>;
  fetchPayload: () => Promise<T>;
}) {
  const cachedPayload = getFreshCachedSeasonDetails(cached, now);
  if (cachedPayload !== null) {
    return cachedPayload;
  }

  try {
    await enforceRateLimit();
  } catch (error) {
    throw normalizeSeasonDetailsError(error);
  }

  return await fetchPayload();
}
