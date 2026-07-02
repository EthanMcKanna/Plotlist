import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import {
  FeedItem,
  getFeedStatusVerb,
  type FeedItemProps,
} from "../../components/FeedItem";

describe("FeedItem", () => {
  const startedItem: FeedItemProps = {
    type: "started",
    timestamp: Date.parse("2026-06-01T12:00:00.000Z"),
    user: {
      _id: "user-1",
      displayName: "Avery",
      username: "avery",
    },
    show: {
      _id: "show-1",
      title: "Severance",
      year: 2025,
      posterUrl: "https://img.example.com/severance.jpg",
    },
  };

  it("keeps status feed copy short on compact homepage activity rows", () => {
    render(<FeedItem item={startedItem} />);

    expect(getFeedStatusVerb("started")).toBe("started");
    expect(getFeedStatusVerb("completed")).toBe("finished");
    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("started")).toBeTruthy();
    expect(screen.queryByText("started watching")).toBeNull();
    expect(screen.getByText("Severance")).toBeTruthy();
    expect(screen.queryByText("play-circle")).toBeNull();
    expect(screen.queryByText("checkmark-circle")).toBeNull();
  });
});
