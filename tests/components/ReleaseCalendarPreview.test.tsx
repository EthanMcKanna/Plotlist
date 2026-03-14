import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockUseQuery = jest.fn();
const mockRefreshForMe = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock("expo-router", () => ({
  router: {
    push: mockPush,
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name?: string }) => name ?? "icon",
}));

jest.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useAction: () => mockRefreshForMe,
  useQuery: (...args: [unknown, unknown?]) => mockUseQuery(...args),
}));

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

import { ReleaseCalendarPreview } from "../../components/ReleaseCalendarPreview";

describe("ReleaseCalendarPreview", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefreshForMe.mockClear();
    mockUseQuery.mockReset().mockReturnValue({
      tonightGroups: [
        {
          items: [
            {
              airDate: "2026-03-13",
              airDateTs: 1773590400000,
              seasonNumber: 1,
              episodeNumber: 1,
              episodeTitle: "Pilot",
              providers: [{ name: "Netflix" }],
              show: {
                _id: "show-1",
                title: "Alpha",
                posterUrl: null,
                backdropUrl: null,
              },
            },
          ],
        },
      ],
      upcomingGroups: [],
      totalTonight: 1,
      totalUpcoming: 1,
      staleShowIds: [],
      selectedProviders: [],
    });
  });

  it("renders the next release slice when preview data exists", () => {
    render(<ReleaseCalendarPreview />);

    expect(screen.getByText("On Tonight")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("S01E01")).toBeTruthy();
  });

  it("renders nothing when there are no release items", () => {
    mockUseQuery.mockReturnValue({
      tonightGroups: [],
      upcomingGroups: [],
      totalTonight: 0,
      totalUpcoming: 0,
      staleShowIds: [],
      selectedProviders: [],
    });

    const { queryByText } = render(<ReleaseCalendarPreview />);

    expect(queryByText("On Tonight")).toBeNull();
  });
});
