import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";

const mockFollow = jest.fn();

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "Light" },
  impactAsync: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../lib/plotlist/react", () => ({
  useMutation: () => mockFollow,
}));

import { router } from "expo-router";

import {
  FRIENDS_ACTIVITY_TOUCH_TARGET,
  FriendsActivity,
  getFriendsActivityPeople,
  type PersonPreview,
} from "../../components/FriendsActivity";
import { buildFriendActivity } from "../../lib/friendsActivity";

function person(
  id: string,
  signals: Partial<PersonPreview> = {},
): PersonPreview {
  return {
    user: {
      _id: id as PersonPreview["user"]["_id"],
      displayName: id,
      username: id,
    },
    ...signals,
  };
}

describe("getFriendsActivityPeople", () => {
  it("keeps random cold suggestions off the homepage social rail", () => {
    const people = getFriendsActivityPeople(
      [
        { source: "contacts", people: [] },
        {
          source: "taste",
          people: [
            person("viewer", { sharedShowCount: 3 }),
            person("cold-taste"),
            person("taste-show", { sharedShowCount: 1 }),
            person("taste-genres", { sharedGenreCount: 2 }),
          ],
        },
        {
          source: "suggested",
          people: [
            person("cold-suggested"),
            person("already-following", { isFollowing: true, mutualCount: 4 }),
            person("mutual", { mutualCount: 1 }),
            person("follows-you", { followsYou: true }),
          ],
        },
      ],
      "viewer" as PersonPreview["user"]["_id"],
    );

    expect(people.map((item) => item.user._id)).toEqual([
      "taste-show",
      "taste-genres",
      "mutual",
      "follows-you",
    ]);
  });

  it("prioritizes contacts and dedupes lower-confidence repeats", () => {
    const people = getFriendsActivityPeople(
      [
        {
          source: "contacts",
          people: [person("friend", { inContacts: true })],
        },
        {
          source: "taste",
          people: [
            person("friend", { sharedShowCount: 5 }),
            person("taste-match", { sharedShowCount: 2 }),
          ],
        },
        {
          source: "suggested",
          people: [person("taste-match", { mutualCount: 3 })],
        },
      ],
      null,
    );

    expect(people.map((item) => item.user._id)).toEqual([
      "friend",
      "taste-match",
    ]);
  });
});

function activityFor(userId: string, viewerId: string | null = null) {
  return buildFriendActivity(
    [
      {
        type: "log",
        timestamp: Date.now(),
        actor: { _id: userId, displayName: userId, username: userId },
        show: { _id: "show-1", title: "Show" },
        log: { seasonNumber: 1, episodeNumber: 1 },
      },
    ],
    { viewerId },
  );
}

describe("FriendsActivity", () => {
  beforeEach(() => {
    mockFollow.mockClear();
    jest.mocked(router.push).mockClear();
  });

  const emptyProps = {
    index: 9,
    viewerId: null,
    contactMatches: [],
    similarTaste: [],
    suggested: [],
    activity: [],
    feedEmpty: true,
  };

  it("turns an empty friends section into compact search and contact-sync actions", () => {
    const onSyncContacts = jest.fn();

    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        onSyncContacts,
      }),
    );

    expect(screen.getByText("Friends")).toBeTruthy();
    expect(screen.queryByText("Find friends")).toBeNull();
    expect(screen.queryByText("See what they watch.")).toBeNull();
    expect(screen.getByText("Contacts stay private")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Find people"));
    fireEvent.press(screen.getByLabelText("Sync contacts"));

    expect(router.push).toHaveBeenCalledWith("/search");
    expect(onSyncContacts).toHaveBeenCalledTimes(1);
  });

  it("keeps empty-state actions large enough for touch QA", () => {
    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        onSyncContacts: jest.fn(),
      }),
    );

    ["friends-empty-find-people", "friends-empty-sync-contacts"].forEach((testID) => {
      const action = screen.UNSAFE_getByProps({ testID });
      const style = StyleSheet.flatten(action.props.style);

      expect(style.minHeight).toBeGreaterThanOrEqual(
        FRIENDS_ACTIVITY_TOUCH_TARGET,
      );
      expect(style.minWidth).toBeGreaterThanOrEqual(
        FRIENDS_ACTIVITY_TOUCH_TARGET,
      );
    });
  });

  it("keeps follow actions large enough for touch QA", () => {
    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        contactMatches: [person("friend", { inContacts: true })],
      }),
    );

    const follow = screen.getByLabelText("Follow friend");
    const style = StyleSheet.flatten(follow.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(
      FRIENDS_ACTIVITY_TOUCH_TARGET,
    );
    expect(style.minWidth).toBeGreaterThanOrEqual(
      FRIENDS_ACTIVITY_TOUCH_TARGET,
    );
    expect(style.height).toBe(FRIENDS_ACTIVITY_TOUCH_TARGET);
    expect(style.width).toBe(FRIENDS_ACTIVITY_TOUCH_TARGET);
  });

  it("shows one useful person-chip context line instead of stacking handle and signal", () => {
    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        contactMatches: [person("friend", { inContacts: true })],
      }),
    );

    expect(screen.getByText("friend")).toBeTruthy();
    expect(screen.getByText("In contacts")).toBeTruthy();
    expect(screen.queryByText("@friend")).toBeNull();
    expect(screen.getByLabelText("Open friend")).toBeTruthy();
    expect(screen.getByLabelText("Follow friend")).toBeTruthy();
    expect(screen.queryByText("Follow")).toBeNull();
  });

  it("omits generic friend-suggestion filler when no visible signal is present", () => {
    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        contactMatches: [person("friend")],
      }),
    );

    expect(screen.getByText("friend")).toBeTruthy();
    expect(screen.getByText("@friend")).toBeTruthy();
    expect(screen.queryByText("Worth following")).toBeNull();
    expect(screen.getByLabelText("Follow friend")).toBeTruthy();
    expect(screen.queryByText("Follow")).toBeNull();
  });

  it("shows refresh copy after contacts have been synced", () => {
    const onSyncContacts = jest.fn();

    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        hasSyncedContacts: true,
        onSyncContacts,
      }),
    );

    fireEvent.press(screen.getByLabelText("Refresh contacts"));

    expect(screen.queryByText("Sync contacts")).toBeNull();
    expect(onSyncContacts).toHaveBeenCalledTimes(1);
  });

  it("keeps the contact-sync action inert while syncing", () => {
    const onSyncContacts = jest.fn();

    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        onSyncContacts,
        syncingContacts: true,
      }),
    );

    fireEvent.press(screen.getByLabelText("Sync contacts"));

    expect(onSyncContacts).not.toHaveBeenCalled();
  });

  it("shows the empty invite card instead of a blank section when feed rows are self-only", () => {
    // The viewer's own fan-out rows are filtered during grouping, so the
    // section receives no entries and falls back to the invite card.
    const selfOnly = activityFor("viewer", "viewer");
    expect(selfOnly).toHaveLength(0);

    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        viewerId: "viewer" as PersonPreview["user"]["_id"],
        feedEmpty: false,
        activity: selfOnly,
      }),
    );

    expect(screen.getByText("Friends")).toBeTruthy();
    expect(screen.queryByText("Find friends")).toBeNull();
    expect(screen.queryByText("Contacts stay private")).toBeNull();
  });

  it("renders one grouped activity row per friend and show", () => {
    const activity = buildFriendActivity([
      {
        type: "log",
        timestamp: 2000,
        actor: { _id: "friend", displayName: "Friend", username: "friend" },
        show: { _id: "show-1", title: "Silo" },
        log: { seasonNumber: 1, episodeNumber: 2 },
      },
      {
        type: "log",
        timestamp: 1000,
        actor: { _id: "friend", displayName: "Friend", username: "friend" },
        show: { _id: "show-1", title: "Silo" },
        log: { seasonNumber: 1, episodeNumber: 1 },
      },
    ]);

    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        feedEmpty: false,
        activity,
      }),
    );

    // One row, not one per episode — and it aggregates the episode count.
    expect(screen.getByLabelText("Friend started Silo")).toBeTruthy();
    expect(screen.getByText("2 episodes")).toBeTruthy();
  });

  it("routes the header action to the dedicated friends screen", () => {
    render(
      React.createElement(FriendsActivity, {
        ...emptyProps,
        feedEmpty: false,
        activity: activityFor("friend"),
      }),
    );

    expect(screen.queryByText("All activity")).toBeNull();

    fireEvent.press(screen.getByLabelText("Open All activity from Friends"));

    expect(router.push).toHaveBeenCalledWith("/friends");
  });
});
