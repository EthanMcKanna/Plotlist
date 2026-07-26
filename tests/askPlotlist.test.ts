import { describe, expect, it } from "@jest/globals";

import {
  applyConstraintFilters,
  applyRefinement,
  buildAskQueryFromChips,
  buildExplainPrompt,
  buildParsePrompt,
  mergeParsedConstraints,
  REFINEMENT_CHIP_ORDER,
  REFINEMENT_CHIPS,
  type AskCandidate,
} from "../lib/askPlotlist";

describe("buildAskQueryFromChips", () => {
  it("maps the quick-episode chip to a runtime cap", () => {
    const { constraints } = buildAskQueryFromChips({ time: "quick" });
    expect(constraints.maxEpisodeMinutes).toBe(35);
    expect(constraints.finishedOnly).toBe(false);
  });

  it("maps binge night to prefer finished shows", () => {
    const { constraints } = buildAskQueryFromChips({ time: "binge" });
    expect(constraints.finishedOnly).toBe(true);
    expect(constraints.maxEpisodeMinutes).toBeNull();
  });

  it("composes free text with mood and time semantics", () => {
    const { semanticText, constraints } = buildAskQueryFromChips({
      time: "quick",
      mood: "funny",
      freeText: "something British",
    });
    expect(semanticText).toContain("something British");
    expect(semanticText).toContain("funny");
    expect(semanticText).toContain("short episodes");
    expect(constraints.moods).toEqual(["funny"]);
  });

  it("falls back to a generic query with no inputs (surprise me)", () => {
    const { semanticText, constraints } = buildAskQueryFromChips({
      mood: "surprise",
    });
    expect(semanticText.length).toBeGreaterThan(10);
    expect(constraints.moods).toEqual([]);
  });

  it("carries the only-my-services toggle", () => {
    expect(
      buildAskQueryFromChips({ onMyServices: true }).constraints.onMyServices,
    ).toBe(true);
    expect(buildAskQueryFromChips({}).constraints.onMyServices).toBe(false);
  });
});

describe("mergeParsedConstraints", () => {
  const base = buildAskQueryFromChips({ time: "quick", freeText: "cozy crime" }).constraints;

  it("lets parsed fields fill gaps without overriding chips", () => {
    const merged = mergeParsedConstraints(base, {
      semanticQuery: "cozy village murder mysteries",
      maxEpisodeMinutes: 60,
      finishedOnly: true,
      excludeTerms: ["gore"],
    });
    // Chip runtime wins over the parsed one.
    expect(merged.maxEpisodeMinutes).toBe(35);
    expect(merged.finishedOnly).toBe(true);
    expect(merged.semanticQuery).toBe("cozy village murder mysteries");
    expect(merged.excludeTerms).toEqual(["gore"]);
  });

  it("survives a null parse", () => {
    expect(mergeParsedConstraints(base, null)).toBe(base);
  });
});

describe("applyConstraintFilters", () => {
  const candidate = (overrides: Partial<AskCandidate>): AskCandidate => ({
    showId: "show1",
    year: 2020,
    episodeRunTimeMinutes: null,
    status: null,
    providerKeys: null,
    onWatchlist: false,
    text: null,
    ...overrides,
  });

  it("passes unknown metadata for every filter except onMyServices", () => {
    const unknown = candidate({});
    const kept = applyConstraintFilters(
      [unknown],
      {
        semanticQuery: "q",
        maxEpisodeMinutes: 30,
        finishedOnly: true,
        yearMin: 2000,
        excludeTerms: ["zombie"],
      },
      ["netflix"],
    );
    expect(kept).toHaveLength(1);

    const dropped = applyConstraintFilters(
      [unknown],
      { semanticQuery: "q", onMyServices: true },
      ["netflix"],
    );
    expect(dropped).toHaveLength(0);
  });

  it("enforces the runtime cap with a small grace margin", () => {
    const constraints = { semanticQuery: "q", maxEpisodeMinutes: 30 };
    expect(
      applyConstraintFilters(
        [candidate({ episodeRunTimeMinutes: 33 })],
        constraints,
      ),
    ).toHaveLength(1);
    expect(
      applyConstraintFilters(
        [candidate({ episodeRunTimeMinutes: 58 })],
        constraints,
      ),
    ).toHaveLength(0);
  });

  it("matches finished/airing against known TMDB statuses", () => {
    const finished = candidate({ showId: "f", status: "Ended" });
    const airing = candidate({ showId: "a", status: "Returning Series" });
    expect(
      applyConstraintFilters([finished, airing], {
        semanticQuery: "q",
        finishedOnly: true,
      }).map((item) => item.showId),
    ).toEqual(["f"]);
    expect(
      applyConstraintFilters([finished, airing], {
        semanticQuery: "q",
        airingOnly: true,
      }).map((item) => item.showId),
    ).toEqual(["a"]);
  });

  it("filters year bounds only when the year is known", () => {
    const old = candidate({ showId: "old", year: 1995 });
    const recent = candidate({ showId: "new", year: 2024 });
    const unknown = candidate({ showId: "unknown", year: null });
    expect(
      applyConstraintFilters([old, recent, unknown], {
        semanticQuery: "q",
        yearMin: 2015,
      }).map((item) => item.showId),
    ).toEqual(["new", "unknown"]);
    expect(
      applyConstraintFilters([old, recent, unknown], {
        semanticQuery: "q",
        yearMax: 2000,
      }).map((item) => item.showId),
    ).toEqual(["old", "unknown"]);
  });

  it("drops candidates whose text matches an exclude term", () => {
    const zombie = candidate({ showId: "z", text: "The Walking Dead — zombie apocalypse" });
    const cozy = candidate({ showId: "c", text: "A gentle bakery mystery" });
    expect(
      applyConstraintFilters([zombie, cozy], {
        semanticQuery: "q",
        excludeTerms: ["Zombie"],
      }).map((item) => item.showId),
    ).toEqual(["c"]);
  });

  it("requires a known provider match for onMyServices", () => {
    const onNetflix = candidate({ showId: "n", providerKeys: ["netflix"] });
    const onMax = candidate({ showId: "m", providerKeys: ["max"] });
    const unknown = candidate({ showId: "u", providerKeys: null });
    expect(
      applyConstraintFilters([onNetflix, onMax, unknown], {
        semanticQuery: "q",
        onMyServices: true,
      }, ["netflix", "hulu"]).map((item) => item.showId),
    ).toEqual(["n"]);
  });
});

describe("refinement chips", () => {
  const base = buildAskQueryFromChips({ mood: "cozy" }).constraints;

  it("exposes every ordered chip", () => {
    for (const chipId of REFINEMENT_CHIP_ORDER) {
      expect(REFINEMENT_CHIPS[chipId]).toBeDefined();
    }
  });

  it("appends the chip text to the semantic query", () => {
    const refined = applyRefinement(base, "funnier");
    expect(refined.semanticQuery).toContain(base.semanticQuery);
    expect(refined.semanticQuery).toContain("lighter and funnier");
  });

  it("shorter also tightens the runtime cap", () => {
    const refined = applyRefinement(base, "shorter");
    expect(refined.maxEpisodeMinutes).toBe(35);
    expect(refined.semanticQuery).toContain("shorter episodes");
  });

  it("newer/older adjust year bounds from the current year", () => {
    expect(applyRefinement(base, "newer", { nowYear: 2026 }).yearMin).toBe(2021);
    expect(applyRefinement(base, "older", { nowYear: 2026 }).yearMax).toBe(2016);
  });

  it("more like #1 substitutes the first pick's title", () => {
    const refined = applyRefinement(base, "more_like_1", {
      firstPickTitle: "Severance",
    });
    expect(refined.semanticQuery).toContain("more shows like Severance");
  });

  it("ignores unknown chip ids", () => {
    expect(applyRefinement(base, "nonsense")).toBe(base);
  });
});

describe("prompt builders", () => {
  it("parse prompt forbids invented constraints and returns the constraint schema", () => {
    const prompt = buildParsePrompt("short comedies that finished airing");
    expect(prompt.system).toContain("never invent constraints");
    expect(prompt.user).toBe("short comedies that finished airing");
    const properties = (prompt.schema as any).properties;
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining([
        "semanticQuery",
        "maxEpisodeMinutes",
        "finishedOnly",
        "airingOnly",
        "yearMin",
        "yearMax",
        "excludeTerms",
        "onMyServices",
        "moods",
      ]),
    );
  });

  it("explain prompt grounds reasons in taste anchors and forbids out-of-candidate picks", () => {
    const prompt = buildExplainPrompt({
      query: "cozy mystery",
      constraints: { semanticQuery: "cozy mystery", maxEpisodeMinutes: 35 },
      tasteAnchors: [{ title: "Only Murders in the Building", note: "an all-time favorite" }],
      candidates: [
        {
          showId: "show_a",
          title: "Shakespeare & Hathaway",
          year: 2018,
          genres: ["Comedy", "Crime"],
          overview: "Two unlikely detectives solve crimes in Stratford.",
          onWatchlist: true,
        },
      ],
    });
    expect(prompt.system).toContain("FROM THE CANDIDATE LIST ONLY");
    expect(prompt.system).toContain("never invent");
    expect(prompt.system).toContain("Never spoil");
    expect(prompt.system).toContain("140 characters");
    expect(prompt.user).toContain("Only Murders in the Building");
    expect(prompt.user).toContain("id=show_a");
    expect(prompt.user).toContain("ON THE VIEWER'S WATCHLIST");
    expect(prompt.user).toContain("episodes under ~35 minutes");
  });

  it("explain prompt truncates long overviews", () => {
    const prompt = buildExplainPrompt({
      query: "anything",
      constraints: { semanticQuery: "anything" },
      tasteAnchors: [],
      candidates: [
        {
          showId: "show_b",
          title: "Long Show",
          overview: "x".repeat(500),
          onWatchlist: false,
        },
      ],
    });
    const line = prompt.user
      .split("\n")
      .find((candidateLine) => candidateLine.includes("id=show_b"))!;
    expect(line.length).toBeLessThan(260);
    expect(prompt.user).toContain("no taste history");
  });
});
