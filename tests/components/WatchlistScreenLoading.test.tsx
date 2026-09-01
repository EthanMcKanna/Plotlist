import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

let mockPaginated: { results: unknown[]; status: string; loadMore: (n?: number) => void };

jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children?: ReactNode }) => children ?? null,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    SafeAreaView: View,
    SafeAreaProvider: View,
  };
});
jest.mock("../../lib/plotlist/react", () => ({
  useAuth: () => ({ isAuthenticated: true }),
  useQuery: (ref: { __name?: string }) =>
    ref.__name === "users:profile" ? { permissions: { watchlist: true } } : undefined,
  usePaginatedQuery: () => mockPaginated,
}));
jest.mock("../../components/FlashList", () => ({
  FlashList: ({
    data,
    renderItem,
  }: {
    data?: unknown[];
    renderItem: (args: { item: unknown; index: number }) => ReactNode;
  }) => {
    const { View } = require("react-native");
    return (
      <View testID="watchlist-grid">
        {(data ?? []).map((item, index) => (
          <View key={`${index}`}>{renderItem({ item, index })}</View>
        ))}
      </View>
    );
  },
}));

import WatchlistScreen from "../../app/me/watchlist";
import PublicWatchlistScreen from "../../app/profile/[id]/watchlist";

const ROW = {
  state: { _id: "ws_1", status: "watching" },
  show: { _id: "show_1", title: "Severance", posterUrl: null, year: 2022 },
};

// AGENTS.md: list UI never gates on results.length alone — the first page
// (and every filter change's first page) shows a skeleton, not the empty
// state, until the server has answered.
describe.each([
  ["My Shows", () => <WatchlistScreen />, "Nothing here yet"],
  ["public watchlist", () => <PublicWatchlistScreen />, "Watchlist is empty"],
])("%s loading states", (_label, renderScreen, emptyTitle) => {
  beforeEach(() => {
    mockPaginated = { results: [], status: "LoadingFirstPage", loadMore: jest.fn() };
  });

  it("shows the poster-grid skeleton, not the empty state, while the first page loads", () => {
    render(renderScreen());
    expect(screen.getByTestId("poster-grid-skeleton")).toBeTruthy();
    expect(screen.queryByText(emptyTitle)).toBeNull();
    expect(screen.queryByTestId("watchlist-grid")).toBeNull();
  });

  it("shows the empty state only once the server returned nothing", () => {
    mockPaginated = { results: [], status: "Exhausted", loadMore: jest.fn() };
    render(renderScreen());
    expect(screen.queryByTestId("poster-grid-skeleton")).toBeNull();
    expect(screen.getByText(emptyTitle)).toBeTruthy();
  });

  it("renders the grid when rows are present", () => {
    mockPaginated = { results: [ROW], status: "CanLoadMore", loadMore: jest.fn() };
    render(renderScreen());
    expect(screen.getByTestId("watchlist-grid")).toBeTruthy();
    expect(screen.getByText("Severance")).toBeTruthy();
    expect(screen.queryByTestId("poster-grid-skeleton")).toBeNull();
  });
});
