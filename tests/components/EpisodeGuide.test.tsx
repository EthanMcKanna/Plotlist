import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-image", () => ({
  Image: () => null,
}));

import { EpisodeGuide } from "../../components/EpisodeGuide";

describe("EpisodeGuide", () => {
  it("renders retry UI for failed season loads instead of empty-state copy", () => {
    render(
      <EpisodeGuide
        seasons={[
          {
            id: 1,
            name: "Season 1",
            season_number: 1,
            air_date: "2000-01-01",
            episode_count: 16,
          },
        ]}
        visibleSeasonCount={3}
        seasonDetailsByNumber={{}}
        seasonLoadStateByNumber={{ 1: "error" }}
        seasonLoadErrorByNumber={{
          1: "Too many season requests. Try again in a moment.",
        }}
        isAuthenticated
        watchedEpisodeSet={new Set()}
        myEpisodeRatingMap={new Map()}
        isEpisodeAvailable={() => true}
        onLoadMoreSeasons={jest.fn()}
        onRetrySeason={jest.fn()}
        onMarkSeasonWatched={jest.fn()}
        onUnmarkSeasonWatched={jest.fn()}
        onToggleEpisode={jest.fn()}
        onSelectEpisode={jest.fn()}
      />,
    );

    expect(
      screen.getByText("Too many season requests. Try again in a moment."),
    ).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.queryByText("No episodes found for this season.")).toBeNull();
  });
});
