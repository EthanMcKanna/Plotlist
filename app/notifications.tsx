import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Avatar } from "../components/Avatar";
import { FlashList } from "../components/FlashList";
import { GlassPressable } from "../components/NativeGlass";
import {
  NotificationRow,
  NotificationSkeletonList,
  notificationHref,
} from "../components/NotificationRow";
import { Screen } from "../components/Screen";
import { useAccent } from "../lib/appearanceStore";
import { notify, notifyError } from "../lib/dialogs";
import { guardedPush } from "../lib/navigation";
import {
  NOTIFICATION_FILTERS,
  notificationSections,
  type NotificationFilter,
  type NotificationItem,
  type NotificationListEntry,
} from "../lib/notificationDisplay";
import { presentProPaywall } from "../lib/purchases";
import { useProStatus } from "../lib/useProStatus";
import { api } from "../lib/plotlist/api";
import { type LocalStore, useMutation, usePaginatedQuery, useQuery } from "../lib/plotlist/react";
import { queryClient } from "../lib/queryClient";
import { syncAppBadgeCount } from "../lib/pushToken";
import { useRefetchWhenStale } from "../lib/useRefetchWhenStale";
import { SHOW_BACK_BUTTON, useIsDesktopWeb } from "../lib/webLayout";

const INBOX_STALE_AFTER_MS = 60 * 1000;

// List entries carry their unread flag so renderItem (and its deps) stay
// stable when one row is marked read — only that row's memo compare fails.
type NotificationFeedEntry =
  | Extract<NotificationListEntry, { kind: "header" }>
  | (Extract<NotificationListEntry, { kind: "row" }> & { unread: boolean });

const UNDO_WINDOW_MS = 4000;

// Optimistic read/unread across every filter's cached copy of the inbox
// (`{}` matches all arg shapes), with the bell badge adjusted by however
// many rows actually flipped.
function patchReadState(localStore: LocalStore, ids: Set<string>, readAt: number | null) {
  const flipped = new Set<string>();
  localStore.setPaginatedQuery(api.notifications.list, {}, (current) => {
    if (!current) return current;
    const rows = ((current.results ?? current.page ?? []) as NotificationItem[]).map((row) => {
      if (!ids.has(row._id) || Boolean(row.readAt) === Boolean(readAt)) return row;
      flipped.add(row._id);
      return { ...row, readAt };
    });
    return { ...current, results: rows, page: rows };
  });
  const count = localStore.getQuery(api.notifications.getUnreadCount, undefined);
  if (typeof count === "number" && flipped.size > 0) {
    const delta = readAt ? -flipped.size : flipped.size;
    localStore.setQuery(api.notifications.getUnreadCount, undefined, Math.max(0, count + delta));
  }
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View className="px-3 pb-1.5 pt-5">
      <Text className="text-[15px] font-bold text-text-primary">{title}</Text>
    </View>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: NotificationFilter;
  onChange: (filter: NotificationFilter) => void;
}) {
  return (
    <View className="flex-row gap-2 px-2" accessibilityRole="tablist">
      {NOTIFICATION_FILTERS.map((filter) => {
        const selected = filter.key === value;
        return (
          <Pressable
            key={filter.key}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync();
              onChange(filter.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={`rounded-full px-4 py-[7px] web:transition-colors ${
              selected
                ? "bg-text-primary"
                : "border border-dark-border bg-dark-card hover:bg-dark-hover"
            }`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                selected ? "text-text-inverse" : "text-text-secondary"
              }`}
            >
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type IncomingRequestPreview = {
  user: { _id: string; avatarUrl?: string | null; displayName?: string | null; username?: string | null };
};

// Instagram-style entry point: pending requests live on their own screen,
// so the inbox shows one summary row instead of a row per request.
function FollowRequestsEntry({
  count,
  preview,
}: {
  count: number;
  preview: IncomingRequestPreview | null;
}) {
  const accent = useAccent();
  const name = preview?.user.displayName ?? preview?.user.username ?? null;
  const subtitle =
    name && count > 1
      ? `${name} + ${count - 1} ${count === 2 ? "other" : "others"}`
      : name ?? "Approve or ignore requests";
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        guardedPush("/follow-requests");
      }}
      accessibilityRole="button"
      accessibilityLabel={`Follow requests, ${count} pending`}
      className="mt-1 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-dark-hover hover:bg-dark-hover web:transition-colors"
    >
      <View className="relative">
        {preview ? (
          <Avatar uri={preview.user.avatarUrl} label={name ?? "User"} size={44} />
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-dark-elevated">
            <Ionicons name="person-add" size={18} color={accent.ramp[400]} />
          </View>
        )}
        <View
          className="absolute -right-1 -top-1 min-w-[20px] items-center justify-center rounded-full px-1"
          style={{
            backgroundColor: accent.ramp[500],
            borderColor: "#0D0F14",
            borderWidth: 2,
            height: 20,
          }}
        >
          <Text className="text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</Text>
        </View>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[14px] font-semibold text-text-primary">Follow requests</Text>
        <Text className="mt-0.5 text-[13px] text-text-secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#5A6070" />
    </Pressable>
  );
}

function InboxEmptyState({ filter }: { filter: NotificationFilter }) {
  const accent = useAccent();
  const copy =
    filter === "social"
      ? {
          icon: "people-outline" as const,
          title: "No social activity yet",
          body: "When people follow you or like and comment on your reviews, you'll see it here.",
        }
      : filter === "shows"
        ? {
            icon: "tv-outline" as const,
            title: "No show alerts yet",
            body: "New episodes, premieres, and streaming arrivals for shows you track land here.",
          }
        : {
            icon: "notifications-outline" as const,
            title: "Nothing here yet",
            body: "New followers, likes, comments, and episode alerts will show up here.",
          };
  return (
    <View className="items-center px-8 pt-20">
      <View
        className="mb-5 h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent.ramp[500]}22` }}
      >
        <Ionicons name={copy.icon} size={28} color={accent.ramp[400]} />
      </View>
      <Text className="text-center text-[17px] font-bold text-text-primary">{copy.title}</Text>
      <Text className="mt-2 text-center text-[14px] leading-[20px] text-text-secondary">
        {copy.body}
      </Text>
    </View>
  );
}

function CaughtUpFooter() {
  return (
    <View className="items-center py-8">
      <View className="h-9 w-9 items-center justify-center rounded-full border border-dark-border">
        <Ionicons name="checkmark" size={18} color="#5A6070" />
      </View>
      <Text className="mt-2 text-[13px] font-medium text-text-tertiary">You're all caught up</Text>
    </View>
  );
}

function UndoBar({ count, onUndo }: { count: number; onUndo: () => void }) {
  const accent = useAccent();
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      className="absolute bottom-6 left-4 right-4 flex-row items-center justify-between rounded-2xl border border-dark-border bg-dark-elevated px-4 py-3"
      style={{ shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}
      accessibilityLiveRegion="polite"
    >
      <Text className="text-[14px] font-medium text-text-primary">
        {count === 1 ? "Notification deleted" : `${count} notifications deleted`}
      </Text>
      <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo delete">
        <Text className="text-[14px] font-bold" style={{ color: accent.ramp[400] }}>
          Undo
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const accent = useAccent();
  const isDesktopWeb = useIsDesktopWeb();
  const proStatus = useProStatus();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const listArgs = useMemo(() => (filter === "all" ? {} : { filter }), [filter]);
  const unreadCount = useQuery(api.notifications.getUnreadCount);
  const requestCount = useQuery(api.followRequests.getIncomingCount) as number | undefined;
  const requestPreview = useQuery(
    api.followRequests.listIncoming,
    (requestCount ?? 0) > 0 ? { paginationOpts: { numItems: 1, cursor: null } } : "skip",
  ) as { page?: IncomingRequestPreview[] } | undefined;
  const {
    results: items,
    status,
    loadMore,
  } = usePaginatedQuery(api.notifications.list, listArgs, { initialNumItems: 30 });
  // Notifications arrive while the app is backgrounded; pushes only bump the
  // springboard badge, so refetch the inbox and count on focus / foreground
  // when the cached copies are old enough to have missed one.
  useRefetchWhenStale(api.notifications.list, listArgs, {
    maxAgeMs: INBOX_STALE_AFTER_MS,
    paginated: true,
  });
  useRefetchWhenStale(api.notifications.getUnreadCount, undefined, {
    maxAgeMs: INBOX_STALE_AFTER_MS,
  });

  // Every loaded page is a live view of the paginated cache, so a row's
  // unread state is the cache's `readAt` — read/unread are plain optimistic
  // patches (rolled back on failure) across every filter's cached copy, and
  // the bell badge rides along.
  const markRead = useMutation(api.notifications.markRead).withOptimisticUpdate(
    (localStore, args) => {
      const ids = new Set<string>(args.notificationIds ?? [args.notificationId].filter(Boolean));
      patchReadState(localStore, ids, Date.now());
    },
  );
  const markUnread = useMutation(api.notifications.markUnread).withOptimisticUpdate(
    (localStore, args) => {
      patchReadState(localStore, new Set<string>(args.notificationIds), null);
    },
  );
  const markAllRead = useMutation(api.notifications.markAllRead).withOptimisticUpdate(
    (localStore) => {
      const readAt = Date.now();
      localStore.setPaginatedQuery(api.notifications.list, {}, (current) => {
        if (!current) return current;
        const rows = ((current.results ?? current.page ?? []) as NotificationItem[]).map(
          (row) => (row.readAt ? row : { ...row, readAt }),
        );
        return { ...current, results: rows, page: rows };
      });
      localStore.setQuery(api.notifications.getUnreadCount, undefined, 0);
    },
  );
  const removeNotifications = useMutation(api.notifications.remove);
  const muteShow = useMutation(api.notifications.muteShow);

  // Latest mutations behind stable refs so the row callbacks (and every
  // row's memo compare) keep one identity for the life of the screen.
  const mutationsRef = useRef({ markRead, markUnread, removeNotifications, muteShow });
  mutationsRef.current = { markRead, markUnread, removeNotifications, muteShow };
  // Ids with a mark-read call in flight: a second tap before the cache patch
  // repaints must not fire the mutation again.
  const pendingReadIdsRef = useRef(new Set<string>());

  const markGroupRead = useCallback((group: NotificationItem[]) => {
    const ids = group
      .filter((item) => !item.readAt && !pendingReadIdsRef.current.has(item._id))
      .map((item) => item._id);
    if (ids.length === 0) return;
    for (const id of ids) pendingReadIdsRef.current.add(id);
    void mutationsRef.current
      .markRead({ notificationIds: ids })
      .then(() => syncAppBadgeCount())
      .catch(() => undefined)
      .finally(() => {
        for (const id of ids) pendingReadIdsRef.current.delete(id);
      });
  }, []);

  const toggleGroupRead = useCallback(
    (group: NotificationItem[], unread: boolean) => {
      Haptics.selectionAsync();
      if (unread) {
        markGroupRead(group);
        return;
      }
      void mutationsRef.current
        .markUnread({ notificationIds: group.map((item) => item._id) })
        .then(() => syncAppBadgeCount())
        .catch(() => undefined);
    },
    [markGroupRead],
  );

  const openNotification = useCallback(
    (item: NotificationItem, group: NotificationItem[]) => {
      markGroupRead(group);
      const href = notificationHref(item);
      if (href) {
        guardedPush(href);
      }
    },
    [markGroupRead],
  );

  // Delete hides rows immediately and commits after the undo window (or on
  // leaving the screen), so Undo never needs a server round trip.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [undoBatch, setUndoBatch] = useState<{ ids: string[]; unreadIds: string[]; rows: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeleteRef = useRef<{ ids: string[]; unreadIds: string[]; rows: number } | null>(null);

  const commitPendingDelete = useCallback(() => {
    const batch = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (!batch || batch.ids.length === 0) return;
    // Rows stay filtered out via hiddenIds; the cached pages are left alone
    // so offset cursors for later pages don't shift under loadMore.
    if (batch.unreadIds.length > 0) {
      queryClient.setQueryData(
        ["plotlist-rpc", "query", "notifications:getUnreadCount", undefined],
        (count: unknown) =>
          typeof count === "number" ? Math.max(0, count - batch.unreadIds.length) : count,
      );
    }
    void mutationsRef.current
      .removeNotifications({ notificationIds: batch.ids })
      .then(() => syncAppBadgeCount())
      .catch(() => {
        // Put the rows back: the delete didn't land.
        setHiddenIds((current) => {
          const next = new Set(current);
          for (const id of batch.ids) next.delete(id);
          return next;
        });
        void queryClient.invalidateQueries({
          queryKey: ["plotlist-rpc", "paginated", "notifications:list"],
        });
      });
    setUndoBatch(null);
  }, []);

  const deleteGroup = useCallback(
    (group: NotificationItem[]) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const ids = group.map((item) => item._id);
      const unreadIds = group.filter((item) => !item.readAt).map((item) => item._id);
      const merged = pendingDeleteRef.current
        ? {
            ids: [...pendingDeleteRef.current.ids, ...ids],
            unreadIds: [...pendingDeleteRef.current.unreadIds, ...unreadIds],
            rows: pendingDeleteRef.current.rows + 1,
          }
        : { ids, unreadIds, rows: 1 };
      pendingDeleteRef.current = merged;
      setUndoBatch(merged);
      setHiddenIds((current) => new Set([...current, ...ids]));
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(commitPendingDelete, UNDO_WINDOW_MS);
    },
    [commitPendingDelete],
  );

  const undoDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const batch = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (batch) {
      setHiddenIds((current) => {
        const next = new Set(current);
        for (const id of batch.ids) next.delete(id);
        return next;
      });
    }
    setUndoBatch(null);
  }, []);

  // Leaving the screen inside the undo window still deletes.
  const commitRef = useRef(commitPendingDelete);
  commitRef.current = commitPendingDelete;
  useEffect(() => () => commitRef.current(), []);

  const isProRef = useRef(proStatus.isPro);
  isProRef.current = proStatus.isPro;
  const muteGroupShow = useCallback(async (item: NotificationItem) => {
    const showId = item.show?._id;
    if (!showId) return;
    // Contextual paywall, same as the bell on the show page.
    if (!isProRef.current) {
      const outcome = await presentProPaywall();
      if (outcome !== "purchased" && outcome !== "restored") return;
    }
    try {
      await mutationsRef.current.muteShow({ showId });
      notify(
        "Show muted",
        `${item.show?.title ?? "This show"} won't send episode, premiere, or streaming alerts.`,
      );
    } catch (error) {
      notifyError("Could not mute", String((error as Error)?.message ?? error));
    }
  }, []);

  const openSettings = useCallback(() => {
    guardedPush("/settings");
  }, []);

  const handleMarkAllRead = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void markAllRead({})
      .then(() => syncAppBadgeCount())
      .catch(() => undefined);
  }, [markAllRead]);

  const showRequestsEntry = (requestCount ?? 0) > 0 && filter !== "shows";

  const entries = useMemo<NotificationFeedEntry[]>(() => {
    const visible = ((items ?? []) as NotificationItem[]).filter(
      (item) =>
        !hiddenIds.has(item._id) &&
        // Pending requests are summarized by the entry row up top.
        !(showRequestsEntry && item.type === "follow_request"),
    );
    return notificationSections(visible).map((entry) =>
      entry.kind === "row"
        ? { ...entry, unread: entry.group.some((member) => !member.readAt) }
        : entry,
    );
  }, [hiddenIds, items, showRequestsEntry]);

  const renderItem = useCallback(
    ({ item: entry }: { item: NotificationFeedEntry }) =>
      entry.kind === "header" ? (
        <SectionHeader title={entry.title} />
      ) : (
        <NotificationRow
          item={entry.item}
          group={entry.group}
          unread={entry.unread}
          onOpen={openNotification}
          onMarkRead={markGroupRead}
          onToggleRead={toggleGroupRead}
          onDelete={deleteGroup}
          onMuteShow={muteGroupShow}
          onOpenSettings={openSettings}
        />
      ),
    [deleteGroup, markGroupRead, muteGroupShow, openNotification, openSettings, toggleGroupRead],
  );

  const listContentStyle = useMemo(() => ({ paddingBottom: 96, paddingTop: 4 }), []);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      // Only what this screen reads — a blanket ["plotlist-rpc"] invalidation
      // used to refetch every mounted query in the app on a pull.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["plotlist-rpc", "query", "notifications:getUnreadCount"],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: ["plotlist-rpc", "query", "followRequests:getIncomingCount"],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: ["plotlist-rpc", "paginated", "notifications:list"],
          refetchType: "active",
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const unread = unreadCount ?? 0;
  const requestsEntry = showRequestsEntry ? (
    <FollowRequestsEntry count={requestCount ?? 0} preview={requestPreview?.page?.[0] ?? null} />
  ) : null;

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
            <Text className="mt-0.5 text-[13px] text-text-tertiary" accessibilityLiveRegion="polite">
              {unreadCount === undefined
                ? " "
                : unread > 0
                  ? `${unread > 99 ? "99+" : unread} unread`
                  : "You're all caught up"}
            </Text>
          </View>
          {unread > 0 ? (
            <Pressable
              onPress={handleMarkAllRead}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
              {...(Platform.OS === "web" ? { title: "Mark all as read" } : null)}
              className="h-9 w-9 items-center justify-center rounded-full border border-dark-border bg-dark-card active:opacity-80 hover:bg-dark-hover web:transition-colors"
            >
              <Ionicons name="checkmark-done" size={18} color={accent.ramp[400]} />
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
              className="h-9 w-9 items-center justify-center rounded-full border border-dark-border bg-dark-card hover:bg-dark-hover web:transition-colors"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#9BA1B0" />
              ) : (
                <Ionicons name="refresh" size={17} color="#9BA1B0" />
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openSettings();
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            {...(Platform.OS === "web" ? { title: "Notification settings" } : null)}
            className="h-9 w-9 items-center justify-center rounded-full border border-dark-border bg-dark-card active:opacity-80 hover:bg-dark-hover web:transition-colors"
          >
            <Ionicons name="settings-outline" size={17} color="#9BA1B0" />
          </Pressable>
        </View>

        <View className="mt-4">
          <FilterTabs value={filter} onChange={setFilter} />
        </View>

        <View className="mt-2 flex-1">
          {status === "LoadingFirstPage" ? (
            <NotificationSkeletonList />
          ) : entries.length > 0 || requestsEntry ? (
            <FlashList
              data={entries}
              renderItem={renderItem}
              keyExtractor={(entry: NotificationFeedEntry) => entry.key}
              getItemType={(entry: NotificationFeedEntry) => entry.kind}
              estimatedItemSize={72}
              contentContainerStyle={listContentStyle}
              ListHeaderComponent={requestsEntry}
              ListFooterComponent={
                status === "LoadingMore" ? (
                  <View className="py-6">
                    <ActivityIndicator size="small" color="#5A6070" />
                  </View>
                ) : status === "Exhausted" && entries.length > 0 ? (
                  <CaughtUpFooter />
                ) : null
              }
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
            <InboxEmptyState filter={filter} />
          )}
        </View>
        {undoBatch ? <UndoBar count={undoBatch.rows} onUndo={undoDelete} /> : null}
      </View>
    </Screen>
  );
}
