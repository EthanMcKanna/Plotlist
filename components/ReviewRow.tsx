import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Poster } from "./Poster";
import { Avatar } from "./Avatar";
import { formatRelativeTime } from "../lib/format";

export function ReviewRow({
  id,
  showTitle,
  posterUrl,
  rating,
  reviewText,
  authorName,
  authorUsername,
  authorAvatarUrl,
  createdAt,
  spoiler = false,
}: {
  id: string;
  showTitle?: string;
  posterUrl?: string | null;
  rating: number;
  reviewText?: string | null;
  authorName?: string | null;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  createdAt?: number;
  spoiler?: boolean;
}) {
  const router = useRouter();
  const titleLabel = authorName ?? showTitle ?? "Review";
  const subtitleLabel = authorName && showTitle ? showTitle : authorUsername ? `@${authorUsername}` : null;
  const hasText = Boolean(reviewText);

  // Rating-only: compact single-line row
  if (!hasText) {
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/review/${id}`);
        }}
        className="flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card px-3 py-2.5 active:bg-dark-hover"
      >
        {authorName ? (
          <Avatar uri={authorAvatarUrl} label={authorName} size={32} />
        ) : (
          <Poster uri={posterUrl ?? undefined} size="sm" />
        )}
        <View className="flex-1">
          <Text className="text-sm font-semibold text-text-primary" numberOfLines={1}>
            {titleLabel}
          </Text>
          {subtitleLabel ? (
            <Text className="text-xs text-text-tertiary">{subtitleLabel}</Text>
          ) : null}
        </View>
        <View className="rounded-full bg-amber-500/12 px-2.5 py-1">
          <Text className="text-xs font-semibold text-amber-300">★ {rating}/5</Text>
        </View>
        {createdAt ? (
          <Text className="text-xs text-text-tertiary">
            {formatRelativeTime(createdAt)}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  // Full review card
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/review/${id}`);
      }}
      className="flex-row gap-4 rounded-2xl border border-dark-border bg-dark-card p-3 active:bg-dark-hover"
    >
      {authorName ? (
        <Avatar uri={authorAvatarUrl} label={authorName} size={40} />
      ) : (
        <Poster uri={posterUrl ?? undefined} size="sm" />
      )}
      <View className="flex-1">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-semibold text-text-primary">
              {titleLabel}
            </Text>
            {subtitleLabel ? (
              <Text className="mt-1 text-xs text-text-tertiary">{subtitleLabel}</Text>
            ) : null}
          </View>
          {createdAt ? (
            <Text className="mt-0.5 text-xs text-text-tertiary">
              {formatRelativeTime(createdAt)}
            </Text>
          ) : null}
        </View>

        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <View className="rounded-full bg-amber-500/12 px-2.5 py-1">
            <Text className="text-xs font-semibold text-amber-300">★ {rating}/5</Text>
          </View>
          {spoiler ? (
            <View className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1">
              <Text className="text-xs font-medium text-red-300">Spoilers</Text>
            </View>
          ) : null}
        </View>

        <Text className="mt-3 text-sm text-text-secondary" numberOfLines={3}>
          {reviewText}
        </Text>
      </View>
    </Pressable>
  );
}
