import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { EmptyState } from "../../components/EmptyState";
import { FlashList } from "../../components/FlashList";
import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { Poster } from "../../components/Poster";
import { Screen } from "../../components/Screen";
import { SegmentedControl } from "../../components/SegmentedControl";
import {
  computeLogSummary,
  getItemSignal,
  getItemSubtitle,
  getItemText,
  getShowTitle,
  organizeLogTimeline,
  type LogActivityItem,
  type LogClusterRow,
  type LogFilterValue,
  type LogItemRow,
  type LogSortValue,
  type LogSummary,
  type LogTimelineRow,
} from "../../lib/logActivity";
import { formatRelativeTime, formatShortDate, formatTime } from "../../lib/format";
import { api } from "../../lib/plotlist/api";
import { useAuth, useMutation, useQuery } from "../../lib/plotlist/react";
import type { Id } from "../../lib/plotlist/types";

const FILTER_OPTIONS: { value: LogFilterValue; label: string }[] = [
  { value: "highlights", label: "Highlights" },
  { value: "journal", label: "Journal" },
  { value: "reviews", label: "Reviews" },
  { value: "all", label: "All" },
];

const SORT_OPTIONS: {
  value: LogSortValue;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: "recent", label: "Newest first", icon: "time-outline" },
  { value: "oldest", label: "Oldest first", icon: "hourglass-outline" },
  { value: "title", label: "Title", icon: "text-outline" },
  { value: "rating", label: "Rating", icon: "star-outline" },
];

type LogListEntry =
  | {
      kind: "section";
      id: string;
      label: string;
      detail: string;
    }
  | {
      kind: "row";
      id: string;
      row: LogTimelineRow;
      isLastInSection: boolean;
    };

export type LogSurfaceProps = {
  items: LogActivityItem[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  onDeleteLog?: (logId: Id<"watchLogs">, title: string) => void;
  onDeleteReview?: (reviewId: Id<"reviews">, title: string) => void;
  now?: number;
};

function triggerLightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function triggerMediumHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function formatCompactNumber(value: number) {
  return value.toLocaleString("en-US");
}

function formatRating(value: number | null) {
  if (value === null) return "None";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function getLatestLabel(item: LogActivityItem | null) {
  if (!item) return "Latest moment";
  if (item.type === "review") {
    return getItemText(item) ? "Latest review" : "Latest rating";
  }
  return getItemText(item) ? "Latest note" : "Latest watch";
}

function getSummarySentence(summary: LogSummary) {
  if (summary.totalItems === 0) {
    return "Your viewing journal starts when you mark something watched.";
  }

  const weekTotal = summary.weekEntries + summary.weekReviews;
  const signalTotal = summary.totalNotes + summary.totalReviews;
  return `${formatCompactNumber(weekTotal)} this week - ${formatCompactNumber(signalTotal)} notes and reviews`;
}

function getFilterEmptyCopy(filter: LogFilterValue) {
  if (filter === "highlights") {
    return {
      title: "No highlights yet",
      description: "Notes, reviews, high ratings, and compact episode runs will appear here.",
    };
  }
  if (filter === "reviews") {
    return {
      title: "No reviews yet",
      description: "Reviews and ratings get their own quiet lane once you publish them.",
    };
  }
  if (filter === "journal") {
    return {
      title: "No watch entries yet",
      description: "Watched episodes and notes will build this journal view.",
    };
  }
  return {
    title: "Nothing matches",
    description: "Try a different mode or sort.",
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View className="flex-row items-center gap-0.5">
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < Math.round(rating);
        return (
          <Ionicons
            key={index}
            name={filled ? "star" : "star-outline"}
            size={12}
            color={filled ? "#F59E0B" : "#4B5563"}
          />
        );
      })}
    </View>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  tone,
  showDivider,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
  showDivider?: boolean;
}) {
  return (
    <View
      className="flex-1 px-3 py-3"
      style={showDivider ? styles.metricDivider : undefined}
    >
      <Text className="text-[21px] font-bold text-text-primary" style={{ color: tone }}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[12px] font-semibold text-text-secondary">
        {label}
      </Text>
      <Text className="mt-1 text-[11px] text-text-tertiary" numberOfLines={1}>
        {detail}
      </Text>
    </View>
  );
}

function TypeBadge({
  label,
  icon,
  color,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={12} color={color} />
      <Text className="text-[11px] font-semibold text-text-tertiary" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function LatestMoment({
  item,
}: {
  item: LogActivityItem | null;
}) {
  if (!item) {
    return (
      <View className="mt-3 rounded-lg border border-dashed border-dark-border px-4 py-5">
        <Text className="text-sm font-semibold text-text-primary">Nothing logged yet</Text>
        <Text className="mt-1 text-sm leading-5 text-text-tertiary">
          Watch entries, notes, and reviews will collect into this page.
        </Text>
      </View>
    );
  }

  const title = getShowTitle(item);
  const subtitle = getItemSubtitle(item);
  const text = getItemText(item);
  const isReview = item.type === "review";
  const rating =
    isReview && typeof item.review.rating === "number" ? item.review.rating : null;

  return (
    <Pressable
      onPress={() => {
        triggerLightHaptic();
        if (isReview) {
          router.push(`/review/${item.review._id}`);
          return;
        }
        if (item.show?._id) {
          router.push(`/show/${item.show._id}`);
        }
      }}
      className="mt-3 active:opacity-90"
    >
      <LinearGradient
        colors={["rgba(14,165,233,0.18)", "rgba(255,255,255,0.055)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.latestGradient}
      >
        <View className="flex-row gap-3">
          <Poster uri={item.show?.posterUrl} width={52} />
          <View className="flex-1">
            <View className="flex-row items-center justify-between gap-3">
              <TypeBadge
                label={getLatestLabel(item)}
                icon={isReview ? "star-outline" : text ? "create-outline" : "play-outline"}
                color={isReview ? "#F59E0B" : "#7DD3FC"}
              />
              <Text className="text-[11px] text-text-tertiary">
                {formatRelativeTime(item.timestamp)}
              </Text>
            </View>
            <Text className="mt-2 text-[16px] font-bold text-text-primary" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-0.5 text-[12px] font-semibold text-brand-300" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            {text ? (
              <Text className="mt-2 text-[13px] leading-5 text-text-secondary" numberOfLines={2}>
                {text}
              </Text>
            ) : rating !== null ? (
              <View className="mt-2 flex-row items-center gap-2">
                <StarRating rating={rating} />
                <Text className="text-[12px] font-semibold text-text-secondary">
                  {formatRating(rating)}
                </Text>
              </View>
            ) : (
              <Text className="mt-2 text-[13px] text-text-secondary">
                {formatShortDate(item.timestamp)} at {formatTime(item.timestamp)}
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function LogHeader({
  filter,
  summary,
  onChangeFilter,
  onOpenSort,
}: {
  filter: LogFilterValue;
  summary: LogSummary;
  onChangeFilter: (value: LogFilterValue) => void;
  onOpenSort: () => void;
}) {
  return (
    <View className="px-6 pb-4 pt-5">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[34px] font-bold text-text-primary">Log</Text>
          <Text className="mt-1 text-[14px] leading-5 text-text-tertiary">
            {getSummarySentence(summary)}
          </Text>
        </View>
        <GlassPressable
          accessibilityLabel="Sort log"
          onPress={() => {
            triggerLightHaptic();
            onOpenSort();
          }}
          radius={8}
          variant="control"
          fallbackColor="rgba(255,255,255,0.07)"
          contentStyle={styles.iconButtonContent}
        >
          <Ionicons name="options-outline" size={19} color="#D6DAE6" />
        </GlassPressable>
      </View>

      <GlassSurface
        radius={8}
        variant="surface"
        fallbackColor="rgba(17,21,29,0.84)"
        style={[styles.summaryPanel, styles.summaryPanelBorder]}
      >
        <View className="flex-row">
          <SummaryMetric
            label="Entries"
            value={formatCompactNumber(summary.weekEntries)}
            detail="This week"
            tone="#7DD3FC"
            showDivider
          />
          <SummaryMetric
            label="Reviews"
            value={formatCompactNumber(summary.weekReviews)}
            detail={`${formatCompactNumber(summary.totalReviews)} total`}
            tone="#F59E0B"
            showDivider
          />
          <SummaryMetric
            label="Notes"
            value={formatCompactNumber(summary.weekNotes)}
            detail={`${formatCompactNumber(summary.totalNotes)} saved`}
            tone="#D6DAE6"
          />
        </View>
        <View className="border-t border-dark-border/70 px-3 pb-3 pt-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-[12px] font-semibold text-text-secondary">
              {formatCompactNumber(summary.uniqueShows)} shows in the archive
            </Text>
            <Text className="text-[12px] text-text-tertiary">
              Avg {formatRating(summary.averageRating)}
            </Text>
          </View>
          <LatestMoment item={summary.latestMeaningfulItem} />
        </View>
      </GlassSurface>

      <View className="mt-4 flex-row items-center gap-2">
        <View className="flex-1">
          <SegmentedControl
            options={FILTER_OPTIONS}
            value={filter}
            onChange={(value) => onChangeFilter(value as LogFilterValue)}
          />
        </View>
      </View>
    </View>
  );
}

function SectionHeader({ label, detail }: { label: string; detail: string }) {
  return (
    <View className="mb-1 mt-4 flex-row items-center justify-between px-6">
      <Text className="text-[15px] font-bold text-text-primary">{label}</Text>
      <Text className="text-[12px] font-medium text-text-tertiary">{detail}</Text>
    </View>
  );
}

function RowShell({
  children,
  isLast,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
      children: ReactNode;
  isLast: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      className="active:opacity-85"
    >
      <View
        className="flex-row gap-3 py-3"
        style={isLast ? undefined : styles.rowDivider}
      >
        {children}
      </View>
    </Pressable>
  );
}

function ActivityRow({
  row,
  isLast,
  onDeleteLog,
  onDeleteReview,
}: {
  row: LogItemRow;
  isLast: boolean;
  onDeleteLog?: (logId: Id<"watchLogs">, title: string) => void;
  onDeleteReview?: (reviewId: Id<"reviews">, title: string) => void;
}) {
  const item = row.item;
  const title = getShowTitle(item);
  const subtitle = getItemSubtitle(item);
  const text = getItemText(item);
  const isReview = item.type === "review";
  const rating =
    isReview && typeof item.review.rating === "number" ? item.review.rating : null;
  const signal = getItemSignal(item);
  const signalColor = isReview ? "#F59E0B" : text ? "#7DD3FC" : "#9BA1B0";

  return (
    <RowShell
      isLast={isLast}
      accessibilityLabel={`${signal} for ${title}`}
      onPress={() => {
        triggerLightHaptic();
        if (isReview) {
          router.push(`/review/${item.review._id}`);
          return;
        }
        if (item.show?._id) {
          router.push(`/show/${item.show._id}`);
        }
      }}
      onLongPress={() => {
        triggerMediumHaptic();
        if (isReview) {
          onDeleteReview?.(item.review._id, title);
          return;
        }
        onDeleteLog?.(item.log._id, title);
      }}
    >
      <Poster uri={item.show?.posterUrl} width={40} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-3">
          <TypeBadge
            label={signal}
            icon={isReview ? "star-outline" : text ? "create-outline" : "play-outline"}
            color={signalColor}
          />
          <Text className="text-[11px] text-text-tertiary">
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
        <Text className="mt-1.5 text-[15px] font-semibold text-text-primary" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-[12px] font-semibold text-brand-300" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {text ? (
          <Text className="mt-1.5 text-[13px] leading-5 text-text-secondary" numberOfLines={2}>
            {text}
          </Text>
        ) : null}
        {rating !== null ? (
          <View className="mt-2 flex-row items-center gap-2">
            <StarRating rating={rating} />
            <Text className="text-[12px] font-semibold text-text-tertiary">
              {formatRating(rating)}
            </Text>
          </View>
        ) : null}
        {isReview && item.review.spoiler ? (
          <View className="mt-2 flex-row items-center gap-1.5">
            <Ionicons name="warning-outline" size={12} color="#9BA1B0" />
            <Text className="text-[11px] text-text-tertiary">Contains spoilers</Text>
          </View>
        ) : null}
      </View>
    </RowShell>
  );
}

function ClusterRow({
  row,
  isLast,
}: {
  row: LogClusterRow;
  isLast: boolean;
}) {
  return (
    <RowShell
      isLast={isLast}
      accessibilityLabel={`${row.logs.length} watch entries for ${row.title}`}
      onPress={() => {
        triggerLightHaptic();
        if (row.show?._id) {
          router.push(`/show/${row.show._id}`);
        }
      }}
    >
      <Poster uri={row.show?.posterUrl} width={40} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-3">
          <TypeBadge label="Episode run" icon="albums-outline" color="#7DD3FC" />
          <Text className="text-[11px] text-text-tertiary">
            {formatRelativeTime(row.timestamp)}
          </Text>
        </View>
        <Text className="mt-1.5 text-[15px] font-semibold text-text-primary" numberOfLines={1}>
          {row.title}
        </Text>
        <Text className="mt-0.5 text-[12px] font-semibold text-brand-300" numberOfLines={1}>
          {row.subtitle}
        </Text>
        <Text className="mt-1.5 text-[13px] leading-5 text-text-secondary" numberOfLines={1}>
          {row.logs.length} episodes watched in a row
        </Text>
      </View>
      <View className="h-8 min-w-8 items-center justify-center rounded-lg border border-brand-500/30 bg-brand-500/10 px-2">
        <Text className="text-[13px] font-bold text-brand-300">
          {row.logs.length}
        </Text>
      </View>
    </RowShell>
  );
}

const TimelineRow = memo(function TimelineRow({
  row,
  isLast,
  onDeleteLog,
  onDeleteReview,
}: {
  row: LogTimelineRow;
  isLast: boolean;
  onDeleteLog?: (logId: Id<"watchLogs">, title: string) => void;
  onDeleteReview?: (reviewId: Id<"reviews">, title: string) => void;
}) {
  if (row.kind === "cluster") {
    return <ClusterRow row={row} isLast={isLast} />;
  }

  return (
    <ActivityRow
      row={row}
      isLast={isLast}
      onDeleteLog={onDeleteLog}
      onDeleteReview={onDeleteReview}
    />
  );
});

function TimelineFooter({
  hasMore,
  onLoadMore,
}: {
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  if (hasMore && onLoadMore) {
    return (
      <View className="px-6 pb-2 pt-4">
        <GlassPressable
          onPress={() => {
            triggerLightHaptic();
            onLoadMore();
          }}
          radius={8}
          variant="control"
          fallbackColor="rgba(255,255,255,0.07)"
          contentStyle={styles.loadMoreContent}
        >
          <Text className="text-sm font-bold text-text-primary">Load more</Text>
        </GlassPressable>
      </View>
    );
  }

  return (
    <View className="items-center px-6 pb-2 pt-5">
      <View className="mb-2 h-px w-14 bg-dark-border" />
      <Text className="text-[12px] font-semibold text-text-tertiary">Caught up</Text>
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
  const [filter, setFilter] = useState<LogFilterValue>("highlights");
  const [sort, setSort] = useState<LogSortValue>("recent");
  const [sortSheetVisible, setSortSheetVisible] = useState(false);

  const summary = useMemo(() => computeLogSummary(items, now), [items, now]);
  const sections = useMemo(
    () => organizeLogTimeline({ items, filter, sort, now }),
    [filter, items, now, sort],
  );
  const entries = useMemo<LogListEntry[]>(
    () =>
      sections.flatMap((section) => [
        { kind: "section" as const, id: section.id, label: section.label, detail: section.detail },
        ...section.rows.map((row, index) => ({
          kind: "row" as const,
          id: row.id,
          row,
          isLastInSection: index === section.rows.length - 1,
        })),
      ]),
    [sections],
  );
  const sortSheetOptions = useMemo<ActionSheetOption[]>(
    () =>
      SORT_OPTIONS.map((option) => ({
        label: option.value === sort ? `${option.label} (selected)` : option.label,
        icon: option.icon,
        onPress: () => setSort(option.value),
      })),
    [sort],
  );
  const header = useMemo(
    () => (
        <LogHeader
          filter={filter}
          summary={summary}
          onChangeFilter={setFilter}
          onOpenSort={() => setSortSheetVisible(true)}
        />
      ),
    [filter, summary],
  );

  const renderEntry = useCallback(
    ({ item }: { item: LogListEntry }) => {
      if (item.kind === "section") {
        return <SectionHeader label={item.label} detail={item.detail} />;
      }

      return (
        <View className="px-6">
          <TimelineRow
            row={item.row}
            isLast={item.isLastInSection}
            onDeleteLog={onDeleteLog}
            onDeleteReview={onDeleteReview}
          />
        </View>
      );
    },
    [onDeleteLog, onDeleteReview],
  );

  if (items.length === 0) {
    return (
      <View className="flex-1 px-6 pt-5">
        <Text className="text-[34px] font-bold text-text-primary">Log</Text>
        <Text className="mt-1 text-[14px] leading-5 text-text-tertiary">
          Your viewing journal starts when you mark something watched.
        </Text>
        <View className="mt-6">
          <EmptyState
            title="No activity yet"
            description="Watch entries, notes, and reviews will collect here once you start tracking."
          />
        </View>
      </View>
    );
  }

  const emptyCopy = getFilterEmptyCopy(filter);

  return (
    <View className="flex-1">
      <FlashList<LogListEntry>
        data={entries}
        renderItem={renderEntry}
        keyExtractor={(item: LogListEntry) => item.id}
        estimatedItemSize={96}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
        getItemType={(item: LogListEntry) => item.kind}
        ListEmptyComponent={
          <View className="px-6 pt-4">
            <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
          </View>
        }
        ListFooterComponent={
          entries.length > 0 ? (
            <TimelineFooter hasMore={hasMore} onLoadMore={onLoadMore} />
          ) : null
        }
      />

      <ActionSheet
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        title="Sort log"
        options={sortSheetOptions}
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
        items: current.items.filter((item: LogActivityItem) => item.id !== args.logId),
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
        items: current.items.filter((item: LogActivityItem) => item.id !== args.reviewId),
      });
    },
  );

  const handleDeleteLog = useCallback(
    (logId: Id<"watchLogs">, title: string) => {
      Alert.alert(
        "Delete entry",
        `Remove your watch entry for "${title}"?`,
        [
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
        ],
      );
    },
    [deleteLog],
  );

  const handleDeleteReview = useCallback(
    (reviewId: Id<"reviews">, title: string) => {
      Alert.alert(
        "Delete review",
        `Remove your review for "${title}"?`,
        [
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
        ],
      );
    },
    [deleteReview],
  );

  if (!isAuthenticated || me === undefined || activity === undefined) {
    return (
      <Screen hasTabBar>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38BDF8" size="large" />
        </View>
      </Screen>
    );
  }

  const items: LogActivityItem[] = (activity.items as LogActivityItem[] | undefined) ?? [];

  return (
    <Screen hasTabBar>
      <LogSurface
        items={items}
        hasMore={Boolean(activity.hasMore)}
        onLoadMore={() => setLimit((current) => Math.min(current + 40, 160))}
        onDeleteLog={handleDeleteLog}
        onDeleteReview={handleDeleteReview}
      />
    </Screen>
  );
}

const webShadow =
  Platform.OS === "web"
    ? ({
        boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
      } as ViewStyle)
    : {
        elevation: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.28,
        shadowRadius: 28,
      };

const styles = StyleSheet.create({
  iconButtonContent: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  latestGradient: {
    borderColor: "rgba(125,211,252,0.18)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    padding: 12,
  },
  loadMoreContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  metricDivider: {
    borderRightColor: "rgba(255,255,255,0.08)",
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  rowDivider: {
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryPanel: {
    marginTop: 18,
  },
  summaryPanelBorder: {
    ...webShadow,
  },
});
