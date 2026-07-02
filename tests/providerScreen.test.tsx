import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

let mockSearchParams: Record<string, string> = { id: "hulu" };
let mockTmdbPages: unknown[][] = [];
const mockGetTmdbList = jest.fn(async () => mockTmdbPages.shift() ?? []);
const mockIngestFromCatalog = jest.fn(async () => "show-1");
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../lib/plotlist/react", () => ({
  useAuth: () => ({ isAuthenticated: true }),
  useAction: (action: { __name?: string }) =>
    action.__name === "shows:getTmdbList"
      ? mockGetTmdbList
      : mockIngestFromCatalog,
}));

jest.mock("../components/FlashList", () => ({
  FlashList: ({
    data,
    renderItem,
    ListEmptyComponent,
    ListFooterComponent,
  }: {
    data?: unknown[];
    renderItem: (args: { item: unknown; index: number }) => ReactNode;
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
        {data && data.length > 0
          ? data.map((item, index) => (
              <View key={`${index}`}>
                {renderItem({ item, index })}
              </View>
            ))
          : renderOptional(ListEmptyComponent)}
        {renderOptional(ListFooterComponent)}
      </View>
    );
  },
}));

import ProviderScreen from "../app/provider/[id]";

// The provider room renders editorial seeds with validFrom/validThrough
// windows, so pin Date (and only Date) inside the researched window to keep
// this suite green regardless of when it runs.
jest.useFakeTimers({
  doNotFake: [
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "setImmediate",
    "clearImmediate",
    "queueMicrotask",
    "nextTick",
    "performance",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ],
  now: new Date("2026-06-10T12:00:00Z"),
});

describe("ProviderScreen", () => {
  beforeEach(() => {
    mockSearchParams = { id: "hulu" };
    mockTmdbPages = [];
    mockGetTmdbList.mockClear();
    mockIngestFromCatalog.mockClear();
    mockBack.mockClear();
    mockPush.mockClear();
  });

  it("renders freshness signals from the homepage provider room on the provider destination", async () => {
    render(<ProviderScreen />);

    await waitFor(() => {
      expect(screen.getByText("Deli Boys")).toBeTruthy();
    });

    expect(screen.getByText("S2 May 28")).toBeTruthy();
    expect(screen.getByText("The Bear")).toBeTruthy();
    expect(screen.getByText("FX/Hulu Jun 25")).toBeTruthy();
    expect(mockGetTmdbList).toHaveBeenCalledWith(
      expect.objectContaining({ category: "hulu", page: 1 }),
    );
  });

  it("places the homepage featured title first when opening a provider room", async () => {
    mockSearchParams = { id: "hulu", featuredTitle: "Tracker" };
    mockTmdbPages = [
      [
        {
          externalSource: "tmdb",
          externalId: "tracker",
          title: "Tracker",
          year: 2024,
          posterUrl: "https://img.example.com/tracker.jpg",
        },
      ],
      [],
      [],
    ];

    render(<ProviderScreen />);

    await waitFor(() => {
      expect(screen.getByText("Tracker")).toBeTruthy();
    });

    const orderedTitles = screen
      .getAllByText(/Tracker|Deli Boys|The Bear/)
      .map((node) => node.props.children);
    expect(orderedTitles[0]).toBe("Tracker");
    expect(orderedTitles).toContain("Deli Boys");
    expect(orderedTitles).toContain("The Bear");
  });
});
