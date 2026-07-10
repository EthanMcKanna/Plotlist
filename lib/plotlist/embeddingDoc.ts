// Embedding document builder for recommendations v2.
//
// Every show is rendered into a stable, labeled, information-dense text doc
// that gemini-embedding-2 turns into the show's single vector (RETRIEVAL_DOCUMENT,
// 1536 dims, L2-normalized client-side). Labels always appear in the same
// order so the embedding geometry stays consistent across the catalog; fields
// missing from a show are simply omitted. See docs/recommendations-v2.md.

import { fnv1aHash, mapGenreIdsToNames } from "./embeddingUtils";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_VERSION = "shows-v2-ge2-1536";

const MAX_KEYWORDS = 14;
const MAX_CAST = 6;
const MAX_CREATORS = 3;
const MAX_OVERVIEW_CHARS = 1200;

// Show rows store ISO 639-1 codes; spell out the common ones so the model
// reads "Korean" instead of "ko".
const LANGUAGE_NAMES: Record<string, string> = {
  aa: "Afar", ab: "Abkhazian", af: "Afrikaans", am: "Amharic", ar: "Arabic",
  az: "Azerbaijani", be: "Belarusian", bg: "Bulgarian", bn: "Bengali",
  bs: "Bosnian", ca: "Catalan", cs: "Czech", cy: "Welsh", da: "Danish",
  de: "German", el: "Greek", en: "English", es: "Spanish", et: "Estonian",
  eu: "Basque", fa: "Persian", fi: "Finnish", fil: "Filipino", fr: "French",
  ga: "Irish", gl: "Galician", he: "Hebrew", hi: "Hindi", hr: "Croatian",
  hu: "Hungarian", hy: "Armenian", id: "Indonesian", is: "Icelandic",
  it: "Italian", ja: "Japanese", ka: "Georgian", kk: "Kazakh", km: "Khmer",
  kn: "Kannada", ko: "Korean", ku: "Kurdish", la: "Latin", lt: "Lithuanian",
  lv: "Latvian", mk: "Macedonian", ml: "Malayalam", mn: "Mongolian",
  mr: "Marathi", ms: "Malay", my: "Burmese", nb: "Norwegian", ne: "Nepali",
  nl: "Dutch", no: "Norwegian", pa: "Punjabi", pl: "Polish", pt: "Portuguese",
  ro: "Romanian", ru: "Russian", si: "Sinhala", sk: "Slovak", sl: "Slovenian",
  sq: "Albanian", sr: "Serbian", sv: "Swedish", sw: "Swahili", ta: "Tamil",
  te: "Telugu", th: "Thai", tl: "Tagalog", tr: "Turkish", uk: "Ukrainian",
  ur: "Urdu", uz: "Uzbek", vi: "Vietnamese", zh: "Chinese", zu: "Zulu",
};

export type EmbeddingShowInput = {
  title: string;
  originalTitle?: string | null;
  year?: number | null;
  overview?: string | null;
  genreIds?: number[] | null;
  originalLanguage?: string | null;
  originCountries?: string[] | null;
};

// Enrichment extracted from a TMDB details payload (raw API response or the
// normalized shape stored in tmdb_details_cache — both are accepted).
export type EmbeddingShowEnrichment = {
  tagline?: string | null;
  type?: string | null;
  status?: string | null;
  firstAirYear?: number | null;
  lastAirYear?: number | null;
  keywords?: string[];
  creators?: string[];
  cast?: string[];
  networks?: string[];
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  episodeRunTimeMinutes?: number | null;
  contentRating?: string | null;
};

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Accepts either a raw TMDB /tv/{id}?append_to_response=keywords,credits,content_ratings
// payload or the normalized copy stored in tmdb_details_cache.
export function extractEnrichmentFromTmdbDetails(payload: any): EmbeddingShowEnrichment {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const keywords = asArray(payload.keywords?.results ?? payload.keywords?.keywords ?? payload.keywords)
    .map((keyword) => cleanName(keyword?.name))
    .filter((name): name is string => Boolean(name));

  const creators = asArray(payload.created_by)
    .map((person) => cleanName(person?.name))
    .filter((name): name is string => Boolean(name));

  const cast = asArray(payload.credits?.cast)
    .map((person) => cleanName(person?.name))
    .filter((name): name is string => Boolean(name));

  const networks = asArray(payload.networks)
    .map((network) => cleanName(network?.name))
    .filter((name): name is string => Boolean(name));

  const usRating = asArray(payload.content_ratings?.results).find(
    (entry) => entry?.iso_3166_1 === "US" && cleanName(entry?.rating),
  );
  const anyRating = asArray(payload.content_ratings?.results).find((entry) =>
    cleanName(entry?.rating),
  );

  const firstAir = cleanName(payload.first_air_date);
  const lastAir = cleanName(payload.last_air_date);
  const runtime =
    typeof payload.episodeRunTime === "number"
      ? payload.episodeRunTime
      : Array.isArray(payload.episode_run_time)
        ? payload.episode_run_time[0]
        : null;

  return {
    tagline: cleanName(payload.tagline),
    type: cleanName(payload.type),
    status: cleanName(payload.status),
    firstAirYear: firstAir ? Number(firstAir.slice(0, 4)) || null : null,
    lastAirYear: lastAir ? Number(lastAir.slice(0, 4)) || null : null,
    keywords,
    creators,
    cast,
    networks,
    numberOfSeasons: payload.numberOfSeasons ?? payload.number_of_seasons ?? null,
    numberOfEpisodes: payload.numberOfEpisodes ?? payload.number_of_episodes ?? null,
    episodeRunTimeMinutes: typeof runtime === "number" && runtime > 0 ? runtime : null,
    contentRating: cleanName(usRating?.rating) ?? cleanName(anyRating?.rating),
  };
}

function languageName(code: string | null | undefined) {
  if (!code) return null;
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}

function describeRun(input: EmbeddingShowInput, enrichment: EmbeddingShowEnrichment) {
  const startYear = enrichment.firstAirYear ?? input.year ?? null;
  if (!startYear) return null;

  const status = (enrichment.status ?? "").toLowerCase();
  const endYear = enrichment.lastAirYear ?? null;
  if (status.includes("returning") || status.includes("production") || status.includes("planned")) {
    return `${startYear}–present, ongoing`;
  }
  if (status.includes("ended") || status.includes("canceled") || status.includes("cancelled")) {
    const label = status.includes("end") ? "ended" : "canceled";
    return endYear && endYear !== startYear
      ? `${startYear}–${endYear}, ${label}`
      : `${startYear}, ${label}`;
  }
  return String(startYear);
}

function describeType(input: EmbeddingShowInput, enrichment: EmbeddingShowEnrichment) {
  const genreNames = mapGenreIdsToNames(input.genreIds ?? undefined);
  const isAnimated = genreNames.includes("Animation");
  const tmdbType = (enrichment.type ?? "").toLowerCase();

  const base = tmdbType.includes("mini")
    ? "miniseries"
    : tmdbType.includes("reality")
      ? "reality series"
      : tmdbType.includes("documentary")
        ? "documentary series"
        : tmdbType.includes("talk")
          ? "talk show"
          : tmdbType.includes("news")
            ? "news program"
            : tmdbType.includes("video") || tmdbType.includes("scripted")
              ? "scripted series"
              : null;

  if (isAnimated) {
    const animated = input.originalLanguage === "ja" ? "anime series" : "animated series";
    return base && base !== "scripted series" ? `${animated} (${base})` : animated;
  }
  return base;
}

function describeFormat(enrichment: EmbeddingShowEnrichment) {
  const parts: string[] = [];
  if (enrichment.numberOfSeasons) {
    parts.push(`${enrichment.numberOfSeasons} season${enrichment.numberOfSeasons === 1 ? "" : "s"}`);
  }
  if (enrichment.numberOfEpisodes) {
    parts.push(`${enrichment.numberOfEpisodes} episode${enrichment.numberOfEpisodes === 1 ? "" : "s"}`);
  }
  if (enrichment.episodeRunTimeMinutes) {
    parts.push(`~${enrichment.episodeRunTimeMinutes} min episodes`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

export function buildShowEmbeddingDocV2(
  input: EmbeddingShowInput,
  enrichment: EmbeddingShowEnrichment = {},
) {
  const genreNames = mapGenreIdsToNames(input.genreIds ?? undefined);
  const run = describeRun(input, enrichment);
  const showType = describeType(input, enrichment);
  const language = languageName(input.originalLanguage);
  const countries = (input.originCountries ?? []).filter(Boolean);

  const originParts = [
    enrichment.networks?.length ? `Network: ${enrichment.networks.slice(0, 2).join(", ")}` : null,
    language ? `Language: ${language}` : null,
    countries.length > 0 ? `Country: ${countries.join(", ")}` : null,
  ].filter(Boolean);

  const overview = (input.overview ?? "").trim();
  const originalTitle =
    input.originalTitle && input.originalTitle !== input.title ? input.originalTitle : null;

  const lines = [
    `Title: ${input.title}${run ? ` (${run})` : ""}`,
    originalTitle ? `Original title: ${originalTitle}` : null,
    showType ? `Type: ${showType}` : null,
    genreNames.length > 0 ? `Genres: ${genreNames.join(", ")}` : null,
    enrichment.keywords?.length
      ? `Keywords: ${enrichment.keywords.slice(0, MAX_KEYWORDS).join(", ")}`
      : null,
    enrichment.creators?.length
      ? `Created by: ${enrichment.creators.slice(0, MAX_CREATORS).join(", ")}`
      : null,
    enrichment.cast?.length ? `Cast: ${enrichment.cast.slice(0, MAX_CAST).join(", ")}` : null,
    originParts.length > 0 ? originParts.join(" · ") : null,
    describeFormat(enrichment) ? `Format: ${describeFormat(enrichment)}` : null,
    enrichment.contentRating ? `Audience: ${enrichment.contentRating}` : null,
    enrichment.tagline ? `Tagline: ${enrichment.tagline}` : null,
    overview ? `Premise: ${overview.slice(0, MAX_OVERVIEW_CHARS)}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}

// Doc hash + version identifies exactly what was embedded; ingest compares
// this against show_embedding_state.input_hash to decide staleness.
export function computeEmbeddingInputHash(docText: string) {
  return fnv1aHash(`${EMBEDDING_VERSION}|${docText}`);
}

// Hash of just the base shows-row fields. Ingest can compute this without a
// TMDB enrichment fetch; a mismatch against show_embedding_state.base_input_hash
// nominates the show for the refresh cron (which rebuilds the full doc and
// re-embeds only if the enriched doc actually changed).
export function computeBaseInputHash(input: EmbeddingShowInput) {
  return fnv1aHash(
    [
      EMBEDDING_VERSION,
      input.title,
      input.originalTitle ?? "",
      input.year ?? "",
      input.overview ?? "",
      (input.genreIds ?? []).join(","),
      input.originalLanguage ?? "",
      (input.originCountries ?? []).join(","),
    ].join("|"),
  );
}

// A show is worth embedding when it has enough signal to place meaningfully
// in the vector space. Metadata-only stubs (no overview, no votes, negligible
// popularity) would cluster as noise near the origin and pollute ANN results.
export function isShowWorthEmbedding(input: {
  overview?: string | null;
  tmdbPopularity?: number | null;
  tmdbVoteCount?: number | null;
}) {
  const overviewLength = (input.overview ?? "").trim().length;
  if (overviewLength >= 40) return true;
  return (input.tmdbPopularity ?? 0) >= 2 || (input.tmdbVoteCount ?? 0) >= 5;
}
