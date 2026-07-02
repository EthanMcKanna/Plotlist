import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import {
  SearchCommandCenter,
  getSearchCommandCenterCopy,
} from "../../components/SearchCommandCenter";

describe("SearchCommandCenter", () => {
  it("renders a compact search surface and forwards query edits", () => {
    const onQueryChange = jest.fn();

    render(
      <SearchCommandCenter
        mode="shows"
        query=""
        isFocused={false}
        onModeChange={jest.fn()}
        onQueryChange={onQueryChange}
        onFocus={jest.fn()}
        onBlur={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByPlaceholderText("Shows, genres, creators"), "the");

    expect(screen.getByText("Search")).toBeTruthy();
    expect(screen.queryByText("TV discovery")).toBeNull();
    expect(screen.queryByText("Live")).toBeNull();
    expect(onQueryChange).toHaveBeenCalledWith("the");
  });

  it("switches modes and keeps the clear affordance explicit", () => {
    const onModeChange = jest.fn();
    const onClear = jest.fn();

    render(
      <SearchCommandCenter
        mode="people"
        query="ethan"
        isFocused
        onModeChange={onModeChange}
        onQueryChange={jest.fn()}
        onFocus={jest.fn()}
        onBlur={jest.fn()}
        onClear={onClear}
      />,
    );

    fireEvent.press(screen.getByText("Shows"));
    fireEvent.press(screen.getByLabelText("Clear search"));

    expect(screen.getByPlaceholderText("People or @username")).toBeTruthy();
    expect(onModeChange).toHaveBeenCalledWith("shows");
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("keeps command-center copy minimal and mode-specific", () => {
    expect(getSearchCommandCenterCopy("shows")).toEqual({
      accessibilityLabel: "Search shows",
      placeholder: "Shows, genres, creators",
    });
    expect(getSearchCommandCenterCopy("people")).toEqual({
      accessibilityLabel: "Search people",
      placeholder: "People or @username",
    });
  });

  it("keeps the input at native mobile search height", () => {
    render(
      <SearchCommandCenter
        mode="shows"
        query=""
        isFocused={false}
        onModeChange={jest.fn()}
        onQueryChange={jest.fn()}
        onFocus={jest.fn()}
        onBlur={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    const searchField = screen.getByTestId("search-command-input-frame");
    const style = StyleSheet.flatten(searchField?.props.style);

    expect(style.minHeight).toBe(48);
  });

  it("shows non-layout-shifting busy feedback while results refresh", () => {
    render(
      <SearchCommandCenter
        mode="shows"
        query="severance"
        isFocused
        isBusy
        onModeChange={jest.fn()}
        onQueryChange={jest.fn()}
        onFocus={jest.fn()}
        onBlur={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId("search-command-busy-indicator", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Clear search")).toBeTruthy();
  });

  it("does not narrate internal query length thresholds", () => {
    render(
      <SearchCommandCenter
        mode="shows"
        query="se"
        isFocused={false}
        onModeChange={jest.fn()}
        onQueryChange={jest.fn()}
        onFocus={jest.fn()}
        onBlur={jest.fn()}
        onClear={jest.fn()}
      />,
    );

    expect(screen.queryByText(/character/i)).toBeNull();
    expect(screen.queryByText(/needed/i)).toBeNull();
  });
});
