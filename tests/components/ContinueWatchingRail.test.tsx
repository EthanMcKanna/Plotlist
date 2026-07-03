import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

const mockMutation = jest.fn() as any;
mockMutation.withOptimisticUpdate = jest.fn(() => mockMutation);

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: (() => {
    const { createElement: mockCreateElement } = require("react");
    return {
      View: ({ children, ...props }: { children?: ReactNode }) =>
        mockCreateElement("View", props, children),
    };
  })(),
  FadeInRight: {
    delay: () => ({
      duration: () => undefined,
    }),
  },
}));

jest.mock("../../lib/plotlist/react", () => ({
  useMutation: () => mockMutation,
  useQuery: () => undefined,
}));

import {
  ContinueWatchingRail,
  CONTINUE_WATCHING_MARK_WATCHED_TOUCH_TARGET,
  getActiveContinueWatchingItems,
  getContinueWatchingAccessibilityLabel,
  getContinueWatchingBadgeLabel,
  getContinueWatchingContextLine,
  getContinueWatchingFreshnessLabel,
  getContinueWatchingMarkWatchedLabel,
  getContinueWatchingPreviewItems,
  getContinueWatchingSubtitle,
  getContinueWatchingVisibleBadgeLabel,
  getContinueWatchingVisibleContextLine,
  isContinueWatchingComplete,
  shouldRenderContinueWatchingEmptyState,
} from "../../components/ContinueWatchingRail";
import { getHomeRailIdentitySet } from "../../lib/homeRailIdentity";
import { resetNavigationLock } from "../../lib/navigationLock";
import { router } from "expo-router";

const includeHiddenElements = { includeHiddenElements: true };

describe("ContinueWatchingRail helpers", () => {
  it("does not render impossible next-episode counts", () => {
    expect(
      getContinueWatchingSubtitle({
        totalWatched: 20,
        totalEpisodes: 19,
      }),
    ).toBe("All caught up");
  });

  it("labels completed cards without pointing at another episode", () => {
    const item = {
      totalWatched: 20,
      totalEpisodes: 19,
      nextSeasonNumber: 3,
      nextEpisodeNumber: 20,
    };

    expect(isContinueWatchingComplete(item)).toBe(true);
    expect(getContinueWatchingBadgeLabel(item)).toBe("Complete");
  });

  it("trusts explicit caught-up state from the progress engine", () => {
    const item = {
      isCaughtUp: true,
      totalWatched: 1,
      totalEpisodes: 20,
      nextSeasonNumber: 1,
      nextEpisodeNumber: 1,
    };

    expect(isContinueWatchingComplete(item)).toBe(true);
    expect(getContinueWatchingSubtitle(item)).toBe("All caught up");
    expect(getContinueWatchingVisibleBadgeLabel(item)).toBe("Complete");
  });

  it("keeps upcoming shows actionable even when no progress has started", () => {
    const item = {
      isUpcoming: true,
      totalWatched: 0,
      totalEpisodes: 8,
      nextSeasonNumber: 1,
      nextEpisodeNumber: 1,
    };

    expect(isContinueWatchingComplete(item)).toBe(false);
    expect(getContinueWatchingBadgeLabel(item)).toBe("S01 · E01");
    expect(getContinueWatchingVisibleBadgeLabel(item)).toBe("S1 E1");
  });

  it("uses a calmer visible episode chip while preserving canonical action labels", () => {
    const item = {
      totalWatched: 6,
      totalEpisodes: 12,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 7,
    };

    expect(getContinueWatchingBadgeLabel(item)).toBe("S02 · E07");
    expect(getContinueWatchingVisibleBadgeLabel(item)).toBe("S2 E7");
  });

  it("clamps the next episode to the known season total", () => {
    expect(
      getContinueWatchingSubtitle({
        totalWatched: 18,
        totalEpisodes: 19,
      }),
    ).toBe("Episode 19 of 19");
  });

  it("keeps full next-episode context available for action labels", () => {
    expect(
      getContinueWatchingContextLine({
        nextEpisodeName: "The Return",
        totalWatched: 4,
        totalEpisodes: 10,
      }),
    ).toBe("The Return · Episode 5 of 10");

    expect(
      getContinueWatchingContextLine({
        nextEpisodeName: "Finale",
        totalWatched: 10,
        totalEpisodes: 10,
      }),
    ).toBe("All caught up");
  });

  it("uses the episode title alone as visible resume copy when the badge has the episode number", () => {
    expect(
      getContinueWatchingVisibleContextLine({
        nextEpisodeName: "The Return",
        totalWatched: 4,
        totalEpisodes: 10,
      }),
    ).toBe("The Return");

    expect(
      getContinueWatchingVisibleContextLine({
        isUpcoming: true,
        nextEpisodeName: "Premiere",
        nextAirDate: Date.parse("2026-06-03T12:00:00.000Z"),
        totalEpisodes: 10,
      }),
    ).toBe("Premiere · Airs Jun 3");
  });

  it("keeps continue-watching actions specific to the episode being resumed", () => {
    const item = {
      showId: "show-alpha" as any,
      show: {
        title: "Alpha",
        posterUrl: "poster.jpg",
      },
      totalWatched: 4,
      totalEpisodes: 10,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 5,
      nextEpisodeName: "The Return",
    };

    expect(getContinueWatchingAccessibilityLabel(item)).toBe(
      "Continue Alpha. S02 · E05. The Return · Episode 5 of 10",
    );
    expect(getContinueWatchingMarkWatchedLabel(item)).toBe(
      "Mark Alpha S02 · E05 watched",
    );
  });

  it("surfaces release-aware freshness without replacing resume context", () => {
    const item = {
      showId: "show-alpha" as any,
      show: {
        title: "Alpha",
        posterUrl: "poster.jpg",
      },
      totalWatched: 4,
      totalEpisodes: 10,
      nextSeasonNumber: 2,
      nextEpisodeNumber: 5,
      nextEpisodeName: "The Return",
      nextReleaseDate: Date.parse("2026-05-30T12:00:00.000Z"),
      nextEpisodeReleasedToday: true,
    };

    expect(getContinueWatchingFreshnessLabel(item)).toBe("New");
    expect(getContinueWatchingContextLine(item)).toBe(
      "The Return · Episode 5 of 10",
    );
    expect(getContinueWatchingAccessibilityLabel(item)).toBe(
      "Continue Alpha. S02 · E05. New. The Return · Episode 5 of 10",
    );
  });

  it("does not badge future episodes twice", () => {
    expect(
      getContinueWatchingFreshnessLabel({
        isUpcoming: true,
        nextAirDate: Date.parse("2026-06-03T12:00:00.000Z"),
        nextReleaseDate: Date.parse("2026-06-03T12:00:00.000Z"),
        totalWatched: 8,
        totalEpisodes: 8,
      }),
    ).toBeNull();
  });

  it("exports active show identities so recommendations avoid resume duplicates", () => {
    const previewKeys = getHomeRailIdentitySet(
      getContinueWatchingPreviewItems([
        {
          showId: "show_boys" as any,
          show: {
            title: "The Boys",
            posterUrl: "poster.jpg",
          },
          totalWatched: 1,
        },
      ]),
    );

    expect(previewKeys.has("show_boys")).toBe(true);
    expect(previewKeys.has("title:the boys")).toBe(true);
  });

  it("does not reserve completed shows as active resume cards", () => {
    const items = [
      {
        showId: "show_boys" as any,
        show: {
          title: "The Boys",
          posterUrl: "poster.jpg",
        },
        totalWatched: 1,
        totalEpisodes: 40,
        nextEpisodeNumber: 2,
      },
      {
        showId: "show_severance" as any,
        show: {
          title: "Severance",
          posterUrl: "poster.jpg",
        },
        totalWatched: 19,
        totalEpisodes: 19,
        nextEpisodeNumber: 20,
      },
    ];

    expect(getActiveContinueWatchingItems(items).map((item) => item.show.title)).toEqual([
      "The Boys",
    ]);

    const previewKeys = getHomeRailIdentitySet(getContinueWatchingPreviewItems(items));
    expect(previewKeys.has("title:the boys")).toBe(true);
    expect(previewKeys.has("title:severance")).toBe(false);
  });

  it("keeps optimistically caught-up cards mounted until the server confirms", () => {
    const items = [
      {
        showId: "show_severance" as any,
        show: {
          title: "Severance",
          posterUrl: "poster.jpg",
        },
        totalWatched: 19,
        totalEpisodes: 19,
        isCaughtUp: true,
        optimisticCaughtUp: true,
      },
    ];

    expect(getActiveContinueWatchingItems(items).map((item) => item.show.title)).toEqual([
      "Severance",
    ]);
    expect(getContinueWatchingBadgeLabel(items[0])).toBe("Complete");
  });

  it("lets the homepage suppress empty resume chrome on cold start", () => {
    expect(shouldRenderContinueWatchingEmptyState([], true)).toBe(false);
    expect(shouldRenderContinueWatchingEmptyState([], false)).toBe(true);
    expect(shouldRenderContinueWatchingEmptyState(undefined, true)).toBe(false);
  });

  it("keeps empty resume copy short while preserving the search action", () => {
    jest.mocked(router.push).mockClear();
    resetNavigationLock();

    render(<ContinueWatchingRail items={[]} />);

    expect(screen.getByText("Find a show")).toBeTruthy();
    expect(screen.queryByText("No active shows.")).toBeNull();
    expect(screen.queryByText("No active shows yet")).toBeNull();
    expect(screen.queryByText("Tap to find something to start tonight.")).toBeNull();

    fireEvent.press(screen.getByLabelText("Find a show to watch"));

    expect(router.push).toHaveBeenCalledWith("/search");
  });

  it("keeps caught-up resume copy short while preserving the search action", () => {
    jest.mocked(router.push).mockClear();
    resetNavigationLock();

    render(
      <ContinueWatchingRail
        items={[
          {
            showId: "show-alpha" as any,
            show: {
              title: "Alpha",
              posterUrl: "poster.jpg",
            },
            totalWatched: 10,
            totalEpisodes: 10,
            isCaughtUp: true,
          },
        ]}
      />,
    );

    expect(screen.getByText("Find something new")).toBeTruthy();
    expect(screen.queryByText("You're caught up.")).toBeNull();
    expect(screen.queryByText("All caught up")).toBeNull();
    expect(screen.queryByText(/No next episode/)).toBeNull();

    fireEvent.press(screen.getByLabelText("Find a fresh show to watch"));

    expect(router.push).toHaveBeenCalledWith("/search");
  });

  it("keeps the mark-watched control at a mobile-safe hit target", () => {
    render(
      <ContinueWatchingRail
        items={[
          {
            showId: "show-alpha" as any,
            show: {
              title: "Alpha",
              posterUrl: "poster.jpg",
            },
            totalWatched: 4,
            totalEpisodes: 10,
            nextSeasonNumber: 2,
            nextEpisodeNumber: 5,
          },
        ]}
      />,
    );

    const action = screen.getByLabelText("Mark Alpha S02 · E05 watched");
    const style = StyleSheet.flatten(action.props.style);

    expect(CONTINUE_WATCHING_MARK_WATCHED_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
    expect(style.width).toBeGreaterThanOrEqual(44);
  });

  it("keeps resume card utility chrome visually quiet", () => {
    render(
      <ContinueWatchingRail
        items={[
          {
            showId: "show-alpha" as any,
            show: {
              title: "Alpha",
              posterUrl: "poster.jpg",
            },
            totalWatched: 4,
            totalEpisodes: 10,
            nextSeasonNumber: 2,
            nextEpisodeNumber: 5,
          },
        ]}
      />,
    );

    const chipStyle = StyleSheet.flatten(
      screen.getByTestId(
        "continue-episode-chip-show-alpha",
        includeHiddenElements,
      ).props.style,
    );
    const glyphStyle = StyleSheet.flatten(
      screen.getByTestId(
        "continue-mark-watched-glyph-show-alpha",
        includeHiddenElements,
      ).props.style,
    );

    expect(chipStyle.backgroundColor).toBe("rgba(13,15,20,0.42)");
    expect(chipStyle.borderColor).toBe("rgba(255,255,255,0.10)");
    expect(glyphStyle.backgroundColor).toBe("rgba(13,15,20,0.26)");
    expect(glyphStyle.borderColor).toBe("rgba(255,255,255,0.12)");
    expect(glyphStyle.height).toBeLessThan(
      CONTINUE_WATCHING_MARK_WATCHED_TOUCH_TARGET,
    );
  });

  it("keeps loaded resume artwork terse while preserving episode context for actions", () => {
    render(
      <ContinueWatchingRail
        items={[
          {
            showId: "show-alpha" as any,
            show: {
              title: "Alpha",
              posterUrl: "poster.jpg",
            },
            totalWatched: 4,
            totalEpisodes: 10,
            nextSeasonNumber: 2,
            nextEpisodeNumber: 5,
            nextEpisodeName: "The Return",
          },
        ]}
      />,
    );

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("S2 E5", includeHiddenElements)).toBeTruthy();
    expect(screen.queryByText("The Return", includeHiddenElements)).toBeNull();
    expect(screen.queryByText("Episode 5 of 10", includeHiddenElements)).toBeNull();
    expect(
      screen.getByLabelText(
        "Continue Alpha. S02 · E05. The Return · Episode 5 of 10",
      ),
    ).toBeTruthy();
  });

  it("keeps the visible resume header terse without losing section context", () => {
    render(
      <ContinueWatchingRail
        items={[
          {
            showId: "show-alpha" as any,
            show: {
              title: "Alpha",
              posterUrl: "poster.jpg",
            },
            totalWatched: 4,
            totalEpisodes: 10,
            nextSeasonNumber: 2,
            nextEpisodeNumber: 5,
          },
        ]}
      />,
    );

    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.queryByText("Continue watching")).toBeNull();
    expect(
      screen.getByLabelText("Section 01. Resume. Continue watching"),
    ).toBeTruthy();
  });
});

describe("ContinueWatchingRail artwork", () => {
  it("keeps fallback resume cards focused on episode context instead of initials chrome", () => {
    render(
      <ContinueWatchingRail
        items={[
          {
            showId: "show-andor" as any,
            show: {
              title: "Andor",
            },
            totalWatched: 6,
            totalEpisodes: 12,
            progressPct: 0.47,
            nextSeasonNumber: 2,
            nextEpisodeNumber: 7,
            nextEpisodeName: "Messenger",
          },
        ]}
      />,
    );

    expect(
      screen.getByTestId("continue-artwork-fallback-show-andor", includeHiddenElements),
    ).toBeTruthy();
    expect(screen.getByText("Andor", includeHiddenElements)).toBeTruthy();
    expect(screen.getByText("Messenger", includeHiddenElements)).toBeTruthy();
    expect(screen.getByText("S2 E7", includeHiddenElements)).toBeTruthy();
    expect(screen.queryByText("S02 · E07", includeHiddenElements)).toBeNull();
    expect(
      screen.getByLabelText(
        "Continue Andor. S02 · E07. Messenger · Episode 7 of 12",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("A", includeHiddenElements)).toBeNull();
  });
});
