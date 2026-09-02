import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("../components/HorizontalRail", () => ({
  HorizontalRail: ({ children }: { children: ReactNode }) => {
    const { View } = require("react-native");
    return <View testID="rail">{children}</View>;
  },
}));

jest.mock("../components/NativeGlass", () => ({
  GlassPressable: ({
    children,
    onPress,
    disabled,
    testID,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
  }) => {
    const { Pressable } = require("react-native");
    return (
      <Pressable testID={testID} onPress={onPress} disabled={disabled}>
        {children}
      </Pressable>
    );
  },
}));

import { WhereToWatchSection } from "../components/WhereToWatchSection";

describe("WhereToWatchSection", () => {
  it("stays hidden until extended details have loaded", () => {
    render(<WhereToWatchSection providers={undefined} loaded={false} onPressProvider={jest.fn()} />);
    expect(screen.queryByTestId("where-to-watch")).toBeNull();
    expect(screen.queryByText("Where to Watch")).toBeNull();
  });

  it("says so honestly when nothing qualifies instead of listing stores", () => {
    render(<WhereToWatchSection providers={[]} loaded onPressProvider={jest.fn()} />);
    expect(screen.getByText("Where to Watch")).toBeTruthy();
    expect(screen.getByText("Not streaming in the US right now.")).toBeTruthy();
    expect(screen.queryByTestId("rail")).toBeNull();
    expect(screen.getByText("Availability data by JustWatch.")).toBeTruthy();
  });

  it("renders one chip per resolved service in order, marking free services", () => {
    const onPress = jest.fn();
    render(
      <WhereToWatchSection
        loaded
        onPressProvider={onPress}
        providers={[
          { key: "apple_tv", name: "Apple TV+", logoUrl: "https://img/apple.jpg", source: "original", deepLinkUrl: null },
          { key: "netflix", name: "Netflix", logoUrl: null, source: "subscription", deepLinkUrl: "https://netflix.com" },
          { key: "tubi", name: "Tubi", logoUrl: null, source: "free" },
        ]}
      />,
    );
    expect(screen.getByText("Streaming in the US with a subscription or for free.")).toBeTruthy();
    const chips = screen.getAllByTestId(/^where-to-watch-/);
    expect(chips.map((chip) => chip.props.testID)).toEqual([
      "where-to-watch-apple_tv",
      "where-to-watch-netflix",
      "where-to-watch-tubi",
    ]);
    expect(screen.getByText("Apple TV+")).toBeTruthy();
    expect(screen.getByText("Free")).toBeTruthy();
    expect(screen.queryByText("Prime Video")).toBeNull();

    fireEvent.press(screen.getByTestId("where-to-watch-netflix"));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ key: "netflix" }));
  });

  it("ignores malformed provider entries", () => {
    render(
      <WhereToWatchSection
        loaded
        onPressProvider={jest.fn()}
        providers={[{ name: "" } as any, null as any, { key: "hulu", name: "Hulu" }]}
      />,
    );
    expect(screen.getAllByTestId(/^where-to-watch-/).map((chip) => chip.props.testID)).toEqual([
      "where-to-watch-hulu",
    ]);
  });
});
