import { describe, expect, it } from "@jest/globals";

import {
  buildCommentNotificationContent,
  buildContactJoinedNotificationContent,
  buildEpisodeNotificationContent,
  buildFollowNotificationContent,
  buildLikeNotificationContent,
  buildListFollowNotificationContent,
  categoryForNotificationType,
  EPISODE_DIGEST_LOCAL_HOUR,
  getLocalDateStringForTimezone,
  getLocalHourForTimezone,
  mergeNotificationPreferences,
  planPushesForRecipient,
  buildPremiereNotificationContent,
  buildStreamingArrivalNotificationContent,
  buildVibeArrivalNotificationContent,
  buildVibeDigestNotificationContent,
  buildMonthlyRecapNotificationContent,
  getUtcOffsetMinutesForTimezone,
  resolveDigestHour,
  resolveNotificationPreferences,
} from "../lib/notificationContent";

describe("resolveNotificationPreferences", () => {
  it("defaults every category to enabled", () => {
    expect(resolveNotificationPreferences(null)).toEqual({
      episodes: true,
      follows: true,
      likes: true,
      comments: true,
      premieres: true,
      streaming: true,
      recaps: true,
    });
  });

  it("only an explicit false disables a category", () => {
    expect(resolveNotificationPreferences({ likes: false, follows: true })).toEqual({
      episodes: true,
      follows: true,
      likes: false,
      comments: true,
      premieres: true,
      streaming: true,
      recaps: true,
    });
  });
});

describe("mergeNotificationPreferences", () => {
  it("applies known categories and ignores unknown keys", () => {
    expect(
      mergeNotificationPreferences({ likes: false }, {
        likes: true,
        comments: false,
        bogus: true,
      } as Record<string, boolean>),
    ).toEqual({ likes: true, comments: false });
  });

  it("preserves untouched stored values", () => {
    expect(mergeNotificationPreferences({ episodes: false }, { follows: false })).toEqual({
      episodes: false,
      follows: false,
    });
  });

  it("stores and clears the Pro digest hour", () => {
    expect(mergeNotificationPreferences(null, { digestHour: 20 })).toEqual({
      digestHour: 20,
    });
    expect(
      mergeNotificationPreferences({ digestHour: 20, likes: false }, { digestHour: null }),
    ).toEqual({ likes: false });
    // Out-of-range hours are ignored rather than stored.
    expect(mergeNotificationPreferences(null, { digestHour: 24 })).toEqual({});
  });
});

describe("resolveDigestHour", () => {
  it("honors a stored hour only for Pro users", () => {
    expect(resolveDigestHour({ digestHour: 9 }, true)).toBe(9);
    expect(resolveDigestHour({ digestHour: 9 }, false)).toBe(EPISODE_DIGEST_LOCAL_HOUR);
    expect(resolveDigestHour(null, true)).toBe(EPISODE_DIGEST_LOCAL_HOUR);
    expect(resolveDigestHour({ digestHour: 99 }, true)).toBe(EPISODE_DIGEST_LOCAL_HOUR);
  });
});

describe("buildPremiereNotificationContent", () => {
  it("announces season returns and ignores non-premiere events", () => {
    const content = buildPremiereNotificationContent({
      showId: "show1",
      showTitle: "Severance",
      airDate: "2026-07-20",
      events: [
        { seasonNumber: 3, episodeNumber: 1, isReturningSeason: true },
        { seasonNumber: 3, episodeNumber: 2 },
      ],
    });
    expect(content!.body).toContain("season 3 starts tonight");
    expect(content!.dedupeKey).toBe("premiere:show1:2026-07-20");

    expect(
      buildPremiereNotificationContent({
        showId: "show1",
        showTitle: "Severance",
        airDate: "2026-07-20",
        events: [{ seasonNumber: 3, episodeNumber: 4 }],
      }),
    ).toBeNull();
  });
});

describe("buildStreamingArrivalNotificationContent", () => {
  it("lists providers and keys the dedupe on the arrival batch", () => {
    const content = buildStreamingArrivalNotificationContent({
      showId: "show1",
      showTitle: "Dark",
      providerLabels: ["Netflix", "Hulu"],
      providerKeys: ["netflix", "hulu"],
    });
    expect(content!.body).toBe(
      "Dark just arrived on Netflix and Hulu. It's on your watchlist.",
    );
    expect(content!.dedupeKey).toBe("streaming:show1:hulu+netflix");
  });
});

describe("categoryForNotificationType", () => {
  it("maps every type to its preference category", () => {
    expect(categoryForNotificationType("follow")).toBe("follows");
    expect(categoryForNotificationType("like")).toBe("likes");
    expect(categoryForNotificationType("comment")).toBe("comments");
    expect(categoryForNotificationType("episode")).toBe("episodes");
  });
});

describe("timezone helpers", () => {
  // 2026-07-04 21:00 UTC = 17:00 in New York (EDT), 23:00 in Paris (CEST).
  const now = new Date("2026-07-04T21:00:00Z");

  it("computes the local hour for a timezone", () => {
    expect(getLocalHourForTimezone("America/New_York", now)).toBe(EPISODE_DIGEST_LOCAL_HOUR);
    expect(getLocalHourForTimezone("Europe/Paris", now)).toBe(23);
    expect(getLocalHourForTimezone("UTC", now)).toBe(21);
  });

  it("normalizes midnight to hour zero", () => {
    const midnight = new Date("2026-07-04T00:30:00Z");
    expect(getLocalHourForTimezone("UTC", midnight)).toBe(0);
  });

  it("computes the local calendar date for a timezone", () => {
    expect(getLocalDateStringForTimezone("America/New_York", now)).toBe("2026-07-04");
    // Tokyo has already rolled to the next day.
    expect(getLocalDateStringForTimezone("Asia/Tokyo", now)).toBe("2026-07-05");
  });

  it("returns null for unknown or missing timezones", () => {
    expect(getLocalHourForTimezone("Not/AZone", now)).toBeNull();
    expect(getLocalHourForTimezone(null, now)).toBeNull();
    expect(getLocalDateStringForTimezone("Not/AZone", now)).toBeNull();
  });
});

describe("buildEpisodeNotificationContent", () => {
  const base = { showId: "show_1", showTitle: "Severance", airDate: "2026-07-04" };

  it("describes a single regular episode with its title", () => {
    const content = buildEpisodeNotificationContent({
      ...base,
      events: [{ seasonNumber: 3, episodeNumber: 4, episodeTitle: "The Board" }],
    });
    expect(content).not.toBeNull();
    expect(content!.title).toBe("New episode tonight");
    expect(content!.body).toContain("Severance S3E4");
    expect(content!.body).toContain("The Board");
    expect(content!.dedupeKey).toBe("episode:show_1:2026-07-04");
    expect(content!.episodeCount).toBe(1);
  });

  it("collapses a multi-episode drop into one notification", () => {
    const content = buildEpisodeNotificationContent({
      ...base,
      events: [
        { seasonNumber: 3, episodeNumber: 2 },
        { seasonNumber: 3, episodeNumber: 1 },
        { seasonNumber: 3, episodeNumber: 3 },
      ],
    });
    expect(content!.body).toBe(
      "Severance drops 3 new episodes today, starting with S3E1.",
    );
    expect(content!.seasonNumber).toBe(3);
    expect(content!.episodeNumber).toBe(1);
  });

  it("prefers milestone copy for premieres and finales", () => {
    const premiere = buildEpisodeNotificationContent({
      ...base,
      events: [{ seasonNumber: 1, episodeNumber: 1, isPremiere: true }],
    });
    expect(premiere!.body).toContain("premieres tonight");

    const finale = buildEpisodeNotificationContent({
      ...base,
      events: [{ seasonNumber: 3, episodeNumber: 10, isSeriesFinale: true }],
    });
    expect(finale!.body).toContain("series finale");
  });

  it("returns null when there are no events", () => {
    expect(buildEpisodeNotificationContent({ ...base, events: [] })).toBeNull();
  });
});

describe("social notification copy", () => {
  it("builds follow, like, and comment bodies", () => {
    expect(buildFollowNotificationContent("Ana").body).toBe("Ana started following you.");
    expect(buildLikeNotificationContent("Ana", "log").body).toBe("Ana liked your watch log.");
    expect(buildCommentNotificationContent("Ana", "review", "So good!").body).toBe(
      "Ana commented on your review: “So good!”",
    );
  });

  it("truncates long comment previews", () => {
    const long = "x".repeat(200);
    const { body } = buildCommentNotificationContent("Ana", "review", long);
    expect(body.length).toBeLessThan(120);
    expect(body).toContain("…");
  });

  it("builds list follow copy and routes it to the follows category", () => {
    const content = buildListFollowNotificationContent("Ana", "Cozy Mysteries");
    expect(content.title).toBe("New list follower");
    expect(content.body).toBe("Ana started following your list “Cozy Mysteries”.");
    expect(categoryForNotificationType("list_follow")).toBe("follows");
  });

  it("builds contact-joined copy from the recipient's address-book name", () => {
    const content = buildContactJoinedNotificationContent("Ada Lovelace");
    expect(content.title).toBe("Your friend joined Plotlist");
    expect(content.body).toBe(
      "Ada Lovelace from your contacts is now on Plotlist. Follow them to see what they're watching.",
    );
    expect(categoryForNotificationType("contact_joined")).toBe("follows");
  });
});

describe("planPushesForRecipient", () => {
  const row = (index: number, type = "episode") => ({
    title: `Title ${index}`,
    body: `Body ${index}`,
    data: { type, url: `/show/${index}` },
  });

  it("keeps small batches as individual pushes", () => {
    const planned = planPushesForRecipient([row(1), row(2), row(3)]);
    expect(planned).toHaveLength(3);
    expect(planned[0].title).toBe("Title 1");
    expect(planned[2].data.url).toBe("/show/3");
  });

  it("collapses a big episode batch into one summary push", () => {
    const planned = planPushesForRecipient([row(1), row(2), row(3), row(4)]);
    expect(planned).toHaveLength(1);
    expect(planned[0].title).toBe("New episodes tonight");
    expect(planned[0].body).toBe("4 of your shows have new episodes today.");
    expect(planned[0].data.url).toBe("/notifications");
  });

  it("uses generic summary copy for mixed types", () => {
    const planned = planPushesForRecipient([
      row(1, "like"),
      row(2, "episode"),
      row(3, "comment"),
      row(4, "follow"),
    ]);
    expect(planned).toHaveLength(1);
    expect(planned[0].body).toBe("You have 4 new notifications.");
  });
});

describe("smart list + recap notification content", () => {
  it("maps the new types to categories", () => {
    expect(categoryForNotificationType("vibe_arrival")).toBe("streaming");
    expect(categoryForNotificationType("vibe_digest")).toBe("streaming");
    expect(categoryForNotificationType("monthly_recap")).toBe("recaps");
  });

  it("builds a vibe arrival with a per-provider dedupe key", () => {
    const content = buildVibeArrivalNotificationContent({
      listId: "list_1",
      showId: "show_1",
      showTitle: "Dark",
      vibeQuery: "cozy sci-fi",
      providerLabels: ["Netflix"],
      providerKeys: ["netflix"],
    });
    expect(content).not.toBeNull();
    expect(content!.title).toContain("cozy sci-fi");
    expect(content!.body).toContain("Dark");
    expect(content!.body).toContain("Netflix");
    expect(content!.dedupeKey).toBe("vibe_arrival:list_1:show_1:netflix");
    expect(
      buildVibeArrivalNotificationContent({
        listId: "list_1",
        showId: "show_1",
        showTitle: "Dark",
        vibeQuery: "cozy sci-fi",
        providerLabels: [],
        providerKeys: [],
      }),
    ).toBeNull();
  });

  it("builds a vibe digest capped at one per list per day", () => {
    const content = buildVibeDigestNotificationContent({
      listId: "list_1",
      listTitle: "Cozy sci-fi",
      vibeQuery: "cozy sci-fi",
      addedTitles: ["Severance", "Silo", "Dark", "Counterpart"],
      localDate: "2026-07-25",
    });
    expect(content).not.toBeNull();
    expect(content!.title).toBe("4 new shows match “cozy sci-fi”");
    expect(content!.body).toContain("Severance, Silo, Dark and 1 more");
    expect(content!.dedupeKey).toBe("vibe_digest:list_1:2026-07-25");
    expect(
      buildVibeDigestNotificationContent({
        listId: "list_1",
        listTitle: "Cozy sci-fi",
        vibeQuery: "cozy sci-fi",
        addedTitles: [],
        localDate: "2026-07-25",
      }),
    ).toBeNull();
  });

  it("builds a monthly recap keyed to the month", () => {
    const content = buildMonthlyRecapNotificationContent({
      monthKey: "2026-06",
      monthLabel: "June",
      episodes: 42,
      minutes: 1830,
      shows: 9,
      topShowTitle: "Severance",
    });
    expect(content).not.toBeNull();
    expect(content!.title).toBe("Your June in TV");
    expect(content!.body).toContain("42 episodes");
    expect(content!.body).toContain("31 hours");
    expect(content!.body).toContain("9 shows");
    expect(content!.body).toContain("Severance");
    expect(content!.dedupeKey).toBe("monthly_recap:2026-06");
    expect(
      buildMonthlyRecapNotificationContent({
        monthKey: "2026-06",
        monthLabel: "June",
        episodes: 0,
        minutes: 0,
        shows: 0,
        topShowTitle: null,
      }),
    ).toBeNull();
  });
});

describe("getUtcOffsetMinutesForTimezone", () => {
  it("computes offsets including DST and half-hour zones", () => {
    const july = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
    expect(getUtcOffsetMinutesForTimezone("UTC", july)).toBe(0);
    expect(getUtcOffsetMinutesForTimezone("America/New_York", july)).toBe(-240);
    expect(getUtcOffsetMinutesForTimezone("Asia/Kolkata", july)).toBe(330);
    const january = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(getUtcOffsetMinutesForTimezone("America/New_York", january)).toBe(-300);
  });

  it("returns null for missing or bogus timezones", () => {
    const now = new Date(Date.UTC(2026, 6, 15));
    expect(getUtcOffsetMinutesForTimezone(null, now)).toBeNull();
    expect(getUtcOffsetMinutesForTimezone("Not/AZone", now)).toBeNull();
  });
});
