// Ask Plotlist pure logic: chip → constraint mapping, candidate post-filters,
// refinement chips, and the two LLM prompt builders. No DB or network imports
// so all of it is unit-testable (jest runs with no DB — repo convention).
// Orchestration lives in api/_lib/ask-plotlist.ts.

export type AskConstraints = {
  maxEpisodeMinutes?: number | null;
  finishedOnly?: boolean;
  airingOnly?: boolean;
  yearMin?: number | null;
  yearMax?: number | null;
  excludeTerms?: string[];
  onMyServices?: boolean;
  moods?: string[];
  semanticQuery: string;
};

export type AskTimeChipId = "quick" | "full" | "binge";
export type AskMoodChipId =
  | "cozy"
  | "funny"
  | "tense"
  | "mind_bending"
  | "background"
  | "surprise";

export type AskChips = {
  time?: AskTimeChipId | null;
  mood?: AskMoodChipId | null;
  onMyServices?: boolean;
};

export const ASK_TIME_CHIPS: Array<{
  id: AskTimeChipId;
  label: string;
  semanticText: string;
  maxEpisodeMinutes: number | null;
  finishedOnly: boolean;
}> = [
  {
    id: "quick",
    label: "Quick episode",
    semanticText: "short episodes that are easy to fit in",
    maxEpisodeMinutes: 35,
    finishedOnly: false,
  },
  {
    id: "full",
    label: "A full episode",
    semanticText: "a satisfying full-length episode",
    maxEpisodeMinutes: null,
    finishedOnly: false,
  },
  {
    id: "binge",
    label: "Binge night",
    semanticText: "a bingeable series worth settling into for the night",
    maxEpisodeMinutes: null,
    // Binge night prefers shows you can actually finish.
    finishedOnly: true,
  },
];

export const ASK_MOOD_CHIPS: Array<{
  id: AskMoodChipId;
  label: string;
  semanticText: string;
}> = [
  { id: "cozy", label: "Cozy", semanticText: "cozy, gentle, comforting, low-stakes" },
  { id: "funny", label: "Funny", semanticText: "funny, witty comedy that makes you laugh" },
  { id: "tense", label: "Tense", semanticText: "tense, gripping, edge-of-your-seat thriller energy" },
  {
    id: "mind_bending",
    label: "Mind-bending",
    semanticText: "mind-bending, twisty, cerebral, makes you think",
  },
  {
    id: "background",
    label: "Background",
    semanticText: "easy background watching that doesn't demand full attention",
  },
  { id: "surprise", label: "Surprise me", semanticText: "" },
];

const TIME_CHIP_BY_ID = new Map(ASK_TIME_CHIPS.map((chip) => [chip.id, chip]));
const MOOD_CHIP_BY_ID = new Map(ASK_MOOD_CHIPS.map((chip) => [chip.id, chip]));

// Tonight mode composes an embedding query and structured constraints from
// the chips alone — no LLM parse needed for this fast path. Free text rides
// along and (server-side) additionally goes through the parse prompt.
export function buildAskQueryFromChips({
  time,
  mood,
  freeText,
  onMyServices,
}: {
  time?: AskTimeChipId | null;
  mood?: AskMoodChipId | null;
  freeText?: string | null;
  onMyServices?: boolean;
}): { semanticText: string; constraints: AskConstraints } {
  const timeChip = time ? TIME_CHIP_BY_ID.get(time) : undefined;
  const moodChip = mood ? MOOD_CHIP_BY_ID.get(mood) : undefined;
  const trimmedText = freeText?.trim() ?? "";

  const pieces: string[] = [];
  if (trimmedText) pieces.push(trimmedText);
  if (moodChip?.semanticText) pieces.push(moodChip.semanticText);
  if (timeChip?.semanticText) pieces.push(timeChip.semanticText);
  const semanticText =
    pieces.join(". ") || "a great TV show worth watching tonight";

  const constraints: AskConstraints = {
    semanticQuery: semanticText,
    maxEpisodeMinutes: timeChip?.maxEpisodeMinutes ?? null,
    finishedOnly: timeChip?.finishedOnly ?? false,
    onMyServices: onMyServices === true,
    moods: moodChip && moodChip.id !== "surprise" ? [moodChip.id] : [],
  };
  return { semanticText, constraints };
}

// Merge LLM-parsed constraints from free text into the chip-derived ones.
// Chips are explicit UI choices, so they win over inferred values; parsed
// fields only fill gaps the chips left open.
export function mergeParsedConstraints(
  base: AskConstraints,
  parsed: Partial<AskConstraints> | null | undefined,
): AskConstraints {
  if (!parsed) return base;
  return {
    semanticQuery:
      typeof parsed.semanticQuery === "string" && parsed.semanticQuery.trim()
        ? parsed.semanticQuery.trim()
        : base.semanticQuery,
    maxEpisodeMinutes: base.maxEpisodeMinutes ?? parsed.maxEpisodeMinutes ?? null,
    finishedOnly: base.finishedOnly || parsed.finishedOnly === true,
    airingOnly: base.airingOnly || parsed.airingOnly === true,
    yearMin: base.yearMin ?? parsed.yearMin ?? null,
    yearMax: base.yearMax ?? parsed.yearMax ?? null,
    excludeTerms: [
      ...(base.excludeTerms ?? []),
      ...(parsed.excludeTerms ?? []).filter(
        (term) => typeof term === "string" && term.trim().length > 0,
      ),
    ],
    onMyServices: base.onMyServices || parsed.onMyServices === true,
    moods: [...new Set([...(base.moods ?? []), ...(parsed.moods ?? [])])],
  };
}

export type AskCandidate = {
  showId: string;
  year?: number | null;
  episodeRunTimeMinutes?: number | null;
  status?: string | null;
  providerKeys?: string[] | null;
  onWatchlist: boolean;
  // Title + overview text for excludeTerms matching; optional because rows
  // outside the detail-loaded top slice don't carry it.
  text?: string | null;
};

const FINISHED_STATUSES = new Set(["Ended", "Canceled"]);
// Runtimes wobble a few minutes around the chip's nominal cap ("under 30"
// shows often report 32), so the filter allows a small grace margin.
const RUNTIME_GRACE_MINUTES = 5;

// Post-retrieval constraint filter. Unknown metadata PASSES every filter
// except onMyServices, which requires a known provider match — "only my
// services" is a promise to the user, not a preference.
export function applyConstraintFilters(
  candidates: AskCandidate[],
  constraints: AskConstraints,
  userProviderKeys?: string[] | null,
): AskCandidate[] {
  const services = new Set(userProviderKeys ?? []);
  const excludeTerms = (constraints.excludeTerms ?? [])
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

  return candidates.filter((candidate) => {
    if (
      constraints.maxEpisodeMinutes != null &&
      candidate.episodeRunTimeMinutes != null &&
      candidate.episodeRunTimeMinutes >
        constraints.maxEpisodeMinutes + RUNTIME_GRACE_MINUTES
    ) {
      return false;
    }
    if (constraints.finishedOnly && candidate.status != null) {
      if (!FINISHED_STATUSES.has(candidate.status)) return false;
    }
    if (constraints.airingOnly && candidate.status != null) {
      if (FINISHED_STATUSES.has(candidate.status)) return false;
    }
    if (constraints.yearMin != null && candidate.year != null) {
      if (candidate.year < constraints.yearMin) return false;
    }
    if (constraints.yearMax != null && candidate.year != null) {
      if (candidate.year > constraints.yearMax) return false;
    }
    if (excludeTerms.length > 0 && candidate.text) {
      const haystack = candidate.text.toLowerCase();
      if (excludeTerms.some((term) => haystack.includes(term))) return false;
    }
    if (constraints.onMyServices) {
      const keys = candidate.providerKeys ?? [];
      if (!keys.some((key) => services.has(key))) return false;
    }
    return true;
  });
}

// Refinement chips shown under results. Tapping one re-asks within the same
// session: the chip's text is appended to the semantic query, and any
// structured tweak in `adjust` is applied to the constraints.
export const REFINEMENT_CHIPS: Record<
  string,
  {
    label: string;
    text: string;
    adjust?: (constraints: AskConstraints, nowYear: number) => AskConstraints;
  }
> = {
  funnier: { label: "Funnier", text: "lighter and funnier than the previous picks" },
  darker: { label: "Darker", text: "darker and more intense than the previous picks" },
  cozier: { label: "Cozier", text: "cozier, gentler, and more comforting than the previous picks" },
  shorter: {
    label: "Shorter",
    text: "with shorter episodes",
    adjust: (constraints) => ({ ...constraints, maxEpisodeMinutes: 35 }),
  },
  newer: {
    label: "Newer",
    text: "more recent shows",
    adjust: (constraints, nowYear) => ({ ...constraints, yearMin: nowYear - 5 }),
  },
  older: {
    label: "Older",
    text: "older shows, classics included",
    adjust: (constraints, nowYear) => ({ ...constraints, yearMax: nowYear - 10 }),
  },
  more_like_1: { label: "More like #1", text: "more shows like {firstPick}" },
};

export const REFINEMENT_CHIP_ORDER = [
  "funnier",
  "darker",
  "cozier",
  "shorter",
  "newer",
  "older",
  "more_like_1",
] as const;

// Appends a refinement chip's text to the constraints' semantic query and
// applies its structured adjustment. `firstPickTitle` fills the {firstPick}
// slot for "More like #1"; without it the chip degrades to a no-op append.
export function applyRefinement(
  constraints: AskConstraints,
  refinementId: string,
  options: { firstPickTitle?: string | null; nowYear?: number } = {},
): AskConstraints {
  const chip = REFINEMENT_CHIPS[refinementId];
  if (!chip) return constraints;
  const nowYear = options.nowYear ?? new Date().getUTCFullYear();
  const text = chip.text.replace(
    "{firstPick}",
    options.firstPickTitle?.trim() || "the first pick",
  );
  const adjusted = chip.adjust ? chip.adjust(constraints, nowYear) : constraints;
  return {
    ...adjusted,
    semanticQuery: `${adjusted.semanticQuery}, ${text}`,
  };
}

// ── Prompt builders ─────────────────────────────────────────────────────────
// Gemini responseSchema uses the OpenAPI-ish uppercase type names.

export function buildParsePrompt(rawText: string): {
  system: string;
  user: string;
  schema: object;
} {
  return {
    system: [
      "You turn a TV-show request into retrieval constraints.",
      "Extract only what the request actually says — never invent constraints.",
      "semanticQuery: rewrite the request as a rich semantic search phrase describing the desired shows (tone, genre, themes). Do not include runtime, year, or service constraints in it.",
      "maxEpisodeMinutes: set only for explicit episode-length limits (\"under 30 min\" → 30).",
      "finishedOnly: true only if they want shows that finished airing / are complete.",
      "airingOnly: true only if they want currently airing / ongoing shows.",
      "yearMin/yearMax: set only for explicit era requests (\"from the 90s\" → 1990–1999, \"recent\" → last few years).",
      "excludeTerms: lowercase topic words the user wants to avoid (\"nothing depressing\" → [\"depressing\"]).",
      "onMyServices: true only if they mention their own streaming services.",
      "moods: short lowercase mood words present in the request.",
    ].join("\n"),
    user: rawText,
    schema: {
      type: "OBJECT",
      properties: {
        semanticQuery: { type: "STRING" },
        maxEpisodeMinutes: { type: "INTEGER", nullable: true },
        finishedOnly: { type: "BOOLEAN", nullable: true },
        airingOnly: { type: "BOOLEAN", nullable: true },
        yearMin: { type: "INTEGER", nullable: true },
        yearMax: { type: "INTEGER", nullable: true },
        excludeTerms: { type: "ARRAY", items: { type: "STRING" } },
        onMyServices: { type: "BOOLEAN", nullable: true },
        moods: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["semanticQuery"],
    },
  };
}

export type ExplainCandidate = {
  showId: string;
  title: string;
  year?: number | null;
  genres?: string[];
  overview?: string | null;
  onWatchlist: boolean;
};

export type TasteAnchor = {
  title: string;
  note: string; // "loved" | "rated 5" | "recently finished" …
};

const OVERVIEW_TRUNCATE_CHARS = 160;

export function buildExplainPrompt({
  query,
  constraints,
  tasteAnchors,
  candidates,
}: {
  query: string;
  constraints: AskConstraints;
  tasteAnchors: TasteAnchor[];
  candidates: ExplainCandidate[];
}): { system: string; user: string; schema: object } {
  const candidateLines = candidates.map((candidate) => {
    const overview = (candidate.overview ?? "").slice(0, OVERVIEW_TRUNCATE_CHARS);
    const bits = [
      `id=${candidate.showId}`,
      candidate.title + (candidate.year ? ` (${candidate.year})` : ""),
      candidate.genres?.length ? candidate.genres.join("/") : null,
      candidate.onWatchlist ? "ON THE VIEWER'S WATCHLIST" : null,
      overview || null,
    ].filter(Boolean);
    return `- ${bits.join(" — ")}`;
  });
  const anchorLines = tasteAnchors.map(
    (anchor) => `- ${anchor.title} (${anchor.note})`,
  );
  const constraintBits = [
    constraints.maxEpisodeMinutes != null
      ? `episodes under ~${constraints.maxEpisodeMinutes} minutes`
      : null,
    constraints.finishedOnly ? "finished airing" : null,
    constraints.airingOnly ? "currently airing" : null,
    constraints.onMyServices ? "on the viewer's streaming services" : null,
  ].filter(Boolean);

  return {
    system: [
      "You are Ask Plotlist, a TV concierge choosing tonight's picks for one viewer.",
      "Pick the 3 to 6 best shows FROM THE CANDIDATE LIST ONLY — never invent or add shows outside it, and use each candidate's exact id.",
      "Order picks best-first.",
      "Each reason must be one personal line of at most 140 characters that connects the pick to the viewer's taste (their loved shows below) or to what they asked for.",
      "Never spoil plots. Never mention ids. Vary the reasons — no two should read alike.",
      "If a candidate is on the viewer's watchlist, it's fine to nod to that.",
    ].join("\n"),
    user: [
      `The viewer asked for: ${query}`,
      constraintBits.length ? `Constraints: ${constraintBits.join(", ")}.` : null,
      anchorLines.length
        ? `Shows the viewer loves:\n${anchorLines.join("\n")}`
        : "The viewer has no taste history yet.",
      `Candidates:\n${candidateLines.join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: {
      type: "OBJECT",
      properties: {
        picks: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              showId: { type: "STRING" },
              reason: { type: "STRING" },
            },
            required: ["showId", "reason"],
          },
        },
      },
      required: ["picks"],
    },
  };
}
