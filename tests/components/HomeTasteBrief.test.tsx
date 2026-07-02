import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

import {
  HomeTasteBrief,
  getHomeTasteBriefEffectiveWidth,
  getHomeTasteBriefCopy,
  getHomeTasteBriefArtworkUrl,
  getHomeTasteBriefPreviewKeys,
  getHomeTasteBriefSelection,
  isHomeTasteBriefCurrentCandidate,
  shouldUseWideTasteBrief,
} from "../../components/HomeTasteBrief";
import type { SignatureRailItem } from "../../components/SignatureRail";
import {
  getHomeRailIdentitySet,
  prioritizeUnpreviewedHomeRailItems,
} from "../../lib/homeRailIdentity";

const includeHiddenElements = { includeHiddenElements: true };

function item(
  key: string,
  title = key,
  overrides: Partial<SignatureRailItem> = {},
): SignatureRailItem {
  return { key, title, posterUrl: "poster.jpg", ...overrides };
}

describe("getHomeTasteBriefSelection", () => {
  it("chooses distinct picks across taste, live, and fresh slots", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [item("berlin"), item("severance")],
      heat: [item("berlin"), item("boys")],
      fresh: [item("boys"), item("dutton")],
    });

    expect(selection.tasteItem?.key).toBe("berlin");
    expect(selection.heatItem?.key).toBe("boys");
    expect(selection.freshItem?.key).toBe("dutton");
  });

  it("leaves a slot empty when there is no distinct candidate", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [item("same")],
      heat: [item("same")],
      fresh: [item("same")],
    });

    expect(selection.tasteItem?.key).toBe("same");
    expect(selection.heatItem).toBeNull();
    expect(selection.freshItem).toBeNull();
  });

  it("treats matching titles from different sources as the same preview", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [item("internal-adolescence", "Adolescence")],
      heat: [
        item("tmdb-adolescence", "Adolescence"),
        item("heat-pluribus", "Pluribus"),
      ],
      fresh: [
        item("seed-pluribus", "Pluribus"),
        item("fresh-dutton", "Dutton Ranch"),
      ],
    });

    expect(selection.tasteItem?.key).toBe("internal-adolescence");
    expect(selection.heatItem?.key).toBe("heat-pluribus");
    expect(selection.freshItem?.key).toBe("fresh-dutton");
  });

  it("keeps a personalized viewer taste-led even when live rails are fresh", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [item("euphoria", "Euphoria", { year: 2019, signal: "8.3 TMDB" })],
      heat: [item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" })],
      fresh: [item("dutton", "Dutton Ranch", { year: 2026, signal: "Paramount+ May 15" })],
      personalized: true,
      now: Date.UTC(2026, 4, 28),
    });

    expect(selection.tasteItem?.key).toBe("euphoria");
    expect(selection.heatItem?.key).toBe("rick");
    expect(selection.freshItem?.key).toBe("dutton");
  });

  it("promotes current personal picks over older generic taste matches", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [
        item("euphoria", "Euphoria", { year: 2019, signal: "8.3 TMDB" }),
        item("star-city", "Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("bear", "The Bear", { year: 2022, signal: "8.2 TMDB" }),
      ],
      heat: [item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" })],
      fresh: [item("dutton", "Dutton Ranch", { year: 2026, signal: "Paramount+ May 15" })],
      personalized: true,
      now: Date.UTC(2026, 4, 28),
    });

    expect(selection.tasteItem?.key).toBe("star-city");
    expect(selection.heatItem?.key).toBe("rick");
    expect(selection.freshItem?.key).toBe("dutton");
  });

  it("uses live and fresh picks before stale for-you fallback for cold-start viewers", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [item("euphoria", "Euphoria", { year: 2019, signal: "8.3 TMDB" })],
      heat: [item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" })],
      fresh: [item("dutton", "Dutton Ranch", { year: 2026, signal: "Paramount+ May 15" })],
      personalized: false,
      now: Date.UTC(2026, 4, 28),
    });

    expect(selection.tasteItem?.key).toBe("dutton");
    expect(selection.heatItem?.key).toBe("rick");
    expect(selection.freshItem).toBeNull();
  });

  it("prefers explicit current context before plain year-only freshness for cold starts", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [],
      heat: [
        item("generic-2026", "Generic 2026", { year: 2026 }),
        item("airing", "Airing Now", { year: 2021, signal: "S4 airing now" }),
      ],
      fresh: [],
      personalized: false,
      now: Date.UTC(2026, 4, 28),
    });

    expect(selection.tasteItem?.key).toBe("airing");
    expect(selection.heatItem?.key).toBe("generic-2026");
  });

  it("prefers release-window heat over chart-only demand in the shortlist", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [],
      heat: [
        item("chart", "Nemesis", {
          year: 2026,
          signal: "Chart mover",
          genreLabel: "Action",
          overview: "A thief and a detective chase each other through a string of heists.",
        }),
        item("release", "The Four Seasons", {
          year: 2025,
          signal: "S2 May 28",
          genreLabel: "Comedy",
          overview: "A friend group recalibrates after one of their marriages ends.",
        }),
      ],
      fresh: [],
      personalized: false,
      now: Date.UTC(2026, 4, 29),
    });

    expect(selection.tasteItem?.key).toBe("release");
    expect(selection.heatItem?.key).toBe("chart");
  });

  it("still uses chart demand when it is the only current context available", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [],
      heat: [
        item("chart", "Nemesis", {
          year: 2026,
          signal: "Chart mover",
          genreLabel: "Action",
        }),
      ],
      fresh: [],
      personalized: false,
      now: Date.UTC(2026, 4, 29),
    });

    expect(selection.tasteItem?.key).toBe("chart");
  });

  it("starts with a non-hero card when the opening hero already previewed the release pick", () => {
    const openingPreviewKeys = getHomeRailIdentitySet([
      item("tmdb:252107", "Star City"),
    ]);
    const heat = prioritizeUnpreviewedHomeRailItems(
      [
        item("tmdb:252107", "Star City", {
          year: 2026,
          signal: "Apple TV+ May 29",
          genreLabel: "Sci-fi",
          overview: "A fresh alternate-history space-race premiere.",
        }),
        item("tmdb:243316", "The Four Seasons", {
          year: 2025,
          signal: "S2 May 28",
          genreLabel: "Comedy",
          overview: "A friend group recalibrates after one of their marriages ends.",
        }),
        item("tmdb:226346", "Deli Boys", {
          year: 2025,
          signal: "S2 May 28",
          genreLabel: "Drama",
          overview: "Two brothers inherit a family business with a criminal underside.",
        }),
      ],
      openingPreviewKeys,
    );

    const selection = getHomeTasteBriefSelection({
      forYou: [],
      heat,
      fresh: [],
      personalized: false,
      now: Date.UTC(2026, 4, 29),
      demotedKeys: openingPreviewKeys,
    });

    expect(selection.tasteItem?.title).toBe("The Four Seasons");
    expect(selection.heatItem?.title).toBe("Deli Boys");
  });

  it("does not let a thin year-only item lead the personal shortlist", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [
        item("pluribus", "Pluribus", { year: 2025 }),
        item("from", "FROM", {
          year: 2022,
          genreLabel: "Mystery",
          signal: "8.2 TMDB",
          overview:
            "Residents of a nightmarish town try to hold onto normal life while searching for a way out.",
        }),
      ],
      heat: [],
      fresh: [],
      personalized: true,
      now: Date.UTC(2026, 4, 28),
    });

    expect(selection.tasteItem?.key).toBe("from");
  });

  it("returns preview keys for the visible cold-start lead, not hidden support picks", () => {
    const selection = getHomeTasteBriefSelection({
      forYou: [item("euphoria", "Euphoria", { year: 2019, signal: "8.3 TMDB" })],
      heat: [item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" })],
      fresh: [item("dutton", "Dutton Ranch", { year: 2026, signal: "Paramount+ May 15" })],
      personalized: false,
      now: Date.UTC(2026, 4, 28),
    });

    const keys = getHomeTasteBriefPreviewKeys(selection);

    expect(keys.has("dutton")).toBe(true);
    expect(keys.has("title:dutton ranch")).toBe(true);
    expect(keys.has("rick")).toBe(false);
    expect(keys.has("title:rick and morty")).toBe(false);
    expect(keys.has("euphoria")).toBe(false);
    expect(keys.has("title:euphoria")).toBe(false);
  });
});

describe("isHomeTasteBriefCurrentCandidate", () => {
  it("rejects old shows with generic score or activity signals", () => {
    const now = Date.UTC(2026, 4, 28);

    expect(
      isHomeTasteBriefCurrentCandidate(
        item("euphoria", "Euphoria", { year: 2019, signal: "8.3 TMDB" }),
        now,
      ),
    ).toBe(false);
    expect(
      isHomeTasteBriefCurrentCandidate(
        item("older", "Older", { year: 2021, signal: "1.2k reviews" }),
        now,
      ),
    ).toBe(false);
  });

  it("accepts airing, provider-date, and current-year picks with useful context", () => {
    const now = Date.UTC(2026, 4, 28);

    expect(
      isHomeTasteBriefCurrentCandidate(
        item("rick", "Rick and Morty", { year: 2013, signal: "S9 airing now" }),
        now,
      ),
    ).toBe(true);
    expect(
      isHomeTasteBriefCurrentCandidate(
        item("dutton", "Dutton Ranch", { year: 2026, signal: "Paramount+ May 15" }),
        now,
      ),
    ).toBe(true);
    expect(
      isHomeTasteBriefCurrentCandidate(
        item("new", "New", { year: 2026, signal: null, genreLabel: "Drama" }),
        now,
      ),
    ).toBe(true);
    expect(
      isHomeTasteBriefCurrentCandidate(
        item("thin", "Thin", { year: 2026, signal: null }),
        now,
      ),
    ).toBe(false);
  });
});

describe("shouldUseWideTasteBrief", () => {
  it("keeps phone cards stacked and promotes tablet or desktop to a three-card strip", () => {
    expect(shouldUseWideTasteBrief(390)).toBe(false);
    expect(shouldUseWideTasteBrief(759)).toBe(false);
    expect(shouldUseWideTasteBrief(760)).toBe(true);
    expect(shouldUseWideTasteBrief(1440)).toBe(true);
  });

  it("uses measured content width over the browser viewport for centered web shells", () => {
    expect(shouldUseWideTasteBrief(getHomeTasteBriefEffectiveWidth(1280, 342))).toBe(false);
    expect(shouldUseWideTasteBrief(getHomeTasteBriefEffectiveWidth(1280, 820))).toBe(true);
    expect(shouldUseWideTasteBrief(getHomeTasteBriefEffectiveWidth(1280, null))).toBe(true);
  });
});

describe("getHomeTasteBriefArtworkUrl", () => {
  it("uses poster art when a shortlist card has no backdrop", () => {
    expect(
      getHomeTasteBriefArtworkUrl({
        key: "nemesis",
        title: "Nemesis",
        backdropUrl: " ",
        posterUrl: "https://img.example.com/nemesis.jpg",
      }),
    ).toBe("https://img.example.com/nemesis.jpg");
  });

  it("returns null when there is no usable art", () => {
    expect(getHomeTasteBriefArtworkUrl({ key: "plain", title: "Plain" })).toBeNull();
  });
});

describe("getHomeTasteBriefCopy", () => {
  it("does not overclaim taste matching before the viewer has taste signals", () => {
    expect(getHomeTasteBriefCopy(false)).toMatchObject({
      tasteLabel: "Pick",
    });
    expect(getHomeTasteBriefCopy(true)).toMatchObject({
      tasteLabel: "For you",
    });
  });
});

describe("HomeTasteBrief decision context", () => {
  it("keeps the shortlist as a single card instead of another titled shelf", () => {
    render(
      <HomeTasteBrief
        personalized
        forYou={[
          item("star-city", "Star City", {
            genreLabel: "Sci-fi",
            signal: "Apple TV+ May 29",
          }),
        ]}
        heat={[]}
        fresh={[]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.queryByText("Pick")).toBeNull();
    expect(screen.queryByText("Next")).toBeNull();
    expect(screen.queryByText("arrow-forward")).toBeNull();
    expect(
      screen.getByLabelText(
        "Open Star City. For you. Sci-fi · Apple TV+ · May 29",
      ).props.accessibilityRole,
    ).toBe("button");
    expect(screen.getByText("Star City")).toBeTruthy();
    expect(screen.queryByText("Watch next")).toBeNull();
  });

  it("does not render a standalone heading in the cold-start card", () => {
    render(
      <HomeTasteBrief
        personalized={false}
        forYou={[]}
        heat={[
          item("four-seasons", "The Four Seasons", {
            genreLabel: "Comedy",
            signal: "S2 May 28",
          }),
        ]}
        fresh={[]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.queryByText("Next")).toBeNull();
    expect(screen.getByText("The Four Seasons")).toBeTruthy();
  });

  it("keeps the single-card brief compact enough to read as an interlude", () => {
    render(
      <HomeTasteBrief
        personalized
        forYou={[
          item("star-city", "Star City", {
            genreLabel: "Sci-fi",
            signal: "Apple TV+ May 29",
          }),
        ]}
        heat={[]}
        fresh={[]}
        onPressItem={jest.fn()}
      />,
    );

    const cardStyle = StyleSheet.flatten(
      screen.getByTestId("taste-brief-card-star-city").props.style,
    );

    expect(cardStyle.minHeight).toBe(136);
    expect(cardStyle.borderRadius).toBe(8);
  });

  it("renders a single lead card instead of a three-card shortlist on the homepage", () => {
    render(
      <HomeTasteBrief
        personalized
        forYou={[
          item("star-city", "Star City", {
            genreLabel: "Sci-fi",
            signal: "Apple TV+ May 29",
          }),
        ]}
        heat={[
          item("rick", "Rick and Morty", {
            genreLabel: "Comedy",
            signal: "S9 airing now",
          }),
        ]}
        fresh={[
          item("dutton", "Dutton Ranch", {
            genreLabel: "Western",
            signal: "Paramount+ May 15",
          }),
        ]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.getByText("Star City")).toBeTruthy();
    expect(screen.queryByText("Rick and Morty")).toBeNull();
    expect(screen.queryByText("Dutton Ranch")).toBeNull();
  });

  it("does not show fallback helper labels when a card lacks real metadata", () => {
    render(
      <HomeTasteBrief
        personalized={false}
        forYou={[]}
        heat={[item("plain-pick", "Plain Pick")]}
        fresh={[]}
        selection={{
          tasteItem: item("plain-pick", "Plain Pick"),
          heatItem: null,
          freshItem: null,
        }}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.getByText("Plain Pick")).toBeTruthy();
    expect(screen.queryByText("Worth starting")).toBeNull();
    expect(screen.queryByText("Closest fit")).toBeNull();
    expect(screen.queryByText("Happening now")).toBeNull();
  });

  it("keeps lead-card action labels concise without adding hidden explanation copy", () => {
    render(
      <HomeTasteBrief
        personalized={false}
        forYou={[]}
        heat={[
          item("the-four-seasons", "The Four Seasons", {
            genreLabel: "Comedy",
            signal: "S2 May 28",
            overview:
              "A friend group recalibrates after one of their marriages ends.",
          }),
        ]}
        fresh={[]}
        onPressItem={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId("taste-brief-reason-the-four-seasons"),
    ).toBeNull();
    expect(screen.queryByText("Best bet")).toBeNull();
    expect(
      screen.getByLabelText(
        "Open The Four Seasons. Pick. Comedy · S2 · May 28",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(/A friend group recalibrates/),
    ).toBeNull();
  });
});

describe("HomeTasteBrief artwork", () => {
  it("keeps the shortlist fallback only until artwork loads", () => {
    render(
      <HomeTasteBrief
        personalized={false}
        forYou={[]}
        heat={[
          item("the-four-seasons", "The Four Seasons", {
            backdropUrl: "https://image.tmdb.org/t/p/w1280/four-seasons.jpg",
            genreLabel: "Comedy",
            signal: "S2 May 28",
          }),
        ]}
        fresh={[]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.getByTestId("taste-brief-image-the-four-seasons")).toBeTruthy();
    expect(
      screen.getByTestId("taste-brief-fallback-the-four-seasons", includeHiddenElements),
    ).toBeTruthy();

    fireEvent(screen.getByTestId("taste-brief-image-the-four-seasons"), "load");

    expect(
      screen.queryByTestId("taste-brief-fallback-the-four-seasons", includeHiddenElements),
    ).toBeNull();
  });

  it("keeps fallback artwork informative without duplicating the card caption", () => {
    render(
      <HomeTasteBrief
        personalized={false}
        forYou={[]}
        heat={[
          item("the-four-seasons", "The Four Seasons", {
            backdropUrl: "https://image.tmdb.org/t/p/w1280/four-seasons.jpg",
            genreLabel: "Comedy",
            signal: "S2 May 28",
          }),
        ]}
        fresh={[]}
        onPressItem={jest.fn()}
      />,
    );

    fireEvent(screen.getByTestId("taste-brief-image-the-four-seasons"), "error", {
      nativeEvent: { error: "failed" },
    });

    const fallback = screen.getByTestId(
      "taste-brief-fallback-the-four-seasons",
      includeHiddenElements,
    );
    expect(fallback).toBeTruthy();
    expect(fallback.props["aria-hidden"]).toBe(true);
    expect(screen.queryByTestId("taste-brief-image-the-four-seasons")).toBeNull();
    expect(screen.queryByText("sparkles", includeHiddenElements)).toBeNull();
    expect(
      screen.getAllByText("The Four Seasons", includeHiddenElements).length,
    ).toBe(1);
    expect(screen.getAllByText("S2 · May 28", includeHiddenElements).length).toBe(1);
    expect(
      screen.queryByText("Comedy · S2 · May 28", includeHiddenElements),
    ).toBeNull();
  });
});
