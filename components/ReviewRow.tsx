import { Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinkPressable } from "./LinkPressable";
import { Poster } from "./Poster";
import { Avatar } from "./Avatar";
import { SpoilerShield } from "./SpoilerShield";
import { formatEpisodeCode, formatRelativeTime } from "../lib/format";

export function getReviewRowEpisodeLabel({
  seasonNumber,
  episodeNumber,
}: {
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}) {
  if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
    return null;
  }
  return formatEpisodeCode(seasonNumber, episodeNumber);
}

// Compact review row in the comments design language: avatar + name/time
// header, small star strip, plain text — no card chrome. Used where reviews
// sit inline on a detail page (show page community reviews).
export function ReviewRowCompact({
  id,
  rating,
  reviewText,
  authorName,
  authorAvatarUrl,
  createdAt,
  spoiler = false,
}: {
  id: string;
  rating: number;
  reviewText?: string | null;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  createdAt?: number;
  spoiler?: boolean;
}) {
  const label = authorName ?? "Someone";

  return (
    <LinkPressable
      href={`/review/${id}`}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Review by ${label}, ${rating} out of 5 stars`}
      className="flex-row gap-3 py-3 web:transition-opacity active:opacity-80 hover:opacity-80"
    >
      <Avatar uri={authorAvatarUrl} label={label} size={32} />
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="shrink text-[13px] font-semibold text-text-primary" numberOfLines={1}>
            {label}
          </Text>
          <View className="flex-row items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Ionicons
                key={i}
                name={i < Math.round(rating) ? "star" : "star-outline"}
                size={11}
                color={i < Math.round(rating) ? "#fbbf24" : "#3b3f4a"}
              />
            ))}
          </View>
          {spoiler ? (
            <View className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5">
              <Text className="text-[10px] font-medium text-red-300">Spoilers</Text>
            </View>
          ) : null}
          {createdAt ? (
            <Text className="text-[11px] text-text-tertiary">
              {formatRelativeTime(createdAt)}
            </Text>
          ) : null}
        </View>
        {reviewText ? (
          <View className="mt-0.5">
            <SpoilerShield active={spoiler}>
              <Text className="text-[15px] leading-5 text-text-primary" numberOfLines={4}>
                {reviewText}
              </Text>
            </SpoilerShield>
          </View>
        ) : null}
      </View>
    </LinkPressable>
  );
}

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
  seasonNumber,
  episodeNumber,
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
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}) {
  const titleLabel = authorName ?? showTitle ?? "Review";
  const subtitleLabel = authorName && showTitle ? showTitle : authorUsername ? `@${authorUsername}` : null;
  const hasText = Boolean(reviewText);
  const episodeLabel = getReviewRowEpisodeLabel({ seasonNumber, episodeNumber });

  // Rating-only: compact single-line row
  if (!hasText) {
    return (
      <LinkPressable
        href={`/review/${id}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        className="flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card px-3 py-2.5 web:transition-colors active:bg-dark-hover hover:bg-dark-hover"
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
        {episodeLabel ? (
          <View className="rounded-full bg-brand-500/10 px-2 py-1">
            <Text className="text-[11px] font-semibold text-brand-300">{episodeLabel}</Text>
          </View>
        ) : null}
        <View className="rounded-full bg-amber-500/12 px-2.5 py-1">
          <Text className="text-xs font-semibold text-amber-300">★ {rating}/5</Text>
        </View>
        {createdAt ? (
          <Text className="text-xs text-text-tertiary">
            {formatRelativeTime(createdAt)}
          </Text>
        ) : null}
      </LinkPressable>
    );
  }

  // Full review card
  return (
    <LinkPressable
      href={`/review/${id}`}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      className="flex-row gap-4 rounded-2xl border border-dark-border bg-dark-card p-3 web:transition-colors active:bg-dark-hover hover:bg-dark-hover"
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
          {episodeLabel ? (
            <View className="rounded-full bg-brand-500/10 px-2.5 py-1">
              <Text className="text-xs font-semibold text-brand-300">{episodeLabel}</Text>
            </View>
          ) : null}
          <View className="rounded-full bg-amber-500/12 px-2.5 py-1">
            <Text className="text-xs font-semibold text-amber-300">★ {rating}/5</Text>
          </View>
          {spoiler ? (
            <View className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1">
              <Text className="text-xs font-medium text-red-300">Spoilers</Text>
            </View>
          ) : null}
        </View>

        <View className="mt-3">
          <SpoilerShield active={spoiler}>
            <Text className="text-sm text-text-secondary" numberOfLines={3}>
              {reviewText}
            </Text>
          </SpoilerShield>
        </View>
      </View>
    </LinkPressable>
  );
}
