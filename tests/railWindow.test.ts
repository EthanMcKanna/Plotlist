import { describe, expect, it } from "@jest/globals";

import {
  RAIL_INITIAL_WINDOW,
  RAIL_REVEAL_BATCH,
  getInitialRailWindow,
  getNextRailWindow,
  shouldRevealMoreRailItems,
} from "../lib/railWindow";

describe("rail window", () => {
  it("mounts at most the initial window on first render", () => {
    expect(getInitialRailWindow(30)).toBe(RAIL_INITIAL_WINDOW);
    expect(getInitialRailWindow(5)).toBe(5);
    expect(getInitialRailWindow(0)).toBe(0);
    expect(getInitialRailWindow(30, 6)).toBe(6);
  });

  it("reveals in batches and never overshoots the item count", () => {
    expect(getNextRailWindow(12, 30)).toBe(12 + RAIL_REVEAL_BATCH);
    expect(getNextRailWindow(28, 30)).toBe(30);
    expect(getNextRailWindow(30, 30)).toBe(30);
    expect(getNextRailWindow(35, 30)).toBe(30);
    expect(getNextRailWindow(12, 30, 0)).toBe(13);
  });

  it("reveals when the scroll position nears the end of the mounted content", () => {
    const metrics = { layoutWidth: 400, contentWidth: 1600 };
    expect(
      shouldRevealMoreRailItems({ ...metrics, offsetX: 0 }, 12, 30),
    ).toBe(false);
    expect(
      shouldRevealMoreRailItems({ ...metrics, offsetX: 900 }, 12, 30),
    ).toBe(true);
    expect(
      shouldRevealMoreRailItems({ ...metrics, offsetX: 700 }, 12, 30, 100),
    ).toBe(false);
  });

  it("treats content that does not overflow the viewport as already at the end", () => {
    expect(
      shouldRevealMoreRailItems(
        { offsetX: 0, layoutWidth: 1200, contentWidth: 900 },
        12,
        30,
      ),
    ).toBe(true);
  });

  it("never reveals past the item count or before layout is known", () => {
    expect(
      shouldRevealMoreRailItems(
        { offsetX: 1200, layoutWidth: 400, contentWidth: 1600 },
        30,
        30,
      ),
    ).toBe(false);
    expect(
      shouldRevealMoreRailItems({ offsetX: 0, layoutWidth: 0, contentWidth: 0 }, 12, 30),
    ).toBe(false);
  });
});
