export type HomeDisplayMetaItem = {
  genreLabel?: string | null;
  year?: number | null;
  signal?: string | null;
};

type HomeDisplayMetaOptions = {
  includeSignal?: boolean;
  maxLabels?: number;
  compactSignal?: boolean;
};

const MONTH_DAY_PATTERN =
  /^(?<prefix>.+?)\s+(?<date>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(?<day>\d{1,2})$/i;

export function formatHomeDatedSignalLabel(label: string) {
  const normalized = label.replace(/\s+/g, " ").trim();
  const match = normalized.match(MONTH_DAY_PATTERN);
  if (!match?.groups) return normalized;

  const prefix = match.groups.prefix.trim();
  const date = `${match.groups.date} ${match.groups.day}`;
  if (!prefix || prefix.endsWith("·")) return normalized;
  return `${prefix} · ${date}`;
}

function formatSignalLabel(label: string, options: HomeDisplayMetaOptions) {
  if (!options.compactSignal) return label;
  return formatHomeDatedSignalLabel(label)
    .replace(/^JustWatch\s+chart\s+#(\d+)$/i, "JustWatch #$1")
    .replace(/^Chart mover$/i, "Rising")
    .replace(/\s+TMDB$/i, "")
    .replace(/\b(S\d+)\s+airing\s+now\b/i, "$1 now");
}

function normalizeMetaKey(label: string | null | undefined) {
  return label?.trim().toLowerCase() || null;
}

export function getHomeDisplayMetaLabels(
  item: HomeDisplayMetaItem,
  options: HomeDisplayMetaOptions = {},
) {
  const includeSignal = options.includeSignal ?? true;
  const maxLabels = options.maxLabels ?? 3;
  const genreLabel = item.genreLabel?.trim() || null;
  const yearLabel = item.year ? String(item.year) : null;
  const rawSignal = includeSignal ? item.signal?.trim() : null;
  const signalLabel = rawSignal ? formatSignalLabel(rawSignal, options) : null;
  const signalKey = normalizeMetaKey(signalLabel);
  const signalAddsContext = Boolean(
    signalKey &&
      signalKey !== normalizeMetaKey(genreLabel) &&
      signalKey !== normalizeMetaKey(yearLabel),
  );
  const yearFitsCompactLine = !options.compactSignal || !signalAddsContext;
  const labels = [
    genreLabel,
    yearFitsCompactLine ? yearLabel : null,
    signalLabel,
  ].flatMap((label) => {
    return label ? [label] : [];
  });

  const seen = new Set<string>();
  return labels
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxLabels);
}

export function getHomeDisplayMetaLine(
  item: HomeDisplayMetaItem,
  options?: HomeDisplayMetaOptions,
) {
  return getHomeDisplayMetaLabels(item, options).join(" · ");
}
