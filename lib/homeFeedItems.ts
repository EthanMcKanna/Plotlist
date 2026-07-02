import type { FeedItemProps } from "../components/FeedItem";

type HomeFeedUser = NonNullable<FeedItemProps["user"]> & {
  avatarUrl?: string | null;
};
type HomeFeedShow = FeedItemProps["show"];
type HomeFeedReview = Extract<FeedItemProps, { type: "review" }>["review"];

export type RawHomeFeedItem = {
  type?: unknown;
  timestamp?: unknown;
  user?: HomeFeedUser | null;
  actor?: HomeFeedUser | null;
  avatarUrl?: string | null;
  review?: HomeFeedReview | null;
  show?: HomeFeedShow | null;
  log?: unknown;
};

export function toHomeFeedItem(item: RawHomeFeedItem): FeedItemProps | null {
  if (typeof item.timestamp !== "number") return null;

  const user = item.user ?? item.actor ?? null;
  const avatarUrl = item.avatarUrl ?? item.actor?.avatarUrl ?? null;
  const show = item.show ?? null;

  if (item.type === "review") {
    if (!item.review) return null;
    return {
      type: "review",
      timestamp: item.timestamp,
      review: item.review,
      user,
      avatarUrl,
      show,
    };
  }

  if (item.type === "completed" || item.type === "started") {
    return {
      type: item.type,
      timestamp: item.timestamp,
      user,
      avatarUrl,
      show,
    };
  }

  if (item.type === "log") {
    return {
      type: "started",
      timestamp: item.timestamp,
      user,
      avatarUrl,
      show,
    };
  }

  return null;
}
