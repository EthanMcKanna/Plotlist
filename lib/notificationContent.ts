// Pure notification logic shared by the worker (fanout + episode digest) and
// the app (settings copy). No database or platform imports so it stays unit
// testable.

export const NOTIFICATION_CATEGORIES = ["episodes", "follows", "likes", "comments"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationType =
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "like"
  | "comment"
  | "episode";

export type NotificationPreferences = Record<NotificationCategory, boolean>;

// Local hour when "new episode tonight" pushes go out. Release events are
// date-only, so early evening is the closest honest reading of "tonight".
export const EPISODE_DIGEST_LOCAL_HOUR = 17;

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
};

export function categoryForNotificationType(type: NotificationType): NotificationCategory {
  return CATEGORY_BY_TYPE[type];
}

// Missing keys mean enabled: users are opted in until they flip a toggle.
export function resolveNotificationPreferences(
  stored: Record<string, boolean> | null | undefined,
): NotificationPreferences {
  const resolved = {} as NotificationPreferences;
  for (const category of NOTIFICATION_CATEGORIES) {
    resolved[category] = stored?.[category] !== false;
  }
  return resolved;
}

export function mergeNotificationPreferences(
  stored: Record<string, boolean> | null | undefined,
  updates: Partial<Record<NotificationCategory, boolean>>,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...(stored ?? {}) };
  for (const category of NOTIFICATION_CATEGORIES) {
    const value = updates[category];
    if (typeof value === "boolean") {
      next[category] = value;
    }
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

export function buildFollowNotificationContent(actorName: string) {
  return {
    title: "New follower",
    body: `${actorName} started following you.`,
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

const TARGET_NOUNS: Record<string, string> = {
  review: "review",
  log: "watch log",
  list: "list",
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
