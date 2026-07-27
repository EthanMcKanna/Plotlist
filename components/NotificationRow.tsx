import { memo, useCallback, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { Href } from "expo-router";

import { api } from "../lib/plotlist/api";
import { useMutation } from "../lib/plotlist/react";
import { useAccent } from "../lib/appearanceStore";
import { formatCompactRelativeTime } from "../lib/format";
import {
  notificationBodySegments,
  notificationVisuals,
  type NotificationItem,
} from "../lib/notificationDisplay";
import { Avatar } from "./Avatar";
import { LinkPressable } from "./LinkPressable";
import { Poster } from "./Poster";
import { ShimmerBlock } from "./ShowDetailSkeleton";

export function notificationHref(item: NotificationItem): Href | null {
  const url = item?.data?.url;
  if (typeof url === "string" && url.startsWith("/") && url !== "/notifications") {
    return url as Href;
  }
  return null;
}

// Small type glyph pinned to the corner of the leading visual, Instagram
// style — the image carries the identity, the badge carries the "what".
function CornerBadge({ glyph, color }: { glyph: string; color: string }) {
  return (
    <View
      className="absolute -bottom-1 -right-1 items-center justify-center rounded-full bg-dark-elevated"
      style={{ borderColor: "#0D0F14", borderWidth: 2, height: 19, width: 19 }}
    >
      <Ionicons
        name={glyph as keyof typeof Ionicons.glyphMap}
        size={10}
        color={color}
        accessible={false}
        accessibilityElementsHidden
        aria-hidden={true}
        importantForAccessibility="no"
      />
    </View>
  );
}

function GlyphTile({ glyph, color, size }: { glyph: string; color: string; size: number }) {
  return (
    <View
      className="items-center justify-center rounded-xl border border-dark-border bg-dark-elevated"
      style={{ height: size, width: size }}
    >
      <Ionicons
        name={glyph as keyof typeof Ionicons.glyphMap}
        size={size >= 44 ? 19 : 17}
        color={color}
        accessible={false}
        accessibilityElementsHidden
        aria-hidden={true}
        importantForAccessibility="no"
      />
    </View>
  );
}

function PosterThumb({ uri }: { uri: string }) {
  return (
    <View
      className="overflow-hidden bg-dark-elevated"
      style={{
        borderColor: "rgba(255,255,255,0.07)",
        borderRadius: 10,
        borderWidth: 1,
        height: 66,
        width: 44,
      }}
    >
      <Image
        source={{ uri }}
        style={{ height: "100%", width: "100%" }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
      />
    </View>
  );
}

// Follow-back pill for follow/contact_joined rows, seeded from the follow
// state the list RPC now returns. Same flow as UserRow: private accounts
// turn a follow tap into a pending request.
function FollowBackButton({
  userId,
  viewerFollows,
  viewerRequested,
}: {
  userId: string;
  viewerFollows: boolean;
  viewerRequested: boolean;
}) {
  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);
  const [isFollowing, setIsFollowing] = useState(viewerFollows);
  const [isRequested, setIsRequested] = useState(viewerRequested);
  const [isPending, setIsPending] = useState(false);

  const handleToggleFollow = useCallback(async () => {
    if (isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPending(true);

    // Web flips the label optimistically (no haptic feedback there, so the
    // click needs an instant response); native keeps its settle-after-server
    // behavior. The catch below restores the previous state either way.
    const optimistic = Platform.OS === "web";
    const wasFollowing = isFollowing;
    const wasRequested = isRequested;
    try {
      if (wasFollowing || wasRequested) {
        if (optimistic) {
          setIsFollowing(false);
          setIsRequested(false);
        }
        // Unfollow also withdraws a pending follow request.
        await unfollow({ userIdToUnfollow: userId });
        setIsFollowing(false);
        setIsRequested(false);
      } else {
        if (optimistic) setIsFollowing(true);
        const result = (await follow({ userIdToFollow: userId })) as
          | { status?: string }
          | null;
        if (result?.status === "requested") {
          setIsFollowing(false);
          setIsRequested(true);
        } else {
          setIsFollowing(true);
        }
      }
    } catch (error) {
      console.warn("Failed to update follow", error);
      setIsFollowing(wasFollowing);
      setIsRequested(wasRequested);
    } finally {
      setIsPending(false);
    }
  }, [follow, isFollowing, isPending, isRequested, unfollow, userId]);

  return (
    <Pressable
      onPress={handleToggleFollow}
      disabled={isPending}
      accessibilityRole="button"
      accessibilityLabel={
        isFollowing ? "Unfollow" : isRequested ? "Withdraw follow request" : "Follow back"
      }
      className={`items-center justify-center rounded-full px-3.5 py-2 web:transition ${
        isFollowing || isRequested
          ? "border border-dark-border bg-dark-card hover:bg-dark-hover"
          : "bg-brand-500 hover:opacity-90"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <Text
        className={`text-xs font-semibold ${
          isFollowing || isRequested ? "text-text-primary" : "text-white"
        }`}
      >
        {isFollowing ? "Following" : isRequested ? "Requested" : "Follow back"}
      </Text>
    </Pressable>
  );
}

export const NotificationRow = memo(function NotificationRow({
  item,
  unread,
  onOpen,
  onMarkRead,
}: {
  item: NotificationItem;
  unread: boolean;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (item: NotificationItem) => void;
}) {
  const accent = useAccent();
  const href = notificationHref(item);
  const visuals = notificationVisuals(item);
  const glyphColor = visuals.glyphColor === "accent" ? accent.ramp[400] : visuals.glyphColor;
  const timeLabel = formatCompactRelativeTime(item.createdAt);
  const actorName = item.actor?.displayName ?? item.actor?.username ?? null;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (href) {
      onMarkRead(item);
    } else {
      onOpen(item);
    }
  }, [href, item, onMarkRead, onOpen]);

  const leading =
    visuals.leading === "avatar" && item.actor ? (
      <View className="relative">
        <Avatar uri={item.actor.avatarUrl} label={actorName ?? "User"} size={44} />
        <CornerBadge glyph={visuals.glyph} color={glyphColor} />
      </View>
    ) : visuals.leading === "poster" && item.show?.posterUrl ? (
      <View className="relative">
        <PosterThumb uri={item.show.posterUrl} />
        <CornerBadge glyph={visuals.glyph} color={glyphColor} />
      </View>
    ) : (
      <GlyphTile glyph={visuals.glyph} color={glyphColor} size={44} />
    );

  // Actor rows collapse to a single Instagram-style paragraph (bold name +
  // action + muted inline age); entity rows keep the server title as the
  // headline with the body below.
  const text = item.actor ? (
    <Text className="text-[14px] leading-[19px] text-text-secondary" numberOfLines={3}>
      {notificationBodySegments(item).map((segment, index) => (
        <Text
          key={index}
          className={
            segment.bold ? "font-semibold text-text-primary" : "text-text-secondary"
          }
        >
          {segment.text}
        </Text>
      ))}
      <Text className="text-text-tertiary">{`  ${timeLabel}`}</Text>
    </Text>
  ) : (
    <>
      <Text
        className={`text-[14px] leading-[19px] ${unread ? "font-semibold" : "font-medium"} text-text-primary`}
        numberOfLines={1}
      >
        {item.title}
        <Text className="font-normal text-text-tertiary">{`  ${timeLabel}`}</Text>
      </Text>
      <Text
        className="mt-0.5 text-[13px] leading-[18px] text-text-secondary"
        numberOfLines={2}
      >
        {item.body}
      </Text>
    </>
  );

  const trailing =
    visuals.trailing === "poster" && item.show?.posterUrl ? (
      <Poster uri={item.show.posterUrl} width={40} alt={item.show.title ?? undefined} />
    ) : visuals.trailing === "tile" ? (
      <GlyphTile glyph={visuals.glyph} color={glyphColor} size={40} />
    ) : visuals.trailing === "chevron" ? (
      <Ionicons
        name="chevron-forward"
        size={16}
        color="#5A6070"
        accessible={false}
        accessibilityElementsHidden
        aria-hidden={true}
        importantForAccessibility="no"
      />
    ) : null;

  const unreadDot = unread ? (
    <View className="h-2 w-2 rounded-full bg-brand-400" />
  ) : null;

  const rowClassName = `flex-row items-center gap-3 rounded-2xl px-3 py-3 ${
    unread ? "bg-dark-elevated/60" : ""
  }`;
  const pressClassName =
    "active:opacity-85 hover:bg-white/5 web:transition-colors rounded-xl";
  const accessibilityLabel = `${item.title}. ${item.body}`;

  // Avatar, row body, and the follow pill are sibling pressables (never
  // nested) so the web output stays valid HTML — a button may not contain
  // another button.
  if (item.actor && (visuals.trailing === "followButton" || visuals.leading === "avatar")) {
    const main = (
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <View className="min-w-0 flex-1">{text}</View>
        {trailing}
      </View>
    );
    return (
      <View className={rowClassName}>
        <LinkPressable
          href={`/profile/${item.actor._id}`}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onMarkRead(item);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open ${actorName ?? "user"}'s profile`}
          hitSlop={6}
          className="active:opacity-80 hover:opacity-80 web:transition-opacity"
        >
          {leading}
        </LinkPressable>
        {href ? (
          <LinkPressable
            href={href}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            className={`min-w-0 flex-1 ${pressClassName}`}
          >
            {main}
          </LinkPressable>
        ) : (
          <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            className={`min-w-0 flex-1 ${pressClassName}`}
          >
            {main}
          </Pressable>
        )}
        {visuals.trailing === "followButton" && item.actor ? (
          <FollowBackButton
            userId={item.actor._id}
            viewerFollows={Boolean(item.actor.viewerFollows)}
            viewerRequested={Boolean(item.actor.viewerRequested)}
          />
        ) : null}
        {unreadDot}
      </View>
    );
  }

  const content = (
    <>
      {leading}
      <View className="min-w-0 flex-1">{text}</View>
      {trailing}
      {unreadDot}
    </>
  );
  if (href) {
    return (
      <LinkPressable
        href={href}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={`${rowClassName} active:bg-dark-hover hover:bg-dark-hover web:transition-colors`}
      >
        {content}
      </LinkPressable>
    );
  }
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`${rowClassName} active:bg-dark-hover hover:bg-dark-hover web:transition-colors`}
    >
      {content}
    </Pressable>
  );
});

export function NotificationRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl px-3 py-3">
      <ShimmerBlock width={44} height={44} radius={22} />
      <View className="flex-1 gap-2">
        <ShimmerBlock width="70%" height={13} radius={6} />
        <ShimmerBlock width="40%" height={11} radius={5} />
      </View>
      <ShimmerBlock width={40} height={60} radius={10} />
    </View>
  );
}

export function NotificationSkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <View>
      <View className="px-3 pb-2 pt-1">
        <ShimmerBlock width={64} height={11} radius={5} />
      </View>
      {Array.from({ length: rows }, (_, index) => (
        <NotificationRowSkeleton key={index} />
      ))}
    </View>
  );
}
