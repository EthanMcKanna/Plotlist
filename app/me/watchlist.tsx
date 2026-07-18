import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "../../components/FlashList";
import { useAuth, usePaginatedQuery, useQuery } from "../../lib/plotlist/react";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { Screen } from "../../components/Screen";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { EmptyState } from "../../components/EmptyState";
import { LinkPressable } from "../../components/LinkPressable";
import { Poster } from "../../components/Poster";
import { FilterDropdown } from "../../components/FilterDropdown";
import { api } from "../../lib/plotlist/api";
import { usePosterGridLayout, WEB_PAGE_MAX_WIDTH } from "../../lib/webLayout";

const GAP = 12;

type StatusFilter =
  | "all"
  | "watchlist"
  | "watching"
  | "caught_up"
  | "finished"
  | "paused"
  | "dropped";
type SortOption = "date" | "title" | "year";
type WatchlistItem = {
  state: {
    _id: string;
    status: StatusFilter;
  };
  show: {
    _id: string;
    title?: string | null;
    posterUrl?: string | null;
    year?: number | null;
  };
};

const VALID_FILTERS = new Set<string>([
  "all",
  "watchlist",
  "watching",
  "caught_up",
  "finished",
  "paused",
  "dropped",
  // Old deep links may still carry the pre-split filter; show finished.
  "completed",
]);

function normalizeFilter(raw: string): StatusFilter {
  return raw === "completed" ? "finished" : (raw as StatusFilter);
}

function parseFilter(raw?: string): StatusFilter {
  return raw && VALID_FILTERS.has(raw) ? normalizeFilter(raw) : "all";
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "date", label: "Recently added" },
  { value: "title", label: "Title A–Z" },
  { value: "year", label: "Release year" },
];

const statusLabels: Record<string, string> = {
  watchlist: "Want to watch",
  watching: "Currently watching",
  caught_up: "Caught up",
  finished: "Finished",
  completed: "Finished",
  paused: "Paused",
  dropped: "Dropped",
};

function normalizeWatchlistItem(item: any): WatchlistItem | null {
  const state = item?.state ?? item;
  const show = item?.show;
  if (!state?._id || !state?.status || !show?._id) {
    return null;
  }
  return { state, show };
}

export default function WatchlistScreen() {
  const { isAuthenticated } = useAuth();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(parseFilter(params.filter));
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const { numColumns, itemWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });

  const sortSheetOptions = useMemo<ActionSheetOption[]>(
    () =>
      sortOptions.map((option) => ({
        label: option.label,
        icon: option.value === sortBy ? "checkmark" : undefined,
        onPress: () => setSortBy(option.value),
      })),
    [sortBy],
  );

  useEffect(() => {
    setStatusFilter(parseFilter(params.filter));
  }, [params.filter]);

  const counts = useQuery(
    api.watchStates.getCounts,
    isAuthenticated ? {} : "skip"
  );
  const watchStateItems = useQuery(
    api.watchStates.listForUser,
    isAuthenticated ? {} : "skip",
  );
  const effectiveCounts = useMemo(() => {
    if (!Array.isArray(watchStateItems)) {
      return {
        watchlist: counts?.watchlist ?? 0,
        watching: counts?.watching ?? 0,
        caught_up: counts?.caughtUp ?? 0,
        finished: counts?.finished ?? 0,
        paused: counts?.paused ?? 0,
        dropped: counts?.dropped ?? 0,
        total: counts?.total ?? 0,
      };
    }

    return watchStateItems.reduce(
      (acc, item: any) => {
        // Unmigrated rows can still say "completed" — count them as finished.
        const status = (item.status === "completed" ? "finished" : item.status) as keyof typeof acc;
        if (status in acc) {
          acc[status] += 1;
        }
        acc.total += 1;
        return acc;
      },
      { watchlist: 0, watching: 0, caught_up: 0, finished: 0, paused: 0, dropped: 0, total: 0 },
    );
  }, [counts, watchStateItems]);

  const filterOptions = useMemo(
    () => [
      { value: "all", label: "All", count: effectiveCounts.total },
      { value: "watchlist", label: "Watchlist", count: effectiveCounts.watchlist },
      { value: "watching", label: "Watching", count: effectiveCounts.watching },
      { value: "caught_up", label: "Caught Up", count: effectiveCounts.caught_up },
      { value: "finished", label: "Finished", count: effectiveCounts.finished },
      { value: "paused", label: "Paused", count: effectiveCounts.paused },
      { value: "dropped", label: "Dropped", count: effectiveCounts.dropped },
    ],
    [effectiveCounts],
  );

  const {
    results: rawItems,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.watchStates.listForUserDetailed,
    isAuthenticated
      ? {
          status: statusFilter === "all" ? undefined : statusFilter,
          sortBy: sortBy,
        }
      : "skip",
    { initialNumItems: 40 },
  );

  const items = useMemo(() => {
    const validItems = rawItems
      .map(normalizeWatchlistItem)
      .filter((item): item is WatchlistItem => Boolean(item));
    if (validItems.length <= 1) return validItems;
    const sorted = [...validItems];

    if (sortBy === "title") {
      sorted.sort((a, b) => {
        const titleA = a.show?.title?.toLowerCase() ?? "";
        const titleB = b.show?.title?.toLowerCase() ?? "";
        return titleA.localeCompare(titleB);
      });
    } else if (sortBy === "year") {
      sorted.sort((a, b) => {
        const yearA = a.show?.year ?? 0;
        const yearB = b.show?.year ?? 0;
        return yearB - yearA;
      });
    }

    return sorted;
  }, [rawItems, sortBy]);

  const renderItem = useCallback(
    ({ item, index }: { item: WatchlistItem; index: number }) => {
      const isLastInRow = index % numColumns === numColumns - 1;
      return (
        <View
          style={{
            width: itemWidth,
            marginRight: isLastInRow ? 0 : GAP,
            marginBottom: GAP,
          }}
        >
          <LinkPressable
            href={`/show/${item.show._id}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            className="active:opacity-80 hover:opacity-80 web:transition-opacity"
          >
            <Poster
              uri={item.show.posterUrl}
              width={itemWidth}
              alt={item.show.title ?? undefined}
            />
            <Text
              className="mt-2 text-xs font-medium text-text-primary"
              numberOfLines={2}
            >
              {item.show.title ?? "Unknown"}
            </Text>
            <Text className="mt-0.5 text-xs text-text-tertiary">
              {statusLabels[item.state.status]}
            </Text>
          </LinkPressable>
        </View>
      );
    },
    [itemWidth, numColumns]
  );

  const getEmptyStateText = () => {
    switch (statusFilter) {
      case "watchlist":
        return {
          title: "Watchlist is empty",
          description: "Add shows you want to watch from search.",
        };
      case "watching":
        return {
          title: "Not watching anything",
          description: "Start watching a show to see it here.",
        };
      case "caught_up":
        return {
          title: "Nothing caught up",
          description: "Shows you've watched everything released for land here.",
        };
      case "finished":
        return {
          title: "No finished shows",
          description: "Shows you've watched to the end will appear here.",
        };
      case "paused":
        return {
          title: "Nothing on hold",
          description: "Pause a show from its page to park it here for later.",
        };
      case "dropped":
        return {
          title: "No dropped shows",
          description: "Shows you've stopped watching will appear here.",
        };
      default:
        return {
          title: "Nothing here yet",
          description: "Add shows to your watchlist from search or a show page.",
        };
    }
  };

  const emptyState = getEmptyStateText();

  return (
    <Screen webMaxWidth={WEB_PAGE_MAX_WIDTH}>
      <ActionSheet
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        title="Sort by"
        options={sortSheetOptions}
      />
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-2xl font-semibold text-text-primary">My Shows</Text>
            <Text className="mt-1 text-sm text-text-tertiary">
              Track what you're watching
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSortSheetVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Sort shows. Currently ${
              sortOptions.find((option) => option.value === sortBy)?.label ?? "Recently added"
            }`}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full border border-dark-border bg-dark-card active:bg-dark-hover"
          >
            <Ionicons name="swap-vertical" size={17} color="#9BA1B0" />
          </Pressable>
        </View>

        {/* Filter dropdown */}
        <View className="mt-4">
          <FilterDropdown
            options={filterOptions}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
        </View>

        <View className="mt-6 flex-1">
          {items.length > 0 ? (
            <FlashList
              key={`grid-${numColumns}`}
              data={items}
              renderItem={renderItem}
              keyExtractor={(item: WatchlistItem) => item.state._id}
              numColumns={numColumns}
              estimatedItemSize={itemWidth * 1.5 + 48}
              contentContainerStyle={{ paddingBottom: 40 }}
              onEndReached={() => {
                if (status === "CanLoadMore") {
                  loadMore(40);
                }
              }}
              onEndReachedThreshold={0.5}
            />
          ) : (
            <View className="mt-4">
              <EmptyState
                title={emptyState.title}
                description={emptyState.description}
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
