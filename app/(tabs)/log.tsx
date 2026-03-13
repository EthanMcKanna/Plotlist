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

const FILTER_LABELS: Record<FilterValue, string> = {
  all: "All",
  entries: "Entries",
  reviews: "Reviews",
  notes: "Notes",
  episodes: "Episodes",
};

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
  return episodeTitle ? `${code} • ${episodeTitle}` : code;
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
  const typeLabel =
    item.type === "review"
      ? subtitle
        ? "Episode review"
        : "Show review"
      : subtitle
        ? "Watched episode"
        : "Logged watch";

  return (
    <Pressable
      className="mb-3 flex-row gap-4 rounded-2xl border border-dark-border bg-dark-card p-3 active:bg-dark-hover"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (item.type === "review") {
          router.push(`/review/${item.review._id}`);
          return;
        }

        if (item.show?._id) {
          router.push(`/show/${item.show._id}`);
        }
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (item.type === "review") {
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
              className="text-base font-semibold text-text-primary"
              numberOfLines={1}
            >
              {title}
            </Text>
            <View className="mt-1 flex-row flex-wrap items-center gap-2">
              <Text className="text-xs text-text-tertiary">{typeLabel}</Text>
              {subtitle ? (
                <>
                  <Text className="text-xs text-text-tertiary">•</Text>
                  <Text className="text-xs text-brand-400" numberOfLines={1}>
                    {subtitle}
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          <View className="items-end">
            {item.type === "review" ? (
              <Text className="text-xs font-semibold text-amber-300">
                ★ {item.review.rating.toFixed(1)}
              </Text>
            ) : null}
            <Text className="mt-1 text-xs text-text-tertiary">
              {formatRelativeTime(item.timestamp)}
            </Text>
          </View>
        </View>

        {note ? (
          <Text className="mt-2 text-sm leading-5 text-text-secondary" numberOfLines={3}>
            {note}
          </Text>
        ) : (
          <Text className="mt-2 text-sm text-text-tertiary">
            {item.type === "review"
              ? "No written review."
              : "No note."}
          </Text>
        )}

        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          {hasEpisodeMetadata(item) ? (
            <View className="rounded-full bg-dark-elevated px-2.5 py-1">
              <Text className="text-[11px] text-text-secondary">Episode</Text>
            </View>
          ) : null}
          {hasNote(item) ? (
            <View className="rounded-full bg-dark-elevated px-2.5 py-1">
              <Text className="text-[11px] text-text-secondary">Notes</Text>
            </View>
          ) : null}
          {item.type === "review" && item.review.spoiler ? (
            <View className="rounded-full bg-dark-elevated px-2.5 py-1">
              <Text className="text-[11px] text-text-secondary">Spoilers</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortValue>("recent");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
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
  const headerSubtitle =
    items.length > 0
      ? "Reviews and watch entries."
      : "Every watch entry and review you make will land here.";
  const activeFilterLabel = FILTER_LABELS[filter];
  const hasActiveFilter = filter !== "all" || sort !== "recent";

  const filterSheetOptions = useMemo<ActionSheetOption[]>(
    () => [
      ...((Object.keys(FILTER_LABELS) as FilterValue[]).map((value) => ({
        label:
          value === filter ? `${FILTER_LABELS[value]} ✓` : FILTER_LABELS[value],
        icon: value === filter ? "checkmark" : "funnel-outline",
        onPress: () => setFilter(value),
      })) as ActionSheetOption[]),
      {
        label:
          sort === "recent"
            ? "Newest first ✓"
            : sort === "oldest"
              ? "Oldest first ✓"
              : sort === "title"
                ? "Title ✓"
                : "Best rated ✓",
        icon: "swap-vertical-outline",
        onPress: () =>
          setSort((current) =>
            current === "recent"
              ? "oldest"
              : current === "oldest"
                ? "title"
                : current === "title"
                  ? "rating"
                  : "recent",
          ),
      },
    ],
    [filter, sort],
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
      <View className="px-6 pt-6 pb-4">
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-3xl font-bold tracking-tight text-text-primary">
              Log
            </Text>
            <Text className="mt-1 text-sm text-text-tertiary">
              {headerSubtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilterSheetVisible(true);
            }}
            className={`flex-row items-center gap-2 rounded-full border px-3.5 py-2 active:opacity-80 ${
              hasActiveFilter
                ? "border-brand-500/25 bg-brand-500/10"
                : "border-dark-border bg-dark-card"
            }`}
          >
            <View
              className={`h-1.5 w-1.5 rounded-full ${
                hasActiveFilter ? "bg-brand-400" : "bg-text-tertiary"
              }`}
            />
            <Text
              className={`text-xs font-medium ${
                hasActiveFilter ? "text-brand-300" : "text-text-secondary"
              }`}
            >
              {activeFilterLabel}
            </Text>
            <Ionicons
              name="chevron-down"
              size={13}
              color={hasActiveFilter ? "#7dd3fc" : "#9BA1B0"}
            />
          </Pressable>
        </View>
      </View>
    ),
    [activeFilterLabel, hasActiveFilter, headerSubtitle],
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
                title="Nothing matches this view"
                description="Try another filter."
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
            estimatedItemSize={176}
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
                      You’re all caught up
                    </Text>
                  </View>
                )}
              </View>
            }
          />
        )}

        <ActionSheet
          visible={filterSheetVisible}
          onClose={() => setFilterSheetVisible(false)}
          title="Filter log"
          options={filterSheetOptions}
        />
      </View>
    </Screen>
  );
}
