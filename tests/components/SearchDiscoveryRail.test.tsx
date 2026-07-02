import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

import {
  SearchDiscoveryRail,
  getSearchDiscoveryItemAccessibilityLabel,
  getSearchDiscoveryRailAccessibilityLabel,
} from "../../components/SearchDiscoveryRail";

const section = {
  key: "fresh_premieres",
  category: "fresh_premieres",
  label: "Fresh Premieres",
  icon: "sparkles",
  items: [
    {
      externalSource: "tmdb",
      externalId: "101",
      title: "The Agency",
      year: 2026,
      posterUrl: "https://image.example/the-agency.jpg",
    },
    {
      externalSource: "tmdb",
      externalId: "102",
      title: "Long Bright River",
      year: 2025,
      posterUrl: "https://image.example/long-bright-river.jpg",
    },
  ],
};

describe("SearchDiscoveryRail", () => {
  it("renders a home-aligned discovery section with accessible poster actions", () => {
    const onPressItem = jest.fn();

    render(
      <SearchDiscoveryRail
        index={2}
        section={section}
        accent="#38BDF8"
        onPressItem={onPressItem}
      />,
    );

    expect(screen.getByText("Fresh Premieres")).toBeTruthy();
    expect(screen.getByText("The Agency")).toBeTruthy();
    expect(screen.getByText("Long Bright River")).toBeTruthy();
    expect(
      screen.getByLabelText("Fresh Premieres. 2 shows"),
    ).toBeTruthy();

    fireEvent.press(
      screen.getByLabelText("Open The Agency. 2026. Fresh Premieres"),
    );

    expect(onPressItem).toHaveBeenCalledWith(section.items[0]);
  });

  it("keeps provider actions tappable without hijacking poster presses", () => {
    const onAction = jest.fn();
    const onPressItem = jest.fn();

    render(
      <SearchDiscoveryRail
        section={{
          ...section,
          key: "netflix",
          label: "Netflix",
          logoUrl: "https://image.example/netflix.jpg",
        }}
        accent="#F87171"
        actionLabel="All"
        onAction={onAction}
        onPressItem={onPressItem}
      />,
    );

    fireEvent.press(screen.getByLabelText("Open All from Netflix"));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onPressItem).not.toHaveBeenCalled();
  });

  it("builds stable labels for rail and poster accessibility", () => {
    expect(
      getSearchDiscoveryRailAccessibilityLabel({
        label: "Hidden Gems",
        count: 1,
      }),
    ).toBe("Hidden Gems. 1 show");

    expect(
      getSearchDiscoveryItemAccessibilityLabel(
        { title: "Pluribus", year: 2025, posterUrl: "poster.jpg" },
        "Critic Favorites",
      ),
    ).toBe("Open Pluribus. 2025. Critic Favorites");
  });
});
