// Wikipedia episode-summary parsing for catch-up briefs: pure wikitext →
// per-season episode plot summaries. Fetching, page resolution, and the D1
// cache live in api/_lib/wiki-episodes.ts — this module stays unit-testable.
//
// Wikipedia's {{Episode list}} ShortSummary fields are the richest freely
// available per-episode plot text (real character names, actual events,
// endings included) — far beyond TMDB's teaser blurbs. Layouts vary:
// summaries live inline on "List of X episodes" pages, on the show's main
// article, or on per-season pages transcluded via {{:X season N}}.

export type WikiEpisodeEntry = {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  summary: string;
};

export type WikiSeasonEpisodes = Map<
  number,
  Map<number, { title: string | null; summary: string }>
>;

// Summaries shorter than this are teaser-grade and not worth preferring
// over the TMDB overview.
const MIN_SUMMARY_CHARS = 60;
// Cap stored summaries; prompt-time truncation trims further.
const MAX_SUMMARY_CHARS = 2400;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

// ── Wikitext cleanup ────────────────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&thinsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
};

// Reduce a wikitext fragment to plain prose: refs, comments, templates, and
// markup out; link display text kept.
export function cleanWikitext(raw: string): string {
  let text = raw;
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<ref[^>/]*\/>/gi, "");
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  // Common inline templates that carry meaning.
  text = text.replace(/\{\{\s*(?:nbsp|spaces|thinsp)\s*\}\}/gi, " ");
  text = text.replace(/\{\{\s*'\s*\}\}/g, "'");
  text = text.replace(/\{\{\s*(?:ndash|snd|spnd|spaced en dash)\s*\}\}/gi, " – ");
  // Remaining templates dropped innermost-first so nesting unwinds.
  for (let pass = 0; pass < 8 && text.includes("{{"); pass += 1) {
    const next = text.replace(/\{\{[^{}]*\}\}/g, "");
    if (next === text) break;
    text = next;
  }
  // Media links vanish entirely; regular links keep their display text.
  text = text.replace(/\[\[(?:File|Image):[^[\]]*(?:\[\[[^[\]]*\]\][^[\]]*)*\]\]/gi, "");
  text = text.replace(/\[\[[^[\]|]*\|([^[\]]*)\]\]/g, "$1");
  text = text.replace(/\[\[([^[\]]*)\]\]/g, "$1");
  text = text.replace(/'{2,5}/g, "");
  text = text.replace(/<br\s*\/?\s*>/gi, " ");
  text = text.replace(/<[^>]+>/g, "");
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

// ── Template extraction ─────────────────────────────────────────────────────

// All balanced {{Episode list …}} / {{Episode list/sublist|…}} template
// sources with their position in the page.
export function extractEpisodeListTemplates(
  wikitext: string,
): Array<{ index: number; body: string }> {
  const results: Array<{ index: number; body: string }> = [];
  const pattern = /\{\{\s*Episode list(?:\/sublist)?\s*[|}]/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(wikitext)) !== null) {
    const start = match.index;
    let depth = 0;
    let end = -1;
    for (let i = start; i < wikitext.length - 1; i += 1) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
        depth += 1;
        i += 1;
      } else if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
        depth -= 1;
        i += 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) break;
    results.push({ index: start, body: wikitext.slice(start + 2, end - 2) });
    pattern.lastIndex = end;
  }
  return results;
}

// Named params of a template body, splitting on top-level pipes only —
// nested templates ({{Start date|…}}) and links ([[a|b]]) keep their pipes.
export function parseTemplateParams(body: string): Map<string, string> {
  const segments: string[] = [];
  let depthBraces = 0;
  let depthBrackets = 0;
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const pair = body.slice(i, i + 2);
    if (pair === "{{") {
      depthBraces += 1;
      current += pair;
      i += 1;
    } else if (pair === "}}") {
      depthBraces = Math.max(0, depthBraces - 1);
      current += pair;
      i += 1;
    } else if (pair === "[[") {
      depthBrackets += 1;
      current += pair;
      i += 1;
    } else if (pair === "]]") {
      depthBrackets = Math.max(0, depthBrackets - 1);
      current += pair;
      i += 1;
    } else if (body[i] === "|" && depthBraces === 0 && depthBrackets === 0) {
      segments.push(current);
      current = "";
    } else {
      current += body[i];
    }
  }
  segments.push(current);

  const params = new Map<string, string>();
  // segments[0] is the template name; positional params are ignored.
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const name = segment.slice(0, eq).trim();
    if (!/^[A-Za-z][A-Za-z0-9_ ]*$/.test(name)) continue;
    params.set(name.toLowerCase(), segment.slice(eq + 1).trim());
  }
  return params;
}

function firstInteger(value: string | undefined): number | null {
  if (!value) return null;
  const match = cleanWikitext(value).match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ── Section headings → season attribution ───────────────────────────────────

type HeadingMark = { index: number; level: number; season: number | "reset" | null };

// "Season 3 (2010)" → 3; "Book One" → 1; specials/films/webisodes → "reset"
// (episode entries under them are not regular-season episodes); anything
// else (e.g. "Episodes", "Cast") is transparent.
export function seasonFromHeading(text: string): number | "reset" | null {
  const cleaned = cleanWikitext(text);
  const seasonMatch = cleaned.match(
    /^(?:Season|Series|Part|Book|Volume|Chapter)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
  );
  if (seasonMatch) {
    const token = seasonMatch[1].toLowerCase();
    return NUMBER_WORDS[token] ?? Number.parseInt(token, 10);
  }
  if (/special|film|movie|minisode|webisode|web episode|short|original video|other media/i.test(cleaned)) {
    return "reset";
  }
  return null;
}

function collectHeadings(wikitext: string): HeadingMark[] {
  const marks: HeadingMark[] = [];
  const pattern = /^(={2,5})\s*(.+?)\s*\1\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(wikitext)) !== null) {
    marks.push({
      index: match.index,
      level: match[1].length,
      season: seasonFromHeading(match[2]),
    });
  }
  return marks;
}

// ── Page parsing ────────────────────────────────────────────────────────────

// Parse every episode entry on a page. Season attribution walks the section
// hierarchy the entry sits in: the deepest enclosing season heading wins,
// but ANY enclosing "reset" heading (specials, films, minisodes, other
// media…) drops the entry — a "Season 1 (2009)" of webisodes nested under
// "Other media" must not masquerade as the real season 1. With no season
// headings at all, `defaultSeason` applies (season pages pass the season
// from the page title).
export function parseWikiEpisodePage(
  wikitext: string,
  options: { defaultSeason?: number | null } = {},
): WikiEpisodeEntry[] {
  const headings = collectHeadings(wikitext);
  const entries: WikiEpisodeEntry[] = [];
  // Active section chain, outermost first, replayed in document order.
  const stack: HeadingMark[] = [];
  let headingCursor = 0;

  for (const template of extractEpisodeListTemplates(wikitext)) {
    while (headingCursor < headings.length && headings[headingCursor].index < template.index) {
      const heading = headings[headingCursor];
      while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
        stack.pop();
      }
      stack.push(heading);
      headingCursor += 1;
    }

    let season: number | null = options.defaultSeason ?? null;
    let inResetSection = false;
    for (const heading of stack) {
      if (heading.season === "reset") inResetSection = true;
      else if (typeof heading.season === "number") season = heading.season;
    }
    if (inResetSection || season === null || season <= 0) continue;

    const params = parseTemplateParams(template.body);
    const episodeNumber =
      firstInteger(params.get("episodenumber2")) ?? firstInteger(params.get("episodenumber"));
    if (episodeNumber === null) continue;

    const rawSummary = params.get("shortsummary");
    if (!rawSummary) continue;
    const summary = cleanWikitext(rawSummary);
    if (summary.length < MIN_SUMMARY_CHARS) continue;

    const rawTitle = params.get("title");
    const title = rawTitle ? cleanWikitext(rawTitle) || null : null;

    entries.push({
      seasonNumber: season,
      episodeNumber,
      title,
      summary:
        summary.length > MAX_SUMMARY_CHARS
          ? `${summary.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`
          : summary,
    });
  }
  return entries;
}

// {{:Page name}} transclusions — how "List of X episodes" pulls in
// per-season pages that hold the actual summaries.
export function extractTransclusions(wikitext: string): string[] {
  const pages: string[] = [];
  const pattern = /\{\{:\s*([^{}|]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(wikitext)) !== null) {
    pages.push(match[1]);
  }
  return [...new Set(pages)];
}

// "Breaking Bad season 1" / "The Office (American season 1)" → 1.
export function seasonFromPageTitle(pageTitle: string): number | null {
  const match = pageTitle.match(/\bseason\s+(\d+)\s*\)?\s*$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ── Assembly + validation ───────────────────────────────────────────────────

// Entries → per-season maps. A season where two entries claim the same
// episode number with different titles is ambiguous (usually mis-attributed
// extras) and is dropped wholesale.
export function groupEntriesBySeason(entries: WikiEpisodeEntry[]): WikiSeasonEpisodes {
  const bySeason: WikiSeasonEpisodes = new Map();
  const ambiguous = new Set<number>();
  for (const entry of entries) {
    const season = bySeason.get(entry.seasonNumber) ?? new Map();
    const existing = season.get(entry.episodeNumber);
    if (existing && existing.title !== entry.title) {
      ambiguous.add(entry.seasonNumber);
      continue;
    }
    season.set(entry.episodeNumber, { title: entry.title, summary: entry.summary });
    bySeason.set(entry.seasonNumber, season);
  }
  for (const season of ambiguous) {
    bySeason.delete(season);
  }
  return bySeason;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // "Part 1"-style suffixes: containment counts when both are substantial.
  return (
    left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))
  );
}

// Guard against wrong-page data (disambiguation collisions, minisodes
// mis-attributed to a real season): a season's wiki entries only survive if
// their titles line up with the TMDB episode names for that season.
export function validateSeasonAgainstTmdb(
  wikiEpisodes: Map<number, { title: string | null; summary: string }>,
  tmdbNamesByEpisode: Map<number, string | null>,
): boolean {
  let comparable = 0;
  let matches = 0;
  for (const [episodeNumber, entry] of wikiEpisodes) {
    const tmdbName = tmdbNamesByEpisode.get(episodeNumber);
    if (!entry.title || !tmdbName) continue;
    comparable += 1;
    if (titlesMatch(entry.title, tmdbName)) matches += 1;
  }
  if (comparable === 0) return false;
  return matches >= 3 || matches / comparable >= 0.5;
}
