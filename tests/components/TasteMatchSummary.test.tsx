import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { TasteMatchChip, TasteMatchSummary } from "../../components/TasteMatchSummary";
import { tasteMatchTier } from "../../lib/plotlist/recsRanking";

describe("TasteMatchSummary", () => {
  it("renders the calibrated percent, tier label, and the why sections", () => {
    render(
      <TasteMatchSummary
        percent={82}
        sharedFavoriteShows={[
          { showId: "show-1", title: "Severance", posterUrl: "https://example.com/a.jpg" },
          { showId: "show-2", title: "The Bear", posterUrl: "https://example.com/b.jpg" },
        ]}
        sharedFacets={[
          { key: "prestige-antihero", title: "Prestige Antihero", score: 0.8 },
          { key: "workplace-comedy", title: "Workplace Comedy", score: 0.7 },
        ]}
      />,
    );

    expect(screen.getByText("82%")).toBeTruthy();
    expect(screen.getByText(tasteMatchTier(82).label)).toBeTruthy();
    expect(screen.getByText("Prestige Antihero")).toBeTruthy();
    expect(screen.getByText("Workplace Comedy")).toBeTruthy();
    expect(screen.getByText("2 shows in common")).toBeTruthy();
  });

  it("caps the facet row at three chips with a +N overflow", () => {
    render(
      <TasteMatchSummary
        percent={82}
        sharedFavoriteShows={[]}
        sharedFacets={[
          { key: "a", title: "Facet A", score: 0.9 },
          { key: "b", title: "Facet B", score: 0.8 },
          { key: "c", title: "Facet C", score: 0.7 },
          { key: "d", title: "Facet D", score: 0.6 },
          { key: "e", title: "Facet E", score: 0.5 },
        ]}
      />,
    );

    expect(screen.getByText("Facet C")).toBeTruthy();
    expect(screen.queryByText("Facet D")).toBeNull();
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("invites the breakdown when tappable and picks exist", () => {
    const onPress = jest.fn();
    render(
      <TasteMatchSummary
        percent={64}
        sharedFavoriteShows={[]}
        hasPicks
        onPress={onPress}
      />,
    );

    expect(screen.getByText("Picks for you")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Taste match 64 percent — see full breakdown"));
    expect(onPress).toHaveBeenCalled();
  });

  it("renders a compact chip for list rows", () => {
    render(<TasteMatchChip percent={71} />);
    expect(screen.getByText("71%")).toBeTruthy();
  });
});
