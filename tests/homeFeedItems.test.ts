import { describe, expect, it } from "@jest/globals";

import { toHomeFeedItem } from "../lib/homeFeedItems";

describe("toHomeFeedItem", () => {
  it("normalizes API actor rows into feed items the home social rail can render", () => {
    const item = toHomeFeedItem({
      type: "log",
      timestamp: 123,
      actor: {
        _id: "user-1",
        displayName: "Maya",
        username: "maya",
        avatarUrl: "https://images.example.com/maya.jpg",
      },
      show: {
        _id: "show-1",
        title: "Slow Horses",
        year: 2022,
      },
    });

    expect(item).toEqual({
      type: "started",
      timestamp: 123,
      user: {
        _id: "user-1",
        displayName: "Maya",
        username: "maya",
        avatarUrl: "https://images.example.com/maya.jpg",
      },
      avatarUrl: "https://images.example.com/maya.jpg",
      show: {
        _id: "show-1",
        title: "Slow Horses",
        year: 2022,
      },
    });
  });

  it("drops malformed feed rows before they reach the social planner", () => {
    expect(toHomeFeedItem({ type: "log", timestamp: "now" })).toBeNull();
    expect(toHomeFeedItem({ type: "review", timestamp: 123 })).toBeNull();
    expect(toHomeFeedItem({ type: "unknown", timestamp: 123 })).toBeNull();
  });
});
