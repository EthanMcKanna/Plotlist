import * as Sentry from "@sentry/cloudflare";

import logoutRoute from "../api/auth/logout";
import refreshRoute from "../api/auth/refresh";
import startVerificationRoute from "../api/auth/start-verification";
import verifyRoute from "../api/auth/verify";
import cleanupTmdbCacheRoute from "../api/internal/cron/cleanup-tmdb-cache";
import fullEmbeddingRefreshRoute from "../api/internal/cron/full-embedding-refresh";
import fullEpisodeCacheRefreshRoute from "../api/internal/cron/full-episode-cache-refresh";
import fullShowCatalogRefreshRoute from "../api/internal/cron/full-show-catalog-refresh";
import homepageFeedRefreshRoute from "../api/internal/cron/homepage-feed-refresh";
import hotEmbeddingRefreshRoute from "../api/internal/cron/hot-embedding-refresh";
import hotEpisodeCacheRefreshRoute from "../api/internal/cron/hot-episode-cache-refresh";
import hotShowCatalogRefreshRoute from "../api/internal/cron/hot-show-catalog-refresh";
import trackedReleaseRefreshRoute from "../api/internal/cron/tracked-release-refresh";
import listRunnableJobsRoute from "../api/internal/jobs/list-runnable";
import rpcActionRoute from "../api/rpc/action";
import rpcMutationRoute from "../api/rpc/mutation";
import rpcQueryRoute from "../api/rpc/query";
import uploadsBlobRoute from "../api/uploads/blob";
import { initDb } from "../api/_lib/db";
import { runNodeRoute, type NodeStyleHandler } from "./shim";
import { runScheduledTasks } from "./scheduled";
import { initUploadsBucket, getUploadsBucket, type UploadsBucket } from "./storage";

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

export type WorkerEnv = {
  DB: unknown;
  UPLOADS: UploadsBucket;
  ASSETS: AssetsBinding;
} & Record<string, unknown>;

const routes: Record<string, NodeStyleHandler> = {
  "/api/auth/start-verification": startVerificationRoute as NodeStyleHandler,
  "/api/auth/verify": verifyRoute as NodeStyleHandler,
  "/api/auth/refresh": refreshRoute as NodeStyleHandler,
  "/api/auth/logout": logoutRoute as NodeStyleHandler,
  "/api/rpc/query": rpcQueryRoute as NodeStyleHandler,
  "/api/rpc/mutation": rpcMutationRoute as NodeStyleHandler,
  "/api/rpc/action": rpcActionRoute as NodeStyleHandler,
  "/api/uploads/blob": uploadsBlobRoute as NodeStyleHandler,
  "/api/internal/jobs/list-runnable": listRunnableJobsRoute as NodeStyleHandler,
  "/api/internal/cron/cleanup-tmdb-cache": cleanupTmdbCacheRoute as NodeStyleHandler,
  "/api/internal/cron/homepage-feed-refresh": homepageFeedRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/hot-show-catalog-refresh": hotShowCatalogRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/hot-embedding-refresh": hotEmbeddingRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/hot-episode-cache-refresh": hotEpisodeCacheRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/full-show-catalog-refresh": fullShowCatalogRefreshRoute as NodeStyleHandler,
  "/api/internal/cron/full-embedding-refresh": fullEmbeddingRefreshRoute as NodeStyleHandler,
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
  if (!key || key.includes("..")) {
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

const workerHandler = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    bootstrap(env);
    const url = new URL(request.url);

    if (url.pathname.startsWith("/files/")) {
      return await serveUploadedFile(url.pathname, request);
    }

    if (url.pathname.startsWith("/api/")) {
      const handler = routes[url.pathname.replace(/\/$/, "")];
      if (!handler) {
        return jsonResponse(404, { error: { code: "not_found", message: "Not found" } });
      }
      try {
        return await runNodeRoute(handler, request);
      } catch (error) {
        console.error("[worker] Unhandled route error", url.pathname, error);
        Sentry.captureException(error);
        return jsonResponse(500, {
          error: { code: "internal_error", message: "Unexpected error" },
        });
      }
    }

    return await env.ASSETS.fetch(request);
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
