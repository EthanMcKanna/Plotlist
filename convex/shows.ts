import { action, internalAction, internalMutation, internalQuery, query, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { normalizeSearchText } from "./utils";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getSeasonDetailsWithCache } from "../lib/seasonDetails";

const LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SHOW_DETAILS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_SEASON_DETAILS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ARCHIVE_SEASON_DETAILS_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAJOR_STREAMING_PROVIDER_IDS = new Set([8, 9, 15, 337, 350, 386, 387, 1899]);
const PROVIDER_NAME_ALIASES: Record<number, string> = {
  386: "Peacock",
  387: "Peacock",
};
const PROVIDER_URL_MATCHERS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Netflix", pattern: /(^|\.)netflix\.com$/i },
  { name: "Prime Video", pattern: /(^|\.)watch\.amazon\.com$/i },
  { name: "Prime Video", pattern: /(^|\.)primevideo\.com$/i },
  { name: "Hulu", pattern: /(^|\.)hulu\.com$/i },
  { name: "Disney+", pattern: /(^|\.)disneyplus\.com$/i },
  { name: "Apple TV", pattern: /(^|\.)tv\.apple\.com$/i },
  { name: "Max", pattern: /(^|\.)play\.hbomax\.com$/i },
  { name: "Max", pattern: /(^|\.)max\.com$/i },
  { name: "Peacock", pattern: /(^|\.)peacocktv\.com$/i },
];

export const getSearchCache = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tmdbSearchCache")
      .withIndex("by_query", (q) => q.eq("query", args.query))
      .unique();
  },
});

export const upsertSearchCache = internalMutation({
  args: {
    query: v.string(),
    results: v.any(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tmdbSearchCache")
      .withIndex("by_query", (q) => q.eq("query", args.query))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        results: args.results,
        fetchedAt: args.fetchedAt,
        expiresAt: args.expiresAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("tmdbSearchCache", {
      query: args.query,
      results: args.results,
      fetchedAt: args.fetchedAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const getListCache = internalQuery({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tmdbListCache")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .unique();
  },
});

export const upsertListCache = internalMutation({
  args: {
    category: v.string(),
    results: v.any(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tmdbListCache")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        results: args.results,
        fetchedAt: args.fetchedAt,
        expiresAt: args.expiresAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("tmdbListCache", {
      category: args.category,
      results: args.results,
      fetchedAt: args.fetchedAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const getDetailsCache = internalQuery({
  args: { externalId: v.string(), externalSource: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tmdbDetailsCache")
      .withIndex("by_external", (q) =>
        q.eq("externalSource", args.externalSource).eq("externalId", args.externalId),
      )
      .unique();
  },
});

export const upsertDetailsCache = internalMutation({
  args: {
    externalSource: v.string(),
    externalId: v.string(),
    payload: v.any(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tmdbDetailsCache")
      .withIndex("by_external", (q) =>
        q.eq("externalSource", args.externalSource).eq("externalId", args.externalId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        payload: args.payload,
        fetchedAt: args.fetchedAt,
        expiresAt: args.expiresAt,
      });
      return existing._id;
    }
    return await ctx.db.insert("tmdbDetailsCache", {
      externalSource: args.externalSource,
      externalId: args.externalId,
      payload: args.payload,
      fetchedAt: args.fetchedAt,
      expiresAt: args.expiresAt,
    });
  },
});

function tmdbUrl(path: string) {
  const base = process.env.TMDB_BASE_URL ?? "https://api.themoviedb.org/3";
  return `${base}${path}`;
}

function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TMDB_API_KEY env var");
  }
  return apiKey;
}

function getSeasonDetailsCacheTtlMs(airDate?: string | null) {
  if (!airDate) {
    return RECENT_SEASON_DETAILS_CACHE_TTL_MS;
  }

  const airTime = new Date(airDate).getTime();
  if (!Number.isFinite(airTime)) {
    return RECENT_SEASON_DETAILS_CACHE_TTL_MS;
  }

  const ageMs = Date.now() - airTime;
  if (ageMs <= 180 * 24 * 60 * 60 * 1000) {
    return RECENT_SEASON_DETAILS_CACHE_TTL_MS;
  }

  return ARCHIVE_SEASON_DETAILS_CACHE_TTL_MS;
}

function getCanonicalProviderName(providerId: number, providerName: string) {
  return PROVIDER_NAME_ALIASES[providerId] ?? providerName;
}

function unwrapProviderUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const nestedUrl = parsed.searchParams.get("u");
    if (nestedUrl) {
      return decodeURIComponent(nestedUrl);
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function getProviderNameForUrl(rawUrl: string) {
  try {
    const host = new URL(rawUrl).hostname;
    const match = PROVIDER_URL_MATCHERS.find(({ pattern }) => pattern.test(host));
    return match?.name ?? null;
  } catch {
    return null;
  }
}

function extractProviderTitleUrls(html: string) {
  const urls = new Map<string, string>();
  const matches = html.match(/https:\/\/click\.justwatch\.com\/a\?[^"' ]+/g) ?? [];

  for (const clickUrl of matches) {
    try {
      const wrappedUrl = new URL(clickUrl);
      const directUrl = wrappedUrl.searchParams.get("r");
      if (!directUrl) {
        continue;
      }
      const unwrappedUrl = unwrapProviderUrl(decodeURIComponent(directUrl));
      const providerName = getProviderNameForUrl(unwrappedUrl);
      if (!providerName || urls.has(providerName)) {
        continue;
      }
      urls.set(providerName, unwrappedUrl);
    } catch {
      continue;
    }
  }

  return urls;
}

export const get = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.showId);
  },
});

export const getByExternal = query({
  args: { externalSource: v.string(), externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shows")
      .withIndex("by_external", (q) =>
        q.eq("externalSource", args.externalSource).eq("externalId", args.externalId),
      )
      .unique();
  },
});

export const getByExternalInternal = internalQuery({
  args: { externalSource: v.string(), externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shows")
      .withIndex("by_external", (q) =>
        q.eq("externalSource", args.externalSource).eq("externalId", args.externalId),
      )
      .unique();
  },
});

export const upsertFromCatalog = internalMutation({
  args: {
    externalSource: v.string(),
    externalId: v.string(),
    title: v.string(),
    year: v.optional(v.number()),
    overview: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    searchText: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shows")
      .withIndex("by_external", (q) =>
        q.eq("externalSource", args.externalSource).eq("externalId", args.externalId),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        year: args.year,
        overview: args.overview,
        posterUrl: args.posterUrl,
        searchText: args.searchText,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("shows", {
      externalSource: args.externalSource,
      externalId: args.externalId,
      title: args.title,
      year: args.year,
      overview: args.overview,
      posterUrl: args.posterUrl,
      searchText: args.searchText,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const search = query({
  args: { text: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50);
    const normalized = normalizeSearchText(args.text);
    if (!normalized) return [];

    const results = await ctx.db
      .query("shows")
      .withSearchIndex("search_shows", (q) =>
        q.search("searchText", normalized).eq("externalSource", "tmdb"),
      )
      .take(limit);

    return results;
  },
});

export const searchCatalog = action({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runAction(api.embeddings.searchShows, {
      text: args.text,
      limit: 12,
    });
  },
});

/** Normalize a TMDB TV result to catalog item format */
function mapTmdbResult(result: any) {
  return {
    externalSource: "tmdb",
    externalId: String(result.id),
    title: result.name ?? result.original_name ?? "Untitled",
    year: result.first_air_date
      ? Number(String(result.first_air_date).slice(0, 4))
      : undefined,
    overview: result.overview ?? undefined,
    posterUrl: result.poster_path
      ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
      : undefined,
    voteAverage: result.vote_average,
  };
}

export const getTmdbList = action({
  args: {
    category: v.union(
      v.literal("popular"),
      v.literal("top_rated"),
      v.literal("on_the_air"),
      v.literal("genre_drama"),
      v.literal("genre_comedy"),
      v.literal("genre_sci_fi"),
      v.literal("netflix"),
      v.literal("apple_tv"),
      v.literal("max"),
      v.literal("disney_plus"),
      v.literal("hulu"),
      v.literal("prime_video"),
    ),
    limit: v.optional(v.number()),
    page: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 20);
    const page = Math.max(args.page ?? 1, 1);
    const cacheKey = page > 1 ? `${args.category}:page${page}` : args.category;
    const now = Date.now();
    const cached = await ctx.runQuery(internal.shows.getListCache, {
      category: cacheKey,
    });
    if (cached && cached.expiresAt > now) {
      return (cached.results as any[]).slice(0, limit);
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error("Missing TMDB_API_KEY env var");
    }

    const baseParams = `api_key=${apiKey}&language=en-US&page=${page}`;
    let url: string;

    switch (args.category) {
      case "popular":
        url = tmdbUrl(`/tv/popular?${baseParams}`);
        break;
      case "top_rated":
        url = tmdbUrl(`/tv/top_rated?${baseParams}`);
        break;
      case "on_the_air":
        url = tmdbUrl(`/tv/on_the_air?${baseParams}`);
        break;
      case "genre_drama":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_genres=18&sort_by=popularity.desc`,
        );
        break;
      case "genre_comedy":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_genres=35&sort_by=popularity.desc`,
        );
        break;
      case "genre_sci_fi":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_genres=10765&sort_by=popularity.desc`,
        );
        break;
      case "netflix":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_watch_providers=8&watch_region=US&sort_by=popularity.desc`,
        );
        break;
      case "apple_tv":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_watch_providers=350&watch_region=US&sort_by=popularity.desc`,
        );
        break;
      case "max":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_watch_providers=1899&watch_region=US&sort_by=popularity.desc`,
        );
        break;
      case "disney_plus":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_watch_providers=337&watch_region=US&sort_by=popularity.desc`,
        );
        break;
      case "hulu":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_watch_providers=15&watch_region=US&sort_by=popularity.desc`,
        );
        break;
      case "prime_video":
        url = tmdbUrl(
          `/discover/tv?${baseParams}&with_watch_providers=9&watch_region=US&sort_by=popularity.desc`,
        );
        break;
      default:
        throw new Error(`Unknown category: ${args.category}`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB list failed: ${response.status}`);
    }
    const data = await response.json();
    const results = (data.results ?? []).slice(0, limit).map(mapTmdbResult);

    await ctx.runMutation(internal.shows.upsertListCache, {
      category: cacheKey,
      results,
      fetchedAt: now,
      expiresAt: now + LIST_CACHE_TTL_MS,
    });

    return results;
  },
});

export const ingestFromCatalog = action({
  args: {
    externalSource: v.string(),
    externalId: v.string(),
    title: v.optional(v.string()),
    originalTitle: v.optional(v.string()),
    year: v.optional(v.number()),
    overview: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    if (args.externalSource !== "tmdb") {
      throw new Error("Unsupported external source");
    }

    const existing = await ctx.runQuery(internal.shows.getByExternalInternal, {
      externalSource: args.externalSource,
      externalId: args.externalId,
    });
    if (existing) {
      await ctx.scheduler.runAfter(0, internal.embeddings.ensureShowEmbedding, {
        showId: existing._id,
      });
      return existing._id;
    }

    if (args.title) {
      const normalized = normalizeSearchText(
        `${args.title} ${args.originalTitle ?? ""}`,
      );
      const showId = await ctx.runMutation(internal.shows.upsertFromCatalog, {
        externalSource: args.externalSource,
        externalId: args.externalId,
        title: args.title,
        year: args.year,
        overview: args.overview,
        posterUrl: args.posterUrl,
        searchText: normalized,
      });
      await ctx.scheduler.runAfter(0, internal.embeddings.ensureShowEmbedding, {
        showId,
      });
      return showId;
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error("Missing TMDB_API_KEY env var");
    }

    const response = await fetch(
      tmdbUrl(`/tv/${args.externalId}?api_key=${apiKey}&language=en-US`),
    );

    if (!response.ok) {
      throw new Error(`TMDB request failed: ${response.status}`);
    }

    const data = await response.json();
    const posterPath = data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : undefined;

    const title = data.name ?? data.original_name ?? "Untitled";
    const normalized = normalizeSearchText(
      `${title} ${data.original_name ?? ""} ${data.tagline ?? ""}`,
    );

    const showId = await ctx.runMutation(internal.shows.upsertFromCatalog, {
      externalSource: "tmdb",
      externalId: String(data.id),
      title,
      year: data.first_air_date
        ? Number(String(data.first_air_date).slice(0, 4))
        : undefined,
      overview: data.overview ?? undefined,
      posterUrl: posterPath,
      searchText: normalized,
    });
    await ctx.scheduler.runAfter(0, internal.embeddings.ensureShowEmbedding, {
      showId,
    });
    return showId;
  },
});

async function fetchSeasonDetailsPayload(
  ctx: ActionCtx,
  args: { externalId: string; seasonNumber: number },
) {
  const now = Date.now();
  const cacheExternalId = `${args.externalId}:season:${args.seasonNumber}`;
  const cached = await ctx.runQuery(internal.shows.getDetailsCache, {
    externalSource: "tmdb-season",
    externalId: cacheExternalId,
  });
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const response = await fetch(
    tmdbUrl(
      `/tv/${args.externalId}/season/${args.seasonNumber}?api_key=${getTmdbApiKey()}&language=en-US`,
    ),
  );

  if (!response.ok) {
    throw new Error(`TMDB season request failed: ${response.status}`);
  }

  const data = await response.json();
  const episodes = (data.episodes ?? []).map((episode: any) => ({
    id: episode.id,
    name: episode.name ?? `Episode ${episode.episode_number}`,
    episodeNumber: episode.episode_number ?? 0,
    seasonNumber: episode.season_number ?? args.seasonNumber,
    airDate: episode.air_date ?? null,
    runtime: episode.runtime ?? null,
    overview: episode.overview ?? null,
    stillPath: episode.still_path
      ? `https://image.tmdb.org/t/p/w780${episode.still_path}`
      : null,
    voteAverage: episode.vote_average ?? 0,
    voteCount: episode.vote_count ?? 0,
    crew:
      episode.crew
        ?.filter((person: any) =>
          ["Director", "Writer", "Screenplay", "Story"].includes(person.job),
        )
        .slice(0, 4)
        .map((person: any) => ({
          id: person.id,
          name: person.name,
          job: person.job,
        })) ?? [],
    guestStars:
      episode.guest_stars?.slice(0, 5).map((person: any) => ({
        id: person.id,
        name: person.name,
        character: person.character ?? null,
      })) ?? [],
  }));

  const ratedEpisodes = episodes.filter((episode: any) => episode.voteCount > 0);
  const seasonVoteAverage =
    ratedEpisodes.length > 0
      ? Number(
          (
            ratedEpisodes.reduce(
              (sum: number, episode: any) => sum + episode.voteAverage,
              0,
            ) / ratedEpisodes.length
          ).toFixed(1),
        )
      : null;

  const payload = {
    id: data.id,
    seasonNumber: data.season_number ?? args.seasonNumber,
    name: data.name ?? `Season ${args.seasonNumber}`,
    overview: data.overview ?? null,
    airDate: data.air_date ?? null,
    posterPath: data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : null,
    episodeCount: episodes.length,
    voteAverage: seasonVoteAverage,
    episodes,
  };

  await ctx.runMutation(internal.shows.upsertDetailsCache, {
    externalSource: "tmdb-season",
    externalId: cacheExternalId,
    payload,
    fetchedAt: now,
    expiresAt: now + getSeasonDetailsCacheTtlMs(payload.airDate),
  });

  return payload;
}

function hasExtendedDetailsCachePayload(payload: unknown) {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    "watchProviderUrlsStatus" in (payload as Record<string, unknown>)
  );
}

async function fetchExtendedDetailsPayload(
  ctx: ActionCtx,
  args: { externalId: string; rateLimitKey?: string | null },
) {
  if (args.rateLimitKey) {
    await ctx.runMutation(internal.rateLimit.enforce, {
      key: args.rateLimitKey,
      limit: 30,
      windowMs: 60_000,
    });
  }

  const apiKey = getTmdbApiKey();
  const now = Date.now();
  const cached = await ctx.runQuery(internal.shows.getDetailsCache, {
    externalSource: "tmdb",
    externalId: args.externalId,
  });
  if (cached && cached.expiresAt > now && hasExtendedDetailsCachePayload(cached.payload)) {
    return cached.payload;
  }

  const url = tmdbUrl(
    `/tv/${args.externalId}?api_key=${apiKey}&language=en-US` +
      `&append_to_response=credits,videos,similar,recommendations,external_ids,content_ratings`,
  );

  const providersUrl = tmdbUrl(
    `/tv/${args.externalId}/watch/providers?api_key=${apiKey}`,
  );
  const watchPageUrl = `https://www.themoviedb.org/tv/${args.externalId}/watch?locale=US`;

  const [response, providersResponse, watchPageResponse] = await Promise.all([
    fetch(url),
    fetch(providersUrl),
    fetch(watchPageUrl),
  ]);
  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }

  const [data, providersData, watchPageHtml] = await Promise.all([
    response.json(),
    providersResponse.ok ? providersResponse.json() : null,
    watchPageResponse.ok ? watchPageResponse.text() : null,
  ]);

  const usProviders = providersData?.results?.US ?? null;
  const providerTitleUrls = watchPageHtml
    ? extractProviderTitleUrls(watchPageHtml)
    : new Map<string, string>();
  const streamingAvailabilityOrder = [{ key: "flatrate", label: "Stream" }] as const;
  const watchProviders = new Map<
    string,
    {
      id: number;
      name: string;
      logoUrl: string | null;
      availability: string[];
      deepLinkUrl: string | null;
    }
  >();

  for (const availability of streamingAvailabilityOrder) {
    const providers = usProviders?.[availability.key] ?? [];
    for (const provider of providers) {
      if (!MAJOR_STREAMING_PROVIDER_IDS.has(provider.provider_id)) {
        continue;
      }
      const providerName = getCanonicalProviderName(
        provider.provider_id,
        provider.provider_name,
      );
      const existing = watchProviders.get(providerName);
      if (existing) {
        if (!existing.availability.includes(availability.label)) {
          existing.availability.push(availability.label);
        }
        continue;
      }

      watchProviders.set(providerName, {
        id: provider.provider_id,
        name: providerName,
        logoUrl: provider.logo_path
          ? `https://image.tmdb.org/t/p/w92${provider.logo_path}`
          : null,
        availability: [availability.label],
        deepLinkUrl: providerTitleUrls.get(providerName) ?? null,
      });
    }
  }

  const payload = {
    tagline: data.tagline ?? null,
    createdBy:
      data.created_by?.map((person: any) => ({
        id: person.id,
        name: person.name,
        profilePath: person.profile_path
          ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
          : null,
      })) ?? [],
    genres: data.genres ?? [],
    networks: data.networks ?? [],
    status: data.status,
    numberOfSeasons: data.number_of_seasons ?? 0,
    numberOfEpisodes: data.number_of_episodes ?? 0,
    episodeRunTime: data.episode_run_time?.[0] ?? null,
    voteAverage: data.vote_average ?? 0,
    voteCount: data.vote_count ?? 0,
    backdropPath: data.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
      : null,
    firstAirDate: data.first_air_date,
    lastAirDate: data.last_air_date,
    seasons: data.seasons ?? [],
    cast:
      data.credits?.cast?.slice(0, 20).map((person: any) => ({
        id: person.id,
        name: person.name,
        character: person.character,
        profilePath: person.profile_path
          ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
          : null,
      })) ?? [],
    crew:
      data.credits?.crew
        ?.filter((person: any) =>
          ["Creator", "Executive Producer", "Director", "Writer"].includes(person.job),
        )
        .slice(0, 10)
        .map((person: any) => ({
          id: person.id,
          name: person.name,
          job: person.job,
          profilePath: person.profile_path
            ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
            : null,
        })) ?? [],
    videos:
      data.videos?.results
        ?.filter((video: any) =>
          video.site === "YouTube" && ["Trailer", "Teaser"].includes(video.type),
        )
        .slice(0, 5)
        .map((video: any) => ({
          id: video.id,
          key: video.key,
          name: video.name,
          type: video.type,
        })) ?? [],
    similar:
      data.similar?.results?.slice(0, 10).map((show: any) => ({
        id: show.id,
        title: show.name,
        posterPath: show.poster_path
          ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
          : null,
        voteAverage: show.vote_average,
      })) ?? [],
    contentRating:
      data.content_ratings?.results?.find((rating: any) => rating.iso_3166_1 === "US")?.rating ??
      null,
    imdbId: data.external_ids?.imdb_id ?? null,
    watchProviders: Array.from(watchProviders.values())
      .slice(0, 12)
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        logoUrl: provider.logoUrl,
        availability: provider.availability.join(" · "),
        deepLinkUrl: provider.deepLinkUrl,
      })),
    watchProvidersLink: usProviders?.link ?? null,
    watchProvidersStatus: usProviders ? "available" : "missing",
    watchProviderUrlsStatus: watchPageHtml ? "available" : "missing",
  };

  await ctx.runMutation(internal.shows.upsertDetailsCache, {
    externalSource: "tmdb",
    externalId: args.externalId,
    payload,
    fetchedAt: now,
    expiresAt: now + SHOW_DETAILS_CACHE_TTL_MS,
  });

  return payload;
}

export const getExtendedDetails = action({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return await fetchExtendedDetailsPayload(ctx, {
      externalId: args.externalId,
      rateLimitKey: `tmdb-details:${userId}`,
    });
  },
});

export const getExtendedDetailsInternal = internalAction({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await fetchExtendedDetailsPayload(ctx, {
      externalId: args.externalId,
      rateLimitKey: null,
    });
  },
});

export const getSeasonDetailsInternal = internalAction({
  args: { externalId: v.string(), seasonNumber: v.number() },
  handler: async (ctx, args) => {
    return await fetchSeasonDetailsPayload(ctx, args);
  },
});

export const getSeasonDetails = action({
  args: { externalId: v.string(), seasonNumber: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const now = Date.now();
    const cacheExternalId = `${args.externalId}:season:${args.seasonNumber}`;
    const cached = await ctx.runQuery(internal.shows.getDetailsCache, {
      externalSource: "tmdb-season",
      externalId: cacheExternalId,
    });

    return await getSeasonDetailsWithCache({
      cached,
      now,
      enforceRateLimit: async () => {
        await ctx.runMutation(internal.rateLimit.enforce, {
          key: `tmdb-season-details:${userId}`,
          limit: 30,
          windowMs: 60_000,
        });
      },
      fetchPayload: async () => await fetchSeasonDetailsPayload(ctx, args),
    });
  },
});
