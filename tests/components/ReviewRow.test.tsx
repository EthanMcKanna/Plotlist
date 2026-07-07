import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { ReviewRow, getReviewRowEpisodeLabel } from "../../components/ReviewRow";

describe("ReviewRow episode labels", () => {
  it("builds S01E04-style codes only when both numbers exist", () => {
    expect(getReviewRowEpisodeLabel({ seasonNumber: 1, episodeNumber: 4 })).toBe("S01E04");
    expect(getReviewRowEpisodeLabel({ seasonNumber: 10, episodeNumber: 12 })).toBe("S10E12");
    expect(getReviewRowEpisodeLabel({ seasonNumber: null, episodeNumber: 4 })).toBeNull();
    expect(getReviewRowEpisodeLabel({})).toBeNull();
  });

  it("shows the episode chip on rating-only rows", () => {
    render(
      <ReviewRow
        id="review_1"
        showTitle="Severance"
        rating={4.5}
        seasonNumber={2}
        episodeNumber={3}
      />,
    );
    expect(screen.getByText("S02E03")).toBeTruthy();
    expect(screen.getByText("★ 4.5/5")).toBeTruthy();
  });

  it("shows the episode chip on full review cards", () => {
    render(
      <ReviewRow
        id="review_2"
        showTitle="Severance"
        rating={5}
        reviewText="The best episode of the season."
        seasonNumber={1}
        episodeNumber={9}
      />,
    );
    expect(screen.getByText("S01E09")).toBeTruthy();
    expect(screen.getByText("The best episode of the season.")).toBeTruthy();
  });

  it("renders no chip for show-level reviews", () => {
    render(<ReviewRow id="review_3" showTitle="Severance" rating={4} />);
    expect(screen.queryByText(/S\d{2}E\d{2}/)).toBeNull();
  });
});
