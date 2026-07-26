// Pure notification logic shared by the worker (fanout + episode digest) and
// the app (settings copy). No database or platform imports so it stays unit
// testable.

// "premieres" (season premieres/returns for shows you haven't started) and
// "streaming" (watchlist arrivals on your services) are Pro-only at emit
// time; the toggles still live here so free users see what Pro unlocks.
export const NOTIFICATION_CATEGORIES = [
  "episodes",
  "follows",
  "likes",
  "comments",
  "premieres",
  "streaming",
  "recaps",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationType =
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "like"
  | "comment"
  | "episode"
  | "list_follow"
  | "contact_joined"
  | "premiere"
  | "streaming"
  | "vibe_arrival"
  | "vibe_digest"
  | "monthly_recap";

export type NotificationPreferences = Record<NotificationCategory, boolean>;

// Local hour when "new episode tonight" pushes go out. Release events are
// date-only, so early evening is the closest honest reading of "tonight".
// Pro subscribers can override this per-account via `digestHour` in their
// stored notification preferences.
export const EPISODE_DIGEST_LOCAL_HOUR = 17;

export const DIGEST_HOUR_PREF_KEY = "digestHour";

// The stored preference record mixes booleans (category toggles) and the
// numeric digest hour, so both readers accept the union.
export type StoredNotificationPreferences = Record<string, boolean | number>;

export function resolveDigestHour(
  stored: StoredNotificationPreferences | null | undefined,
  hasPro: boolean,
): number {
  const raw = stored?.[DIGEST_HOUR_PREF_KEY];
  if (
    hasPro &&
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= 23
  ) {
    return raw;
  }
  return EPISODE_DIGEST_LOCAL_HOUR;
}

// More than this many episode notifications in one batch collapses into a
// single summary push so a binge-drop day doesn't spam the lock screen.
export const MAX_INDIVIDUAL_PUSHES_PER_BATCH = 3;

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  follow: "follows",
  follow_request: "follows",
  follow_accepted: "follows",
  like: "likes",
  comment: "comments",
  episode: "episodes",
  list_follow: "follows",
  contact_joined: "follows",
  premiere: "premieres",
  streaming: "streaming",
  // Smart-list alerts ride the streaming toggle — they're the same "on your
  // services" moment, just discovered via a saved vibe instead of the
  // watchlist.
  vibe_arrival: "streaming",
  vibe_digest: "streaming",
  monthly_recap: "recaps",
};

export function categoryForNotificationType(type: NotificationType): NotificationCategory {
  return CATEGORY_BY_TYPE[type];
}

// Missing keys mean enabled: users are opted in until they flip a toggle.
export function resolveNotificationPreferences(
  stored: StoredNotificationPreferences | null | undefined,
): NotificationPreferences {
  const resolved = {} as NotificationPreferences;
  for (const category of NOTIFICATION_CATEGORIES) {
    resolved[category] = stored?.[category] !== false;
  }
  return resolved;
}

export function mergeNotificationPreferences(
  stored: StoredNotificationPreferences | null | undefined,
  updates: Partial<Record<NotificationCategory, boolean>> & {
    // null resets the digest hour back to the default.
    digestHour?: number | null;
  },
): StoredNotificationPreferences {
  const next: StoredNotificationPreferences = { ...(stored ?? {}) };
  for (const category of NOTIFICATION_CATEGORIES) {
    const value = updates[category];
    if (typeof value === "boolean") {
      next[category] = value;
    }
  }
  if (updates.digestHour === null) {
    delete next[DIGEST_HOUR_PREF_KEY];
  } else if (
    typeof updates.digestHour === "number" &&
    Number.isInteger(updates.digestHour) &&
    updates.digestHour >= 0 &&
    updates.digestHour <= 23
  ) {
    next[DIGEST_HOUR_PREF_KEY] = updates.digestHour;
  }
  return next;
}

export function getLocalHourForTimezone(timezone: string | null | undefined, now: Date) {
  if (!timezone) {
    return null;
  }
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const parsed = Number(hour);
    // Intl renders midnight as "24" in some ICU builds.
    return Number.isFinite(parsed) ? parsed % 24 : null;
  } catch {
    return null;
  }
}

export function getLocalDateStringForTimezone(
  timezone: string | null | undefined,
  now: Date,
) {
  if (!timezone) {
    return null;
  }
  try {
    // en-CA renders YYYY-MM-DD, matching releaseEvents.airDate.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
}

// Minutes east of UTC for an IANA timezone at a given instant — the same
// convention as the client's `-new Date().getTimezoneOffset()`. Lets crons
// hand tz-aware engines (lib/watchInsights.ts) an offset derived from the
// timezone stored on push tokens.
export function getUtcOffsetMinutesForTimezone(
  timezone: string | null | undefined,
  now: Date,
): number | null {
  if (!timezone) {
    return null;
  }
  try {
    // Truncate to the minute first — formatted parts drop seconds, so the
    // subtraction below must compare minute-aligned instants.
    const minuteAligned = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(minuteAligned);
    const read = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? NaN);
    const localAsUtc = Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour") % 24,
      read("minute"),
    );
    if (!Number.isFinite(localAsUtc)) {
      return null;
    }
    return Math.round((localAsUtc - minuteAligned.getTime()) / 60_000);
  } catch {
    return null;
  }
}

export function formatEpisodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${seasonNumber}E${episodeNumber}`;
}

export type EpisodeReleaseForNotification = {
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  isPremiere?: boolean;
  isReturningSeason?: boolean;
  isSeasonFinale?: boolean;
  isSeriesFinale?: boolean;
};

export type EpisodeNotificationContent = {
  title: string;
  body: string;
  dedupeKey: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeCount: number;
};

// One notification per show per air date, no matter how many episodes drop.
export function buildEpisodeNotificationContent(args: {
  showId: string;
  showTitle: string;
  airDate: string;
  events: EpisodeReleaseForNotification[];
}): EpisodeNotificationContent | null {
  if (args.events.length === 0) {
    return null;
  }
  const ordered = [...args.events].sort(
    (left, right) =>
      left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber,
  );
  const first = ordered[0];
  const code = formatEpisodeCode(first.seasonNumber, first.episodeNumber);

  let body: string;
  if (ordered.length > 1) {
    body = `${args.showTitle} drops ${ordered.length} new episodes today, starting with ${code}.`;
  } else if (first.isSeriesFinale) {
    body = `The series finale of ${args.showTitle} (${code}) airs tonight.`;
  } else if (first.isSeasonFinale) {
    body = `The season finale of ${args.showTitle} (${code}) airs tonight.`;
  } else if (first.isPremiere) {
    body = `${args.showTitle} premieres tonight with ${code}.`;
  } else if (first.isReturningSeason) {
    body = `${args.showTitle} is back tonight with ${code}.`;
  } else {
    const episodeTitle = first.episodeTitle?.trim();
    body = episodeTitle
      ? `${args.showTitle} ${code} — “${episodeTitle}” airs tonight.`
      : `${args.showTitle} ${code} airs tonight.`;
  }

  return {
    title: "New episode tonight",
    body,
    dedupeKey: `episode:${args.showId}:${args.airDate}`,
    seasonNumber: first.seasonNumber,
    episodeNumber: first.episodeNumber,
    episodeCount: ordered.length,
  };
}

// Pro premiere alert for shows the user is waiting on (watchlist/paused) —
// distinct from the episode digest, which covers watching/caught-up shows.
export function buildPremiereNotificationContent(args: {
  showId: string;
  showTitle: string;
  airDate: string;
  events: EpisodeReleaseForNotification[];
}): EpisodeNotificationContent | null {
  const premieres = args.events.filter(
    (event) => event.isPremiere || event.isReturningSeason,
  );
  if (premieres.length === 0) {
    return null;
  }
  const first = [...premieres].sort(
    (left, right) =>
      left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber,
  )[0];
  const code = formatEpisodeCode(first.seasonNumber, first.episodeNumber);
  const body =
    first.seasonNumber <= 1
      ? `${args.showTitle} premieres tonight with ${code}. It's on your watchlist.`
      : `${args.showTitle} is back — season ${first.seasonNumber} starts tonight (${code}).`;
  return {
    title: first.seasonNumber <= 1 ? "Premiere tonight" : "Season premiere tonight",
    body,
    dedupeKey: `premiere:${args.showId}:${args.airDate}`,
    seasonNumber: first.seasonNumber,
    episodeNumber: first.episodeNumber,
    episodeCount: premieres.length,
  };
}

// Pro streaming arrival alert: a watchlisted show just landed on one of the
// user's own services. One notification per show per arrival batch.
export function buildStreamingArrivalNotificationContent(args: {
  showId: string;
  showTitle: string;
  providerLabels: string[];
  providerKeys: string[];
}): { title: string; body: string; dedupeKey: string } | null {
  if (args.providerLabels.length === 0) {
    return null;
  }
  const labels =
    args.providerLabels.length === 1
      ? args.providerLabels[0]
      : `${args.providerLabels.slice(0, -1).join(", ")} and ${args.providerLabels.at(-1)}`;
  return {
    title: "Now streaming",
    body: `${args.showTitle} just arrived on ${labels}. It's on your watchlist.`,
    dedupeKey: `streaming:${args.showId}:${[...args.providerKeys].sort().join("+")}`,
  };
}

// Smart-list arrival: a show that matches one of the owner's saved vibes
// just landed on one of their services. Membership in the smart list is the
// match signal (no similarity thresholding at alert time).
export function buildVibeArrivalNotificationContent(args: {
  listId: string;
  showId: string;
  showTitle: string;
  vibeQuery: string;
  providerLabels: string[];
  providerKeys: string[];
}): { title: string; body: string; dedupeKey: string } | null {
  if (args.providerLabels.length === 0) {
    return null;
  }
  const labels =
    args.providerLabels.length === 1
      ? args.providerLabels[0]
      : `${args.providerLabels.slice(0, -1).join(", ")} and ${args.providerLabels.at(-1)}`;
  return {
    title: `Your “${args.vibeQuery}” vibe just landed`,
    body: `${args.showTitle} — a match for your saved vibe — just hit ${labels}.`,
    dedupeKey: `vibe_arrival:${args.listId}:${args.showId}:${[...args.providerKeys].sort().join("+")}`,
  };
}

// Smart-list refresh digest: new shows matched a saved vibe. At most one per
// list per local day via the dedupe key.
export function buildVibeDigestNotificationContent(args: {
  listId: string;
  listTitle: string;
  vibeQuery: string;
  addedTitles: string[];
  localDate: string;
}): { title: string; body: string; dedupeKey: string } | null {
  const titles = args.addedTitles.filter((title) => title.trim().length > 0);
  if (titles.length === 0) {
    return null;
  }
  const preview = titles.slice(0, 3).join(", ");
  const extra = titles.length > 3 ? ` and ${titles.length - 3} more` : "";
  return {
    title: `${titles.length === 1 ? "A new show matches" : `${titles.length} new shows match`} “${args.vibeQuery}”`,
    body: `${preview}${extra} just joined ${args.listTitle}.`,
    dedupeKey: `vibe_digest:${args.listId}:${args.localDate}`,
  };
}

// Pro mini-wrapped on the 1st: last month's totals, deep-linking to /me/stats.
export function buildMonthlyRecapNotificationContent(args: {
  monthKey: string;
  monthLabel: string;
  episodes: number;
  minutes: number;
  shows: number;
  topShowTitle: string | null;
}): { title: string; body: string; dedupeKey: string } | null {
  if (args.episodes <= 0) {
    return null;
  }
  const hours = Math.round(args.minutes / 60);
  const timePhrase = hours >= 1 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${args.minutes} minutes`;
  const showsPhrase = `${args.shows} show${args.shows === 1 ? "" : "s"}`;
  const topShowPhrase = args.topShowTitle ? ` Top show: ${args.topShowTitle}.` : "";
  return {
    title: `Your ${args.monthLabel} in TV`,
    body: `${args.episodes} episode${args.episodes === 1 ? "" : "s"} · ${timePhrase} across ${showsPhrase}.${topShowPhrase} See your recap.`,
    dedupeKey: `monthly_recap:${args.monthKey}`,
  };
}

export function buildFollowNotificationContent(actorName: string) {
  return {
    title: "New follower",
    body: `${actorName} started following you.`,
  };
}

export function buildListFollowNotificationContent(actorName: string, listTitle: string) {
  return {
    title: "New list follower",
    body: `${actorName} started following your list “${listTitle}”.`,
  };
}

export function buildFollowRequestNotificationContent(actorName: string) {
  return {
    title: "Follow request",
    body: `${actorName} wants to follow you.`,
  };
}

export function buildFollowAcceptedNotificationContent(actorName: string) {
  return {
    title: "Request approved",
    body: `${actorName} approved your follow request.`,
  };
}

// contactName is the name from the recipient's own address book, not the
// joiner's profile — fresh signups haven't set a display name yet, and the
// address-book name is the one the recipient actually recognizes.
export function buildContactJoinedNotificationContent(contactName: string) {
  return {
    title: "Your friend joined Plotlist",
    body: `${contactName} from your contacts is now on Plotlist. Follow them to see what they're watching.`,
  };
}

const TARGET_NOUNS: Record<string, string> = {
  review: "review",
  log: "watch log",
  list: "list",
  comment: "comment",
};

export function buildLikeNotificationContent(actorName: string, targetType: string) {
  const noun = TARGET_NOUNS[targetType] ?? "post";
  return {
    title: "New like",
    body: `${actorName} liked your ${noun}.`,
  };
}

export function buildCommentNotificationContent(
  actorName: string,
  targetType: string,
  commentText: string,
) {
  const noun = TARGET_NOUNS[targetType] ?? "post";
  const trimmed = commentText.trim().replace(/\s+/g, " ");
  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
  return {
    title: "New comment",
    body: `${actorName} commented on your ${noun}: “${preview}”`,
  };
}

// For the author of the comment being replied to — more direct than the
// generic "commented on your …" wording.
export function buildCommentReplyNotificationContent(
  actorName: string,
  commentText: string,
) {
  const trimmed = commentText.trim().replace(/\s+/g, " ");
  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
  return {
    title: "New reply",
    body: `${actorName} replied to your comment: “${preview}”`,
  };
}

// For other participants in the thread (they commented earlier but don't own
// the target), so conversations continue past the owner's first reply.
export function buildThreadCommentNotificationContent(
  actorName: string,
  targetType: string,
  commentText: string,
) {
  const noun = TARGET_NOUNS[targetType] ?? "post";
  const trimmed = commentText.trim().replace(/\s+/g, " ");
  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
  return {
    title: "New comment",
    body: `${actorName} also commented on a ${noun} you commented on: “${preview}”`,
  };
}

export type PushableNotification = {
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
};

// Collapse a large same-batch burst for one recipient into a summary push.
// The inbox still shows every row; only the lock screen is condensed.
export function planPushesForRecipient<T extends PushableNotification>(
  rows: T[],
): Array<{ title: string; body: string; data: Record<string, unknown> }> {
  if (rows.length <= MAX_INDIVIDUAL_PUSHES_PER_BATCH) {
    return rows.map((row) => ({
      title: row.title,
      body: row.body,
      data: { ...(row.data ?? {}) },
    }));
  }
  const allEpisodes = rows.every((row) => (row.data as any)?.type === "episode");
  return [
    {
      title: allEpisodes ? "New episodes tonight" : "Plotlist",
      body: allEpisodes
        ? `${rows.length} of your shows have new episodes today.`
        : `You have ${rows.length} new notifications.`,
      data: { type: "summary", url: "/notifications" },
    },
  ];
}
