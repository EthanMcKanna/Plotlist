import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Poster } from "./Poster";
import { formatDate } from "../lib/format";
import { Avatar } from "./Avatar";

export type FeedReviewItem = {
  type: "review";
  timestamp: number;
  review: { _id: string; rating: number; reviewText: string };
  user?: { _id: string; displayName?: string | null; username?: string | null } | null;
  avatarUrl?: string | null;
  show?: { _id: string; title: string; year?: number | null; posterUrl?: string | null } | null;
};

export type FeedItemProps = FeedReviewItem;

export function FeedItem({ item }: { item: FeedItemProps }) {
  const router = useRouter();
  const userLabel = item.user?.displayName ?? item.user?.username ?? "Someone";
  const showTitle = item.show?.title ?? "Unknown show";
  const showId = item.show?._id;
  const userId = item.user?._id;

  const handleProfilePress = useCallback(() => {
    if (userId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/profile/${userId}`);
    }
  }, [router, userId]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/review/${item.review._id}`);
  }, [router, item.review._id]);

  return (
    <Pressable
      onPress={handlePress}
      className="rounded-2xl bg-dark-card p-4"
    >
      <Pressable
        onPress={handleProfilePress}
        disabled={!userId}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        <Avatar uri={item.avatarUrl} label={userLabel} size={32} />
        <View>
          <Text className="text-sm font-semibold text-text-primary">{userLabel}</Text>
          <Text className="text-xs text-text-tertiary">
            Reviewed · {formatDate(item.timestamp)}
          </Text>
        </View>
      </Pressable>

      <View className="mt-4 flex-row gap-4">
        <Poster uri={item.show?.posterUrl ?? undefined} size="sm" />
        <View className="flex-1">
          <Text className="text-base font-semibold text-text-primary">
            {showTitle}
          </Text>
          <Text className="mt-2 text-sm text-text-secondary" numberOfLines={3}>
            {item.review.reviewText}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
