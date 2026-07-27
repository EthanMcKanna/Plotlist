// Blend ("For us") pure logic: pair-fairness candidate scoring and the
// Gemini explain prompt. Data access, privacy gating, quota, and the LLM
// call live in api/_lib/blend.ts — this module stays unit-testable.

export type BlendPairCandidate = {
  showId: string;
  // Vectorize match score against the blended (mean) centroid.
  centroidScore: number;
  // Cosine of each person's taste vector against the show vector; null when
  // the show vector wasn't fetched (deep candidates beyond the fairness
  // window).
  simViewer: number | null;
  simPartner: number | null;
};

export const MAX_BLEND_PICKS = 8;
export const MIN_BLEND_PICKS = 4;

// How much an imbalanced pick (great for one person, meh for the other) is
// penalized on top of scoring by the weaker side's affinity.
const BLEND_IMBALANCE_PENALTY = 0.15;
// Candidates outside the fairness window score by centroid alone, nudged
// down so a fairness-scored candidate wins ties.
const CENTROID_ONLY_PENALTY = 0.1;

function minMaxNormalize(values: number[]): (value: number) => number {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  if (!Number.isFinite(span) || span <= 1e-9) return () => 0.5;
  return (value: number) => (value - min) / span;
}

// Turns per-person affinities into one semanticScore per candidate: the
// weaker side's (set-normalized) affinity, minus a penalty for imbalance —
// "great for both" beats "perfect for one". Raw cosines cluster tightly
// (the TV cone), so each side is min-max rescaled across the candidate set
// before comparing; never threshold on the raw values.
export function scoreBlendCandidates(
  candidates: BlendPairCandidate[],
): Array<{ showId: string; semanticScore: number }> {
  const viewerSims = candidates
    .map((candidate) => candidate.simViewer)
    .filter((sim): sim is number => sim !== null);
  const partnerSims = candidates
    .map((candidate) => candidate.simPartner)
    .filter((sim): sim is number => sim !== null);
  const centroidScores = candidates.map((candidate) => candidate.centroidScore);

  const normalizeViewer = minMaxNormalize(viewerSims);
  const normalizePartner = minMaxNormalize(partnerSims);
  const normalizeCentroid = minMaxNormalize(centroidScores);

  return candidates.map((candidate) => {
    if (candidate.simViewer !== null && candidate.simPartner !== null) {
      const viewer = normalizeViewer(candidate.simViewer);
      const partner = normalizePartner(candidate.simPartner);
      const fair =
        Math.min(viewer, partner) -
        BLEND_IMBALANCE_PENALTY * Math.abs(viewer - partner);
      return { showId: candidate.showId, semanticScore: fair };
    }
    return {
      showId: candidate.showId,
      semanticScore: Math.max(
        0,
        normalizeCentroid(candidate.centroidScore) - CENTROID_ONLY_PENALTY,
      ),
    };
  });
}

// Provider keys both people subscribe to, preserving the first list's order.
export function intersectProviderKeys(
  viewerKeys: string[] | null | undefined,
  partnerKeys: string[] | null | undefined,
): string[] {
  const partnerSet = new Set(partnerKeys ?? []);
  return (viewerKeys ?? []).filter((key) => partnerSet.has(key));
}

// ── Explain prompt ──────────────────────────────────────────────────────────

export type BlendExplainCandidate = {
  showId: string;
  title: string;
  year?: number | null;
  genres?: string[];
  overview?: string | null;
  onViewerWatchlist: boolean;
  onPartnerWatchlist: boolean;
};

const OVERVIEW_TRUNCATE_CHARS = 160;

export function buildBlendExplainPrompt({
  viewerName,
  partnerName,
  viewerAnchors,
  partnerAnchors,
  sharedFacetTitles,
  candidates,
}: {
  viewerName: string;
  partnerName: string;
  viewerAnchors: string[];
  partnerAnchors: string[];
  sharedFacetTitles: string[];
  candidates: BlendExplainCandidate[];
}): { system: string; user: string; schema: object } {
  const candidateLines = candidates.map((candidate) => {
    const overview = (candidate.overview ?? "").slice(0, OVERVIEW_TRUNCATE_CHARS);
    const bits = [
      `id=${candidate.showId}`,
      candidate.title + (candidate.year ? ` (${candidate.year})` : ""),
      candidate.genres?.length ? candidate.genres.join("/") : null,
      candidate.onViewerWatchlist ? `ON ${viewerName.toUpperCase()}'S WATCHLIST` : null,
      candidate.onPartnerWatchlist ? `ON ${partnerName.toUpperCase()}'S WATCHLIST` : null,
      overview || null,
    ].filter(Boolean);
    return `- ${bits.join(" — ")}`;
  });

  return {
    system: [
      `You are Plotlist's Blend concierge, picking shows for two people to watch together. Neither has seen any of the candidates.`,
      `The viewer reading this is ${viewerName}; their blend partner is ${partnerName}. Address ${viewerName} as "you" and call ${partnerName} by name.`,
      `Pick the ${MIN_BLEND_PICKS} to ${MAX_BLEND_PICKS} best shows FROM THE CANDIDATE LIST ONLY — never invent shows, and use each candidate's exact id. Order picks best-first.`,
      `Each reason is one line of at most 140 characters that shows why the pick works for BOTH of them — connect it to each person's taste below, not just one side's.`,
      `duoLine: one warm line (at most 120 characters) describing where their two tastes meet. No show plots, no cringe.`,
      `Never spoil plots. Never mention ids. Vary the reasons — no two should read alike.`,
      `If a candidate is on someone's watchlist, it's fine to nod to that.`,
    ].join("\n"),
    user: [
      `Shows ${viewerName} loves:\n${viewerAnchors.map((title) => `- ${title}`).join("\n") || "- (no history yet)"}`,
      `Shows ${partnerName} loves:\n${partnerAnchors.map((title) => `- ${title}`).join("\n") || "- (no history yet)"}`,
      sharedFacetTitles.length
        ? `Tastes they share: ${sharedFacetTitles.join(", ")}`
        : null,
      `Candidates:\n${candidateLines.join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: {
      type: "OBJECT",
      properties: {
        duoLine: { type: "STRING" },
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

// Best display handle for prompt + UI copy: display name, then name, then
// username, then a neutral fallback.
export function blendDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
}): string {
  return (
    user.displayName?.trim() ||
    user.name?.trim() ||
    (user.username ? `@${user.username}` : "") ||
    "your friend"
  );
}
