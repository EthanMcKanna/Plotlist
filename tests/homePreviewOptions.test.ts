import { describe, expect, it } from "@jest/globals";

import { getHomePreviewReduceMotionFlag } from "../lib/homePreviewOptions";

describe("home preview options", () => {
  it("keeps preview motion enabled by default", () => {
    expect(getHomePreviewReduceMotionFlag({})).toBe(false);
    expect(getHomePreviewReduceMotionFlag({ reduceMotion: "0" })).toBe(false);
    expect(getHomePreviewReduceMotionFlag({ reduceMotion: "false" })).toBe(false);
  });

  it("allows Browser QA to freeze hero rotation with a query flag", () => {
    expect(getHomePreviewReduceMotionFlag({ reduceMotion: "1" })).toBe(true);
    expect(getHomePreviewReduceMotionFlag({ reduceMotion: " true " })).toBe(true);
    expect(getHomePreviewReduceMotionFlag({ reduceMotion: ["true", "0"] })).toBe(true);
  });
});
