import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { EmptyState } from "../components/EmptyState";
import { FlashList } from "../components/FlashList";
import { GlassPressable } from "../components/NativeGlass";
import {
  NotificationRow,
  NotificationSkeletonList,
  notificationHref,
} from "../components/NotificationRow";
import { Screen } from "../components/Screen";
import { useAccent } from "../lib/appearanceStore";
import { guardedPush } from "../lib/navigation";
import {
  notificationSections,
  type NotificationItem,
  type NotificationListEntry,
} from "../lib/notificationDisplay";
import { api } from "../lib/plotlist/api";
import { useMutation, usePaginatedQuery, useQuery } from "../lib/plotlist/react";
import { queryClient } from "../lib/queryClient";
import { syncAppBadgeCount } from "../lib/pushToken";
import { SHOW_BACK_BUTTON, useIsDesktopWeb } from "../lib/webLayout";

// List entries carry their unread flag so renderItem (and its deps) stay
// stable when one row is marked read — only that row's memo compare fails.
type NotificationFeedEntry =
  | Extract<NotificationListEntry, { kind: "header" }>
  | (Extract<NotificationListEntry, { kind: "row" }> & { unread: boolean });

function SectionHeader({ title }: { title: string }) {
  return (
    <View className="px-3 pb-1 pt-4">
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const accent = useAccent();
  const isDesktopWeb = useIsDesktopWeb();
  const unreadCount = useQuery(api.notifications.getUnreadCount);
  const {
    results: items,
    status,
    loadMore,
  } = usePaginatedQuery(api.notifications.list, {}, { initialNumItems: 30 });

  // Paginated pages are frozen in local state, so cache writes can't repaint
  // rows on older pages. Local overrides are the row-level unread truth; the
  // optimistic cache updates below only keep the bell badge in sync.
  const [readOverrides, setReadOverrides] = useState<Set<string>>(() => new Set());
  const [allReadLocally, setAllReadLocally] = useState(false);

  const markRead = useMutation(api.notifications.markRead).withOptimisticUpdate(
    (localStore) => {
      const current = localStore.getQuery(api.notifications.getUnreadCount, undefined);
      if (typeof current === "number") {
        localStore.setQuery(
          api.notifications.getUnreadCount,
          undefined,
          Math.max(0, current - 1),
        );
      }
    },
  );
  const markAllRead = useMutation(api.notifications.markAllRead).withOptimisticUpdate(
    (localStore) => {
      localStore.setQuery(api.notifications.getUnreadCount, undefined, 0);
    },
  );

  // Latest values behind stable refs so markNotificationRead (and everything
  // downstream: openNotification, renderItem, every row's memo compare) keeps
  // one identity for the life of the screen.
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  const readStateRef = useRef({ allReadLocally, readOverrides });
  readStateRef.current = { allReadLocally, readOverrides };

  const markNotificationRead = useCallback((item: NotificationItem) => {
    const readState = readStateRef.current;
    if (item.readAt || readState.allReadLocally || readState.readOverrides.has(item._id)) {
      return;
    }
    setReadOverrides((current) => {
      const next = new Set(current);
      next.add(item._id);
      return next;
    });
    void markReadRef.current({ notificationId: item._id }).then(() => syncAppBadgeCount());
  }, []);

  const openNotification = useCallback(
    (item: NotificationItem) => {
      markNotificationRead(item);
      const href = notificationHref(item);
      if (href) {
        guardedPush(href);
      }
    },
    [markNotificationRead],
  );

  const handleMarkAllRead = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAllReadLocally(true);
    void markAllRead({}).then(() => syncAppBadgeCount());
  }, [markAllRead]);

  const entries = useMemo<NotificationFeedEntry[]>(
    () =>
      notificationSections((items ?? []) as NotificationItem[]).map((entry) =>
        entry.kind === "row"
          ? {
              ...entry,
              unread:
                !entry.item.readAt &&
                !allReadLocally &&
                !readOverrides.has(entry.item._id),
            }
          : entry,
      ),
    [allReadLocally, items, readOverrides],
  );

  const renderItem = useCallback(
    ({ item: entry }: { item: NotificationFeedEntry }) =>
      entry.kind === "header" ? (
        <SectionHeader title={entry.title} />
      ) : (
        <NotificationRow
          item={entry.item}
          unread={entry.unread}
          onOpen={openNotification}
          onMarkRead={markNotificationRead}
        />
      ),
    [markNotificationRead, openNotification],
  );

  const listContentStyle = useMemo(() => ({ paddingBottom: 24, paddingTop: 4 }), []);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["plotlist-rpc"] });
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <Screen>
      <View className="flex-1 px-4 pt-2">
        <View className="flex-row items-center gap-3 px-2">
          {SHOW_BACK_BUTTON ? (
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
          ) : null}
          <View className="flex-1">
            <Text className="text-2xl font-black text-text-primary">Notifications</Text>
          </View>
          {(unreadCount ?? 0) > 0 ? (
            <Pressable onPress={handleMarkAllRead} hitSlop={8}>
              <Text className="text-sm font-semibold text-brand-400">Mark all read</Text>
            </Pressable>
          ) : null}
          {/* Desktop web has no pull-to-refresh gesture. */}
          {isDesktopWeb ? (
            <Pressable
              onPress={() => void handleRefresh()}
              disabled={refreshing}
              accessibilityRole="button"
              accessibilityLabel="Refresh notifications"
              {...(Platform.OS === "web"
                ? { title: "Refresh notifications" }
                : null)}
              className="h-8 w-8 items-center justify-center rounded-full hover:bg-white/5 web:transition-colors"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#9BA1B0" />
              ) : (
                <Ionicons name="refresh" size={17} color="#9BA1B0" />
              )}
            </Pressable>
          ) : null}
        </View>

        <View className="mt-3 flex-1">
          {status === "LoadingFirstPage" ? (
            <NotificationSkeletonList />
          ) : entries.length > 0 ? (
            <FlashList
              data={entries}
              renderItem={renderItem}
              keyExtractor={(entry: NotificationFeedEntry) => entry.key}
              getItemType={(entry: NotificationFeedEntry) => entry.kind}
              estimatedItemSize={72}
              contentContainerStyle={listContentStyle}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={accent.ramp[400]}
                />
              }
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
