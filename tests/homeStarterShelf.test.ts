import { describe, expect, it } from "@jest/globals";

import {
  buildColdStartHomeShelfItems,
  buildPersonalHomeShelfItems,
  isContextualHomeShelfLead,
  prioritizeHomeShelfCurrentItems,
  promoteContextualHomeShelfLead,
} from "../lib/homeStarterShelf";

const item = (
  key: string,
  title = key,
  overrides: { year?: number; signal?: string | null } = {},
) => ({ key, title, ...overrides });

describe("buildColdStartHomeShelfItems", () => {
  it("leads with current starts before older generic for-you fallbacks", () => {
    const shelf = buildColdStartHomeShelfItems({
      forYou: [
        item("from", "FROM", { year: 2022, signal: "8.2 TMDB" }),
        item("euphoria", "Euphoria", { year: 2019, signal: "8.3 TMDB" }),
      ],
      heat: [
        item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" }),
      ],
      fresh: [
        item("star-city", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
      ],
      critics: [
        item("pitt", "The Pitt", { year: 2025, signal: "8.7 TMDB" }),
      ],
      quick: [
        item("studio", "The Studio", { year: 2025, signal: "7.7 TMDB" }),
      ],
      now: Date.UTC(2026, 4, 28),
      limit: 5,
    });

    expect(shelf.map((next) => next.title)).toEqual([
      "Star City",
      "Rick and Morty",
      "The Pitt",
      "The Studio",
      "FROM",
    ]);
  });

  it("dedupes titles across sources before filling the starter shelf", () => {
    const shelf = buildColdStartHomeShelfItems({
      forYou: [item("personal-pluribus", "Pluribus", { year: 2026 })],
      heat: [
        item("heat-pluribus", "Pluribus", { year: 2026, signal: "S1 airing now" }),
        item("heat-rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" }),
      ],
      fresh: [item("fresh-legends", "Legends", { year: 2026, signal: "Netflix May 7" })],
      critics: [],
      quick: [],
      now: Date.UTC(2026, 4, 28),
    });

    expect(shelf.map((next) => next.title)).toEqual([
      "Legends",
      "Pluribus",
      "Rick and Morty",
    ]);
  });

  it("pushes chart-only demand behind release and live context", () => {
    const shelf = buildColdStartHomeShelfItems({
      forYou: [],
      heat: [
        item("chart", "Chart Only", { year: 2021, signal: "Chart mover" }),
        item("live", "Live Show", { year: 2020, signal: "S2 tonight" }),
      ],
      fresh: [item("new", "New Show", { year: 2026, signal: "Hulu May 4" })],
      critics: [],
      quick: [],
      now: Date.UTC(2026, 4, 28),
    });

    expect(shelf.map((next) => next.title)).toEqual([
      "New Show",
      "Live Show",
      "Chart Only",
    ]);
  });
});

describe("prioritizeHomeShelfCurrentItems", () => {
  it("keeps a personalized shelf personal while moving current picks ahead of stale generic matches", () => {
    const shelf = prioritizeHomeShelfCurrentItems(
      [
        item("from", "FROM", { year: 2022, signal: "8.2 TMDB" }),
        item("euphoria", "Euphoria", { year: 2019, signal: "8.3 TMDB" }),
        item("star-city", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("foundation", "Foundation", { year: 2021, signal: null }),
      ],
      { now: Date.UTC(2026, 4, 28) },
    );

    expect(shelf.map((next) => next.title)).toEqual([
      "Star City",
      "FROM",
      "Euphoria",
      "Foundation",
    ]);
  });

  it("keeps chart-only items behind more useful current context", () => {
    const shelf = prioritizeHomeShelfCurrentItems(
      [
        item("chart", "Chart Only", { year: 2021, signal: "Chart mover" }),
        item("live", "Live Show", { year: 2021, signal: "S2 tonight" }),
      ],
      { now: Date.UTC(2026, 4, 28) },
    );

    expect(shelf.map((next) => next.title)).toEqual(["Live Show", "Chart Only"]);
  });
});

describe("buildPersonalHomeShelfItems", () => {
  it("keeps personal current picks first and weaves fresh discovery before stale personal fallbacks", () => {
    const shelf = buildPersonalHomeShelfItems({
      forYou: [
        item("neighbors", "Your Friends & Neighbors", { year: 2025, signal: "7.6 TMDB" }),
        item("bear", "The Bear", { year: 2022, signal: "8.2 TMDB" }),
        item("from", "FROM", { year: 2022, signal: "8.2 TMDB" }),
      ],
      heat: [
        item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" }),
      ],
      fresh: [
        item("star-city", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
      ],
      critics: [],
      quick: [],
      now: Date.UTC(2026, 4, 28),
      limit: 5,
    });

    expect(shelf.map((next) => next.title)).toEqual([
      "Your Friends & Neighbors",
      "Star City",
      "Rick and Morty",
      "The Bear",
      "FROM",
    ]);
  });

  it("caps discovery borrowing so personalized shelves do not drain dedicated freshness rails", () => {
    const shelf = buildPersonalHomeShelfItems({
      forYou: [item("from", "FROM", { year: 2022, signal: "8.2 TMDB" })],
      heat: [
        item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" }),
        item("good-girl", "A Good Girl's Guide to Murder", {
          year: 2024,
          signal: "S2 May 27",
        }),
      ],
      fresh: [
        item("star-city", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("lord", "Lord of the Flies", { year: 2026, signal: "Netflix May 4" }),
        item("legends", "Legends", { year: 2026, signal: "Netflix May 7" }),
      ],
      critics: [],
      quick: [],
      now: Date.UTC(2026, 4, 28),
      limit: 6,
    });

    expect(shelf.map((next) => next.title)).toEqual([
      "Star City",
      "Lord of the Flies",
      "FROM",
    ]);
  });

  it("dedupes discovery titles that are already personal", () => {
    const shelf = buildPersonalHomeShelfItems({
      forYou: [
        item("personal-star", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
      ],
      heat: [],
      fresh: [
        item("fresh-star", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("fresh-legends", "Legends", { year: 2026, signal: "Netflix May 7" }),
      ],
      critics: [],
      quick: [],
      now: Date.UTC(2026, 4, 28),
    });

    expect(shelf.map((next) => next.title)).toEqual(["Star City", "Legends"]);
  });
});

describe("promoteContextualHomeShelfLead", () => {
  it("keeps a signaled personal lead in place", () => {
    const shelf = promoteContextualHomeShelfLead(
      [
        item("neighbors", "Your Friends & Neighbors", { year: 2025, signal: "7.6 TMDB" }),
        item("star-city", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
      ],
      { now: Date.UTC(2026, 4, 30) },
    );

    expect(shelf.map((next) => next.title)).toEqual([
      "Your Friends & Neighbors",
      "Star City",
    ]);
  });

  it("moves a contextual current pick ahead of a bare recent-year lead", () => {
    const shelf = promoteContextualHomeShelfLead(
      [
        item("pluribus", "Pluribus", { year: 2025 }),
        item("foundation", "Foundation", { year: 2021 }),
        item("star-city", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
      ],
      { now: Date.UTC(2026, 4, 30) },
    );

    expect(shelf.map((next) => next.title)).toEqual([
      "Star City",
      "Pluribus",
      "Foundation",
    ]);
    expect(isContextualHomeShelfLead(shelf[0], Date.UTC(2026, 4, 30))).toBe(true);
    expect(isContextualHomeShelfLead(shelf[1], Date.UTC(2026, 4, 30))).toBe(false);
  });
});
