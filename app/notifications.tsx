import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";

import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { FlashList } from "../components/FlashList";
import { GlassPressable } from "../components/NativeGlass";
import { Screen } from "../components/Screen";
import { formatRelativeTime } from "../lib/format";
import { guardedPush } from "../lib/navigation";
import { api } from "../lib/plotlist/api";
import { useMutation, usePaginatedQuery, useQuery } from "../lib/plotlist/react";
import { syncAppBadgeCount } from "../lib/pushToken";

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  follow: "person-add",
  follow_request: "person-add",
  follow_accepted: "checkmark-circle",
  like: "heart",
  comment: "chatbubble-ellipses",
  episode: "tv",
  list_follow: "list",
};

const TYPE_ICON_COLORS: Record<string, string> = {
  follow: "#38BDF8",
  follow_request: "#F59E0B",
  follow_accepted: "#22C55E",
  like: "#F472B6",
  comment: "#A78BFA",
  episode: "#22C55E",
  list_follow: "#38BDF8",
};

function notificationHref(item: any): Href | null {
  const url = item?.data?.url;
  if (typeof url === "string" && url.startsWith("/") && url !== "/notifications") {
    return url as Href;
  }
  return null;
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: any;
  onOpen: (item: any) => void;
}) {
  const unread = !item.readAt;
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onOpen(item);
      }}
      className={`flex-row items-start gap-3 rounded-2xl px-4 py-3.5 active:bg-dark-hover ${
        unread ? "bg-dark-elevated/60" : ""
      }`}
    >
      {item.actor ? (
        <Avatar
          uri={item.actor.avatarUrl}
          label={item.actor.displayName ?? item.actor.username}
          size={40}
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-dark-elevated">
          <Ionicons
            name={TYPE_ICONS[item.type] ?? "notifications"}
            size={18}
            color={TYPE_ICON_COLORS[item.type] ?? "#9BA1B0"}
          />
        </View>
      )}
      <View className="flex-1">
        <Text className={`text-sm ${unread ? "font-semibold" : "font-medium"} text-text-primary`}>
          {item.title}
        </Text>
        <Text className="mt-0.5 text-sm text-text-secondary" numberOfLines={2}>
          {item.body}
        </Text>
        <Text className="mt-1 text-xs text-text-tertiary">
          {formatRelativeTime(item.createdAt)}
        </Text>
      </View>
      {unread ? <View className="mt-2 h-2 w-2 rounded-full bg-sky-400" /> : null}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const unreadCount = useQuery(api.notifications.getUnreadCount);
  const {
    results: items,
    status,
    loadMore,
  } = usePaginatedQuery(api.notifications.list, {}, { initialNumItems: 30 });

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const listContentStyle = useMemo(() => ({ paddingVertical: 12 }), []);

  const openNotification = useCallback(
    (item: any) => {
      if (!item.readAt) {
        void markRead({ notificationId: item._id }).then(() => syncAppBadgeCount());
      }
      const href = notificationHref(item);
      if (href) {
        guardedPush(href);
      }
    },
    [markRead],
  );

  const handleMarkAllRead = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void markAllRead({}).then(() => syncAppBadgeCount());
  }, [markAllRead]);

  const renderItem = useCallback(
    ({ item }: { item: any }) => <NotificationRow item={item} onOpen={openNotification} />,
    [openNotification],
  );

  return (
    <Screen>
      <View className="flex-1 px-4 pt-2">
        <View className="flex-row items-center gap-3 px-2">
          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            radius={20}
            variant="control"
            contentStyle={{
              alignItems: "center",
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
          </GlassPressable>
          <View className="flex-1">
            <Text className="text-2xl font-black text-text-primary">Notifications</Text>
          </View>
          {(unreadCount ?? 0) > 0 ? (
            <Pressable onPress={handleMarkAllRead} hitSlop={8}>
              <Text className="text-sm font-semibold text-sky-400">Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mt-4 flex-1">
          {status === "LoadingFirstPage" ? (
            <View className="mt-16 items-center">
              <ActivityIndicator color="#5A6070" />
            </View>
          ) : items.length > 0 ? (
            <FlashList
              data={items}
              renderItem={renderItem}
              keyExtractor={(item: any) => item._id}
              estimatedItemSize={88}
              contentContainerStyle={listContentStyle}
              onEndReached={() => {
                if (status === "CanLoadMore") {
                  loadMore(30);
                }
              }}
              onEndReachedThreshold={0.5}
            />
          ) : (
            <View className="mt-4">
              <EmptyState
                title="Nothing here yet"
                description="New followers, likes, comments, and episode alerts will show up here."
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
