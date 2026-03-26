import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Poster } from "./Poster";
import { formatRelativeTime } from "../lib/format";
import { Avatar } from "./Avatar";

export type FeedReviewItem = {
  type: "review";
  timestamp: number;
  review: { _id: string; rating: number; reviewText: string };
  user?: { _id: string; displayName?: string | null; username?: string | null } | null;
  avatarUrl?: string | null;
  show?: { _id: string; title: string; year?: number | null; posterUrl?: string | null } | null;
};

export type FeedStatusItem = {
  type: "started" | "completed";
  timestamp: number;
  user?: { _id: string; displayName?: string | null; username?: string | null } | null;
  avatarUrl?: string | null;
  show?: { _id: string; title: string; year?: number | null; posterUrl?: string | null } | null;
};

export type FeedItemProps = FeedReviewItem | FeedStatusItem;

function RatingStars({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  const stars: string[] = [];
  for (let i = 0; i < fullStars; i++) stars.push("★");
  if (halfStar) stars.push("½");
  return (
    <Text className="text-sm text-amber-400" style={{ letterSpacing: 1 }}>
      {stars.join("")}
    </Text>
  );
}

/* ── Review Feed Card ─── */

function ReviewFeedItem({ item }: { item: FeedReviewItem }) {
  const router = useRouter();
  const userLabel = item.user?.displayName ?? item.user?.username ?? "Someone";
  const showTitle = item.show?.title ?? "Unknown show";
  const userId = item.user?._id;

  const handleProfilePress = useCallback(() => {
    if (userId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/profile/${userId}`);
    }
  }, [router, userId]);

  const handleShowPress = useCallback(() => {
    if (item.show?._id) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/show/${item.show._id}`);
    }
  }, [router, item.show?._id]);

  const handleReviewPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/review/${item.review._id}`);
  }, [router, item.review._id]);

  return (
    <View className="flex-row gap-3">
      <Pressable onPress={handleProfilePress} disabled={!userId} className="active:opacity-80">
        <Avatar uri={item.avatarUrl} label={userLabel} size={36} />
      </Pressable>

      <View className="flex-1">
        <View className="flex-row items-baseline gap-1.5">
          <Pressable onPress={handleProfilePress} disabled={!userId} className="active:opacity-80">
            <Text className="text-sm font-semibold text-text-primary">{userLabel}</Text>
          </Pressable>
          <Text className="text-xs text-text-tertiary">
            {item.review.reviewText ? "reviewed" : "rated"}
          </Text>
          <Text className="text-xs text-text-tertiary">·</Text>
          <Text className="text-xs text-text-tertiary">
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>

        <Pressable
          onPress={handleReviewPress}
          className="mt-2.5 rounded-2xl border border-dark-border bg-dark-card active:bg-dark-hover"
          style={{ overflow: "hidden" }}
        >
          <View className="flex-row">
            <Pressable onPress={handleShowPress} className="active:opacity-90">
              <Poster uri={item.show?.posterUrl ?? undefined} size="md" width={80} className="rounded-none" />
            </Pressable>

            <View className="flex-1 justify-center px-4 py-3">
              <Pressable onPress={handleShowPress} className="active:opacity-80">
                <Text className="text-base font-bold text-text-primary" numberOfLines={1}>
                  {showTitle}
                </Text>
                {item.show?.year ? (
                  <Text className="mt-0.5 text-xs text-text-tertiary">{item.show.year}</Text>
                ) : null}
              </Pressable>

              <View className="mt-2">
                <RatingStars rating={item.review.rating} />
              </View>

              {item.review.reviewText ? (
                <Text className="mt-2 text-sm leading-5 text-text-secondary" numberOfLines={2}>
                  {item.review.reviewText}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Status Feed Card (started / completed) ─── */

function StatusFeedItem({ item }: { item: FeedStatusItem }) {
  const router = useRouter();
  const userLabel = item.user?.displayName ?? item.user?.username ?? "Someone";
  const showTitle = item.show?.title ?? "Unknown show";
  const userId = item.user?._id;

  const isCompleted = item.type === "completed";
  const verb = isCompleted ? "finished" : "started watching";
  const iconName = isCompleted ? "checkmark-circle" : "play-circle";
  const iconColor = isCompleted ? "#22c55e" : "#0ea5e9";

  const handleProfilePress = useCallback(() => {
    if (userId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/profile/${userId}`);
    }
  }, [router, userId]);

  const handleShowPress = useCallback(() => {
    if (item.show?._id) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/show/${item.show._id}`);
    }
  }, [router, item.show?._id]);

  return (
    <View className="flex-row gap-3">
      <Pressable onPress={handleProfilePress} disabled={!userId} className="active:opacity-80">
        <Avatar uri={item.avatarUrl} label={userLabel} size={36} />
      </Pressable>

      <View className="flex-1">
        <View className="flex-row items-baseline gap-1.5 flex-wrap">
          <Pressable onPress={handleProfilePress} disabled={!userId} className="active:opacity-80">
            <Text className="text-sm font-semibold text-text-primary">{userLabel}</Text>
          </Pressable>
          <Text className="text-xs text-text-tertiary">{verb}</Text>
          <Text className="text-xs text-text-tertiary">·</Text>
          <Text className="text-xs text-text-tertiary">
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>

        <Pressable
          onPress={handleShowPress}
          className="mt-2.5 flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card p-3 active:bg-dark-hover"
        >
          <Poster uri={item.show?.posterUrl ?? undefined} size="sm" />
          <View className="flex-1">
            <Text className="text-base font-bold text-text-primary" numberOfLines={1}>
              {showTitle}
            </Text>
            {item.show?.year ? (
              <Text className="mt-0.5 text-xs text-text-tertiary">{item.show.year}</Text>
            ) : null}
          </View>
          <Ionicons name={iconName} size={22} color={iconColor} />
        </Pressable>
      </View>
    </View>
  );
}

/* ── Dispatcher ─── */

export function FeedItem({ item }: { item: FeedItemProps }) {
  if (item.type === "review") {
    return <ReviewFeedItem item={item} />;
  }
  return <StatusFeedItem item={item} />;
}
