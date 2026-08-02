// Colo-local response cache for RPCs whose results are identical for every
// user. These were previously recomputed from D1 (or TMDB) on every request —
// the worker had no caching layer at all. Keys are synthetic GET requests
// (the Cache API ignores non-GET), scoped to a private hostname so they can
// never collide with real routes.

type RpcCacheKind = "query" | "action";

// Bump when a cached handler's response shape changes so stale shapes can't
// outlive a deploy beyond their TTL.
const CACHE_EPOCH = "v1";

const CACHEABLE_RPCS: Record<RpcCacheKind, Record<string, number>> = {
  query: {
    "trending:shows": 300,
    "trending:mostReviewed": 300,
    "reviews:getShowStats": 120,
    "reviews:getEpisodeStats": 120,
    "shows:get": 300,
    "embeddings:getShowFacets": 3600,
  },
  action: {
    "shows:getHomeCatalog": 300,
    "shows:getTmdbList": 300,
    "shows:getExtendedDetails": 600,
    "shows:getSeasonDetails": 600,
    "shows:getImdbRatings": 3600,
    "people:getDetails": 600,
  },
};

export function getRpcEdgeCacheTtl(kind: RpcCacheKind, name: string) {
  return CACHEABLE_RPCS[kind][name] ?? null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function getDefaultCache(): {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
} | null {
  return (globalThis as { caches?: { default?: any } }).caches?.default ?? null;
}

function cacheKeyRequest(kind: RpcCacheKind, name: string, args: unknown) {
  const encodedArgs = encodeURIComponent(stableStringify(args ?? {}));
  return new Request(
    `https://rpc-cache.plotlist.internal/${CACHE_EPOCH}/${kind}/${encodeURIComponent(name)}?args=${encodedArgs}`,
    { method: "GET" },
  );
}

export async function readRpcEdgeCache(
  kind: RpcCacheKind,
  name: string,
  args: unknown,
): Promise<{ result: unknown } | null> {
  const cache = getDefaultCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(cacheKeyRequest(kind, name, args));
    if (!hit) return null;
    return { result: await hit.json() };
  } catch {
    return null;
  }
}

export async function writeRpcEdgeCache(
  kind: RpcCacheKind,
  name: string,
  args: unknown,
  result: unknown,
  ttlSeconds: number,
) {
  const cache = getDefaultCache();
  if (!cache) return;
  try {
    await cache.put(
      cacheKeyRequest(kind, name, args),
      new Response(JSON.stringify(result ?? null), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${ttlSeconds}`,
        },
      }),
    );
  } catch {
    // Cache writes are best-effort; the response already has the data.
  }
}
