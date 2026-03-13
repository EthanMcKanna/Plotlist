import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { TasteMatchSummary } from "../../components/TasteMatchSummary";

describe("TasteMatchSummary", () => {
  it("renders the match percent and shared favorites", () => {
    render(
      <TasteMatchSummary
        percent={82}
        sharedFavoriteShows={[
          { showId: "show-1", title: "Severance", posterUrl: "https://example.com/a.jpg" },
          { showId: "show-2", title: "The Bear", posterUrl: "https://example.com/b.jpg" },
        ]}
      />,
    );

    expect(screen.getAllByText("82%")).toHaveLength(1);
    expect(screen.getByText("Shared Favorites")).toBeTruthy();
    expect(screen.getByText("Severance • The Bear")).toBeTruthy();
  });

  it("renders the compact explanatory copy when there are no shared favorites", () => {
    render(
      <TasteMatchSummary
        percent={64}
        sharedFavoriteShows={[]}
        variant="compact"
      />,
    );

    expect(screen.getAllByText("64%")).toHaveLength(1);
    expect(
      screen.getByText("Your watch history and favorites align closely."),
    ).toBeTruthy();
  });
});
