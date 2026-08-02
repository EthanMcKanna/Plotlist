export type TmdbImageSize =
  | "w92"
  | "w154"
  | "w185"
  | "w300"
  | "w342"
  | "w500"
  | "w780"
  | "w1280"
  | "original";

const TMDB_IMAGE_SIZE_RE = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)[^/]+\//;

// The server emits w500 posters (and w780 stills) uniformly; small list
// thumbnails should downshift so a fast scroll decodes ~7x fewer pixels.
// Non-TMDB URLs pass through untouched.
export function resizeTmdbImageUrl<T extends string | null | undefined>(
  url: T,
  size: TmdbImageSize,
): T {
  if (!url) return url;
  return url.replace(TMDB_IMAGE_SIZE_RE, `$1${size}/`) as T;
}
