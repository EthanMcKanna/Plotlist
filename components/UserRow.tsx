import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import type { Id } from "../lib/plotlist/types";
import { useFollowToggle } from "../lib/useFollowToggle";
import { Avatar } from "./Avatar";
import { LinkPressable } from "./LinkPressable";
import { TasteMatchSummary } from "./TasteMatchSummary";

type TasteMatchData = {
  percent: number;
  sharedFavoriteShows: Array<{
    showId?: string;
    title: string;
    posterUrl?: string | null;
  }>;
};

type UserRowProps = {
  userId: Id<"users">;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  subtitle?: string | null;
  isFollowing?: boolean;
  followsYou?: boolean;
  isMutualFollow?: boolean;
  mutualCount?: number;
  inContacts?: boolean;
  sharedShowCount?: number;
  showFollowButton?: boolean;
  taste?: TasteMatchData | null;
  /**
   * Fires on the follow tap before any state moves — lists use it to pin
   * their visible order so the row never shifts under the finger.
   */
  onFollowPress?: () => void;
};

function buildRelationshipSubtitle({
  subtitle,
  inContacts,
  followsYou,
  isMutualFollow,
  mutualCount,
  sharedShowCount,
}: Pick<
  UserRowProps,
  | "subtitle"
  | "inContacts"
  | "followsYou"
  | "isMutualFollow"
  | "mutualCount"
  | "sharedShowCount"
>) {
  if (subtitle) {
    return subtitle;
  }

  const parts: string[] = [];
  if (inContacts) {
    parts.push("In your contacts");
  }
  if (isMutualFollow) {
    parts.push("Friends");
  } else if (followsYou) {
    parts.push("Follows you");
  }
  if ((mutualCount ?? 0) > 0) {
    parts.push(`${mutualCount} mutual friend${mutualCount === 1 ? "" : "s"}`);
  }
  if ((sharedShowCount ?? 0) > 0) {
    parts.push(`${sharedShowCount} shared show${sharedShowCount === 1 ? "" : "s"}`);
  }

  return parts.join(" · ") || null;
}

export const UserRow = memo(function UserRow({
  userId,
  displayName,
  username,
  avatarUrl,
  subtitle,
  isFollowing: isFollowingProp = false,
  followsYou = false,
  isMutualFollow = false,
  mutualCount = 0,
  inContacts = false,
  sharedShowCount = 0,
  showFollowButton = true,
  taste = null,
  onFollowPress,
}: UserRowProps) {
  // Optimistic on every platform; private accounts turn a follow tap into a
  // pending request ("Requested"). Person previews carry no request flag, so
  // that state is local until the next payload.
  const { isFollowing, isRequested, toggle } = useFollowToggle(
    userId,
    { isFollowing: isFollowingProp },
    { onPress: onFollowPress },
  );

  const handlePressProfile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleToggleFollow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void toggle();
  }, [toggle]);

  const nameLabel = displayName ?? username ?? "User";
  const usernameLabel = username ? `@${username}` : null;
  const relationshipSubtitle = buildRelationshipSubtitle({
    subtitle,
    inContacts,
    followsYou,
    isMutualFollow,
    mutualCount,
    sharedShowCount,
  });

  return (
    <View className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
      <View className="flex-row items-center justify-between">
        <LinkPressable
          href={`/profile/${userId}`}
          onPress={handlePressProfile}
          className="flex-1 flex-row items-center gap-3 pr-3 web:transition-opacity active:opacity-80 hover:opacity-90"
        >
          <Avatar uri={avatarUrl} label={nameLabel} size={44} />
          <View className="flex-1">
            <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
              {nameLabel}
            </Text>
            {usernameLabel ? (
              <Text className="text-xs text-text-tertiary" numberOfLines={1}>
                {usernameLabel}
              </Text>
            ) : null}
            {relationshipSubtitle ? (
              <Text className="mt-1 text-xs text-text-tertiary" numberOfLines={1}>
                {relationshipSubtitle}
              </Text>
            ) : null}
          </View>
        </LinkPressable>
        {showFollowButton ? (
          <Pressable
            onPress={handleToggleFollow}
            accessibilityRole="button"
            accessibilityLabel={
              isFollowing ? "Unfollow" : isRequested ? "Withdraw follow request" : "Follow"
            }
            className={`items-center justify-center rounded-full px-4 py-2 web:transition ${
              isFollowing || isRequested
                ? "border border-dark-border bg-dark-card hover:bg-dark-hover"
                : "bg-brand-500 hover:opacity-90"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                isFollowing || isRequested ? "text-text-primary" : "text-white"
              }`}
            >
              {isFollowing
                ? "Following"
                : isRequested
                  ? "Requested"
                  : followsYou
                    ? "Follow back"
                    : "Follow"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {taste ? (
        <TasteMatchSummary
          percent={taste.percent}
          sharedFavoriteShows={taste.sharedFavoriteShows}
          variant="compact"
        />
      ) : null}
    </View>
  );
});
