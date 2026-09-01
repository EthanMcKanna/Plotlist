import * as Sentry from "@sentry/cloudflare";

import appleRoute from "../api/auth/apple";
import logoutRoute from "../api/auth/logout";
import refreshRoute from "../api/auth/refresh";
import startVerificationRoute from "../api/auth/start-verification";
import verifyRoute from "../api/auth/verify";
import cleanupTmdbCacheRoute from "../api/internal/cron/cleanup-tmdb-cache";
import fullEpisodeCacheRefreshRoute from "../api/internal/cron/full-episode-cache-refresh";
import fullShowCatalogRefreshRoute from "../api/internal/cron/full-show-catalog-refresh";
import homepageFeedRefreshRoute from "../api/internal/cron/homepage-feed-refresh";
import hotEpisodeCacheRefreshRoute from "../api/internal/cron/hot-episode-cache-refresh";
import hotShowCatalogRefreshRoute from "../api/internal/cron/hot-show-catalog-refresh";
import trackedReleaseRefreshRoute from "../api/internal/cron/tracked-release-refresh";
import listRunnableJobsRoute from "../api/internal/jobs/list-runnable";
import rpcActionRoute from "../api/rpc/action";
import rpcMutationRoute from "../api/rpc/mutation";
import rpcQueryRoute from "../api/rpc/query";
import uploadsBlobRoute from "../api/uploads/blob";
import calendarFeedRoute from "../api/calendar/feed";
import revenuecatWebhookRoute from "../api/webhooks/revenuecat";
import { initDb } from "../api/_lib/db";
import { applyLinkPreview, getLinkPreview, isPreviewablePath } from "./link-previews";
import { runWithBackgroundScope } from "../api/_lib/background";
import { runNodeRoute, type NodeStyleHandler } from "./shim";
import { runScheduledTasks } from "./scheduled";
import { initUploadsBucket, getUploadsBucket, type UploadsBucket } from "./storage";
import { initVectorizeIndex, type VectorizeIndexBinding } from "./vectorize";

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

export type WorkerEnv = {
  DB: unknown;
  UPLOADS: UploadsBucket;
  ASSETS: AssetsBinding;
  VECTORIZE?: VectorizeIndexBinding;
} & Record<string, unknown>;

const routes: Record<string, NodeStyleHandler> = {
  "/api/auth/apple": appleRoute as NodeStyleHandler,
  "/api/auth/start-verification": startVerificationRoute as NodeStyleHandler,
  "/api/auth/verify": verifyRoute as NodeStyleHandler,
  "/api/auth/refresh": refreshRoute as NodeStyleHandler,
  "/api/auth/logout": logoutRoute as NodeStyleHandler,
  "/api/rpc/query": rpcQueryRoute as NodeStyleHandler,
  "/api/rpc/mutation": rpcMutationRoute as NodeStyleHandler,
  "/api/rpc/action": rpcActionRoute as NodeStyleHandler,
  "/api/uploads/blob": uploadsBlobRoute as NodeStyleHandler,
  "/api/webhooks/revenuecat": revenuecatWebhookRoute as NodeStyleHandler,
  "/api/calendar/feed": calendarFeedRoute as NodeStyleHandler,
  "/api/internal/jobs/list-runnable": listRunnableJobsRoute as NodeStyleHandler,
  "/api/internal/cron/cleanup-tmdb-cache": cleanupTmdbCacheRoute as NodeStyleHandler,
  "/api/internal/cron/homepage-feed-refresh": homepageFeedRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/hot-show-catalog-refresh": hotShowCatalogRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/hot-episode-cache-refresh": hotEpisodeCacheRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/full-show-catalog-refresh": fullShowCatalogRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/full-episode-cache-refresh": fullEpisodeCacheRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/tracked-release-refresh": trackedReleaseRefreshRoute as NodeStyleHandler,
};

let envBootstrapped = false;

function bootstrap(env: WorkerEnv) {
  if (!envBootstrapped) {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string" && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    envBootstrapped = true;
  }
  initDb(env.DB);
  initUploadsBucket(env.UPLOADS);
  initVectorizeIndex(env.VECTORIZE);
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

async function serveUploadedFile(pathname: string, request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(405, { error: { code: "method_not_allowed", message: "Method not allowed" } });
  }

  const key = decodeURIComponent(pathname.replace(/^\/files\//, ""));
  // Only user uploads are public. Other bucket prefixes (e.g. the Trakt
  // import staging area) hold private data and must never be servable.
  if (!key || key.includes("..") || !key.startsWith("uploads/")) {
    return jsonResponse(404, { error: { code: "not_found", message: "Not found" } });
  }

  const object = await getUploadsBucket().get(key);
  if (!object) {
    return jsonResponse(404, { error: { code: "not_found", message: "Not found" } });
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
      etag: object.httpEtag,
      "content-length": String(object.size),
      "access-control-allow-origin": "*",
    },
  });
}

// Universal-links manifest: lets iOS open https://plotlist.app/... URLs in
// the app. API and file routes stay in Safari; everything else deep-links.
const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: ["697K7CH7J6.com.emckanna.Plotlist"],
        components: [
          { "/": "/api/*", exclude: true },
          { "/": "/files/*", exclude: true },
          { "/": "/*" },
        ],
      },
    ],
  },
};

const workerHandler = {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx?: { waitUntil(p: Promise<unknown>): void },
  ): Promise<Response> {
    bootstrap(env);
    const url = new URL(request.url);
    // Deferred work (cache upserts, write-backs, fan-out) outlives the
    // response via waitUntil; local shims without a ctx just let it float.
    const backgroundScope = {
      waitUntil: (task: Promise<unknown>) => {
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(task);
        } else {
          void task;
        }
      },
    };

    if (
      url.pathname === "/.well-known/apple-app-site-association" ||
      url.pathname === "/apple-app-site-association"
    ) {
      return new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    if (url.pathname.startsWith("/files/")) {
      return await serveUploadedFile(url.pathname, request);
    }

    if (url.pathname.startsWith("/api/")) {
      const handler = routes[url.pathname.replace(/\/$/, "")];
      if (!handler) {
        return jsonResponse(404, { error: { code: "not_found", message: "Not found" } });
      }
      try {
        return await runWithBackgroundScope(backgroundScope, () =>
          runNodeRoute(handler, request),
        );
      } catch (error) {
        console.error("[worker] Unhandled route error", url.pathname, error);
        Sentry.captureException(error);
        return jsonResponse(500, {
          error: { code: "internal_error", message: "Unexpected error" },
        });
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);

    // Shareable pages (shows, profiles, lists, reviews) get their og:*/
    // twitter:* tags rewritten with entity data so links unfurl with real
    // titles and artwork instead of the generic site card.
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      isPreviewablePath(url.pathname) &&
      assetResponse.status === 200 &&
      (assetResponse.headers.get("content-type") ?? "").includes("text/html")
    ) {
      // Cloned up front: the success path consumes the body via .text(), so
      // the failure fallback needs its own copy instead of re-fetching the
      // asset a second time.
      const fallbackResponse = assetResponse.clone();
      try {
        const preview = await getLinkPreview(url.pathname);
        if (preview) {
          const html = applyLinkPreview(await assetResponse.text(), preview);
          const headers = new Headers(assetResponse.headers);
          // Body changed: the asset's validators and length no longer apply.
          headers.delete("content-length");
          headers.delete("etag");
          headers.set("cache-control", "public, max-age=300");
          return new Response(request.method === "HEAD" ? null : html, {
            status: 200,
            headers,
          });
        }
      } catch (error) {
        // Preview rewriting is best-effort; the plain SPA shell (with its
        // default site-wide card) is always an acceptable fallback.
        console.error("[worker] link preview failed", url.pathname, error);
        Sentry.captureException(error);
        return fallbackResponse;
      }
    }

    return assetResponse;
  },

  async scheduled(event: { cron: string }, env: WorkerEnv, ctx: { waitUntil(p: Promise<unknown>): void }) {
    bootstrap(env);
    ctx.waitUntil(
      // withSentry only observes the handler call itself, so failures inside
      // waitUntil must be captured explicitly before rethrowing.
      runScheduledTasks(event.cron).catch((error) => {
        Sentry.captureException(error, { tags: { cron: event.cron } });
        throw error;
      }),
    );
  },
};

export default Sentry.withSentry(
  (env: WorkerEnv) => ({
    dsn: typeof env.SENTRY_DSN === "string" ? env.SENTRY_DSN : undefined,
    environment: typeof env.NODE_ENV === "string" ? env.NODE_ENV : "production",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    debug: env.SENTRY_DEBUG === "1",
  }),
  workerHandler,
);
