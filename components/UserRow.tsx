import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { api } from "../lib/plotlist/api";
import type { Id } from "../lib/plotlist/types";
import { useMutation } from "../lib/plotlist/react";
import { Avatar } from "./Avatar";
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
}: UserRowProps) {
  const router = useRouter();
  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);
  const [isFollowing, setIsFollowing] = useState(Boolean(isFollowingProp));
  // Private accounts turn a follow tap into a pending request.
  const [isRequested, setIsRequested] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setIsFollowing(Boolean(isFollowingProp));
  }, [isFollowingProp]);

  const handlePressProfile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${userId}`);
  }, [router, userId]);

  const handleToggleFollow = useCallback(async () => {
    if (isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPending(true);

    try {
      if (isFollowing || isRequested) {
        // Unfollow also withdraws a pending follow request.
        await unfollow({ userIdToUnfollow: userId });
        setIsFollowing(false);
        setIsRequested(false);
      } else {
        const result = (await follow({ userIdToFollow: userId })) as
          | { status?: string }
          | null;
        if (result?.status === "requested") {
          setIsRequested(true);
        } else {
          setIsFollowing(true);
        }
      }
    } catch (error) {
      console.warn("Failed to update follow", error);
    } finally {
      setIsPending(false);
    }
  }, [follow, isFollowing, isPending, isRequested, unfollow, userId]);

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
        <Pressable
          onPress={handlePressProfile}
          className="flex-1 flex-row items-center gap-3 pr-3 active:opacity-80"
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
        </Pressable>
        {showFollowButton ? (
          <Pressable
            onPress={handleToggleFollow}
            disabled={isPending}
            className={`items-center justify-center rounded-full px-4 py-2 ${
              isFollowing || isRequested
                ? "border border-dark-border bg-dark-card"
                : "bg-brand-500"
            } ${isPending ? "opacity-60" : ""}`}
          >
            <Text
              className={`text-xs font-semibold ${
                isFollowing || isRequested ? "text-text-primary" : "text-white"
              }`}
            >
              {isFollowing ? "Following" : isRequested ? "Requested" : "Follow"}
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
