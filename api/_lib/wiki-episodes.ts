// Wikipedia episode summaries for catch-up briefs: resolve the show's
// episode page(s), parse {{Episode list}} ShortSummary text, and cache per
// (show, season) in D1. Everything here is best-effort — any failure
// degrades to the TMDB-overview-only brief. Pure wikitext parsing lives in
// lib/wikiEpisodes.ts.
//
// Resolution walks known page layouts: "List of X episodes" (which may
// transclude per-season pages), the show's main article ("X (TV series)",
// "X (miniseries)", plain "X"), and a search fallback. Parsed seasons are
// validated against TMDB episode titles before use, so a disambiguation
// collision or mis-attributed webisodes can't inject a different show's
// plot into a brief.

import { and, eq, inArray } from "drizzle-orm";

import { wikiEpisodeCache } from "../../db/schema";
import {
  extractEpisodeListTemplates,
  extractTransclusions,
  groupEntriesBySeason,
  parseWikiEpisodePage,
  seasonFromPageTitle,
  validateSeasonAgainstTmdb,
  type WikiSeasonEpisodes,
} from "../../lib/wikiEpisodes";
import { db } from "./db";
import { createId } from "./ids";

const WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php";
// Wikimedia etiquette wants an identifying UA; Workers also send none by
// default (the Trakt lesson).
const WIKI_USER_AGENT = "Plotlist/1.0 (+https://plotlist.app)";
const WIKI_FETCH_TIMEOUT_MS = 10_000;
// Total Wikipedia HTTP calls per brief generation, across resolution,
// search, and season-page fetches.
const MAX_WIKI_FETCHES = 7;

// Summaries for settled seasons only ever improve; refreshing every couple
// of weeks is plenty. Negative entries retry sooner — pages appear as shows
// get popular.
const WIKI_FOUND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const WIKI_NEGATIVE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export type WikiSeasonPayload = {
  pageTitle: string | null;
  episodes: Array<{ episodeNumber: number; title: string | null; summary: string }>;
};

// season → episode → summary text
export type WikiSummaries = Map<number, Map<number, string>>;

type FetchBudget = { remaining: number };

type WikiPage = { title: string; wikitext: string };

async function wikiApiCall(params: Record<string, string>): Promise<any | null> {
  const url = new URL(WIKIPEDIA_API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WIKI_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": WIKI_USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Wikitext of a page (redirects followed); null when missing or on error.
async function fetchWikiPage(pageTitle: string, budget: FetchBudget): Promise<WikiPage | null> {
  if (budget.remaining <= 0) return null;
  budget.remaining -= 1;
  const result = await wikiApiCall({
    action: "parse",
    prop: "wikitext",
    redirects: "1",
    page: pageTitle,
  });
  const title = result?.parse?.title;
  const wikitext = result?.parse?.wikitext;
  if (typeof title !== "string" || typeof wikitext !== "string") return null;
  return { title, wikitext };
}

async function searchWikiPages(query: string, budget: FetchBudget): Promise<string[]> {
  if (budget.remaining <= 0) return [];
  budget.remaining -= 1;
  const result = await wikiApiCall({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "5",
    srnamespace: "0",
  });
  const hits = Array.isArray(result?.query?.search) ? result.query.search : [];
  return hits
    .map((hit: any) => (typeof hit?.title === "string" ? hit.title : null))
    .filter((title: string | null): title is string => title !== null);
}

const LIST_PAGE_PATTERN = /^list of .* episodes$/i;

// A page is a plausible episode source when it carries episode-list
// templates, transcludes season pages, or transcludes a "List of …
// episodes" page — this is what rejects e.g. the Chernobyl-disaster article
// when the show is "Chernobyl".
function looksLikeEpisodeSource(page: WikiPage): boolean {
  if (extractEpisodeListTemplates(page.wikitext).length > 0) return true;
  return extractTransclusions(page.wikitext).some(
    (target) => seasonFromPageTitle(target) !== null || LIST_PAGE_PATTERN.test(target),
  );
}

// Main articles often hold no episode content themselves and just transclude
// the show's list page ("The Office (American TV series)" → "List of The
// Office (American TV series) episodes"). Hop to it — the list page is the
// better root.
async function hopToListPage(page: WikiPage, budget: FetchBudget): Promise<WikiPage> {
  if (extractEpisodeListTemplates(page.wikitext).length > 0) return page;
  const transclusions = extractTransclusions(page.wikitext);
  if (transclusions.some((target) => seasonFromPageTitle(target) !== null)) return page;
  const listTarget = transclusions.find((target) => LIST_PAGE_PATTERN.test(target));
  if (!listTarget) return page;
  const listPage = await fetchWikiPage(listTarget, budget);
  return listPage && looksLikeEpisodeSource(listPage) ? listPage : page;
}

async function resolveRootPage(
  title: string,
  year: number | null,
  budget: FetchBudget,
): Promise<WikiPage | null> {
  const candidates = [
    `List of ${title} episodes`,
    `${title} (TV series)`,
    ...(year ? [`${title} (${year} TV series)`] : []),
    `${title} (miniseries)`,
    title,
  ];
  const tried = new Set<string>();
  for (const candidate of candidates) {
    if (tried.has(candidate.toLowerCase())) continue;
    tried.add(candidate.toLowerCase());
    const page = await fetchWikiPage(candidate, budget);
    if (page && looksLikeEpisodeSource(page)) return await hopToListPage(page, budget);
  }

  // Year in the query nudges same-name remakes ("The Office") toward the
  // right era; validation still rejects wrong-show data either way.
  const found = await searchWikiPages(
    `${title}${year ? ` ${year}` : ""} television series episodes`,
    budget,
  );
  const hits = found
    .filter(
      (pageTitle) =>
        LIST_PAGE_PATTERN.test(pageTitle) || /\((?:[^)]* )?TV series\)$/i.test(pageTitle),
    )
    .filter((pageTitle) => !tried.has(pageTitle.toLowerCase()))
    .slice(0, 3);
  for (const hit of hits) {
    const page = await fetchWikiPage(hit, budget);
    if (page && looksLikeEpisodeSource(page)) return await hopToListPage(page, budget);
  }
  return null;
}

function payloadFromSeason(
  pageTitle: string,
  episodes: Map<number, { title: string | null; summary: string }>,
): WikiSeasonPayload {
  return {
    pageTitle,
    episodes: [...episodes.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([episodeNumber, entry]) => ({
        episodeNumber,
        title: entry.title,
        summary: entry.summary,
      })),
  };
}

// Fetch + parse wiki data for the seasons we still need. Returns validated
// per-season payloads keyed by season number; seasons that stay unresolved
// simply aren't in the map. Exported (db-free) for verification scripts.
export async function resolveSeasons(
  title: string,
  year: number | null,
  neededSeasons: number[],
  tmdbNames: Map<number, Map<number, string | null>>,
): Promise<Map<number, WikiSeasonPayload>> {
  const budget: FetchBudget = { remaining: MAX_WIKI_FETCHES };
  const resolved = new Map<number, WikiSeasonPayload>();

  const root = await resolveRootPage(title, year, budget);
  if (!root) return resolved;

  const accept = (source: WikiPage, seasons: WikiSeasonEpisodes) => {
    for (const [seasonNumber, episodes] of seasons) {
      if (resolved.has(seasonNumber)) continue;
      const names = tmdbNames.get(seasonNumber);
      if (!names || !validateSeasonAgainstTmdb(episodes, names)) continue;
      resolved.set(seasonNumber, payloadFromSeason(source.title, episodes));
    }
  };

  const rootDefaultSeason = seasonFromPageTitle(root.title) ?? 1;
  accept(root, groupEntriesBySeason(parseWikiEpisodePage(root.wikitext, { defaultSeason: rootDefaultSeason })));

  // Season pages transcluded from the root ("{{:Breaking Bad season 2}}")
  // hold the summaries the root only displays. Fetch the ones covering
  // seasons we still need, newest first — they carry the brief's detail
  // windows.
  const transclusionBySeason = new Map<number, string>();
  for (const target of extractTransclusions(root.wikitext)) {
    const seasonNumber = seasonFromPageTitle(target);
    if (seasonNumber !== null && !transclusionBySeason.has(seasonNumber)) {
      transclusionBySeason.set(seasonNumber, target);
    }
  }
  const outstanding = neededSeasons
    .filter((seasonNumber) => !resolved.has(seasonNumber))
    .sort((left, right) => right - left);
  for (const seasonNumber of outstanding) {
    if (budget.remaining <= 0) break;
    const candidates = transclusionBySeason.has(seasonNumber)
      ? [transclusionBySeason.get(seasonNumber)!]
      : [`${title} season ${seasonNumber}`];
    for (const candidate of candidates) {
      const page = await fetchWikiPage(candidate, budget);
      if (!page) continue;
      accept(page, groupEntriesBySeason(
        parseWikiEpisodePage(page.wikitext, {
          defaultSeason: seasonFromPageTitle(page.title) ?? seasonNumber,
        }),
      ));
      if (resolved.has(seasonNumber)) break;
    }
  }
  return resolved;
}

// ── Cache + public entry point ──────────────────────────────────────────────

async function readCachedSeasons(externalId: string, seasons: number[], now: number) {
  const fresh = new Map<number, WikiSeasonPayload>();
  if (seasons.length === 0) return fresh;
  const rows = await db
    .select()
    .from(wikiEpisodeCache)
    .where(
      and(
        eq(wikiEpisodeCache.externalSource, "tmdb"),
        eq(wikiEpisodeCache.externalId, externalId),
        inArray(wikiEpisodeCache.seasonNumber, seasons),
      ),
    );
  for (const row of rows) {
    if (row.expiresAt <= now) continue;
    const payload = row.payload as WikiSeasonPayload | null;
    if (!payload || !Array.isArray(payload.episodes)) continue;
    fresh.set(row.seasonNumber, payload);
  }
  return fresh;
}

async function writeCachedSeason(
  externalId: string,
  seasonNumber: number,
  payload: WikiSeasonPayload,
  now: number,
) {
  const ttl = payload.pageTitle === null ? WIKI_NEGATIVE_TTL_MS : WIKI_FOUND_TTL_MS;
  await db
    .insert(wikiEpisodeCache)
    .values({
      id: createId("wikiep"),
      externalSource: "tmdb",
      externalId,
      seasonNumber,
      payload,
      fetchedAt: now,
      expiresAt: now + ttl,
    })
    .onConflictDoUpdate({
      target: [
        wikiEpisodeCache.externalSource,
        wikiEpisodeCache.externalId,
        wikiEpisodeCache.seasonNumber,
      ],
      set: { payload, fetchedAt: now, expiresAt: now + ttl },
    });
}

// Episode plot summaries for the requested seasons, cache-first. `tmdbNames`
// (season → episode → TMDB episode name) drives wrong-page validation.
// Never throws; missing data just means a smaller (possibly empty) map.
export async function loadWikiEpisodeSummaries(args: {
  externalId: string;
  title: string;
  year: number | null;
  seasons: number[];
  tmdbNames: Map<number, Map<number, string | null>>;
}): Promise<WikiSummaries> {
  const summaries: WikiSummaries = new Map();
  try {
    const now = Date.now();
    const wanted = [...new Set(args.seasons)].filter((seasonNumber) => seasonNumber > 0);
    const cached = await readCachedSeasons(args.externalId, wanted, now);
    const missing = wanted.filter((seasonNumber) => !cached.has(seasonNumber));

    if (missing.length > 0) {
      const fetched = await resolveSeasons(args.title, args.year, missing, args.tmdbNames);
      for (const seasonNumber of missing) {
        const payload =
          fetched.get(seasonNumber) ?? ({ pageTitle: null, episodes: [] } as WikiSeasonPayload);
        cached.set(seasonNumber, payload);
        await writeCachedSeason(args.externalId, seasonNumber, payload, now);
      }
      // Bonus seasons the root page happened to carry — cache those too so
      // later stop points skip the fetch entirely.
      for (const [seasonNumber, payload] of fetched) {
        if (!missing.includes(seasonNumber) && !cached.has(seasonNumber)) {
          await writeCachedSeason(args.externalId, seasonNumber, payload, now);
        }
      }
    }

    for (const [seasonNumber, payload] of cached) {
      if (payload.episodes.length === 0) continue;
      const bySeasonEpisode = new Map<number, string>();
      for (const episode of payload.episodes) {
        bySeasonEpisode.set(episode.episodeNumber, episode.summary);
      }
      summaries.set(seasonNumber, bySeasonEpisode);
    }
  } catch (error) {
    console.warn("[catchup] wiki summaries failed", args.externalId, error);
  }
  return summaries;
}
