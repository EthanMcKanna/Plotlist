import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockUseQuery = jest.fn();
const mockRefreshForMe = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetProviderFilter = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock("expo-router", () => ({
  router: {
    back: mockBack,
    push: mockPush,
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name?: string }) => name ?? "icon",
}));

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useAction: () => mockRefreshForMe,
  useMutation: () => mockSetProviderFilter,
  useQuery: (...args: [unknown, unknown?]) => mockUseQuery(...args),
}));

type CalendarArgs = {
  view: string;
  today: string;
  limit?: number;
  selectedProvidersOverride?: string[];
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

function buildQueryResult(args: CalendarArgs) {
  const providerOptions = [
    { key: "netflix", name: "Netflix", logoUrl: "" },
    { key: "hulu", name: "Hulu", logoUrl: "" },
  ];
  const selectedProviders = args.selectedProvidersOverride ?? [];
  const allItems = [
    makeEvent("Alpha", ["Netflix"]),
    makeEvent("Beta", ["Hulu"]),
  ];
  const filteredItems =
    selectedProviders.length === 0
      ? allItems
      : allItems.filter((item) =>
          item.providers.some((provider) => selectedProviders.includes(provider.name)),
        );

  if (args.view === "finales") {
    return {
      providerOptions,
      selectedProviders,
      groups: [],
      totalItems: 0,
      staleShowIds: [],
      continueCursor: "0",
      isDone: true,
    };
  }

  if (args.view === "upcoming") {
    return {
      providerOptions,
      selectedProviders,
      groups: [
        {
          airDate: "2026-03-13",
          airDateTs: Date.parse("2026-03-13T00:00:00.000Z"),
          items: filteredItems,
        },
      ],
      totalItems: filteredItems.length,
      staleShowIds: [],
      continueCursor: String(filteredItems.length),
      isDone: true,
    };
  }

  return {
    providerOptions,
    selectedProviders,
    groups: [
      {
        airDate: "2026-03-13",
        airDateTs: Date.parse("2026-03-13T00:00:00.000Z"),
        items: [filteredItems[0] ?? allItems[0]],
      },
    ],
    totalItems: 1,
    staleShowIds: [],
    continueCursor: "1",
    isDone: true,
  };
}

import CalendarScreen from "../../app/calendar";

describe("CalendarScreen", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockRefreshForMe.mockClear();
    mockSetProviderFilter.mockClear();
    mockUseQuery.mockReset();
    (mockUseQuery as any).mockImplementation((_: unknown, args?: CalendarArgs | "skip") => {
      if (!args || args === "skip") {
        return undefined;
      }
      return buildQueryResult(args);
    });
  });

  it("defaults to upcoming and shows releases", () => {
    render(<CalendarScreen />);

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
  });

  it("renders the empty state when the selected view has no results", async () => {
    (mockUseQuery as any).mockImplementation((_: unknown, args?: CalendarArgs | "skip") => {
      if (!args || args === "skip") return undefined;
      if (args.view === "upcoming") {
        return {
          providerOptions: [],
          selectedProviders: [],
          groups: [],
          totalItems: 0,
          staleShowIds: [],
          continueCursor: "0",
          isDone: true,
        };
      }
      return buildQueryResult(args);
    });

    render(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByText("No upcoming releases")).toBeTruthy();
    });
  });
});
