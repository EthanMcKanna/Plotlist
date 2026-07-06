import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

import {
  SearchResultRow,
  getSearchResultRowAccessibilityLabel,
} from "../../components/SearchResultRow";

describe("SearchResultRow", () => {
  it("makes the entire slim row a self-describing action", () => {
    const onPress = jest.fn();

    render(
      <SearchResultRow
        title="Severance"
        year={2025}
        overview="A workplace thriller about memory, labor, and the rituals of the office."
        posterUrl="https://image.example/severance.jpg"
        actionLabel="Add to Plotlist"
        onPress={onPress}
      />,
    );

    fireEvent.press(
      screen.getByLabelText("Open Severance. 2025. Add to Plotlist"),
    );

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Severance")).toBeTruthy();
    // Source badges and the add button are gone — the row is just poster,
    // title, year, and overview.
    expect(screen.queryByText("TMDB")).toBeNull();
    expect(screen.queryByText("add", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText("Add to Plotlist")).toBeNull();
  });

  it("keeps the search row compact but mobile-safe", () => {
    render(
      <SearchResultRow
        title="The Pitt"
        year={2025}
        posterUrl={null}
        onPress={jest.fn()}
      />,
    );

    const row = screen.getByLabelText("Open The Pitt. 2025");
    const style = StyleSheet.flatten(row.props.style);

    expect(style.borderBottomWidth).toBeGreaterThan(0);
    expect(style.minHeight).toBeGreaterThanOrEqual(90);
  });

  it("builds accessibility labels without empty metadata gaps", () => {
    expect(
      getSearchResultRowAccessibilityLabel({
        title: "Pluribus",
        year: null,
        actionLabel: "Open",
      }),
    ).toBe("Open Pluribus. Open");
  });
});
