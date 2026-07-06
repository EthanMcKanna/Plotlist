import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { guardedPush } from "../../lib/navigation";
import { useScrollToTopOnTabPress } from "../../lib/useScrollToTopOnTabPress";

import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { EmptyState } from "../../components/EmptyState";
import { FlashList } from "../../components/FlashList";
import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { Poster } from "../../components/Poster";
import { Screen } from "../../components/Screen";
import { SegmentedControl } from "../../components/SegmentedControl";
import {
  buildDiaryFeed,
  computeDiaryPulse,
  getDiaryEmptyCopy,
  getDiaryEpisodeLabel,
  getDiaryHeadline,
  getDiaryItemRating,
  getDiaryItemText,
  getDiaryItemTitle,
  type DiaryBingeRow,
  type DiaryDayActivity,
  type DiaryDayLabel,
  type DiaryEntryRow,
  type DiaryFilter,
  type DiaryItem,
  type DiaryMonthRow,
  type DiaryRow,
} from "../../lib/logDiary";
import { formatTime } from "../../lib/format";
import { api } from "../../lib/plotlist/api";
import { useAuth, useMutation, useQuery } from "../../lib/plotlist/react";
import type { Id } from "../../lib/plotlist/types";

const FILTER_OPTIONS: { value: DiaryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "episodes", label: "Episodes" },
  { value: "reviews", label: "Reviews" },
  { value: "notes", label: "Notes" },
];

const DAY_RAIL_WIDTH = 44;
const PAGE_SIZE = 40;
const MAX_LIMIT = 160;

type DiaryAction =
  | { type: "log"; logId: Id<"watchLogs">; showId: string | null; title: string }
  | { type: "review"; reviewId: Id<"reviews">; showId: string | null; title: string };

export type LogSurfaceProps = {
  items: DiaryItem[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  onDeleteLog?: (logId: Id<"watchLogs">, title: string) => void;
  onDeleteReview?: (reviewId: Id<"reviews">, title: string) => void;
  now?: number;
};

function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function mediumHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function openDiaryItem(item: DiaryItem) {
  lightHaptic();
  if (item.type === "review") {
    router.push(`/review/${item.review._id}`);
    return;
  }
  if (item.show?._id) {
    guardedPush(`/show/${item.show._id}`);
  }
}

// Seven slim bars for the trailing week; today reads brand-blue so the
// header carries a pulse without becoming a stats dashboard.
function WeekSparkline({ days }: { days: DiaryDayActivity[] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const active = days.filter((day) => day.count > 0).length;
  return (
    <View
      accessibilityLabel={`Activity on ${active} of the last 7 days`}
      style={styles.sparkline}
    >
      {days.map((day) => {
        const height = day.count === 0 ? 4 : 7 + Math.round((day.count / max) * 17);
        return (
          <View
            key={day.key}
            style={[
              styles.sparklineBar,
              {
                height,
                backgroundColor: day.isToday
                  ? "#38BDF8"
                  : day.count > 0
                    ? "rgba(125,211,252,0.42)"
                    : "rgba(255,255,255,0.12)",
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <View className="flex-row items-center" style={styles.starRow}>
      {Array.from({ length: 5 }, (_, index) => {
        const name =
          rating >= index + 1 ? "star" : rating >= index + 0.5 ? "star-half" : "star-outline";
        return (
          <Ionicons
            key={index}
            name={name}
            size={size}
            color={name === "star-outline" ? "#4B5563" : "#F59E0B"}
          />
        );
      })}
    </View>
  );
}

// Letterboxd-style date spine: the first row of each day carries the day
// number, every following row leaves the rail empty so the eye can scan
// dates down the left edge.
function DayRail({ label }: { label: DiaryDayLabel | null }) {
  return (
    <View style={styles.dayRail}>
      {label ? (
        <>
          <Text
            className="text-[17px] font-bold"
            style={{ color: label.isToday ? "#38BDF8" : "#F1F3F7" }}
          >
            {label.day}
          </Text>
          <Text className="text-[10px] font-semibold tracking-widest text-text-tertiary">
            {label.weekday}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function MonthHeader({ row }: { row: DiaryMonthRow }) {
  return (
    <View className="mb-1 mt-6 px-6">
      <View className="flex-row items-baseline justify-between border-b border-dark-border/70 pb-2">
        <Text className="text-[13px] font-bold uppercase tracking-[2px] text-text-secondary">
          {row.label}
        </Text>
        <Text className="text-[12px] font-medium text-text-tertiary">
          {row.entryCount} {row.entryCount === 1 ? "entry" : "entries"}
        </Text>
      </View>
    </View>
  );
}

function RowShell({
  dayLabel,
  isLastOfDay,
  onPress,
  onLongPress,
  accessibilityLabel,
  children,
}: {
  dayLabel: DiaryDayLabel | null;
  isLastOfDay: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      className="active:opacity-85"
    >
      <View className="flex-row px-6">
        <DayRail label={dayLabel} />
        <View
          className="flex-1 flex-row gap-3 py-3"
          style={isLastOfDay ? undefined : styles.rowDivider}
        >
          {children}
        </View>
      </View>
    </Pressable>
  );
}

const EntryRow = memo(function EntryRow({
  row,
  onAction,
}: {
  row: DiaryEntryRow;
  onAction: (action: DiaryAction) => void;
}) {
  const item = row.item;
  const title = getDiaryItemTitle(item);
  const episodeLabel = getDiaryEpisodeLabel(item);
  const text = getDiaryItemText(item);
  const rating = getDiaryItemRating(item);
  const isReview = item.type === "review";

  return (
    <RowShell
      dayLabel={row.dayLabel}
      isLastOfDay={row.isLastOfDay}
      accessibilityLabel={`${isReview ? "Review" : "Watch entry"} for ${title}`}
      onPress={() => openDiaryItem(item)}
      onLongPress={() => {
        mediumHaptic();
        onAction(
          isReview
            ? { type: "review", reviewId: item.review._id, showId: item.show?._id ?? null, title }
            : { type: "log", logId: item.log._id, showId: item.show?._id ?? null, title },
        );
      }}
    >
      <Poster uri={item.show?.posterUrl} width={42} />
      <View className="min-w-0 flex-1 justify-center">
        <View className="flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-[15px] font-semibold text-text-primary"
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text className="text-[11px] font-medium text-text-tertiary">
            {formatTime(item.timestamp)}
          </Text>
        </View>

        {isReview ? (
          <View className="mt-1 flex-row items-center gap-2">
            {rating !== null ? <Stars rating={rating} /> : null}
            {episodeLabel ? (
              <Text className="flex-1 text-[12px] font-semibold text-brand-300" numberOfLines={1}>
                {episodeLabel}
              </Text>
            ) : rating === null ? (
              <Text className="text-[12px] font-semibold text-accent">Review</Text>
            ) : null}
          </View>
        ) : (
          <Text className="mt-1 text-[12px] font-semibold text-brand-300" numberOfLines={1}>
            {episodeLabel ?? "Marked watched"}
          </Text>
        )}

        {text ? (
          <Text className="mt-1.5 text-[13px] leading-5 text-text-secondary" numberOfLines={3}>
            {text}
          </Text>
        ) : null}

        {isReview && item.review.spoiler ? (
          <View className="mt-1.5 flex-row items-center gap-1">
            <Ionicons name="eye-off-outline" size={11} color="#5A6070" />
            <Text className="text-[11px] font-medium text-text-tertiary">Spoilers</Text>
          </View>
        ) : null}
      </View>
    </RowShell>
  );
});

const BingeRow = memo(function BingeRow({ row }: { row: DiaryBingeRow }) {
  return (
    <RowShell
      dayLabel={row.dayLabel}
      isLastOfDay={row.isLastOfDay}
      accessibilityLabel={`${row.logs.length} episodes of ${row.title}`}
      onPress={() => {
        lightHaptic();
        if (row.show?._id) {
          guardedPush(`/show/${row.show._id}`);
        }
      }}
    >
      <Poster uri={row.show?.posterUrl} width={42} />
      <View className="min-w-0 flex-1 justify-center">
        <View className="flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-[15px] font-semibold text-text-primary"
            numberOfLines={1}
          >
            {row.title}
          </Text>
          <Text className="text-[11px] font-medium text-text-tertiary">
            {formatTime(row.timestamp)}
          </Text>
        </View>
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="text-[12px] font-semibold text-brand-300" numberOfLines={1}>
            {row.episodeRange ?? `${row.logs.length} entries`}
          </Text>
          <View className="rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5">
            <Text className="text-[10px] font-bold text-brand-300">
              {row.logs.length} eps
            </Text>
          </View>
        </View>
      </View>
    </RowShell>
  );
});

function DiaryHeader({
  filter,
  headline,
  days,
  onChangeFilter,
}: {
  filter: DiaryFilter;
  headline: string;
  days: DiaryDayActivity[];
  onChangeFilter: (value: DiaryFilter) => void;
}) {
  return (
    <View className="px-6 pb-2 pt-5">
      <View className="flex-row items-end justify-between">
        <Text className="text-[34px] font-bold text-text-primary">Log</Text>
        <View className="pb-2">
          <WeekSparkline days={days} />
        </View>
      </View>
      <Text className="mt-1 text-[14px] leading-5 text-text-tertiary">{headline}</Text>
      <View className="mt-4">
        <SegmentedControl
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(value) => onChangeFilter(value as DiaryFilter)}
        />
      </View>
    </View>
  );
}

function DiaryFooter({ hasMore }: { hasMore?: boolean }) {
  if (hasMore) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator color="#38BDF8" />
      </View>
    );
  }
  return (
    <View className="items-center pb-2 pt-6">
      <View className="mb-2 h-px w-12 bg-dark-border" />
      <Text className="text-[12px] font-semibold text-text-tertiary">
        You're all caught up
      </Text>
    </View>
  );
}

function EmptyDiary() {
  return (
    <View className="flex-1 px-6 pt-5">
      <Text className="text-[34px] font-bold text-text-primary">Log</Text>
      <Text className="mt-1 text-[14px] leading-5 text-text-tertiary">
        Everything you watch, remembered in order.
      </Text>
      <GlassSurface
        radius={12}
        variant="surface"
        fallbackColor="rgba(22,26,34,0.72)"
        style={styles.emptyCard}
      >
        <View className="items-center px-6 py-10">
          <View className="h-14 w-14 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/10">
            <Ionicons name="book-outline" size={24} color="#7DD3FC" />
          </View>
          <Text className="mt-4 text-[17px] font-bold text-text-primary">
            Your diary starts here
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
            Mark an episode watched, jot a note, or review a show — every moment lands
            here, day by day.
          </Text>
          <GlassPressable
            accessibilityLabel="Find something to watch"
            onPress={() => {
              lightHaptic();
              router.push("/search");
            }}
            radius={8}
            variant="prominent"
            style={styles.emptyCta}
            contentStyle={styles.emptyCtaContent}
          >
            <Text className="text-[14px] font-bold text-text-primary">
              Find something to watch
            </Text>
          </GlassPressable>
        </View>
      </GlassSurface>
    </View>
  );
}

export function LogSurface({
  items,
  hasMore,
  onLoadMore,
  onDeleteLog,
  onDeleteReview,
  now = Date.now(),
}: LogSurfaceProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<any>(null);
  useScrollToTopOnTabPress(listRef);

  const [filter, setFilter] = useState<DiaryFilter>("all");
  const [pendingAction, setPendingAction] = useState<DiaryAction | null>(null);

  const pulse = useMemo(() => computeDiaryPulse(items, now), [items, now]);
  const rows = useMemo(() => buildDiaryFeed({ items, filter, now }), [filter, items, now]);

  const handleAction = useCallback((action: DiaryAction) => {
    setPendingAction(action);
  }, []);

  const actionOptions = useMemo<ActionSheetOption[]>(() => {
    if (!pendingAction) return [];
    const options: ActionSheetOption[] = [];
    if (pendingAction.showId) {
      const showId = pendingAction.showId;
      options.push({
        label: "Open show",
        icon: "tv-outline",
        onPress: () => guardedPush(`/show/${showId}`),
      });
    }
    if (pendingAction.type === "review") {
      const { reviewId, title } = pendingAction;
      options.push({
        label: "Open review",
        icon: "star-outline",
        onPress: () => router.push(`/review/${reviewId}`),
      });
      options.push({
        label: "Delete review",
        icon: "trash-outline",
        destructive: true,
        onPress: () => onDeleteReview?.(reviewId, title),
      });
    } else {
      const { logId, title } = pendingAction;
      options.push({
        label: "Delete entry",
        icon: "trash-outline",
        destructive: true,
        onPress: () => onDeleteLog?.(logId, title),
      });
    }
    return options;
  }, [onDeleteLog, onDeleteReview, pendingAction]);

  const renderRow = useCallback(
    ({ item }: { item: DiaryRow }) => {
      if (item.kind === "month") {
        return <MonthHeader row={item} />;
      }
      if (item.kind === "binge") {
        return <BingeRow row={item} />;
      }
      return <EntryRow row={item} onAction={handleAction} />;
    },
    [handleAction],
  );

  const handleEndReached = useCallback(() => {
    if (hasMore) {
      onLoadMore?.();
    }
  }, [hasMore, onLoadMore]);

  if (items.length === 0) {
    return <EmptyDiary />;
  }

  const emptyCopy = getDiaryEmptyCopy(filter);

  return (
    <View className="flex-1">
      <FlashList<DiaryRow>
        ref={listRef}
        data={rows}
        renderItem={renderRow}
        keyExtractor={(row: DiaryRow) => row.id}
        getItemType={(row: DiaryRow) => row.kind}
        estimatedItemSize={84}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
        ListHeaderComponent={
          <DiaryHeader
            filter={filter}
            headline={getDiaryHeadline(pulse)}
            days={pulse.days}
            onChangeFilter={setFilter}
          />
        }
        ListEmptyComponent={
          <View className="px-6 pt-4">
            <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
          </View>
        }
        ListFooterComponent={rows.length > 0 ? <DiaryFooter hasMore={hasMore} /> : null}
      />

      <ActionSheet
        visible={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingAction?.title}
        options={actionOptions}
      />
    </View>
  );
}

export default function LogScreen() {
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [limit, setLimit] = useState(60);
  const activity = useQuery(
    api.watchLogs.listActivityForUser,
    me?._id ? { userId: me._id, limit } : "skip",
  );

  const deleteLog = useMutation(api.watchLogs.deleteLog).withOptimisticUpdate(
    (localStore, args) => {
      if (!me?._id) return;
      const queryArgs = { userId: me._id, limit };
      const current = localStore.getQuery(api.watchLogs.listActivityForUser, queryArgs);
      if (!current?.items) return;
      localStore.setQuery(api.watchLogs.listActivityForUser, queryArgs, {
        ...current,
        items: current.items.filter((item: DiaryItem) => item.id !== args.logId),
      });
    },
  );
  const deleteReview = useMutation(api.reviews.deleteReview).withOptimisticUpdate(
    (localStore, args) => {
      if (!me?._id) return;
      const queryArgs = { userId: me._id, limit };
      const current = localStore.getQuery(api.watchLogs.listActivityForUser, queryArgs);
      if (!current?.items) return;
      localStore.setQuery(api.watchLogs.listActivityForUser, queryArgs, {
        ...current,
        items: current.items.filter((item: DiaryItem) => item.id !== args.reviewId),
      });
    },
  );

  const handleDeleteLog = useCallback(
    (logId: Id<"watchLogs">, title: string) => {
      Alert.alert("Delete entry", `Remove your watch entry for "${title}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteLog({ logId }).catch((error) => {
              Alert.alert("Could not delete", String(error));
            });
          },
        },
      ]);
    },
    [deleteLog],
  );

  const handleDeleteReview = useCallback(
    (reviewId: Id<"reviews">, title: string) => {
      Alert.alert("Delete review", `Remove your review for "${title}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteReview({ reviewId }).catch((error) => {
              Alert.alert("Could not delete", String(error));
            });
          },
        },
      ]);
    },
    [deleteReview],
  );

  const handleLoadMore = useCallback(() => {
    setLimit((current) => Math.min(current + PAGE_SIZE, MAX_LIMIT));
  }, []);

  if (!isAuthenticated || me === undefined || activity === undefined) {
    return (
      <Screen hasTabBar>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38BDF8" size="large" />
        </View>
      </Screen>
    );
  }

  const items: DiaryItem[] = (activity.items as DiaryItem[] | undefined) ?? [];

  return (
    <Screen hasTabBar>
      <LogSurface
        items={items}
        hasMore={Boolean(activity.hasMore) && limit < MAX_LIMIT}
        onLoadMore={handleLoadMore}
        onDeleteLog={handleDeleteLog}
        onDeleteReview={handleDeleteReview}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRail: {
    alignItems: "flex-start",
    paddingTop: 14,
    width: DAY_RAIL_WIDTH,
  },
  emptyCard: {
    marginTop: 24,
  },
  emptyCta: {
    marginTop: 20,
  },
  emptyCtaContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomColor: "rgba(255,255,255,0.07)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sparkline: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 3,
    height: 24,
  },
  sparklineBar: {
    borderRadius: 2.5,
    width: 5,
  },
  starRow: {
    gap: 1,
  },
});
