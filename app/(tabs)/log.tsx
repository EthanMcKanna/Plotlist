import {
  memo,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { Poster } from "../../components/Poster";
import { Screen } from "../../components/Screen";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { formatRelativeTime } from "../../lib/format";

type FilterValue = "all" | "entries" | "reviews" | "notes" | "episodes";
type SortValue = "recent" | "oldest" | "title" | "rating";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "entries", label: "Entries" },
  { value: "reviews", label: "Reviews" },
];

const SORT_OPTIONS: { value: SortValue; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "recent", label: "Newest first", icon: "time-outline" },
  { value: "oldest", label: "Oldest first", icon: "hourglass-outline" },
  { value: "title", label: "By title", icon: "text-outline" },
  { value: "rating", label: "Best rated", icon: "star-outline" },
];

type ActivityItem =
  | {
      id: Id<"watchLogs">;
      type: "log";
      timestamp: number;
      show: Doc<"shows"> | null;
      log: Doc<"watchLogs">;
    }
  | {
      id: Id<"reviews">;
      type: "review";
      timestamp: number;
      show: Doc<"shows"> | null;
      review: Doc<"reviews">;
    };

function hasEpisodeMetadata(item: ActivityItem) {
  if (item.type === "log") {
    return (
      item.log.seasonNumber !== undefined && item.log.episodeNumber !== undefined
    );
  }

  return (
    item.review.seasonNumber !== undefined &&
    item.review.episodeNumber !== undefined
  );
}

function hasNote(item: ActivityItem) {
  if (item.type === "log") {
    return Boolean(item.log.note?.trim());
  }

  return Boolean(item.review.reviewText?.trim());
}

function getShowTitle(item: ActivityItem) {
  return item.show?.title ?? "Unknown Show";
}

function matchesFilter(item: ActivityItem, filter: FilterValue) {
  switch (filter) {
    case "entries":
      return item.type === "log";
    case "reviews":
      return item.type === "review";
    case "notes":
      return hasNote(item);
    case "episodes":
      return hasEpisodeMetadata(item);
    case "all":
    default:
      return true;
  }
}

function compareItems(left: ActivityItem, right: ActivityItem, sort: SortValue) {
  if (sort === "oldest") {
    return left.timestamp - right.timestamp;
  }

  if (sort === "title") {
    return getShowTitle(left).localeCompare(getShowTitle(right)) || right.timestamp - left.timestamp;
  }

  if (sort === "rating") {
    const leftRating = left.type === "review" ? left.review.rating : -1;
    const rightRating = right.type === "review" ? right.review.rating : -1;
    return rightRating - leftRating || right.timestamp - left.timestamp;
  }

  return right.timestamp - left.timestamp;
}

function buildEpisodeLabel(
  seasonNumber?: number,
  episodeNumber?: number,
  episodeTitle?: string,
) {
  if (seasonNumber === undefined || episodeNumber === undefined) {
    return null;
  }

  const code = `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
  return episodeTitle ? `${code} · ${episodeTitle}` : code;
}

function getItemSubtitle(item: ActivityItem) {
  if (item.type === "log") {
    return buildEpisodeLabel(
      item.log.seasonNumber,
      item.log.episodeNumber,
      item.log.episodeTitle,
    );
  }

  return buildEpisodeLabel(
    item.review.seasonNumber,
    item.review.episodeNumber,
    item.review.episodeTitle,
  );
}

/* ─── Filter pill ───────────────────────────────────────────────── */

function FilterPill({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="rounded-full px-3.5 py-1.5 active:opacity-80"
      style={{
        backgroundColor: isActive ? "rgba(14, 165, 233, 0.15)" : "rgba(90, 96, 112, 0.1)",
        borderWidth: 1,
        borderColor: isActive ? "rgba(14, 165, 233, 0.3)" : "transparent",
      }}
    >
      <Text
        className="text-[13px] font-semibold"
        style={{ color: isActive ? "#7dd3fc" : "#9BA1B0" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ─── Activity card ─────────────────────────────────────────────── */

const LogActivityCard = memo(function LogActivityCard({
  item,
  onDeleteLog,
  onDeleteReview,
}: {
  item: ActivityItem;
  onDeleteLog: (logId: Id<"watchLogs">, title: string) => void;
  onDeleteReview: (reviewId: Id<"reviews">, title: string) => void;
}) {
  const title = getShowTitle(item);
  const subtitle = getItemSubtitle(item);
  const note = item.type === "log" ? item.log.note : item.review.reviewText;
  const isReview = item.type === "review";

  return (
    <Pressable
      className="mb-3 flex-row gap-3.5 rounded-2xl border border-dark-border bg-dark-card p-3 active:bg-dark-hover"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (isReview) {
          router.push(`/review/${item.review._id}`);
          return;
        }
        if (item.show?._id) {
          router.push(`/show/${item.show._id}`);
        }
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isReview) {
          onDeleteReview(item.review._id, title);
          return;
        }
        onDeleteLog(item.log._id, title);
      }}
    >
      <Poster uri={item.show?.posterUrl} size="sm" />

      <View className="flex-1">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text
              className="text-[15px] font-semibold text-text-primary"
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                className="mt-0.5 text-xs text-brand-400"
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <Text className="text-[11px] text-text-tertiary">
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>

        {isReview && (
          <View className="mt-1.5 flex-row items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Ionicons
                key={i}
                name={i < Math.round(item.review.rating) ? "star" : "star-outline"}
                size={12}
                color={i < Math.round(item.review.rating) ? "#fbbf24" : "#4b5563"}
              />
            ))}
          </View>
        )}

        {note ? (
          <Text className="mt-2 text-sm leading-5 text-text-secondary" numberOfLines={3}>
            {note}
          </Text>
        ) : null}

        {isReview && item.review.spoiler ? (
          <View className="mt-2 flex-row items-center gap-1">
            <Ionicons name="warning-outline" size={11} color="#9BA1B0" />
            <Text className="text-[11px] text-text-tertiary">
              Contains spoilers
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

/* ─── Main screen ───────────────────────────────────────────────── */

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortValue>("recent");
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [limit, setLimit] = useState(60);

  const activity = useQuery(
    api.watchLogs.listActivityForUser,
    me?._id ? { userId: me._id, limit } : "skip",
  );

  const deleteLog = useMutation(api.watchLogs.deleteLog);
  const deleteReview = useMutation(api.reviews.deleteReview);

  const items: ActivityItem[] = (activity?.items as ActivityItem[] | undefined) ?? [];

  const filteredItems = useMemo(() => {
    const matching = items.filter((item: ActivityItem) => matchesFilter(item, filter));
    return [...matching].sort((left, right) => compareItems(left, right, sort));
  }, [filter, items, sort]);

  const currentSort = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];

  const sortSheetOptions = useMemo<ActionSheetOption[]>(
    () =>
      SORT_OPTIONS.map((option) => ({
        label: option.value === sort ? `${option.label} ✓` : option.label,
        icon: option.icon,
        onPress: () => setSort(option.value),
      })),
    [sort],
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

  const renderItem = useCallback(
    ({ item }: { item: ActivityItem }) => (
      <LogActivityCard
        item={item}
        onDeleteLog={handleDeleteLog}
        onDeleteReview={handleDeleteReview}
      />
    ),
    [handleDeleteLog, handleDeleteReview],
  );

  const header = useMemo(
    () => (
      <View className="pb-5 pt-6">
        {/* Title row */}
        <View className="px-6">
          <Text className="text-3xl font-bold tracking-tight text-text-primary">
            Log
          </Text>
          <Text className="mt-1 text-sm text-text-tertiary">
            {items.length > 0
              ? "Your reviews and watch entries."
              : "Every watch entry and review you make will land here."}
          </Text>
        </View>

        {/* Filter pills + sort button */}
        <View className="mt-4 flex-row items-center">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
            className="flex-1"
          >
            {FILTERS.map((option) => (
              <FilterPill
                key={option.value}
                label={option.label}
                isActive={filter === option.value}
                onPress={() => setFilter(option.value)}
              />
            ))}
          </ScrollView>

          {/* Sort button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSortSheetVisible(true);
            }}
            className="mr-6 flex-row items-center gap-1.5 active:opacity-80"
          >
            <Ionicons name={currentSort.icon} size={14} color="#9BA1B0" />
            <Ionicons name="chevron-down" size={12} color="#9BA1B0" />
          </Pressable>
        </View>
      </View>
    ),
    [currentSort.icon, filter, items.length],
  );

  if (activity === undefined) {
    return (
      <Screen hasTabBar>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38bdf8" size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen hasTabBar>
      <View className="flex-1">
        {items.length === 0 ? (
          <View className="flex-1 justify-center px-6">
            <EmptyState
              title="No activity yet"
              description="Mark episodes watched, add notes, or publish reviews to start building your log."
            />
          </View>
        ) : filteredItems.length === 0 ? (
          <View className="flex-1">
            {header}
            <View className="px-6">
              <EmptyState
                title="Nothing matches this filter"
                description="Try a different filter or change the sort."
              />
            </View>
          </View>
        ) : (
          <FlashList
            data={filteredItems}
            renderItem={({ item }: { item: ActivityItem }) => (
              <View className="px-6">
                {renderItem({ item })}
              </View>
            )}
            keyExtractor={(item: ActivityItem) => item.id}
            estimatedItemSize={140}
            ListHeaderComponent={header}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
            getItemType={(item: ActivityItem) => item.type}
            ListFooterComponent={
              <View className="px-6">
                {activity.hasMore ? (
                  <Pressable
                    className="mt-2 items-center justify-center rounded-2xl border border-dark-border bg-dark-card py-4 active:opacity-80"
                    onPress={() => setLimit((current) => Math.min(current + 40, 160))}
                  >
                    <Text className="text-sm font-semibold text-text-secondary">
                      Load more activity
                    </Text>
                  </Pressable>
                ) : (
                  <View className="items-center py-4">
                    <Text className="text-xs uppercase tracking-[1.8px] text-text-tertiary">
                      You're all caught up
                    </Text>
                  </View>
                )}
              </View>
            }
          />
        )}

        <ActionSheet
          visible={sortSheetVisible}
          onClose={() => setSortSheetVisible(false)}
          title="Sort by"
          options={sortSheetOptions}
        />
      </View>
    </Screen>
  );
}
