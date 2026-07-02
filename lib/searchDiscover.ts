export type SearchDiscoverDefinition = {
  key: string;
  category: string;
  label: string;
  icon?: string;
  logoPath?: string;
  rotatePages?: number;
};

export type SearchDiscoverItem = {
  externalSource?: string;
  externalId?: string | number;
  title?: string | null;
  year?: number | null;
  posterUrl?: string | null;
};

export type SearchDiscoverSection<Item extends SearchDiscoverItem = SearchDiscoverItem> =
  SearchDiscoverDefinition & {
    logoUrl?: string;
    items: Item[];
  };

const TMDB_LOGO_BASE_URL = "https://image.tmdb.org/t/p/w92";
const DAY_MS = 24 * 60 * 60 * 1000;
const PRIMARY_DISCOVER_KEYS = new Set([
  "trending_day",
  "fresh_premieres",
  "airing_today",
  "hidden_gems",
  "top_rated",
]);

export const SEARCH_DISCOVER_SECTIONS: SearchDiscoverDefinition[] = [
  { key: "trending_day", category: "trending_day", label: "Trending Today", icon: "flame" },
  { key: "fresh_premieres", category: "fresh_premieres", label: "Fresh Premieres", icon: "sparkles", rotatePages: 3 },
  { key: "airing_today", category: "airing_today", label: "Airing Today", icon: "today" },
  { key: "hidden_gems", category: "hidden_gems", label: "Hidden Gems", icon: "diamond", rotatePages: 5 },
  { key: "top_rated", category: "top_rated", label: "Critic Favorites", icon: "star", rotatePages: 4 },
  { key: "genre_drama", category: "genre_drama", label: "Drama", icon: "film", rotatePages: 5 },
  { key: "genre_comedy", category: "genre_comedy", label: "Comedy", icon: "happy", rotatePages: 5 },
  { key: "genre_sci_fi", category: "genre_sci_fi", label: "Sci-Fi & Fantasy", icon: "rocket", rotatePages: 5 },
  { key: "genre_crime", category: "genre_crime", label: "Crime", icon: "finger-print", rotatePages: 5 },
  { key: "netflix", category: "netflix", label: "Netflix", logoPath: "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg", rotatePages: 4 },
  { key: "apple_tv", category: "apple_tv", label: "Apple TV", logoPath: "/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg", rotatePages: 4 },
  { key: "max", category: "max", label: "HBO Max", logoPath: "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg", rotatePages: 4 },
  { key: "disney_plus", category: "disney_plus", label: "Disney+", logoPath: "/97yvRBw1GzX7fXprcF80er19ot.jpg", rotatePages: 4 },
  { key: "hulu", category: "hulu", label: "Hulu", logoPath: "/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg", rotatePages: 4 },
  { key: "prime_video", category: "prime_video", label: "Prime Video", logoPath: "/pvske1MyAoymrs5bguRfVqYiM9a.jpg", rotatePages: 4 },
];

export function getSearchDiscoverFetchPlan(
  definitions: SearchDiscoverDefinition[],
) {
  const primary = definitions.filter((section) =>
    PRIMARY_DISCOVER_KEYS.has(section.key),
  );
  const secondary = definitions.filter(
    (section) => !PRIMARY_DISCOVER_KEYS.has(section.key),
  );
  return { primary, secondary };
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getDailyDiscoverPage(
  section: Pick<SearchDiscoverDefinition, "key" | "rotatePages">,
  now = Date.now(),
) {
  const pageCount = Math.max(1, section.rotatePages ?? 1);
  if (pageCount === 1) {
    return 1;
  }
  const day = Math.floor(now / DAY_MS);
  return ((hashString(section.key) + day) % pageCount) + 1;
}

export function getSearchDiscoverCacheKey(
  definitions: SearchDiscoverDefinition[],
  now = Date.now(),
) {
  const day = Math.floor(now / DAY_MS);
  return definitions
    .map((section) => `${section.key}:${getDailyDiscoverPage(section, now)}`)
    .join("|")
    .concat(`:${day}`);
}

function getItemKey(item: SearchDiscoverItem) {
  if (item.externalSource && item.externalId !== undefined && item.externalId !== null) {
    return `${item.externalSource}:${item.externalId}`;
  }
  if (item.externalId !== undefined && item.externalId !== null) {
    return String(item.externalId);
  }
  return `${item.title ?? "unknown"}:${item.year ?? ""}`.toLowerCase();
}

export function buildSearchDiscoverSections<Item extends SearchDiscoverItem>(
  definitions: SearchDiscoverDefinition[],
  resultsByKey: Record<string, Item[] | undefined>,
  maxItemsPerSection = 10,
) {
  const seen = new Set<string>();
  const sections: SearchDiscoverSection<Item>[] = [];

  for (const definition of definitions) {
    const items: Item[] = [];
    for (const item of resultsByKey[definition.key] ?? []) {
      const itemKey = getItemKey(item);
      if (seen.has(itemKey) || !item.title || !item.posterUrl) {
        continue;
      }
      seen.add(itemKey);
      items.push(item);
      if (items.length >= maxItemsPerSection) {
        break;
      }
    }

    if (items.length > 0) {
      sections.push({
        ...definition,
        logoUrl: definition.logoPath ? `${TMDB_LOGO_BASE_URL}${definition.logoPath}` : undefined,
        items,
      });
    }
  }

  return sections;
}
