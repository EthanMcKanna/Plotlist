import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

import { SearchDiscoveryRail } from "../../components/SearchDiscoveryRail";

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
  it("renders the home rail treatment with accessible poster actions", () => {
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
    expect(screen.getByLabelText("Fresh Premieres rail")).toBeTruthy();
    // Home header keeps the section context in the accessibility label only —
    // no icon chip renders next to the title.
    expect(
      screen.getByLabelText("Section 02. Discover. Fresh Premieres"),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Open The Agency. 2026"));

    expect(onPressItem).toHaveBeenCalledWith(section.items[0]);
  });

  it("does not caption posters with a visible dot/year line", () => {
    render(
      <SearchDiscoveryRail
        section={section}
        accent="#38BDF8"
        onPressItem={jest.fn()}
      />,
    );

    // Poster cards are pure artwork: the year appears in accessibility labels
    // but never as a rendered caption under the poster.
    expect(screen.queryByText("2026")).toBeNull();
    expect(screen.queryByText("2025")).toBeNull();
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
});
