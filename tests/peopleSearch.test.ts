import { describe, expect, it } from "@jest/globals";

import {
  getSocialProximityScore,
  getTextMatchScore,
  rankPeopleSearchResults,
} from "../lib/peopleSearch";

function person(overrides: {
  username?: string | null;
  displayName?: string | null;
  name?: string | null;
  lastSeenAt?: number;
  isFollowing?: boolean;
  followsYou?: boolean;
  mutualCount?: number;
  inContacts?: boolean;
  sharedShowCount?: number;
}) {
  const { username, displayName, name, lastSeenAt, ...social } = overrides;
  return {
    user: { username, displayName, name, lastSeenAt },
    ...social,
  };
}

describe("getTextMatchScore", () => {
  it("scores exact > username prefix > name prefix > word prefix > substring", () => {
    const exact = getTextMatchScore(person({ username: "ada" }), "ada");
    const usernamePrefix = getTextMatchScore(person({ username: "adalace" }), "ada");
    const namePrefix = getTextMatchScore(person({ displayName: "Ada Lovelace" }), "ada l");
    const wordPrefix = getTextMatchScore(person({ displayName: "Ada Lovelace" }), "love");
    const substring = getTextMatchScore(person({ username: "notadam" }), "ada");

    expect(exact).toBeGreaterThan(usernamePrefix);
    expect(usernamePrefix).toBeGreaterThan(namePrefix);
    expect(namePrefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    expect(getTextMatchScore(person({ username: "Ada" }), "  ADA  ")).toBe(1000);
  });

  it("returns zero for a non-match or empty query", () => {
    expect(getTextMatchScore(person({ username: "grace" }), "ada")).toBe(0);
    expect(getTextMatchScore(person({ username: "grace" }), "")).toBe(0);
  });
});

describe("getSocialProximityScore", () => {
  it("weighs contacts above mutuals above follows-you", () => {
    expect(getSocialProximityScore(person({ inContacts: true }))).toBeGreaterThan(
      getSocialProximityScore(person({ mutualCount: 5 })),
    );
    expect(getSocialProximityScore(person({ mutualCount: 4 }))).toBeGreaterThan(
      getSocialProximityScore(person({ followsYou: true })),
    );
  });

  it("caps runaway mutual and shared-show counts", () => {
    expect(getSocialProximityScore(person({ mutualCount: 10 }))).toBe(
      getSocialProximityScore(person({ mutualCount: 500 })),
    );
    expect(getSocialProximityScore(person({ sharedShowCount: 10 }))).toBe(
      getSocialProximityScore(person({ sharedShowCount: 400 })),
    );
  });
});

describe("rankPeopleSearchResults", () => {
  it("puts a username prefix match with social ties above a bare substring match", () => {
    const stranger = person({ username: "chadam", lastSeenAt: 100 });
    const friend = person({
      username: "adam",
      inContacts: true,
      mutualCount: 3,
      lastSeenAt: 50,
    });

    const ranked = rankPeopleSearchResults([stranger, friend], "adam");
    expect(ranked[0]).toBe(friend);
  });

  it("lets social proximity break ties between equal text matches", () => {
    const plain = person({ username: "adam1" });
    const followsYou = person({ username: "adam2", followsYou: true });

    const ranked = rankPeopleSearchResults([plain, followsYou], "adam");
    expect(ranked[0]).toBe(followsYou);
  });

  it("falls back to recent activity when scores tie exactly", () => {
    const older = person({ username: "adam1", lastSeenAt: 100 });
    const newer = person({ username: "adam2", lastSeenAt: 200 });

    const ranked = rankPeopleSearchResults([older, newer], "adam");
    expect(ranked[0]).toBe(newer);
  });

  it("does not mutate the input array", () => {
    const input = [person({ username: "b" }), person({ username: "a" })];
    const snapshot = [...input];
    rankPeopleSearchResults(input, "a");
    expect(input).toEqual(snapshot);
  });
});
