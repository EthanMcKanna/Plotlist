import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name?: string }) => name ?? "icon",
}));

import {
  getArtworkFallbackInitials,
  HomeArtworkFallback,
} from "../../components/HomeArtworkFallback";

const includeHiddenElements = { includeHiddenElements: true };

describe("HomeArtworkFallback", () => {
  it("builds compact title marks from show names", () => {
    expect(getArtworkFallbackInitials("Love Island USA")).toBe("LI");
    expect(getArtworkFallbackInitials("Rafa")).toBe("R");
    expect(getArtworkFallbackInitials("  ")).toBe("TV");
  });

  it("keeps missing artwork visually informative but hidden from accessibility", () => {
    render(
      <HomeArtworkFallback
        testID="fallback-card"
        title="Poker Face"
        subtitle="Whodunit · Episode 4 of 12"
        accent="#0EA5E9"
        compact
      />,
    );

    const fallback = screen.getByTestId("fallback-card", includeHiddenElements);
    expect(fallback.props["aria-hidden"]).toBe(true);
    expect(screen.getByText("PF", includeHiddenElements)).toBeTruthy();
    expect(screen.getByText("Poker Face", includeHiddenElements)).toBeTruthy();
    expect(
      screen.getByText("Whodunit · Episode 4 of 12", includeHiddenElements),
    ).toBeTruthy();
  });

  it("can hide its bottom copy when a parent card owns the caption", () => {
    render(
      <HomeArtworkFallback
        testID="fallback-card"
        title="Love Island USA"
        subtitle="Peacock"
        accent="#38BDF8"
        compact
        copyVisible={false}
      />,
    );

    expect(screen.getByText("LI", includeHiddenElements)).toBeTruthy();
    expect(screen.queryByText("Love Island USA", includeHiddenElements)).toBeNull();
    expect(screen.queryByText("Peacock", includeHiddenElements)).toBeNull();
    expect(screen.queryByText("tv-outline", includeHiddenElements)).toBeNull();
  });

  it("can hide the initials mark for dense parent-owned fallback cards", () => {
    render(
      <HomeArtworkFallback
        testID="fallback-card"
        title="Love Island USA"
        subtitle="Peacock"
        accent="#38BDF8"
        compact
        copyVisible={false}
        markVisible={false}
        haloVisible={false}
        ornamentsVisible={false}
      />,
    );

    expect(screen.queryByText("LI", includeHiddenElements)).toBeNull();
    expect(screen.queryByText("Love Island USA", includeHiddenElements)).toBeNull();
    expect(screen.queryByText("Peacock", includeHiddenElements)).toBeNull();
    expect(screen.queryByText("tv-outline", includeHiddenElements)).toBeNull();
  });
});
