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
  SignatureRail,
  getFeatureCardVisibleMetaLine,
  getPosterCardVisibleMetaLine,
  getSignatureRailItemAccessibilityLabel,
} from "../../components/SignatureRail";

const includeHiddenElements = { includeHiddenElements: true };

describe("SignatureRail", () => {
  it("carries watch context into feature-card action labels", () => {
    const show = {
      key: "spider-noir",
      title: "Spider-Noir",
      backdropUrl: null,
      posterUrl: null,
      genreLabel: "Crime",
      year: 2026,
      signal: "Prime May 27",
      overview:
        "A hard-boiled private eye gets pulled back into a dangerous masked case.",
      rank: 1,
    };

    render(
      <SignatureRail
        index={2}
        kicker="Now"
        title="Trending"
        accent="#F59E0B"
        layout="feature"
        featureCardWidth={320}
        items={[show]}
        onPressItem={jest.fn()}
      />,
    );

    const label = getSignatureRailItemAccessibilityLabel(show);

    expect(label).toBe(
      "Open Spider-Noir. Rank 1. Crime · Prime · May 27",
    );
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it("adds fallback context to broad feature-card action labels", () => {
    const show = {
      key: "pluribus",
      title: "Pluribus",
      backdropUrl: null,
      posterUrl: null,
      year: 2025,
    };

    render(
      <SignatureRail
        index={3}
        kicker="For you"
        title="Your shelf"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        fallbackMetaLabel="Personal pick"
        items={[show]}
        onPressItem={jest.fn()}
      />,
    );

    expect(
      screen.getByLabelText("Open Pluribus. Personal pick · 2025"),
    ).toBeTruthy();
  });

  it("uses compact metadata in poster-card action labels", () => {
    const show = {
      key: "the-pitt",
      title: "The Pitt",
      posterUrl: null,
      genreLabel: "Drama",
      year: 2025,
      signal: "8.7 TMDB",
    };

    render(
      <SignatureRail
        index={5}
        kicker="Quality"
        title="Quietly excellent"
        accent="#F472B6"
        layout="poster"
        featureCardWidth={320}
        items={[show]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Open The Pitt. Drama · 8.7")).toBeTruthy();
  });

  it("shows timely poster signals without repeating broad genre labels", () => {
    const item = {
      key: "love-island-usa",
      title: "Love Island USA",
      posterUrl: null,
      genreLabel: "Reality",
      year: 2026,
      signal: "Peacock Jun 2",
    };

    render(
      <SignatureRail
        index={5}
        kicker="Fresh"
        title="New"
        accent="#38BDF8"
        layout="poster"
        featureCardWidth={320}
        items={[item]}
        onPressItem={jest.fn()}
      />,
    );

    expect(getPosterCardVisibleMetaLine(item)).toBe("Peacock · Jun 2");
    expect(screen.getByText("Peacock · Jun 2", includeHiddenElements)).toBeTruthy();
    expect(screen.queryByText("Reality · Peacock · Jun 2")).toBeNull();
    expect(
      screen.getByLabelText("Open Love Island USA. Reality · Peacock · Jun 2"),
    ).toBeTruthy();
  });

  it("keeps genre context for rating and chart poster metadata", () => {
    expect(
      getPosterCardVisibleMetaLine({
        key: "the-pitt",
        title: "The Pitt",
        genreLabel: "Drama",
        year: 2025,
        signal: "8.7 TMDB",
      }),
    ).toBe("Drama · 8.7");

    expect(
      getPosterCardVisibleMetaLine({
        key: "nemesis",
        title: "Nemesis",
        genreLabel: "Action",
        year: 2026,
        signal: "Chart mover",
      }),
    ).toBe("Action · Rising");

    expect(
      getPosterCardVisibleMetaLine({
        key: "your-friends-and-neighbors",
        title: "Your Friends & Neighbors",
        genreLabel: "Drama",
        year: 2026,
        signal: "JustWatch chart #8",
      }),
    ).toBe("Drama · Trending");

    expect(
      getPosterCardVisibleMetaLine({
        key: "rick-and-morty",
        title: "Rick and Morty",
        genreLabel: "Animated",
        year: 2013,
        signal: "S9 airing now",
      }),
    ).toBe("S9 now");
  });

  it("keeps feature cards designed while backdrop artwork is missing", () => {
    render(
      <SignatureRail
        index={1}
        kicker="Start"
        title="Starter shelf"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        items={[
          {
            key: "rick-and-morty",
            title: "Rick and Morty",
            backdropUrl: null,
            posterUrl: null,
            genreLabel: "Animated",
            year: 2013,
            signal: "S9 airing now",
          },
        ]}
        onPressItem={jest.fn()}
      />,
    );

    const fallback = screen.getByTestId(
      "feature-fallback-rick-and-morty",
      includeHiddenElements,
    );
    expect(fallback).toBeTruthy();
    expect(fallback.props["aria-hidden"]).toBe(true);
    expect(screen.getByText("Rick and Morty")).toBeTruthy();
    expect(screen.getByText("S9 now")).toBeTruthy();
    expect(screen.queryByText("Animated")).toBeNull();
    expect(screen.queryByText("2013")).toBeNull();
    expect(screen.queryByText("tv-outline", includeHiddenElements)).toBeNull();
    expect(
      screen.getByLabelText("Open Rick and Morty. Animated · S9 now"),
    ).toBeTruthy();
  });

  it("lets strong feature-card signals stand alone visually", () => {
    const item = {
      key: "dutton-ranch",
      title: "Dutton Ranch",
      backdropUrl: null,
      posterUrl: null,
      genreLabel: "Western",
      signal: "Paramount+ May 15",
    };

    render(
      <SignatureRail
        index={1}
        kicker="Personal"
        title="For you"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        items={[item]}
        onPressItem={jest.fn()}
      />,
    );

    expect(getFeatureCardVisibleMetaLine(item)).toBe("Paramount+ · May 15");
    expect(screen.getByText("Paramount+ · May 15")).toBeTruthy();
    expect(screen.queryByText("Western")).toBeNull();
    expect(
      screen.getByLabelText("Open Dutton Ranch. Western · Paramount+ · May 15"),
    ).toBeTruthy();
  });

  it("softens raw chart ranks on-card while keeping accessible provenance", () => {
    const item = {
      key: "your-friends-and-neighbors",
      title: "Your Friends & Neighbors",
      backdropUrl: null,
      posterUrl: null,
      genreLabel: "Drama",
      signal: "JustWatch chart #8",
    };

    render(
      <SignatureRail
        index={1}
        kicker="Curated"
        title="Picks"
        accent="#FDE68A"
        layout="feature"
        featureCardWidth={320}
        items={[item]}
        onPressItem={jest.fn()}
      />,
    );

    expect(getFeatureCardVisibleMetaLine(item)).toBe("Drama · Trending");
    expect(screen.getByText("Drama")).toBeTruthy();
    expect(screen.getByText("Trending")).toBeTruthy();
    expect(screen.queryByText("JustWatch #8")).toBeNull();
    expect(
      screen.getByLabelText("Open Your Friends & Neighbors. Drama · JustWatch #8"),
    ).toBeTruthy();
  });

  it("keeps feature cards compact enough to avoid a second hero rail", () => {
    render(
      <SignatureRail
        index={1}
        kicker="Start"
        title="Starter shelf"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        items={[
          {
            key: "dutton-ranch",
            title: "Dutton Ranch",
            backdropUrl: null,
            posterUrl: null,
            genreLabel: "Western",
            signal: "Paramount+ May 15",
          },
        ]}
        onPressItem={jest.fn()}
      />,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId("feature-card-dutton-ranch").props.style)
        ?.height,
    ).toBe(168);
  });

  it("keeps compact feature cards tappable", () => {
    const onPressItem = jest.fn();
    const item = {
      key: "dutton-ranch",
      title: "Dutton Ranch",
      backdropUrl: null,
      posterUrl: null,
      genreLabel: "Western",
      signal: "Paramount+ May 15",
    };

    render(
      <SignatureRail
        index={1}
        kicker="Start"
        title="Starter shelf"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        items={[item]}
        onPressItem={onPressItem}
      />,
    );

    fireEvent.press(
      screen.getByLabelText("Open Dutton Ranch. Western · Paramount+ · May 15"),
    );

    expect(onPressItem).toHaveBeenCalledWith(item);
  });

  it("keeps feature fallbacks visible until backdrop artwork loads", () => {
    render(
      <SignatureRail
        index={1}
        kicker="Start"
        title="Starter shelf"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        items={[
          {
            key: "lord-of-the-flies-feature",
            title: "Lord of the Flies",
            backdropUrl: "https://example.com/lord-backdrop.jpg",
            posterUrl: "https://example.com/lord-poster.jpg",
            genreLabel: "Drama",
            year: 2026,
            signal: "Netflix May 4",
          },
        ]}
        onPressItem={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId(
        "feature-fallback-lord-of-the-flies-feature",
        includeHiddenElements,
      ),
    ).toBeTruthy();
    expect(
      screen.getByTestId("feature-image-lord-of-the-flies-feature").props.transition,
    ).toBeUndefined();
    fireEvent(screen.getByTestId("feature-image-lord-of-the-flies-feature"), "load");
    expect(
      screen.queryByTestId(
        "feature-fallback-lord-of-the-flies-feature",
        includeHiddenElements,
      ),
    ).toBeNull();
  });

  it("keeps rank context off-card while preserving the accessible label", () => {
    render(
      <SignatureRail
        index={4}
        kicker="Chart"
        title="Everyone's watching"
        accent="#F59E0B"
        layout="feature"
        featureCardWidth={320}
        items={[
          {
            key: "dutton-ranch",
            title: "Dutton Ranch",
            backdropUrl: null,
            posterUrl: null,
            signal: "Paramount+ May 15",
            rank: 1,
          },
        ]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.queryByText("#1")).toBeNull();
    expect(screen.getByText("Everyone's watching")).toBeTruthy();
    expect(
      screen.getByLabelText("Open Dutton Ranch. Rank 1. Paramount+ · May 15"),
    ).toBeTruthy();
  });

  it("adds fallback context to broad feature-card metadata", () => {
    render(
      <SignatureRail
        index={3}
        kicker="For you"
        title="Your shelf"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        fallbackMetaLabel="Personal pick"
        items={[
          {
            key: "pluribus",
            title: "Pluribus",
            backdropUrl: null,
            posterUrl: null,
            year: 2025,
          },
        ]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.getByText("Personal pick")).toBeTruthy();
    expect(screen.getByText("2025")).toBeTruthy();
  });

  it("keeps stronger feature-card metadata ahead of fallback context", () => {
    render(
      <SignatureRail
        index={3}
        kicker="For you"
        title="Your shelf"
        accent="#22C55E"
        layout="feature"
        featureCardWidth={320}
        fallbackMetaLabel="Personal pick"
        items={[
          {
            key: "foundation",
            title: "Foundation",
            backdropUrl: null,
            posterUrl: null,
            genreLabel: "Sci-Fi",
            year: 2025,
          },
        ]}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.getByText("Sci-Fi")).toBeTruthy();
    expect(screen.getByText("2025")).toBeTruthy();
    expect(screen.queryByText("Personal pick")).toBeNull();
  });

  it("keeps poster cards informative when artwork is missing", () => {
    render(
      <SignatureRail
        index={5}
        kicker="Fresh"
        title="New or back"
        accent="#38BDF8"
        layout="poster"
        featureCardWidth={320}
        items={[
          {
            key: "lord-of-the-flies",
            title: "Lord of the Flies",
            posterUrl: null,
            genreLabel: "Drama",
            year: 2026,
            signal: "7.6",
          },
        ]}
        onPressItem={jest.fn()}
      />,
    );

    const fallback = screen.getByTestId(
      "poster-fallback-lord-of-the-flies",
      includeHiddenElements,
    );
    expect(fallback).toBeTruthy();
    expect(fallback.props["aria-hidden"]).toBe(true);
    expect(
      screen.getAllByText("Lord of the Flies", includeHiddenElements).length,
    ).toBe(1);
    expect(
      screen.getAllByText("Drama · 7.6", includeHiddenElements).length,
    ).toBe(1);
    expect(screen.queryByText("tv-outline", includeHiddenElements)).toBeNull();
  });

  it("keeps loaded poster artwork clean while preserving the accessible label", () => {
    const item = {
      key: "the-pitt",
      title: "The Pitt",
      posterUrl: "https://example.com/pitt.jpg",
      genreLabel: "Drama",
      year: 2025,
      signal: "8.7",
    };

    render(
      <SignatureRail
        index={6}
        kicker="Quality"
        title="Quietly excellent"
        accent="#F472B6"
        layout="poster"
        featureCardWidth={320}
        items={[item]}
        onPressItem={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId("poster-fallback-the-pitt", includeHiddenElements),
    ).toBeTruthy();
    expect(
      screen.getByTestId("poster-image-the-pitt").props.transition,
    ).toBeUndefined();
    fireEvent(screen.getByTestId("poster-image-the-pitt"), "load");
    expect(
      screen.queryByTestId("poster-fallback-the-pitt", includeHiddenElements),
    ).toBeNull();
    expect(screen.queryByTestId("poster-caption-the-pitt")).toBeNull();
    expect(screen.queryByText("The Pitt")).toBeNull();
    expect(screen.queryByText("Drama · 8.7")).toBeNull();
    expect(
      screen.getByLabelText(getSignatureRailItemAccessibilityLabel(item, undefined, {
        compactSignal: true,
      })),
    ).toBeTruthy();
  });
});

describe("SignatureRail progressive reveal", () => {
  const posterItems = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      key: `show-${index}`,
      title: `Show ${index}`,
      posterUrl: `https://example.com/poster-${index}.jpg`,
      year: 2026,
    }));
  const mountedPosterKeys = () =>
    screen
      .queryAllByTestId(/^poster-image-/)
      .map((node) => String(node.props.testID).replace("poster-image-", ""));
  const renderRail = (items: ReturnType<typeof posterItems>) =>
    render(
      <SignatureRail
        index={2}
        kicker="Today"
        title="Trending"
        accent="#F59E0B"
        layout="poster"
        featureCardWidth={320}
        items={items}
        onPressItem={jest.fn()}
      />,
    );

  it("mounts only the initial window of a deep rail on first render", () => {
    renderRail(posterItems(30));

    expect(mountedPosterKeys()).toHaveLength(12);
    expect(mountedPosterKeys()[0]).toBe("show-0");
    expect(screen.queryByTestId("poster-image-show-12")).toBeNull();
  });

  it("reveals the next batch when the rail scrolls near its end, then the rest", () => {
    renderRail(posterItems(30));
    const rail = screen.getByLabelText("Trending rail");
    const scrollTo = (x: number) =>
      fireEvent.scroll(rail, {
        nativeEvent: {
          contentOffset: { x },
          layoutMeasurement: { width: 390 },
          contentSize: { width: 12 * 130 },
        },
      });

    // Early in the rail: nothing new mounts (no extra image requests).
    scrollTo(100);
    expect(mountedPosterKeys()).toHaveLength(12);

    scrollTo(12 * 130 - 390 - 100);
    expect(mountedPosterKeys()).toHaveLength(20);
    expect(screen.getByTestId("poster-image-show-19")).toBeTruthy();

    fireEvent.scroll(rail, {
      nativeEvent: {
        contentOffset: { x: 20 * 130 - 390 },
        layoutMeasurement: { width: 390 },
        contentSize: { width: 20 * 130 },
      },
    });
    expect(mountedPosterKeys()).toHaveLength(28);
    fireEvent.scroll(rail, {
      nativeEvent: {
        contentOffset: { x: 28 * 130 - 390 },
        layoutMeasurement: { width: 390 },
        contentSize: { width: 28 * 130 },
      },
    });
    expect(mountedPosterKeys()).toHaveLength(30);
  });

  it("keeps revealing while the mounted window does not overflow a wide viewport", () => {
    renderRail(posterItems(30));
    const rail = screen.getByLabelText("Trending rail");

    // A desktop-width rail fits the whole initial window without scrolling,
    // so layout + content size alone must trigger the next batch.
    fireEvent(rail, "layout", { nativeEvent: { layout: { width: 2400, height: 190 } } });
    fireEvent(rail, "contentSizeChange", 12 * 130, 190);
    expect(mountedPosterKeys()).toHaveLength(20);

    // 20 cards (2600px) still end within the reveal threshold of a 2400px
    // viewport, so the next batch follows on its own.
    fireEvent(rail, "contentSizeChange", 20 * 130, 190);
    expect(mountedPosterKeys()).toHaveLength(28);

    // Once the content clearly overflows the viewport, revealing waits for
    // scroll.
    fireEvent(rail, "contentSizeChange", 28 * 130, 190);
    expect(mountedPosterKeys()).toHaveLength(28);
  });

  it("never mounts past the poster cap and shows short rails whole", () => {
    renderRail(posterItems(8));
    expect(mountedPosterKeys()).toHaveLength(8);
    expect(
      screen.getByLabelText("Trending rail").props.onEndReached,
    ).toBeUndefined();
  });

  it("shows at least the initial window when a longer list replaces a short one", () => {
    const { rerender } = renderRail(posterItems(5));
    expect(mountedPosterKeys()).toHaveLength(5);

    rerender(
      <SignatureRail
        index={2}
        kicker="Today"
        title="Trending"
        accent="#F59E0B"
        layout="poster"
        featureCardWidth={320}
        items={posterItems(30)}
        onPressItem={jest.fn()}
      />,
    );
    expect(mountedPosterKeys()).toHaveLength(12);
  });
});
