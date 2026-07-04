// Canonical registry of the streaming services Plotlist knows about, plus
// pure helpers for the "my streaming services" preference. The keys match
// the TMDB watch-provider categories used by the home catalog and the
// release calendar.

const TMDB_LOGO = (path: string) => `https://image.tmdb.org/t/p/w92${path}`;

export type StreamingProviderOption = {
  key: string;
  label: string;
  logoUrl: string;
  tint: string;
};

export const STREAMING_PROVIDER_OPTIONS: StreamingProviderOption[] = [
  { key: "netflix", label: "Netflix", logoUrl: TMDB_LOGO("/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"), tint: "#E50914" },
  { key: "apple_tv", label: "Apple TV+", logoUrl: TMDB_LOGO("/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg"), tint: "#A8A8A8" },
  { key: "max", label: "Max", logoUrl: TMDB_LOGO("/jbe4gVSfRlbPTdESXhEKpornsfu.jpg"), tint: "#7B2CBF" },
  { key: "disney_plus", label: "Disney+", logoUrl: TMDB_LOGO("/97yvRBw1GzX7fXprcF80er19ot.jpg"), tint: "#1F80E0" },
  { key: "hulu", label: "Hulu", logoUrl: TMDB_LOGO("/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg"), tint: "#1CE783" },
  { key: "peacock", label: "Peacock", logoUrl: TMDB_LOGO("/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg"), tint: "#8AC926" },
  { key: "prime_video", label: "Prime Video", logoUrl: TMDB_LOGO("/pvske1MyAoymrs5bguRfVqYiM9a.jpg"), tint: "#00A8E1" },
  { key: "paramount_plus", label: "Paramount+", logoUrl: TMDB_LOGO("/fts6X10Jn4QT0X6ac3udKEn2tJA.jpg"), tint: "#0064FF" },
  { key: "mgm_plus", label: "MGM+", logoUrl: TMDB_LOGO("/ctiRpS16dlaTXQBSsiFncMrgWmh.jpg"), tint: "#D6B35A" },
];

export const STREAMING_PROVIDER_KEYS = STREAMING_PROVIDER_OPTIONS.map(
  (option) => option.key,
);

const VALID_KEYS = new Set(STREAMING_PROVIDER_KEYS);

/** Sanitize a stored preference value into known, deduped provider keys. */
export function normalizeStreamingProviderKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && VALID_KEYS.has(entry)) {
      seen.add(entry);
    }
  }
  // Preserve registry order so downstream surfaces render consistently.
  return STREAMING_PROVIDER_KEYS.filter((key) => seen.has(key));
}

/**
 * Filter provider-keyed sections (home streaming rooms, search provider
 * rails) down to the user's services. No selection — or a selection that
 * matches nothing — leaves the surface untouched rather than emptying it.
 */
export function filterSectionsToStreamingProviders<T extends { key: string }>(
  sections: T[],
  selectedKeys: string[] | null | undefined,
): T[] {
  const selected = normalizeStreamingProviderKeys(selectedKeys);
  if (selected.length === 0) return sections;
  const wanted = new Set(selected);
  const filtered = sections.filter((section) => wanted.has(section.key));
  return filtered.length > 0 ? filtered : sections;
}

/**
 * Build the set of TMDB external ids known to stream on the user's services,
 * from the per-provider home catalog lists.
 */
export function buildStreamingAvailabilityIndex(
  providerCatalogs:
    | Partial<Record<string, Array<{ externalSource?: string | null; externalId?: string | null }>>>
    | null
    | undefined,
  selectedKeys: string[] | null | undefined,
): Set<string> {
  const index = new Set<string>();
  const selected = normalizeStreamingProviderKeys(selectedKeys);
  if (!providerCatalogs || selected.length === 0) return index;
  for (const key of selected) {
    for (const item of providerCatalogs[key] ?? []) {
      if ((item.externalSource ?? "tmdb") === "tmdb" && item.externalId) {
        index.add(String(item.externalId));
      }
    }
  }
  return index;
}

/**
 * Lean a rail toward the user's services: items known to be streamable on
 * them float to the front, everything else keeps its relative order. With no
 * availability data this is a no-op.
 */
export function leanItemsToStreamingAvailability<T>(
  items: T[],
  availability: Set<string>,
  getExternalId: (item: T) => string | null | undefined,
): T[] {
  if (availability.size === 0) return items;
  const available: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const externalId = getExternalId(item);
    (externalId && availability.has(String(externalId)) ? available : rest).push(item);
  }
  return available.length > 0 ? [...available, ...rest] : items;
}
