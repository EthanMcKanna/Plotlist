// The one canonical resolver for "where can I actually watch this show".
//
// TMDB's watch-provider data (sourced from JustWatch) is noisy: a single
// subscription shows up as its ad tier ("Netflix Standard with Ads"), its
// premium tier ("Peacock Premium Plus"), and as storefront channel variants
// ("Apple TV Amazon Channel", "Paramount Plus Apple TV channel", "AMC+ Roku
// Premium Channel"). Worse, the storefront host itself ("Amazon Prime Video")
// gets listed just because the show is sold as *another* service's channel
// inside Amazon — which is how Ted Lasso ended up labelled "Prime Video".
//
// Every surface that names a service (show page, release strip, calendar,
// provider filters, home provider rooms, arrival notifications, Ask) must go
// through `resolveWatchProviders` so they all agree. The module is pure and
// shared by the worker and the client; it must not import anything with
// side effects.
//
// Rules, in order:
//   1. Only subscription streaming counts: `flatrate` always; `free`/`ads`
//      only for genuinely free services (Tubi, Pluto TV, The Roku Channel…)
//      or a free tier of a known service. `rent`/`buy` are never "where to
//      watch".
//   2. Canonicalize ids/names: tiers collapse into their parent service,
//      brand spellings collapse into one key ("Disney Plus" → disney_plus,
//      "HBO Max"/"Max" → max, "Apple TV"/"Apple TV Plus" → apple_tv).
//   3. Channel storefront variants ("<service> Amazon Channel") collapse into
//      the underlying service. They are the same subscription delivered
//      through a storefront — never a reason to list the storefront.
//   4. Originals live on their network: when the show's TMDB networks name a
//      streamer, that service is promoted to the front (source "original")
//      *if TMDB lists it* — we never fabricate an entry, because originals do
//      leave their home (Westworld is off Max). A storefront host (Prime
//      Video / Apple TV / The Roku Channel / Hulu) that is not the original
//      home and only appears alongside "<other service> <host> Channel"
//      variants is dropped as spurious.
//   5. Broadcast/cable networks and their TV-Everywhere apps (NBC, USA
//      Network, FXNow, DisneyNOW…), live-TV bundles (fuboTV, Philo, YouTube
//      TV) and cable on-demand are excluded; their streaming homes come from
//      the flatrate data as usual.
//   6. Output is ordered original-first, then by TMDB display priority,
//      deduped, and capped.

export type WatchProviderSource = "original" | "subscription" | "free";

export type WatchProvider = {
  /** Stable canonical key, e.g. "apple_tv". Matches `users.streaming_providers`. */
  key: string;
  /** Display name, e.g. "Apple TV+". */
  name: string;
  logoUrl: string | null;
  source: WatchProviderSource;
  /** TMDB provider id of the direct (non-storefront) entry when one exists. */
  tmdbProviderId: number | null;
  /** Lowest TMDB display priority among the merged entries (lower = more prominent). */
  displayPriority: number;
};

export type WatchService = {
  key: string;
  name: string;
  logoPath: string | null;
  kind: "subscription" | "free";
  /** TMDB provider ids that resolve to this service: direct, tiers, and channel variants. */
  tmdbProviderIds: number[];
  /** Normalized provider/network names that resolve to this service. */
  aliases: string[];
  /** TMDB network ids whose originals live on this service. */
  networkIds: number[];
  /** Brand tint for pickers and provider rooms. */
  tint: string | null;
};

// Bumped whenever the resolution rules change in a way that alters output.
// Persisted resolver output (the streaming-arrival snapshot) is re-baselined
// against this so a rules change never reads as a wave of "arrivals".
export const WATCH_PROVIDER_RESOLVER_VERSION = 2;

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const DEFAULT_LIMIT = 6;
const UNKNOWN_DISPLAY_PRIORITY = 999;

export function normalizeWatchProviderName(value: string) {
  return value
    .toLowerCase()
    .replace(/\+/g, " plus")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function defineService(
  definition: Partial<Omit<WatchService, "key" | "name" | "logoPath">> &
    Pick<WatchService, "key" | "name" | "logoPath">,
): WatchService {
  const { aliases = [], ...rest } = definition;
  return {
    kind: "subscription",
    tmdbProviderIds: [],
    networkIds: [],
    tint: null,
    ...rest,
    aliases: [definition.name, ...aliases].map(normalizeWatchProviderName),
  };
}

// TMDB provider ids and logo paths come from
// /watch/providers/tv?watch_region=US (verified 2026-09). Network ids come
// from /tv/{id} payloads of the fixtures in tests/fixtures/tmdbWatchProviders.json.
export const WATCH_SERVICES: WatchService[] = [
  defineService({
    key: "netflix",
    name: "Netflix",
    logoPath: "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg",
    tmdbProviderIds: [8, 1796, 175],
    aliases: ["Netflix Standard with Ads", "Netflix Basic with Ads", "Netflix Kids"],
    networkIds: [213],
    tint: "#E50914",
  }),
  defineService({
    key: "apple_tv",
    name: "Apple TV+",
    logoPath: "/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg",
    // 350 is both the Apple TV+ subscription and the host of "<service>
    // Apple TV channel" variants; 2243 is Apple TV+ sold through Amazon.
    tmdbProviderIds: [350, 2243],
    aliases: ["Apple TV", "Apple TV Plus", "AppleTV"],
    networkIds: [2552],
    tint: "#A8A8A8",
  }),
  defineService({
    key: "max",
    name: "Max",
    logoPath: "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
    tmdbProviderIds: [1899, 1825],
    aliases: ["HBO Max", "HBO", "HBO Go", "HBO Now"],
    networkIds: [49, 6783, 8304],
    tint: "#7B2CBF",
  }),
  defineService({
    key: "disney_plus",
    name: "Disney+",
    logoPath: "/97yvRBw1GzX7fXprcF80er19ot.jpg",
    tmdbProviderIds: [337],
    aliases: ["Disney Plus", "Disney"],
    networkIds: [2739],
    tint: "#1F80E0",
  }),
  defineService({
    key: "hulu",
    name: "Hulu",
    logoPath: "/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg",
    tmdbProviderIds: [15],
    aliases: ["Hulu (No Ads)", "FX on Hulu"],
    networkIds: [453],
    tint: "#1CE783",
  }),
  defineService({
    key: "peacock",
    name: "Peacock",
    logoPath: "/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg",
    tmdbProviderIds: [386, 387, 2553],
    aliases: ["Peacock Premium", "Peacock Premium Plus"],
    networkIds: [3353],
    tint: "#8AC926",
  }),
  defineService({
    key: "prime_video",
    name: "Prime Video",
    logoPath: "/pvske1MyAoymrs5bguRfVqYiM9a.jpg",
    // 613 ("Amazon Prime Video Free with Ads") is the old Freevee library —
    // free without Prime, so it is also allowed from the free/ads buckets.
    tmdbProviderIds: [9, 2100, 613],
    aliases: [
      "Amazon Prime Video",
      "Amazon Prime",
      "Prime",
      "Amazon",
      "Amazon Prime Video with Ads",
      "Amazon Prime Video Free with Ads",
      "Freevee",
      "Amazon Freevee",
    ],
    networkIds: [1024, 5865],
    tint: "#00A8E1",
  }),
  defineService({
    key: "paramount_plus",
    name: "Paramount+",
    logoPath: "/fts6X10Jn4QT0X6ac3udKEn2tJA.jpg",
    tmdbProviderIds: [2303, 2616, 1853, 582, 633],
    aliases: [
      "Paramount Plus",
      "Paramount Plus Premium",
      "Paramount Plus Essential",
      "Paramount Plus with Showtime",
      "Paramount+ with Showtime",
      "Showtime",
      "CBS All Access",
    ],
    networkIds: [4330, 6631, 67],
    tint: "#0064FF",
  }),
  defineService({
    key: "mgm_plus",
    name: "MGM+",
    logoPath: "/ctiRpS16dlaTXQBSsiFncMrgWmh.jpg",
    tmdbProviderIds: [34, 583, 636],
    aliases: ["MGM Plus", "Epix"],
    networkIds: [6219, 922],
    tint: "#D6B35A",
  }),
  defineService({
    key: "amc_plus",
    name: "AMC+",
    logoPath: "/ovmu6uot1XVvsemM2dDySXLiX57.jpg",
    tmdbProviderIds: [526, 528, 635, 1854],
    aliases: ["AMC Plus"],
    tint: "#0D9D6B",
  }),
  defineService({
    key: "starz",
    name: "Starz",
    logoPath: "/yIKwylTLP1u8gl84Is7FItpYLGL.jpg",
    tmdbProviderIds: [43, 1794, 1855, 634],
    aliases: ["STARZ"],
    networkIds: [318],
    tint: "#1B1B1B",
  }),
  defineService({
    key: "crunchyroll",
    name: "Crunchyroll",
    logoPath: "/fzN5Jok5Ig1eJ7gyNGoMhnLSCfh.jpg",
    tmdbProviderIds: [283, 1968],
    tint: "#F47521",
  }),
  defineService({
    key: "discovery_plus",
    name: "Discovery+",
    logoPath: "/eMTnWwNVtThkjvQA6zwxaoJG9NE.jpg",
    tmdbProviderIds: [520, 584],
    aliases: ["Discovery Plus", "Discovery +"],
  }),
  defineService({
    key: "britbox",
    name: "BritBox",
    logoPath: "/8oA7IcDNNUtBa9JYB5kQ8hrDz5o.jpg",
    tmdbProviderIds: [151, 197, 1852],
    aliases: ["Britbox"],
  }),
  defineService({
    key: "acorn_tv",
    name: "Acorn TV",
    logoPath: "/doCc555FPPgGtuaZJxf9QZVpIp5.jpg",
    tmdbProviderIds: [87, 196, 2034],
    aliases: ["AcornTV"],
  }),
  defineService({
    key: "shudder",
    name: "Shudder",
    logoPath: "/vEtdiYRPRbDCp1Tcn3BEPF1Ni76.jpg",
    tmdbProviderIds: [99, 204, 2049],
  }),
  defineService({
    key: "sundance_now",
    name: "Sundance Now",
    logoPath: "/1Edma9SrJnqkQW3BqFd2rJNHZvX.jpg",
    tmdbProviderIds: [143, 205, 2048],
  }),
  defineService({
    key: "mubi",
    name: "MUBI",
    logoPath: "/x570VpH2C9EKDf1riP83rYc5dnL.jpg",
    tmdbProviderIds: [11, 201],
  }),
  defineService({
    key: "criterion_channel",
    name: "Criterion Channel",
    logoPath: "/yhrtzYd43pFIhRq0ruO8umJPuyn.jpg",
    tmdbProviderIds: [258],
    aliases: ["The Criterion Channel"],
  }),
  defineService({
    key: "curiosity_stream",
    name: "Curiosity Stream",
    logoPath: "/oR1aNm1Qu9jQBkW4VrGPWhqbC3P.jpg",
    tmdbProviderIds: [190, 603, 2060],
    aliases: ["CuriosityStream"],
  }),
  defineService({
    key: "hallmark_plus",
    name: "Hallmark+",
    logoPath: "/wVxA3Rw87917VEXChiVKZpXUjSm.jpg",
    tmdbProviderIds: [290, 2058, 1746],
    aliases: ["Hallmark Plus", "Hallmark TV", "Hallmark Movies Now"],
  }),
  defineService({
    key: "allblk",
    name: "ALLBLK",
    logoPath: "/4cKdiYEPW1BsWLb9UmNzAyUlD5p.jpg",
    tmdbProviderIds: [251, 2036, 2064],
  }),
  defineService({
    key: "hidive",
    name: "HIDIVE",
    logoPath: "/iCV9oPBeoLDC5okFRZEgQkx7je0.jpg",
    tmdbProviderIds: [430, 2390],
    aliases: ["HiDive"],
  }),
  defineService({
    key: "fox_one",
    name: "FOX One",
    logoPath: "/nDWgrNeNgkmb9ZD6EK5Ot6ohLEm.jpg",
    tmdbProviderIds: [2545, 2554],
  }),
  defineService({
    key: "cinemax",
    name: "Cinemax",
    logoPath: "/ohcwolMl8E743CkS8MnhmJKOlRj.jpg",
    tmdbProviderIds: [289, 2061],
  }),
  defineService({
    key: "youtube_premium",
    name: "YouTube Premium",
    logoPath: "/rMb93u1tBeErSYLv79zSTR07UdO.jpg",
    tmdbProviderIds: [188],
  }),
  // Genuinely free (ad-supported) services. These are the only entries the
  // `free`/`ads` buckets can contribute.
  defineService({
    key: "tubi",
    name: "Tubi",
    logoPath: "/zLYr7OPvpskMA4S79E3vlCi71iC.jpg",
    kind: "free",
    tmdbProviderIds: [73],
    aliases: ["Tubi TV"],
    tint: "#FA382F",
  }),
  defineService({
    key: "pluto_tv",
    name: "Pluto TV",
    logoPath: "/dB8G41Q6tSL5NBisrIeqByfepBc.jpg",
    kind: "free",
    tmdbProviderIds: [300],
    tint: "#FFD400",
  }),
  defineService({
    key: "roku_channel",
    name: "The Roku Channel",
    logoPath: "/wQzSN83BnWVgO7xEh0SeTVqtrFv.jpg",
    kind: "free",
    tmdbProviderIds: [207],
    aliases: ["Roku Channel", "Roku"],
    networkIds: [4692],
    tint: "#6F1AB1",
  }),
  defineService({
    key: "plex",
    name: "Plex",
    logoPath: "/vLZKlXUNDcZR7ilvfY9Wr9k80FZ.jpg",
    kind: "free",
    tmdbProviderIds: [538, 2077],
    aliases: ["Plex Channel"],
  }),
  defineService({
    key: "xumo_play",
    name: "Xumo Play",
    logoPath: "/xfKqqWYYIyvjECOFOaYtJdD7gl3.jpg",
    kind: "free",
    tmdbProviderIds: [1963],
    aliases: ["Xumo"],
  }),
  defineService({
    key: "pbs",
    name: "PBS",
    logoPath: "/iLjStQKQwzyxXJb3jyNpvDmW9mx.jpg",
    kind: "free",
    tmdbProviderIds: [209],
  }),
  defineService({
    key: "crackle",
    name: "Crackle",
    logoPath: null,
    kind: "free",
    aliases: ["Sony Crackle"],
  }),
  defineService({
    key: "fawesome",
    name: "Fawesome",
    logoPath: "/pSUa7lMYLoQAU00ikXoHxmOfTZ9.jpg",
    kind: "free",
    tmdbProviderIds: [2409],
  }),
];

// Free tiers of subscription services that are watchable without the
// subscription, so they count when TMDB lists them under free/ads.
const FREE_TIER_PROVIDER_IDS = new Set<number>([613]);

// Storefronts that resell other services as "channels". Each maps the token
// TMDB uses in the variant name to the host's canonical key.
const CHANNEL_HOST_BY_TOKEN: Record<string, string> = {
  amazon: "prime_video",
  amzon: "prime_video", // TMDB typo ("Outside TV Features Amzon Channel")
  "apple tv": "apple_tv",
  "roku premium": "roku_channel",
  hulu: "hulu",
};
const CHANNEL_SUFFIX_PATTERN = /\s(amazon|amzon|apple tv|roku premium|hulu) channels?$/;
export const STOREFRONT_HOST_KEYS = ["prime_video", "apple_tv", "roku_channel", "hulu"];

// Known channel-variant ids → host, so a renamed variant still resolves.
const CHANNEL_HOST_BY_PROVIDER_ID: Record<number, string> = {
  2243: "prime_video",
  1825: "prime_video",
  583: "prime_video",
  1968: "prime_video",
  582: "prime_video",
  584: "prime_video",
  528: "prime_video",
  1794: "prime_video",
  2553: "prime_video",
  2554: "prime_video",
  197: "prime_video",
  196: "prime_video",
  204: "prime_video",
  205: "prime_video",
  201: "prime_video",
  603: "prime_video",
  290: "prime_video",
  2064: "prime_video",
  2390: "prime_video",
  289: "prime_video",
  1853: "apple_tv",
  1854: "apple_tv",
  1852: "apple_tv",
  1855: "apple_tv",
  2034: "apple_tv",
  2049: "apple_tv",
  2048: "apple_tv",
  2060: "apple_tv",
  2058: "apple_tv",
  2036: "apple_tv",
  2061: "apple_tv",
  635: "roku_channel",
  636: "roku_channel",
  633: "roku_channel",
  634: "roku_channel",
};

// Tier / plan suffixes that never change which service you need.
const TIER_SUFFIXES = [
  "standard with ads",
  "basic with ads",
  "free with ads",
  "with ads",
  "premium plus",
  "premium",
  "essential",
  "no ads",
  "ad free",
  "kids",
  "standard",
  "basic",
];

// Never "where to watch": transactional stores, live-TV bundles (vMVPDs),
// cable on-demand, and broadcast/cable network apps that require a pay-TV
// login. Ids from the US TV provider registry; names cover entries that
// appear under different ids over time.
const EXCLUDED_PROVIDER_IDS = new Set<number>([
  // Stores
  2, 3, 7, 10, 192, 235, 332,
  // Live-TV bundles / aggregators
  257, 2383, 2528, 1809, 2285,
  // Cable on-demand & library-card apps
  486, 191, 212,
  // Broadcast & cable network TV-Everywhere apps
  79, 148, 83, 322, 123, 508, 211, 80, 156, 157, 365, 363, 506, 366, 397, 412,
  406, 408, 411, 399, 403, 413, 422, 507, 318, 1964, 155, 487, 1962, 555, 2129,
  458,
]);
const EXCLUDED_PROVIDER_NAMES = new Set<string>(
  [
    "Amazon Video",
    "Apple TV Store",
    "Google Play Movies",
    "Fandango At Home",
    "Fandango at Home Free",
    "Vudu",
    "YouTube",
    "YouTube Free",
    "Microsoft Store",
    "fuboTV",
    "Philo",
    "YouTube TV",
    "Sling TV",
    "Sling TV Orange",
    "Sling TV Blue",
    "DIRECTV STREAM",
    "JustWatch TV",
    "Spectrum On Demand",
    "Hoopla",
    "Kanopy",
    "NBC",
    "ABC",
    "CBS",
    "FOX",
    "The CW",
    "CW",
    "USA Network",
    "FXNow",
    "FX",
    "DisneyNOW",
    "Freeform",
    "AMC",
    "A&E",
    "Lifetime",
    "Bravo TV",
    "Bravo",
    "TNT",
    "TBS",
    "Food Network",
    "BBC America",
    "TLC",
    "HGTV",
    "Investigation Discovery",
    "Science Channel",
    "Animal Planet",
    "Discovery",
    "Travel Channel",
    "VH1",
    "tru TV",
    "truTV",
    "Adult Swim",
    "National Geographic",
    "History",
    "OXYGEN",
    "FYI Network",
    "The Oprah Winfrey Network",
    "Vice TV",
    "Comedy Central",
    "Syfy",
    "MTV",
    "Nickelodeon",
    "Cartoon Network",
    "Paramount Network",
    "BYUtv",
  ].map(normalizeWatchProviderName),
);
const EXCLUDED_NAME_PATTERNS = [/ on demand$/, /^sling tv/, /^directv/, /^xfinity/, /^spectrum/];

const SERVICE_BY_KEY = new Map(WATCH_SERVICES.map((service) => [service.key, service] as const));
const SERVICE_KEY_BY_ALIAS = new Map<string, string>();
const SERVICE_KEY_BY_PROVIDER_ID = new Map<number, string>();
const SERVICE_KEY_BY_NETWORK_ID = new Map<number, string>();
for (const service of WATCH_SERVICES) {
  for (const alias of service.aliases) {
    if (!SERVICE_KEY_BY_ALIAS.has(alias)) SERVICE_KEY_BY_ALIAS.set(alias, service.key);
  }
  for (const id of service.tmdbProviderIds) SERVICE_KEY_BY_PROVIDER_ID.set(id, service.key);
  for (const id of service.networkIds) SERVICE_KEY_BY_NETWORK_ID.set(id, service.key);
}

export function getWatchService(key: string): WatchService | null {
  return SERVICE_BY_KEY.get(key) ?? null;
}

export function getWatchServiceLogoUrl(key: string, size = "w92"): string | null {
  const service = SERVICE_BY_KEY.get(key);
  return service?.logoPath ? `${TMDB_IMAGE_BASE_URL}/${size}${service.logoPath}` : null;
}

export function getWatchServiceName(key: string): string {
  return SERVICE_BY_KEY.get(key)?.name ?? key;
}

/** TMDB provider ids for `with_watch_providers` discover queries. */
export function getWatchServiceTmdbProviderIds(key: string): number[] {
  return SERVICE_BY_KEY.get(key)?.tmdbProviderIds ?? [];
}

function stripOneTierSuffix(name: string): string | null {
  for (const suffix of TIER_SUFFIXES) {
    if (name.endsWith(` ${suffix}`)) {
      return name.slice(0, -(suffix.length + 1)).trim();
    }
  }
  return null;
}

function lookupServiceKeyByName(normalizedName: string): string | null {
  let candidate: string | null = normalizedName;
  for (let step = 0; candidate && step < 4; step += 1) {
    const hit = SERVICE_KEY_BY_ALIAS.get(candidate);
    if (hit) return hit;
    candidate = stripOneTierSuffix(candidate);
  }
  return null;
}

function slugify(value: string) {
  return normalizeWatchProviderName(value).replace(/\s+/g, "_");
}

const RAW_CHANNEL_SUFFIX_PATTERN = /\s+(amazon|amzon|apple tv|roku premium|hulu)\s+channels?\s*$/i;

// Display name for a service we don't have in the registry: TMDB's own
// casing minus the storefront suffix ("Hallmark+ Amazon Channel" → "Hallmark+").
function displayNameFromTmdbName(raw: string) {
  const stripped = raw.replace(RAW_CHANNEL_SUFFIX_PATTERN, "").trim();
  return stripped.length > 0 ? stripped : raw.trim();
}

type TmdbProviderEntry = {
  id: number | null;
  name: string;
  logoPath: string | null;
  displayPriority: number;
};

type CanonicalProvider = {
  key: string;
  name: string;
  serviceKind: "subscription" | "free";
  /** Storefront host key when this entry is a "<service> <host> Channel" variant. */
  host: string | null;
  freeEligible: boolean;
  known: boolean;
};

function isExcludedProvider(entry: TmdbProviderEntry, normalizedName: string) {
  if (entry.id !== null && EXCLUDED_PROVIDER_IDS.has(entry.id)) return true;
  if (EXCLUDED_PROVIDER_NAMES.has(normalizedName)) return true;
  return EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(normalizedName));
}

/**
 * Map one TMDB provider entry to its canonical service. Returns null for
 * entries that are never "where to watch".
 */
export function canonicalizeTmdbWatchProvider(raw: unknown): CanonicalProvider | null {
  const entry = readProviderEntry(raw);
  if (!entry) return null;
  const normalized = normalizeWatchProviderName(entry.name);
  if (!normalized || isExcludedProvider(entry, normalized)) return null;

  let host: string | null = entry.id !== null ? (CHANNEL_HOST_BY_PROVIDER_ID[entry.id] ?? null) : null;
  let base = normalized;
  // Tier words can trail the channel suffix ("Max Amazon Channel with Ads").
  for (let step = 0; step < 3; step += 1) {
    const channelMatch = base.match(CHANNEL_SUFFIX_PATTERN);
    if (channelMatch) {
      host = host ?? CHANNEL_HOST_BY_TOKEN[channelMatch[1]] ?? null;
      base = base.slice(0, channelMatch.index).trim();
      continue;
    }
    const stripped = SERVICE_KEY_BY_ALIAS.has(base) ? null : stripOneTierSuffix(base);
    if (stripped && CHANNEL_SUFFIX_PATTERN.test(stripped)) {
      base = stripped;
      continue;
    }
    break;
  }

  const keyById = entry.id !== null ? SERVICE_KEY_BY_PROVIDER_ID.get(entry.id) ?? null : null;
  // Direct entries trust the id first (robust to renames); channel variants
  // resolve by the service named in front of the storefront suffix, since a
  // storefront id would otherwise swallow the underlying service.
  const key = host
    ? (lookupServiceKeyByName(base) ?? keyById ?? slugify(base))
    : (keyById ?? lookupServiceKeyByName(base) ?? slugify(base));
  const service = SERVICE_BY_KEY.get(key) ?? null;
  if (!service && !base) return null;
  return {
    key,
    name: service?.name ?? displayNameFromTmdbName(entry.name),
    serviceKind: service?.kind ?? "subscription",
    host: host && host !== key ? host : null,
    freeEligible:
      service?.kind === "free" || (entry.id !== null && FREE_TIER_PROVIDER_IDS.has(entry.id)),
    known: Boolean(service),
  };
}

function readProviderEntry(raw: any): TmdbProviderEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const name = raw.provider_name ?? raw.providerName ?? raw.name ?? raw.displayName;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  const rawId = raw.provider_id ?? raw.providerId ?? raw.id;
  const id = typeof rawId === "number" && Number.isFinite(rawId) ? rawId : null;
  const rawLogo = raw.logo_path ?? raw.logoPath ?? raw.logoUrl;
  const rawPriority = raw.display_priority ?? raw.displayPriority;
  return {
    id,
    name,
    logoPath: typeof rawLogo === "string" && rawLogo.trim().length > 0 ? rawLogo.trim() : null,
    displayPriority:
      typeof rawPriority === "number" && Number.isFinite(rawPriority)
        ? rawPriority
        : UNKNOWN_DISPLAY_PRIORITY,
  };
}

function toLogoUrl(path: string | null, size = "w92") {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

export type TmdbWatchProviderBuckets = {
  flatrate: unknown[];
  free: unknown[];
  ads: unknown[];
};

export function readTmdbWatchProviderBuckets(details: any, region = "US"): TmdbWatchProviderBuckets {
  const results =
    details?.["watch/providers"]?.results ??
    details?.watchProviders?.results ??
    details?.watch_providers?.results ??
    {};
  const regional = results?.[region] ?? null;
  const list = (bucket: string) => (Array.isArray(regional?.[bucket]) ? regional[bucket] : []);
  return { flatrate: list("flatrate"), free: list("free"), ads: list("ads") };
}

export function readTmdbNetworks(details: any): Array<{ id: number | null; name: string }> {
  const networks = Array.isArray(details?.networks) ? details.networks : [];
  return networks
    .map((network: any) => ({
      id: typeof network?.id === "number" ? network.id : null,
      name: typeof network?.name === "string" ? network.name : "",
    }))
    .filter(
      (network: { id: number | null; name: string }) =>
        network.name.length > 0 || network.id !== null,
    );
}

/**
 * The streaming service a show is an original of, from its TMDB networks.
 * Broadcast/cable networks return null — their streaming homes come from
 * the provider data, not from the network.
 */
export function getOriginalWatchServiceKey(
  networks: Array<{ id?: number | null; name?: string | null }> | null | undefined,
): string | null {
  for (const network of networks ?? []) {
    if (typeof network?.id === "number") {
      const byId = SERVICE_KEY_BY_NETWORK_ID.get(network.id);
      if (byId) return byId;
    }
    if (typeof network?.name === "string" && network.name.trim().length > 0) {
      const byName = SERVICE_KEY_BY_ALIAS.get(normalizeWatchProviderName(network.name));
      if (byName) return byName;
    }
  }
  return null;
}

type ProviderGroup = {
  key: string;
  name: string;
  serviceKind: "subscription" | "free";
  directLogoPath: string | null;
  anyLogoPath: string | null;
  displayPriority: number;
  tmdbProviderId: number | null;
  fromSubscriptionBucket: boolean;
};

export type ResolveWatchProvidersOptions = {
  region?: string;
  limit?: number;
};

/**
 * Resolve the minimal, canonical list of services a show can be watched on
 * with that service's own subscription (or for free). Accepts a raw TMDB
 * `/tv/{id}?append_to_response=watch/providers` payload or the slim
 * `{ networks, watchProviders: { results: { US } } }` projection.
 */
export function resolveWatchProviders(
  details: unknown,
  options: ResolveWatchProvidersOptions = {},
): WatchProvider[] {
  const region = options.region ?? "US";
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT);
  const buckets = readTmdbWatchProviderBuckets(details, region);
  const originalKey = getOriginalWatchServiceKey(readTmdbNetworks(details));

  const groups = new Map<string, ProviderGroup>();
  // host key → service keys sold through that storefront (excluding the host itself).
  const channelServicesByHost = new Map<string, Set<string>>();

  const ingest = (raw: unknown, bucket: "flatrate" | "free" | "ads") => {
    const canonical = canonicalizeTmdbWatchProvider(raw);
    if (!canonical) return;
    const entry = readProviderEntry(raw)!;
    if (bucket !== "flatrate" && !canonical.freeEligible) {
      // TMDB lists paid services under `free` when they offer a trial or a
      // free-with-Prime window; that is not "free to watch".
      return;
    }
    if (canonical.host) {
      const sold = channelServicesByHost.get(canonical.host) ?? new Set<string>();
      sold.add(canonical.key);
      channelServicesByHost.set(canonical.host, sold);
    }
    const existing = groups.get(canonical.key);
    const isDirect = !canonical.host;
    if (!existing) {
      groups.set(canonical.key, {
        key: canonical.key,
        name: canonical.name,
        serviceKind: canonical.serviceKind,
        directLogoPath: isDirect ? entry.logoPath : null,
        anyLogoPath: entry.logoPath,
        displayPriority: entry.displayPriority,
        tmdbProviderId: isDirect ? entry.id : null,
        fromSubscriptionBucket: bucket === "flatrate",
      });
      return;
    }
    const isMoreProminent = entry.displayPriority < existing.displayPriority;
    existing.displayPriority = Math.min(existing.displayPriority, entry.displayPriority);
    existing.anyLogoPath = existing.anyLogoPath ?? entry.logoPath;
    if (isDirect && (existing.tmdbProviderId === null || isMoreProminent)) {
      // The base plan carries the lowest display priority; its id and logo
      // represent the service better than an ad tier's.
      existing.tmdbProviderId = entry.id;
      existing.directLogoPath = entry.logoPath ?? existing.directLogoPath;
    }
    existing.fromSubscriptionBucket = existing.fromSubscriptionBucket || bucket === "flatrate";
  };

  for (const raw of buckets.flatrate) ingest(raw, "flatrate");
  for (const raw of buckets.free) ingest(raw, "free");
  for (const raw of buckets.ads) ingest(raw, "ads");

  // Rule 4: a storefront host that is not the original home and is only
  // explained by "<other service> <host> Channel" variants is spurious. This
  // is exactly Ted Lasso: "Amazon Prime Video" appears because the show is
  // sold as the Apple TV+ channel inside Amazon. A host with no channel
  // variants explaining it (Fleabag → Prime Video) stays.
  for (const host of STOREFRONT_HOST_KEYS) {
    if (!groups.has(host) || host === originalKey) continue;
    const sold = channelServicesByHost.get(host);
    if (sold && [...sold].some((key) => key !== host)) {
      groups.delete(host);
    }
  }

  const providers = [...groups.values()].map<WatchProvider>((group) => {
    const service = SERVICE_BY_KEY.get(group.key) ?? null;
    const logoPath = group.directLogoPath ?? service?.logoPath ?? group.anyLogoPath;
    // A subscription service reached only through its free tier (Prime
    // Video's free-with-ads library) is free to watch, not a subscription.
    const source: WatchProviderSource =
      group.key === originalKey
        ? "original"
        : group.serviceKind === "free" || !group.fromSubscriptionBucket
          ? "free"
          : "subscription";
    return {
      key: group.key,
      name: group.name,
      logoUrl: toLogoUrl(logoPath),
      source,
      tmdbProviderId: group.tmdbProviderId,
      displayPriority: group.displayPriority,
    };
  });

  providers.sort((left, right) => {
    const originalDelta = (left.source === "original" ? 0 : 1) - (right.source === "original" ? 0 : 1);
    if (originalDelta !== 0) return originalDelta;
    if (left.displayPriority !== right.displayPriority) {
      return left.displayPriority - right.displayPriority;
    }
    return left.name.localeCompare(right.name);
  });

  return providers.slice(0, limit);
}

/** Sorted canonical keys — for availability snapshots and service matching. */
export function getWatchProviderKeys(
  details: unknown,
  options: ResolveWatchProvidersOptions = {},
): string[] {
  return resolveWatchProviders(details, { limit: 50, ...options })
    .map((provider) => provider.key)
    .sort();
}

/**
 * Normalize any provider token a client or a stored preference might send —
 * a canonical key ("apple_tv"), a display name ("Apple TV+"), a TMDB name
 * ("Apple TV Plus", "HBO Max Amazon Channel") or a loose alias ("prime") —
 * into a canonical key. Unknown tokens return null.
 */
export function normalizeWatchProviderToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  const asKey = trimmed.toLowerCase();
  if (SERVICE_BY_KEY.has(asKey)) return asKey;
  const canonical = canonicalizeTmdbWatchProvider({ provider_name: trimmed });
  return canonical?.known ? canonical.key : null;
}

/** First listed provider — originals first, then the top subscription. */
export function getPrimaryWatchProvider<T extends { name?: string | null; logoUrl?: string | null }>(
  providers: T[] | null | undefined,
): T | null {
  if (!Array.isArray(providers)) return null;
  return (
    providers.find(
      (provider) => typeof provider?.name === "string" && provider.name.trim().length > 0,
    ) ?? null
  );
}

// --- Persisted resolver output ---------------------------------------------
//
// The streaming-arrival cron stores each show's last-seen keys and diffs
// them on the next pass. Output from an older resolver version differs for
// reasons that are not arrivals (v1 dropped Peacock/Paramount+ tiers and
// every storefront channel variant), so the version rides along inside the
// stored array as a marker. A snapshot without the current marker is
// re-baselined silently instead of diffed. Keeping the marker in the array
// avoids a schema migration; it is stripped on read.
const SNAPSHOT_VERSION_MARKER_PREFIX = "resolver:v";
export const WATCH_PROVIDER_SNAPSHOT_MARKER = `${SNAPSHOT_VERSION_MARKER_PREFIX}${WATCH_PROVIDER_RESOLVER_VERSION}`;

export function encodeWatchProviderSnapshot(keys: string[]): string[] {
  return [...keys.filter((key) => !key.startsWith(SNAPSHOT_VERSION_MARKER_PREFIX)), WATCH_PROVIDER_SNAPSHOT_MARKER];
}

export function decodeWatchProviderSnapshot(
  stored: unknown,
): { keys: string[]; isCurrentVersion: boolean } {
  if (!Array.isArray(stored)) return { keys: [], isCurrentVersion: false };
  const entries = stored.filter((entry): entry is string => typeof entry === "string");
  return {
    keys: entries.filter((entry) => !entry.startsWith(SNAPSHOT_VERSION_MARKER_PREFIX)),
    isCurrentVersion: entries.includes(WATCH_PROVIDER_SNAPSHOT_MARKER),
  };
}
