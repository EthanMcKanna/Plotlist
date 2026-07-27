// "Where was I?" catch-up briefs: pure episode-windowing + prompt logic.
// Data access, caching, quota, and the Gemini call live in
// api/_lib/catchup.ts — this module stays unit-testable.
//
// Spoiler safety comes from construction: the prompt only ever contains
// episode data up to the viewer's stop point, and the system prompt forbids
// the model from reaching past it from its own knowledge of the show.

export type CatchupEpisodeInput = {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  // Wikipedia plot summary (api/_lib/wiki-episodes.ts) — much richer than
  // the TMDB teaser overview, so it wins when present.
  wikiSummary?: string | null;
};

export type CatchupShowInput = {
  title: string;
  year: number | null;
  overview: string | null;
};

export type CatchupStopPoint = {
  seasonNumber: number;
  episodeNumber: number;
};

export type CatchupBrief = {
  storySoFar: Array<{ title: string; body: string }>;
  lastTime: string;
  keyPlayers: Array<{ name: string; note: string }>;
  openThreads: string[];
};

// Cache key component — bump when the prompt, schema, or windowing changes
// enough that old cached briefs should regenerate.
// v2: Wikipedia plot summaries as grounding, specificity rules, openThreads.
export const CATCHUP_BRIEF_VERSION = "catchup-v2";

// Episode windows: the closer to the stop point, the more detail the model
// gets. Older seasons collapse to titles so a 150-episode show still fits
// comfortably in one prompt. Wiki summaries carry real plot (not teaser
// copy), so they get a much larger budget than TMDB overviews.
const RECENT_EPISODE_COUNT = 12;
const RECENT_OVERVIEW_CHARS = 500;
const RECENT_WIKI_CHARS = 1300;
const MID_EPISODE_COUNT = 36;
const MID_OVERVIEW_CHARS = 200;
const MID_WIKI_CHARS = 320;

// Episodes that get per-episode detail in the digest (recent + mid tiers) —
// the stretch worth fetching rich wiki summaries for. Older episodes render
// as title lists, where a summary would never be used.
export const CATCHUP_DETAIL_EPISODE_COUNT = RECENT_EPISODE_COUNT + MID_EPISODE_COUNT;

const MAX_STORY_SECTIONS = 3;
const MAX_KEY_PLAYERS = 5;
const MAX_OPEN_THREADS = 4;
const MAX_SECTION_TITLE_CHARS = 60;
const MAX_SECTION_BODY_CHARS = 900;
const MAX_LAST_TIME_CHARS = 900;
const MAX_PLAYER_NAME_CHARS = 60;
const MAX_PLAYER_NOTE_CHARS = 200;
const MAX_THREAD_CHARS = 200;

export function formatEpisodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${seasonNumber}E${episodeNumber}`;
}

export function compareEpisodeOrder(
  a: { seasonNumber: number; episodeNumber: number },
  b: { seasonNumber: number; episodeNumber: number },
) {
  return a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber;
}

// Regular episodes up to and including the stop point, in airing order.
// Specials (season 0) are dropped — they derail recaps more than they help.
export function episodesUpTo(
  episodes: CatchupEpisodeInput[],
  stop: CatchupStopPoint,
): CatchupEpisodeInput[] {
  const seen = new Set<string>();
  return episodes
    .filter((episode) => {
      if (episode.seasonNumber <= 0) return false;
      if (compareEpisodeOrder(episode, stop) > 0) return false;
      const key = formatEpisodeCode(episode.seasonNumber, episode.episodeNumber);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareEpisodeOrder);
}

function truncate(text: string, maxChars: number) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

function episodeLine(
  episode: CatchupEpisodeInput,
  overviewChars: number,
  wikiChars: number,
) {
  const code = formatEpisodeCode(episode.seasonNumber, episode.episodeNumber);
  const summary = episode.wikiSummary
    ? truncate(episode.wikiSummary, wikiChars)
    : episode.overview
      ? truncate(episode.overview, overviewChars)
      : null;
  const bits = [
    episode.name ? `"${truncate(episode.name, 80)}"` : null,
    summary,
  ].filter(Boolean);
  return `- ${code}${bits.length ? `: ${bits.join(" — ")}` : ""}`;
}

// Three-tier episode digest: recent episodes verbatim, the stretch before
// them condensed, everything older as season title lists.
export function buildEpisodeDigest(episodes: CatchupEpisodeInput[]) {
  const recent = episodes.slice(-RECENT_EPISODE_COUNT);
  const mid = episodes.slice(-(RECENT_EPISODE_COUNT + MID_EPISODE_COUNT), -RECENT_EPISODE_COUNT);
  const older = episodes.slice(0, Math.max(0, episodes.length - RECENT_EPISODE_COUNT - MID_EPISODE_COUNT));

  const sections: string[] = [];
  if (older.length > 0) {
    const bySeason = new Map<number, string[]>();
    for (const episode of older) {
      const titles = bySeason.get(episode.seasonNumber) ?? [];
      titles.push(episode.name ? truncate(episode.name, 60) : formatEpisodeCode(episode.seasonNumber, episode.episodeNumber));
      bySeason.set(episode.seasonNumber, titles);
    }
    const seasonLines = [...bySeason.entries()].map(
      ([seasonNumber, titles]) => `- Season ${seasonNumber} episode titles: ${titles.join("; ")}`,
    );
    sections.push(`Earlier episodes (titles only):\n${seasonLines.join("\n")}`);
  }
  if (mid.length > 0) {
    sections.push(
      `Episodes before the most recent stretch:\n${mid
        .map((episode) => episodeLine(episode, MID_OVERVIEW_CHARS, MID_WIKI_CHARS))
        .join("\n")}`,
    );
  }
  if (recent.length > 0) {
    sections.push(
      `Most recent episodes the viewer watched (closest to where they stopped):\n${recent
        .map((episode) => episodeLine(episode, RECENT_OVERVIEW_CHARS, RECENT_WIKI_CHARS))
        .join("\n")}`,
    );
  }
  return sections.join("\n\n");
}

export function buildCatchupPrompt({
  show,
  episodes,
  stop,
}: {
  show: CatchupShowInput;
  episodes: CatchupEpisodeInput[];
  stop: CatchupStopPoint;
}): { system: string; user: string; schema: object; maxOutputTokens: number } {
  const stopCode = formatEpisodeCode(stop.seasonNumber, stop.episodeNumber);
  const shortRun = episodes.length <= 4;
  return {
    system: [
      `You write "previously on" catch-up briefs for TV viewers returning to a show after a long break.`,
      `The viewer has watched up to and including ${stopCode} and remembers little. Refresh them so ${stopCode}'s ending feels vivid again.`,
      `HARD SPOILER RULES:`,
      `- The provided episode information ends exactly at ${stopCode}. Never mention, hint at, or foreshadow ANYTHING that happens after ${stopCode}, even if you know this show well. No "little do they know", no teases about what's coming.`,
      `- Every EVENT you describe must come from the provided episode information. Do not add events from your own memory of the show — your memory may include things past the stop point.`,
      `- You MAY use your knowledge of this show to enrich what the provided episodes already mention: full character names, who is related to whom, what a place or organization is. None of that enrichment may reveal anything past ${stopCode}; when unsure whether a detail belongs before or after ${stopCode}, leave it out.`,
      `BE SPECIFIC:`,
      `- Name names. Ground every sentence in concrete characters, events, and consequences from the provided episodes — what happened, who did it, and where it left them.`,
      `- Banned: filler that could describe any show — "tensions rise", "faces new challenges", "secrets come to light", "loyalties are tested", "things will never be the same", "shocking revelations". If a sentence has no specifics, rewrite it with specifics or cut it.`,
      `Write in second person ("you last saw…"), warm and efficient, like a friend who watched it with you.`,
      `storySoFar: ${shortRun ? "one short section" : "2-3 titled sections"} tracing the arc from the beginning up to (but not repeating) the most recent episodes. Titles are short and evocative, never spoiler-y on their own.`,
      `lastTime: 2-4 sentences on exactly where things stood at the end of ${stopCode} — the concrete final-scene situation, including any cliffhanger, that the viewer will pick up from.`,
      `keyPlayers: up to ${MAX_KEY_PLAYERS} characters with a one-line "where they stand now" note, as of ${stopCode}. Only characters named in the provided episode data, using their actual names.`,
      `openThreads: 2-${MAX_OPEN_THREADS} short unresolved questions the viewer should have in mind going into the next episode — each anchored to a specific event or character from the provided episodes, never a tease about what's coming.`,
    ].join("\n"),
    user: [
      `Show: ${show.title}${show.year ? ` (${show.year})` : ""}`,
      show.overview ? `Premise: ${truncate(show.overview, 500)}` : null,
      `The viewer stopped after ${stopCode}.`,
      buildEpisodeDigest(episodes),
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: {
      type: "OBJECT",
      properties: {
        storySoFar: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              body: { type: "STRING" },
            },
            required: ["title", "body"],
          },
        },
        lastTime: { type: "STRING" },
        keyPlayers: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              note: { type: "STRING" },
            },
            required: ["name", "note"],
          },
        },
        openThreads: {
          type: "ARRAY",
          items: { type: "STRING" },
        },
      },
      required: ["storySoFar", "lastTime"],
    },
    // gemini-3.5-flash spends ~2k "thinking" tokens before emitting JSON and
    // they count against this cap — 2048 truncated briefs mid-string.
    maxOutputTokens: 8192,
  };
}

// Clamp a raw model response into a renderable brief; null when unusable.
export function sanitizeCatchupBrief(raw: unknown): CatchupBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const storySoFar = (Array.isArray(value.storySoFar) ? value.storySoFar : [])
    .map((section) => {
      if (!section || typeof section !== "object") return null;
      const title = typeof (section as any).title === "string" ? (section as any).title.trim() : "";
      const body = typeof (section as any).body === "string" ? (section as any).body.trim() : "";
      if (!body) return null;
      return {
        title: truncate(title || "The story so far", MAX_SECTION_TITLE_CHARS),
        body: truncate(body, MAX_SECTION_BODY_CHARS),
      };
    })
    .filter((section): section is { title: string; body: string } => section !== null)
    .slice(0, MAX_STORY_SECTIONS);

  const lastTime =
    typeof value.lastTime === "string" && value.lastTime.trim().length > 0
      ? truncate(value.lastTime, MAX_LAST_TIME_CHARS)
      : "";

  const keyPlayers = (Array.isArray(value.keyPlayers) ? value.keyPlayers : [])
    .map((player) => {
      if (!player || typeof player !== "object") return null;
      const name = typeof (player as any).name === "string" ? (player as any).name.trim() : "";
      const note = typeof (player as any).note === "string" ? (player as any).note.trim() : "";
      if (!name || !note) return null;
      return {
        name: truncate(name, MAX_PLAYER_NAME_CHARS),
        note: truncate(note, MAX_PLAYER_NOTE_CHARS),
      };
    })
    .filter((player): player is { name: string; note: string } => player !== null)
    .slice(0, MAX_KEY_PLAYERS);

  const openThreads = (Array.isArray(value.openThreads) ? value.openThreads : [])
    .map((thread) => (typeof thread === "string" ? thread.trim() : ""))
    .filter((thread) => thread.length > 0)
    .map((thread) => truncate(thread, MAX_THREAD_CHARS))
    .slice(0, MAX_OPEN_THREADS);

  if (storySoFar.length === 0 && !lastTime) return null;
  return { storySoFar, lastTime, keyPlayers, openThreads };
}
