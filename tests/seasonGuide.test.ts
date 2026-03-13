import { describe, expect, it } from "@jest/globals";

import {
  INITIAL_VISIBLE_SEASONS,
  SEASON_DETAILS_RATE_LIMIT_ERROR,
  getInitialVisibleSeasonCount,
  getNextVisibleSeasonCount,
  getSeasonLoadErrorMessage,
  getSeasonToggleLabel,
} from "../lib/seasonGuide";

describe("seasonGuide helpers", () => {
  it("uses the initial visible season count", () => {
    expect(getInitialVisibleSeasonCount(10)).toBe(INITIAL_VISIBLE_SEASONS);
    expect(getInitialVisibleSeasonCount(2)).toBe(2);
  });

  it("reveals five more seasons at a time and caps at the total", () => {
    expect(getNextVisibleSeasonCount(3, 48)).toBe(8);
    expect(getNextVisibleSeasonCount(8, 48)).toBe(13);
    expect(getNextVisibleSeasonCount(45, 48)).toBe(48);
  });

  it("switches the toggle label to show less when fully expanded", () => {
    expect(getSeasonToggleLabel(3, 48)).toBe("Show 45 more seasons");
    expect(getSeasonToggleLabel(48, 48)).toBe("Show less");
  });

  it("maps season rate limit errors to the friendly retry copy", () => {
    expect(
      getSeasonLoadErrorMessage(new Error(SEASON_DETAILS_RATE_LIMIT_ERROR)),
    ).toBe("Too many season requests. Try again in a moment.");
    expect(getSeasonLoadErrorMessage(new Error("boom"))).toBe(
      "Couldn't load episodes for this season.",
    );
  });
});
