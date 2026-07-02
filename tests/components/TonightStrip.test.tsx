import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

const mockUseQuery = jest.fn();
const mockRefreshForMe = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockInvalidateQueries = jest.fn<(args?: unknown) => Promise<void>>().mockResolvedValue(undefined);
let mockLocalDateString = "2026-05-30";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name?: string }) => name ?? "icon",
}));

jest.mock("../../lib/plotlist/react", () => ({
  useAuth: () => ({ isAuthenticated: true }),
  useAction: () => mockRefreshForMe,
  useQuery: (...args: [unknown, unknown?]) => mockUseQuery(...args),
}));

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: "AnimatedView",
  },
  FadeInRight: {
    delay: () => ({
      duration: () => undefined,
    }),
  },
}));

jest.mock("../../lib/releaseCalendar", () => ({
  getLocalDateString: () => mockLocalDateString,
}));

import {
  HOME_SCHEDULE_SEGMENTED_TAB_TOUCH_TARGET,
  getHomeSchedulePreviewCounts,
  getHomeSchedulePreviewItems,
  getHomeScheduleSubtitle,
  getHomeScheduleTabAccessibilityLabel,
  getScheduleCardDateLabel,
  getScheduleCardAccessibilityLabel,
  getScheduleCardSubline,
  getScheduleCardVisibleSubline,
  refreshHomeSchedulePreviewData,
  shouldRefreshHomeSchedulePreview,
  TonightStrip,
} from "../../components/TonightStrip";
import { router } from "expo-router";

const mockPush = router.push as jest.Mock;

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    airDate: "2026-05-30",
    airDateTs: Date.parse("2026-05-30T00:00:00.000Z"),
    seasonNumber: 2,
    episodeNumber: 5,
    episodeTitle: "The Return",
    isPremiere: false,
    isSeasonFinale: true,
    providers: [{ name: "Max" }],
    show: {
      _id: "show-1",
      title: "Alpha",
      posterUrl: null,
      backdropUrl: null,
    },
    ...overrides,
  };
}

function makePreview(item = makeEvent()) {
  return {
    tonightGroups: [
      {
        airDate: "2026-05-30",
        airDateTs: Date.parse("2026-05-30T00:00:00.000Z"),
        items: [item],
      },
    ],
    upcomingGroups: [],
    staleShowIds: [],
  };
}

describe("TonightStrip", () => {
  beforeEach(() => {
    mockLocalDateString = "2026-05-30";
    mockPush.mockReset();
    mockRefreshForMe.mockClear();
    mockInvalidateQueries.mockClear();
    mockUseQuery.mockReset().mockReturnValue(makePreview());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("separates tonight from upcoming schedule counts for homepage planning", () => {
    const tonight = makeEvent({ airDate: "2026-05-30" });
    const sameDayDuplicate = makeEvent({
      airDate: "2026-05-30",
      show: { _id: "show-2", title: "Beta" },
    });
    const tomorrow = makeEvent({
      airDate: "2026-05-31",
      show: { _id: "show-3", title: "Gamma" },
    });
    const preview = {
      tonightGroups: [{ airDate: "2026-05-30", airDateTs: 0, items: [tonight] }],
      upcomingGroups: [
        {
          airDate: "2026-05-30",
          airDateTs: 0,
          items: [sameDayDuplicate],
        },
        {
          airDate: "2026-05-31",
          airDateTs: 0,
          items: [tomorrow],
        },
      ],
      staleShowIds: [],
    };

    expect(getHomeSchedulePreviewCounts(preview, "2026-05-30")).toEqual({
      tonightCount: 1,
      weekCount: 1,
    });
    expect(
      getHomeSchedulePreviewItems(preview, "2026-05-30").upcomingItems.map(
        (item) => item.show.title,
      ),
    ).toEqual(["Gamma"]);
  });

  it("describes the active schedule segment instead of stale tonight copy", () => {
    expect(
      getHomeScheduleSubtitle({
        tab: "tonight",
        tonightCount: 2,
        weekCount: 1,
      }),
    ).toBe("2 tonight.");
    expect(
      getHomeScheduleSubtitle({
        tab: "week",
        tonightCount: 2,
        weekCount: 1,
      }),
    ).toBe("1 this week.");
    expect(
      getHomeScheduleSubtitle({
        tab: "week",
        tonightCount: 0,
        weekCount: 3,
      }),
    ).toBe("3 this week.");
  });

  it("labels schedule tabs with count and selected state for Browser and screen-reader QA", () => {
    expect(
      getHomeScheduleTabAccessibilityLabel({
        label: "Tonight",
        badge: 1,
        active: true,
      }),
    ).toBe("Tonight, 1 release, selected");
    expect(
      getHomeScheduleTabAccessibilityLabel({
        label: "This week",
        badge: 3,
        active: false,
      }),
    ).toBe("This week, 3 releases");
    expect(
      getHomeScheduleTabAccessibilityLabel({
        label: "This week",
        badge: 0,
        active: false,
        disabled: true,
      }),
    ).toBe("This week, 0 releases, unavailable");
  });

  it("updates schedule tab accessibility labels when the selected segment changes", () => {
    mockUseQuery.mockReturnValue({
      tonightGroups: [
        {
          airDate: "2026-05-30",
          airDateTs: Date.parse("2026-05-30T00:00:00.000Z"),
          items: [makeEvent()],
        },
      ],
      upcomingGroups: [
        {
          airDate: "2026-06-01",
          airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
          items: [
            makeEvent({
              airDate: "2026-06-01",
              airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
              show: { _id: "show-2", title: "Beta" },
            }),
          ],
        },
      ],
      staleShowIds: [],
    });

    render(<TonightStrip />);

    expect(screen.getByLabelText("Tonight, 1 release, selected")).toBeTruthy();
    expect(screen.getByLabelText("This week, 1 release")).toBeTruthy();
    expect(screen.queryByText("1")).toBeNull();
    expect(screen.getByLabelText("Tonight releases rail")).toBeTruthy();
    expect(screen.getByLabelText("Release schedule").props.accessibilityRole).toBe(
      "tablist",
    );
    expect(
      StyleSheet.flatten(screen.getByLabelText("Release schedule").props.style)
        .borderWidth,
    ).toBeUndefined();
    expect(
      screen.getByLabelText("Tonight, 1 release, selected").props.accessibilityRole,
    ).toBe("tab");
    expect(
      screen.getByLabelText("Tonight, 1 release, selected").props.accessibilityState,
    ).toEqual({ selected: true, disabled: false });
    expect(
      screen.getByLabelText("This week, 1 release").props.accessibilityState,
    ).toEqual({ selected: false, disabled: false });

    fireEvent.press(screen.getByLabelText("This week, 1 release"));

    expect(screen.getByLabelText("This week, 1 release, selected")).toBeTruthy();
    expect(screen.getByLabelText("Tonight, 1 release")).toBeTruthy();
    expect(screen.queryByText("1")).toBeNull();
    expect(screen.getByLabelText("This week releases rail")).toBeTruthy();
    expect(
      screen.getByLabelText("This week, 1 release, selected").props.accessibilityRole,
    ).toBe("tab");
    expect(
      screen.getByLabelText("This week, 1 release, selected").props.accessibilityState,
    ).toEqual({ selected: true, disabled: false });
  });

  it("refreshes release data only when stale show ids are present", () => {
    expect(shouldRefreshHomeSchedulePreview(undefined)).toBe(false);
    expect(shouldRefreshHomeSchedulePreview({ tonightGroups: [] })).toBe(false);
    expect(
      shouldRefreshHomeSchedulePreview({
        tonightGroups: [],
        staleShowIds: [],
      }),
    ).toBe(false);
    expect(
      shouldRefreshHomeSchedulePreview({
        tonightGroups: [],
        staleShowIds: ["show-1"],
      }),
    ).toBe(true);
  });

  it("rolls the schedule query to the next local day while the homepage stays open", () => {
    jest.useFakeTimers();
    mockUseQuery.mockImplementation((_query, args?: any) => {
      if (args?.today === "2026-05-31") {
        return makePreview(
          makeEvent({
            airDate: "2026-05-31",
            airDateTs: Date.parse("2026-05-31T00:00:00.000Z"),
            show: {
              _id: "show-2",
              title: "Beta",
              posterUrl: null,
              backdropUrl: null,
            },
          }),
        );
      }
      return makePreview();
    });

    render(<TonightStrip />);

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ today: "2026-05-30" }),
    );
    expect(
      screen.getByLabelText("Open Alpha. Tonight. S02E05. The Return · Max"),
    ).toBeTruthy();

    mockLocalDateString = "2026-05-31";
    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ today: "2026-05-31" }),
    );
    expect(
      screen.getByLabelText("Open Beta. Tonight. S02E05. The Return · Max"),
    ).toBeTruthy();
  });

  it("invalidates active schedule preview data after refreshing releases", async () => {
    await refreshHomeSchedulePreviewData(mockRefreshForMe, mockInvalidateQueries);

    expect(mockRefreshForMe).toHaveBeenCalledWith({ today: "2026-05-30" });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["plotlist-rpc"],
      refetchType: "active",
    });
  });

  it("retries a stale schedule refresh after a transient failure", async () => {
    mockRefreshForMe
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    mockUseQuery.mockImplementation(() => ({
      ...makePreview(),
      staleShowIds: ["show-1"],
    }));

    const { rerender } = render(<TonightStrip />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRefreshForMe).toHaveBeenCalledTimes(1);

    rerender(<TonightStrip />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRefreshForMe).toHaveBeenCalledTimes(2);
  });

  it("builds schedule card decision context from episode and provider data", () => {
    const event = makeEvent();

    expect(getScheduleCardSubline(event)).toBe("The Return · Max");
    expect(getScheduleCardVisibleSubline(event)).toBe("The Return · Max");
    expect(
      getScheduleCardAccessibilityLabel({
        item: event,
        dateLabel: "Tonight",
      }),
    ).toBe("Open Alpha. Tonight. S02E05. The Return · Max");
  });

  it("keeps premiere and finale schedule copy compact without hiding the release signal", () => {
    const premiere = makeEvent({
      episodeTitle: "Season premiere",
      isPremiere: true,
      isSeasonFinale: false,
      providers: [{ name: "Peacock" }],
    });
    const finale = makeEvent({
      episodeTitle: "Finale",
      isPremiere: false,
      isSeasonFinale: true,
      providers: [{ name: "Max" }],
    });

    expect(getScheduleCardSubline(premiere)).toBe("Season premiere · Peacock");
    expect(getScheduleCardVisibleSubline(premiere)).toBe("Premiere · Peacock");
    expect(getScheduleCardVisibleSubline(finale)).toBe("Finale · Max");
    expect(
      getScheduleCardAccessibilityLabel({
        item: premiere,
        dateLabel: "Tuesday, Jun 2",
      }),
    ).toBe("Open Alpha. Tuesday, Jun 2. S02E05. Season premiere · Peacock");
  });

  it("uses the air-date string for future card labels so timezone offsets do not shift releases", () => {
    expect(
      getScheduleCardDateLabel(
        {
          airDate: "2026-06-02",
          airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
        },
        "2026-05-30",
      ),
    ).toBe("Tuesday, Jun 2");
  });

  it("renders provider context and opens the selected show", () => {
    render(<TonightStrip />);

    expect(screen.getByText("Releases")).toBeTruthy();
    expect(screen.queryByLabelText("Open Calendar from Releases")).toBeNull();
    expect(
      screen.getByLabelText("Open Alpha. Tonight. S02E05. The Return · Max"),
    ).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("The Return · Max")).toBeTruthy();
    expect(screen.queryByText("FINALE")).toBeNull();
    expect(screen.queryByText("TONIGHT")).toBeNull();

    fireEvent.press(screen.getByLabelText("Open Alpha. Tonight. S02E05. The Return · Max"));

    expect(mockPush).toHaveBeenCalledWith("/show/show-1");
  });

  it("keeps premiere schedule cards concise without dropping the full action label", () => {
    mockUseQuery.mockReturnValue(
      makePreview(
        makeEvent({
          episodeTitle: "Season premiere",
          isPremiere: true,
          isSeasonFinale: false,
          providers: [{ name: "Peacock" }],
          show: {
            _id: "show-love-island",
            title: "Love Island USA",
            posterUrl: null,
            backdropUrl: null,
          },
        }),
      ),
    );

    render(<TonightStrip />);

    expect(screen.getByText("Love Island USA")).toBeTruthy();
    expect(screen.getByText("Premiere · Peacock")).toBeTruthy();
    expect(screen.queryByText("Season premiere · Peacock")).toBeNull();
    expect(screen.queryByText("S02E05")).toBeNull();
    expect(screen.queryByText("PREMIERE")).toBeNull();
    expect(
      screen.getByLabelText(
        "Open Love Island USA. Tonight. S02E05. Season premiere · Peacock",
      ),
    ).toBeTruthy();
  });

  it("keeps image-backed schedule cards self-contained without outside captions", () => {
    mockUseQuery.mockReturnValue(
      makePreview(
        makeEvent({
          show: {
            _id: "show-1",
            title: "Alpha",
            posterUrl: null,
            backdropUrl: "https://example.com/alpha.jpg",
          },
        }),
      ),
    );

    render(<TonightStrip />);

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("The Return · Max")).toBeTruthy();
    expect(screen.getAllByText("Alpha")).toHaveLength(1);
    expect(screen.getAllByText("The Return · Max")).toHaveLength(1);
  });

  it("updates the selected schedule rail without repeating counts in the header", () => {
    mockUseQuery.mockReturnValue({
      tonightGroups: [
        {
          airDate: "2026-05-30",
          airDateTs: Date.parse("2026-05-30T00:00:00.000Z"),
          items: [makeEvent({ show: { _id: "show-1", title: "Alpha" } })],
        },
      ],
      upcomingGroups: [
        {
          airDate: "2026-06-01",
          airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
          items: [
            makeEvent({
              airDate: "2026-06-01",
              airDateTs: Date.parse("2026-06-01T00:00:00.000Z"),
              show: { _id: "show-2", title: "Beta" },
            }),
          ],
        },
      ],
      staleShowIds: [],
    });

    render(<TonightStrip />);

    expect(screen.queryByText("1 tonight.")).toBeNull();
    expect(screen.getByLabelText("Tonight, 1 release, selected")).toBeTruthy();

    fireEvent.press(screen.getByText("This week"));

    expect(screen.queryByText("1 this week.")).toBeNull();
    expect(screen.queryByText("1 tonight.")).toBeNull();
    expect(screen.getByLabelText("This week, 1 release, selected")).toBeTruthy();
    expect(screen.getByText("Monday, Jun 1")).toBeTruthy();
    expect(screen.queryByText("MONDAY, JUN 1")).toBeNull();
    expect(
      screen.getByLabelText("Open Beta. Monday, Jun 1. S02E05. The Return · Max"),
    ).toBeTruthy();
  });

  it("does not route malformed schedule items to an undefined show page", () => {
    mockUseQuery.mockReturnValue(
      makePreview(
        makeEvent({
          show: {
            title: "Alpha",
            posterUrl: null,
            backdropUrl: null,
          },
        }),
      ),
    );

    render(<TonightStrip />);

    fireEvent.press(screen.getByLabelText("Open Alpha. Tonight. S02E05. The Return · Max"));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps schedule segment controls large enough for touch QA", () => {
    render(<TonightStrip />);

    ["home-schedule-tab-tonight", "home-schedule-tab-week"].forEach((testID) => {
      const tab = screen.getByTestId(testID);
      const style = StyleSheet.flatten(tab.props.style);

      expect(style.minHeight).toBeGreaterThanOrEqual(
        HOME_SCHEDULE_SEGMENTED_TAB_TOUCH_TARGET,
      );
    });
  });
});
