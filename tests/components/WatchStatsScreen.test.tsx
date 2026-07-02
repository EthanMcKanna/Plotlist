import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { buildWatchStats, type WatchStatsPayload } from "../../lib/watchStats";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseAuth = jest.fn();
const mockUseQuery = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name?: string }) => name ?? "icon",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("../../components/Poster", () => ({
  Poster: () => {
    const { View } = require("react-native");
    return <View testID="poster" />;
  },
}));

jest.mock("../../lib/plotlist/react", () => ({
  useAuth: () => mockUseAuth(),
  useQuery: (...args: [unknown, unknown?]) => mockUseQuery(...args),
}));

import WatchStatsScreen from "../../app/me/watch-stats";

function makePopulatedStats(): WatchStatsPayload {
  return {
    totalEpisodes: 24,
    totalMinutes: 1080,
    showsWithProgress: 2,
    averageEpisodeMinutes: 45,
    firstWatchedAt: Date.parse("2026-04-01T12:00:00.000Z"),
    latestWatchedAt: Date.parse("2026-05-01T12:00:00.000Z"),
    episodesLast30Days: 12,
    activeDays: 8,
    currentStreak: 2,
    longestStreak: 5,
    statusCounts: {
      watchlist: 3,
      watching: 2,
      completed: 1,
      dropped: 0,
      total: 6,
    },
    monthlyActivity: [
      { key: "2026-04", label: "Apr", count: 10 },
      { key: "2026-05", label: "May", count: 14 },
    ],
    weekdayActivity: [{ label: "Fri", count: 7 }],
    timeOfDayActivity: [{ label: "Evening", count: 20 }],
    topShows: [
      {
        show: {
          _id: "show-1",
          title: "Severance",
          posterUrl: null,
          genreIds: [18],
        },
        episodes: 16,
        minutes: 720,
        firstWatchedAt: Date.parse("2026-04-01T12:00:00.000Z"),
        latestWatchedAt: Date.parse("2026-05-01T12:00:00.000Z"),
      },
    ],
    recentEpisodes: [
      {
        _id: "episode-1",
        show: { _id: "show-1", title: "Severance", posterUrl: null },
        seasonNumber: 2,
        episodeNumber: 4,
        watchedAt: Date.parse("2026-05-01T12:00:00.000Z"),
        runtimeMinutes: 45,
      },
    ],
    reviewStats: {
      totalReviews: 1,
      ratedShows: 1,
      averageRating: 4.5,
      fiveStarCount: 0,
      topRated: [
        {
          review: {
            _id: "review-1",
            _creationTime: Date.parse("2026-05-01T12:00:00.000Z"),
            rating: 4.5,
            createdAt: Date.parse("2026-05-01T12:00:00.000Z"),
          },
          show: { _id: "show-1", title: "Severance", posterUrl: null },
        },
      ],
    },
  };
}

describe("WatchStatsScreen", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockUseAuth.mockReset();
    mockUseQuery.mockReset();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders first-run guidance for a new authenticated user", () => {
    mockUseQuery.mockReturnValue(buildWatchStats({ now: Date.parse("2026-05-01T12:00:00.000Z") }));

    render(<WatchStatsScreen />);

    expect(screen.getAllByText("0m").length).toBeGreaterThan(0);
    expect(screen.getByText("Your stats will fill in as you watch.")).toBeTruthy();
    expect(screen.getByText("No top shows yet")).toBeTruthy();
    expect(screen.getByText("No ratings yet")).toBeTruthy();
    expect(screen.getByText("No recent episodes")).toBeTruthy();

    fireEvent.press(screen.getByText("Search"));
    expect(mockPush).toHaveBeenCalledWith("/search");
    fireEvent.press(screen.getByText("My Shows"));
    expect(mockPush).toHaveBeenCalledWith("/me/watchlist");
  });

  it("renders populated stats without hiding detailed sections", () => {
    mockUseQuery.mockReturnValue(makePopulatedStats());

    render(<WatchStatsScreen />);

    for (const label of [
      "Total watch time",
      "Average",
      "Complete",
      "First",
      "Latest",
      "Top Shows",
      "Rhythm",
      "Monthly Pace",
      "Weekday Heat",
      "Library Mix",
      "Achievements",
      "Ratings",
      "Recent Episodes",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("18h 0m")).toBeTruthy();
    expect(screen.getAllByText("Severance").length).toBeGreaterThan(0);
    expect(screen.getByText("Drama")).toBeTruthy();
    expect(screen.getByText("You mostly watch in the evening.")).toBeTruthy();
    expect(screen.getByText("S02E04 · May 1")).toBeTruthy();
    expect(screen.getAllByText("4.5").length).toBeGreaterThan(0);

    fireEvent.press(screen.getAllByText("Severance")[0]);
    expect(mockPush).toHaveBeenCalledWith("/show/show-1");
    fireEvent.press(screen.getByLabelText("Back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders legacy stats payloads that do not include review stats", () => {
    const stats = makePopulatedStats() as Partial<WatchStatsPayload>;
    delete stats.monthlyActivity;
    delete stats.weekdayActivity;
    delete stats.timeOfDayActivity;
    delete stats.topShows;
    delete stats.recentEpisodes;
    delete stats.reviewStats;
    delete stats.averageEpisodeMinutes;
    mockUseQuery.mockReturnValue(stats);

    render(<WatchStatsScreen />);

    expect(screen.getByText("18h 0m")).toBeTruthy();
    expect(screen.getByText("45m")).toBeTruthy();
    expect(screen.getByText("No top shows yet")).toBeTruthy();
    expect(screen.getByText("Ratings")).toBeTruthy();
    expect(screen.getByText("No ratings yet")).toBeTruthy();
    expect(screen.getByText("No recent episodes")).toBeTruthy();
  });

  it("renders a sign-in callout and skips the stats query when signed out", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    render(<WatchStatsScreen />);

    expect(mockUseQuery.mock.calls[0]?.[1]).toBe("skip");
    expect(screen.getByText("Sign in to see watch stats")).toBeTruthy();
    fireEvent.press(screen.getByText("Sign in"));
    expect(mockReplace).toHaveBeenCalledWith("/sign-in");
  });

  it("shows loading while auth is still resolving", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });
    mockUseQuery.mockReturnValue(undefined);

    render(<WatchStatsScreen />);

    expect(screen.queryByText("Watch Stats")).toBeNull();
    expect(screen.queryByText("Sign in to see watch stats")).toBeNull();
  });

  it("guides users with a library but no watched episodes to mark episodes", () => {
    mockUseQuery.mockReturnValue(
      buildWatchStats({
        now: Date.parse("2026-05-01T12:00:00.000Z"),
        watchStates: [
          { showId: "show-1", status: "watchlist", updatedAt: 1 },
          { showId: "show-2", status: "watching", updatedAt: 2 },
        ],
      }),
    );

    render(<WatchStatsScreen />);

    expect(screen.getByText("Library found. Episodes next.")).toBeTruthy();
    expect(screen.queryByText("Your stats will fill in as you watch.")).toBeNull();
  });
});
