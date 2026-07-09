import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseQuery = jest.fn();
const mockRefreshForMe = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

// Wrapped in closures: the factory runs during hoisted imports, before the
// consts above are initialized.
jest.mock("expo-router", () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name?: string }) => name ?? "icon",
}));

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual(
    "react-native-safe-area-context",
  ) as Record<string, unknown>;
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("../../lib/plotlist/react", () => ({
  useAuth: () => ({ isAuthenticated: true }),
  useAction: () => mockRefreshForMe,
  useQuery: (...args: [unknown, unknown?]) => mockUseQuery(...args),
}));

jest.mock("../../components/FlashList", () => ({
  FlashList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
  }: {
    data?: unknown[];
    renderItem: (args: { item: unknown; index: number }) => ReactNode;
    ListHeaderComponent?: ReactNode | (() => ReactNode);
    ListEmptyComponent?: ReactNode | (() => ReactNode);
    ListFooterComponent?: ReactNode | (() => ReactNode);
  }) => {
    const { View } = require("react-native");
    const renderOptional = (component?: ReactNode | (() => ReactNode)) => {
      if (!component) return null;
      return typeof component === "function" ? component() : component;
    };

    return (
      <View>
        {renderOptional(ListHeaderComponent)}
        {data && data.length > 0
          ? data.map((item, index) => (
              <View key={`${index}`}>{renderItem({ item, index })}</View>
            ))
          : renderOptional(ListEmptyComponent)}
        {renderOptional(ListFooterComponent)}
      </View>
    );
  },
}));

type CalendarArgs = {
  view: string;
  today: string;
  limit?: number;
};

function makeEvent(title: string, providers: string[]) {
  return {
    airDate: "2026-03-13",
    airDateTs: Date.parse("2026-03-13T00:00:00.000Z"),
    seasonNumber: 1,
    episodeNumber: 1,
    episodeTitle: "Pilot",
    isPremiere: true,
    isReturningSeason: false,
    isSeasonFinale: false,
    isSeriesFinale: false,
    providers: providers.map((name) => ({ name })),
    show: {
      _id: title.toLowerCase(),
      title,
      posterUrl: null,
    },
  };
}

function buildQueryResult() {
  return {
    groups: [
      {
        airDate: "2026-03-13",
        airDateTs: Date.parse("2026-03-13T00:00:00.000Z"),
        items: [makeEvent("Alpha", ["Netflix"]), makeEvent("Beta", ["Hulu"])],
      },
    ],
    totalItems: 2,
    staleShowIds: [],
    continueCursor: "2",
    isDone: true,
  };
}

import CalendarScreen, {
  getReleaseRowBadge,
  getReleaseRowEpisodeLine,
} from "../../app/calendar";
import { resetNavigationLock } from "../../lib/navigationLock";

describe("CalendarScreen", () => {
  beforeEach(() => {
    resetNavigationLock();
    mockBack.mockReset();
    mockPush.mockReset();
    mockRefreshForMe.mockClear();
    mockUseQuery.mockReset();
    (mockUseQuery as any).mockImplementation(
      (_: unknown, args?: CalendarArgs | "skip") => {
        if (!args || args === "skip") {
          return undefined;
        }
        return buildQueryResult();
      },
    );
  });

  it("renders every release as a dated diary row", () => {
    render(<CalendarScreen />);

    expect(screen.getByText("Releases")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    // The date spine labels the first row of the day only.
    expect(screen.getAllByText("13")).toHaveLength(1);
    expect(screen.getAllByText("FRI")).toHaveLength(1);
  });

  it("shows provider names when logo URLs are not available yet", () => {
    render(<CalendarScreen />);

    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText("Hulu")).toBeTruthy();
  });

  it("always requests one chronological upcoming list — no view tabs", () => {
    const observedViews: string[] = [];
    (mockUseQuery as any).mockImplementation(
      (_: unknown, args?: CalendarArgs | "skip") => {
        if (!args || args === "skip") return undefined;
        observedViews.push(args.view);
        return buildQueryResult();
      },
    );

    render(<CalendarScreen />);

    expect(new Set(observedViews)).toEqual(new Set(["upcoming"]));
    expect(screen.queryByText("All Upcoming")).toBeNull();
    expect(screen.queryByText("Premieres")).toBeNull();
    expect(screen.queryByText("New Seasons")).toBeNull();
    expect(screen.queryByText("Finales")).toBeNull();
  });

  it("carries premiere and finale signals as row badges", () => {
    render(<CalendarScreen />);

    // Both fixture events are premieres.
    expect(screen.getAllByText("Premiere")).toHaveLength(2);

    expect(getReleaseRowBadge({ isSeriesFinale: true, isSeasonFinale: true })).toEqual({
      label: "Series finale",
      tone: "accent",
    });
    expect(getReleaseRowBadge({ isSeasonFinale: true })).toEqual({
      label: "Season finale",
      tone: "primary",
    });
    expect(getReleaseRowBadge({ isReturningSeason: true })).toEqual({
      label: "New season",
      tone: "neutral",
    });
    expect(getReleaseRowBadge({})).toBeNull();
  });

  it("keeps the episode line compact and skips placeholder titles", () => {
    expect(
      getReleaseRowEpisodeLine({
        seasonNumber: 2,
        episodeNumber: 5,
        episodeTitle: "The Return",
      }),
    ).toBe("S02E05 · The Return");
    expect(
      getReleaseRowEpisodeLine({
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: "Season premiere",
      }),
    ).toBe("S01E01");
  });

  it("uses date-only labels so timezone offsets cannot shift releases", () => {
    jest.useFakeTimers({
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    try {
      (mockUseQuery as any).mockImplementation(
        (_: unknown, args?: CalendarArgs | "skip") => {
          if (!args || args === "skip") return undefined;
          return {
            groups: [
              {
                airDate: "2026-06-02",
                // Deliberately skewed timestamp: the string must win.
                airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
                items: [
                  {
                    ...makeEvent("Love Island USA", ["Peacock"]),
                    airDate: "2026-06-02",
                    airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
                  },
                ],
              },
            ],
            totalItems: 1,
            staleShowIds: [],
            continueCursor: "1",
            isDone: true,
          };
        },
      );

      render(<CalendarScreen />);

      expect(screen.getByText("2")).toBeTruthy();
      expect(screen.getByText("TUE")).toBeTruthy();
      expect(
        screen.getByLabelText(
          "Open Love Island USA. Tuesday, Jun 2. S01E01 · Pilot. Premiere",
        ),
      ).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("opens the show when a row is pressed and goes back from the header", () => {
    render(<CalendarScreen />);

    fireEvent.press(
      screen.getByLabelText(/Open Alpha\./),
    );
    expect(mockPush).toHaveBeenCalledWith("/show/alpha");

    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders the empty state when nothing is scheduled", async () => {
    (mockUseQuery as any).mockImplementation(
      (_: unknown, args?: CalendarArgs | "skip") => {
        if (!args || args === "skip") return undefined;
        return {
          groups: [],
          totalItems: 0,
          staleShowIds: [],
          continueCursor: "0",
          isDone: true,
        };
      },
    );

    render(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByText("No upcoming releases")).toBeTruthy();
    });
  });

  it("refreshes stale release data using the client local date", async () => {
    (mockUseQuery as any).mockImplementation(
      (_: unknown, args?: CalendarArgs | "skip") => {
        if (!args || args === "skip") return undefined;
        return {
          ...buildQueryResult(),
          staleShowIds: ["show-alpha"],
        };
      },
    );

    render(<CalendarScreen />);

    await waitFor(() => {
      expect(mockRefreshForMe).toHaveBeenCalledWith({
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
    expect(screen.getByText("Checking latest episode dates")).toBeTruthy();
  });

  it("refreshes stale saved shows even when no cached release cards exist yet", async () => {
    (mockUseQuery as any).mockImplementation(
      (_: unknown, args?: CalendarArgs | "skip") => {
        if (!args || args === "skip") return undefined;
        return {
          groups: [],
          totalItems: 0,
          staleShowIds: ["favorite-without-cache"],
          continueCursor: "0",
          isDone: true,
        };
      },
    );

    render(<CalendarScreen />);

    await waitFor(() => {
      expect(mockRefreshForMe).toHaveBeenCalledWith({
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
    expect(screen.getByText("Checking latest episode dates")).toBeTruthy();
  });
});
