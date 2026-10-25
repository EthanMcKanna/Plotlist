import { memo, useCallback, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { Href } from "expo-router";

import { useAccent } from "../lib/appearanceStore";
import { formatCompactRelativeTime } from "../lib/format";
import {
  groupActors,
  groupBodySegments,
  groupPlainText,
  notificationVisuals,
  type NotificationActor,
  type NotificationItem,
} from "../lib/notificationDisplay";
import { resizeTmdbImageUrl } from "../lib/tmdbImages";
import { useFollowToggle } from "../lib/useFollowToggle";
import { Avatar } from "./Avatar";
import { LinkPressable } from "./LinkPressable";
import { NotificationRowActions } from "./NotificationRowActions";
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
  // 44pt-wide thumb: w185 decodes ~7x fewer pixels than the server's w500.
  const thumbUri = resizeTmdbImageUrl(uri, "w185");
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
        source={{ uri: thumbUri }}
        recyclingKey={thumbUri}
        style={{ height: "100%", width: "100%" }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
      />
    </View>
  );
}

// Follow-back pill for follow/contact_joined rows, seeded from the follow
// state the list RPC now returns. Same flow as UserRow: optimistic on every
// platform, private accounts turn a follow tap into a pending request.
function FollowBackButton({
  userId,
  viewerFollows,
  viewerRequested,
}: {
  userId: string;
  viewerFollows: boolean;
  viewerRequested: boolean;
}) {
  const { isFollowing, isRequested, toggle } = useFollowToggle(userId, {
    isFollowing: viewerFollows,
    isRequested: viewerRequested,
  });

  const handleToggleFollow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void toggle();
  }, [toggle]);

  return (
    <Pressable
      onPress={handleToggleFollow}
      accessibilityRole="button"
      accessibilityLabel={
        isFollowing ? "Unfollow" : isRequested ? "Withdraw follow request" : "Follow back"
      }
      className={`items-center justify-center rounded-full px-3.5 py-2 web:transition ${
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
        {isFollowing ? "Following" : isRequested ? "Requested" : "Follow back"}
      </Text>
    </Pressable>
  );
}

// Two overlapping avatars for grouped rows ("Ana, Ben and 3 others …"),
// newest actor in front — the same footprint as a single 44pt avatar.
function StackedAvatars({ actors }: { actors: NotificationActor[] }) {
  const [front, back] = actors;
  return (
    <View style={{ height: 44, width: 44 }}>
      <View className="absolute right-0 top-0">
        <Avatar
          uri={back.avatarUrl}
          label={back.displayName ?? back.username ?? "User"}
          size={28}
        />
      </View>
      <View
        className="absolute bottom-0 left-0 rounded-full"
        style={{ borderColor: "#0D0F14", borderWidth: 2 }}
      >
        <Avatar
          uri={front.avatarUrl}
          label={front.displayName ?? front.username ?? "User"}
          size={30}
        />
      </View>
    </View>
  );
}

export type NotificationRowProps = {
  item: NotificationItem;
  group: NotificationItem[];
  unread: boolean;
  onOpen: (item: NotificationItem, group: NotificationItem[]) => void;
  onMarkRead: (group: NotificationItem[]) => void;
  onToggleRead: (group: NotificationItem[], unread: boolean) => void;
  onDelete: (group: NotificationItem[]) => void;
  onMuteShow: (item: NotificationItem) => void;
  onOpenSettings: () => void;
};

const SHOW_MUTABLE_TYPES = new Set(["episode", "premiere", "streaming", "vibe_arrival"]);

export const NotificationRow = memo(function NotificationRow({
  item,
  group,
  unread,
  onOpen,
  onMarkRead,
  onToggleRead,
  onDelete,
  onMuteShow,
  onOpenSettings,
}: NotificationRowProps) {
  const accent = useAccent();
  const href = notificationHref(item);
  const visuals = notificationVisuals(item);
  const glyphColor = visuals.glyphColor === "accent" ? accent.ramp[400] : visuals.glyphColor;
  const timeLabel = formatCompactRelativeTime(item.createdAt);
  const actorName = item.actor?.displayName ?? item.actor?.username ?? null;
  const actors = groupActors(group);
  const isGroup = actors.length > 1;
  const bodySegments = groupBodySegments(group);
  const plainBody = isGroup ? groupPlainText(group) : item.body;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (href) {
      onMarkRead(group);
    } else {
      onOpen(item, group);
    }
  }, [group, href, item, onMarkRead, onOpen]);

  const handleToggleRead = useCallback(() => onToggleRead(group, unread), [group, onToggleRead, unread]);
  const handleDelete = useCallback(() => onDelete(group), [group, onDelete]);
  const canMuteShow = Boolean(item.show?._id) && SHOW_MUTABLE_TYPES.has(item.type);
  const handleMuteShow = useCallback(() => onMuteShow(item), [item, onMuteShow]);

  const leading =
    visuals.leading === "avatar" && isGroup ? (
      <View className="relative">
        <StackedAvatars actors={actors} />
        <CornerBadge glyph={visuals.glyph} color={glyphColor} />
      </View>
    ) : visuals.leading === "avatar" && item.actor ? (
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

  // Actor rows collapse to a single Instagram-style paragraph (bold names +
  // action + muted inline age); entity rows keep the server title as the
  // headline with the body below.
  const text = item.actor ? (
    <Text className="text-[14px] leading-[19px] text-text-secondary" numberOfLines={3}>
      {bodySegments.map((segment, index) => (
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

  const showFollowButton = visuals.trailing === "followButton" && item.actor && !isGroup;
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
    <View
      className="h-2 w-2 rounded-full"
      style={{ backgroundColor: accent.ramp[400] }}
      accessible={false}
    />
  ) : null;

  // Opaque on native so the swipe actions underneath only show as the row
  // slides away (web has no swipe and a different column background).
  const rowClassName = `flex-row items-center gap-3 rounded-2xl px-3 py-3 ${
    unread ? "bg-dark-card" : "native:bg-dark-bg"
  }`;
  const pressClassName =
    "active:opacity-85 hover:bg-white/5 web:transition-colors rounded-xl";
  const accessibilityLabel = `${unread ? "Unread. " : ""}${item.actor ? plainBody : `${item.title}. ${item.body}`}. ${timeLabel} ago`;
  // VoiceOver/TalkBack get the swipe + menu actions on the row itself.
  const accessibilityActions = [
    { name: "toggleRead", label: unread ? "Mark as read" : "Mark as unread" },
    { name: "delete", label: "Delete" },
    ...(canMuteShow ? [{ name: "muteShow", label: "Mute this show" }] : []),
  ];
  const onAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === "toggleRead") handleToggleRead();
    else if (event.nativeEvent.actionName === "delete") handleDelete();
    else if (event.nativeEvent.actionName === "muteShow") handleMuteShow();
  };
  const a11yProps = { accessibilityActions, onAccessibilityAction };

  let row: ReactNode;
  // Avatar, row body, and the follow pill are sibling pressables (never
  // nested) so the web output stays valid HTML — a button may not contain
  // another button.
  if (item.actor && (showFollowButton || visuals.leading === "avatar")) {
    const main = (
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <View className="min-w-0 flex-1">{text}</View>
        {trailing}
      </View>
    );
    row = (
      <View className={rowClassName}>
        <LinkPressable
          href={`/profile/${item.actor._id}`}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onMarkRead(group);
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
            {...a11yProps}
            className={`min-w-0 flex-1 ${pressClassName}`}
          >
            {main}
          </LinkPressable>
        ) : (
          <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            {...a11yProps}
            className={`min-w-0 flex-1 ${pressClassName}`}
          >
            {main}
          </Pressable>
        )}
        {showFollowButton && item.actor ? (
          <FollowBackButton
            userId={item.actor._id}
            viewerFollows={Boolean(item.actor.viewerFollows)}
            viewerRequested={Boolean(item.actor.viewerRequested)}
          />
        ) : null}
        {unreadDot}
      </View>
    );
  } else {
    const content = (
      <>
        {leading}
        <View className="min-w-0 flex-1">{text}</View>
        {trailing}
        {unreadDot}
      </>
    );
    row = href ? (
      <LinkPressable
        href={href}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        {...a11yProps}
        className={`${rowClassName} active:bg-dark-hover hover:bg-dark-hover web:transition-colors`}
      >
        {content}
      </LinkPressable>
    ) : (
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        {...a11yProps}
        className={`${rowClassName} active:bg-dark-hover hover:bg-dark-hover web:transition-colors`}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <NotificationRowActions
      unread={unread}
      onToggleRead={handleToggleRead}
      onDelete={handleDelete}
      onMuteShow={canMuteShow ? handleMuteShow : undefined}
      onOpenSettings={onOpenSettings}
    >
      {row}
    </NotificationRowActions>
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
