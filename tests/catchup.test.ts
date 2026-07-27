import { describe, expect, it } from "@jest/globals";

import {
  buildCatchupPrompt,
  buildEpisodeDigest,
  compareEpisodeOrder,
  episodesUpTo,
  formatEpisodeCode,
  sanitizeCatchupBrief,
  type CatchupEpisodeInput,
} from "../lib/catchup";

function episode(
  seasonNumber: number,
  episodeNumber: number,
  overrides: Partial<CatchupEpisodeInput> = {},
): CatchupEpisodeInput {
  return {
    seasonNumber,
    episodeNumber,
    name: `Episode ${seasonNumber}x${episodeNumber}`,
    overview: `Things happen in season ${seasonNumber} episode ${episodeNumber}.`,
    airDate: "2020-01-01",
    ...overrides,
  };
}

describe("episode ordering", () => {
  it("orders by season then episode", () => {
    expect(
      compareEpisodeOrder(
        { seasonNumber: 2, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 10 },
      ),
    ).toBeGreaterThan(0);
    expect(formatEpisodeCode(3, 7)).toBe("S3E7");
  });
});

describe("episodesUpTo", () => {
  it("keeps everything up to and including the stop point, sorted", () => {
    const episodes = [
      episode(2, 2),
      episode(1, 1),
      episode(2, 3),
      episode(1, 2),
      episode(2, 1),
    ];
    const result = episodesUpTo(episodes, { seasonNumber: 2, episodeNumber: 2 });
    expect(result.map((entry) => formatEpisodeCode(entry.seasonNumber, entry.episodeNumber))).toEqual([
      "S1E1",
      "S1E2",
      "S2E1",
      "S2E2",
    ]);
  });

  it("drops specials and duplicate entries", () => {
    const episodes = [episode(0, 1), episode(1, 1), episode(1, 1), episode(1, 2)];
    const result = episodesUpTo(episodes, { seasonNumber: 1, episodeNumber: 5 });
    expect(result).toHaveLength(2);
    expect(result[0].seasonNumber).toBe(1);
  });
});

describe("buildEpisodeDigest", () => {
  it("tiers detail: recent episodes verbatim, older seasons as titles", () => {
    const episodes: CatchupEpisodeInput[] = [];
    for (let season = 1; season <= 4; season += 1) {
      for (let ep = 1; ep <= 20; ep += 1) {
        episodes.push(episode(season, ep));
      }
    }
    const digest = buildEpisodeDigest(episodes);
    // 80 episodes: last 12 full, previous 36 condensed, first 32 titles-only.
    expect(digest).toContain("Most recent episodes the viewer watched");
    expect(digest).toContain("Episodes before the most recent stretch");
    expect(digest).toContain("Season 1 episode titles:");
    // The very first episode is title-only — its overview must not appear.
    expect(digest).not.toContain("Things happen in season 1 episode 1.");
    // The last episode keeps its overview.
    expect(digest).toContain("Things happen in season 4 episode 20.");
  });

  it("handles a short run with no older tiers", () => {
    const digest = buildEpisodeDigest([episode(1, 1), episode(1, 2)]);
    expect(digest).toContain("Most recent episodes");
    expect(digest).not.toContain("titles only");
  });
});

describe("buildCatchupPrompt", () => {
  const show = { title: "Severance", year: 2022, overview: "Work-life split." };

  it("pins the stop point and bans anything after it", () => {
    const prompt = buildCatchupPrompt({
      show,
      episodes: [episode(1, 1), episode(1, 2)],
      stop: { seasonNumber: 1, episodeNumber: 2 },
    });
    expect(prompt.system).toContain("S1E2");
    expect(prompt.system).toContain("Never mention, hint at, or foreshadow ANYTHING that happens after S1E2");
    expect(prompt.user).toContain("Severance (2022)");
    expect(prompt.user).toContain("The viewer stopped after S1E2.");
    expect(prompt.maxOutputTokens).toBeGreaterThan(1024);
  });

  it("asks for a single short section on very short runs", () => {
    const shortPrompt = buildCatchupPrompt({
      show,
      episodes: [episode(1, 1)],
      stop: { seasonNumber: 1, episodeNumber: 1 },
    });
    expect(shortPrompt.system).toContain("one short section");
    const longPrompt = buildCatchupPrompt({
      show,
      episodes: Array.from({ length: 20 }, (_, index) => episode(1, index + 1)),
      stop: { seasonNumber: 1, episodeNumber: 20 },
    });
    expect(longPrompt.system).toContain("2-3 titled sections");
  });
});

describe("sanitizeCatchupBrief", () => {
  it("clamps and trims a valid response", () => {
    const brief = sanitizeCatchupBrief({
      storySoFar: [
        { title: "  The setup  ", body: "  Mark joins Lumon.  " },
        { title: "", body: "The team rebels." },
        { title: "Extra", body: "" },
      ],
      lastTime: "Helly opened the door.",
      keyPlayers: [
        { name: "Mark", note: "Torn between selves." },
        { name: "", note: "dropped" },
      ],
    });
    expect(brief).not.toBeNull();
    expect(brief!.storySoFar).toHaveLength(2);
    expect(brief!.storySoFar[0]).toEqual({ title: "The setup", body: "Mark joins Lumon." });
    // A missing section title falls back rather than dropping the section.
    expect(brief!.storySoFar[1].title).toBe("The story so far");
    expect(brief!.keyPlayers).toEqual([{ name: "Mark", note: "Torn between selves." }]);
  });

  it("caps section and player counts", () => {
    const brief = sanitizeCatchupBrief({
      storySoFar: Array.from({ length: 6 }, (_, index) => ({
        title: `Part ${index}`,
        body: "Something.",
      })),
      lastTime: "The end.",
      keyPlayers: Array.from({ length: 9 }, (_, index) => ({
        name: `Person ${index}`,
        note: "Standing by.",
      })),
    });
    expect(brief!.storySoFar).toHaveLength(3);
    expect(brief!.keyPlayers).toHaveLength(5);
  });

  it("returns null when there's nothing renderable", () => {
    expect(sanitizeCatchupBrief(null)).toBeNull();
    expect(sanitizeCatchupBrief({})).toBeNull();
    expect(sanitizeCatchupBrief({ storySoFar: [], lastTime: "" })).toBeNull();
  });
});
