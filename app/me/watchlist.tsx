import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Pressable, Text, View } from "react-native";
import { FlashList } from "../../components/FlashList";
import { useAuth, usePaginatedQuery, useQuery } from "../../lib/plotlist/react";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { Poster } from "../../components/Poster";
import { FilterDropdown } from "../../components/FilterDropdown";
import { SegmentedControl } from "../../components/SegmentedControl";
import { api } from "../../lib/plotlist/api";
import { guardedPush } from "../../lib/navigation";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PADDING = 24;
const GAP = 12;
const NUM_COLS = 3;
const ITEM_WIDTH =
  (SCREEN_WIDTH - H_PADDING * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS;

type StatusFilter = "all" | "watchlist" | "watching" | "completed" | "dropped";
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

const VALID_FILTERS = new Set<string>(["all", "watchlist", "watching", "completed", "dropped"]);

function parseFilter(raw?: string): StatusFilter {
  return raw && VALID_FILTERS.has(raw) ? (raw as StatusFilter) : "all";
}

const sortOptions = [
  { value: "date", label: "Recent" },
  { value: "title", label: "A-Z" },
  { value: "year", label: "Year" },
];

const statusLabels: Record<string, string> = {
  watchlist: "Want to watch",
  watching: "Currently watching",
  completed: "Completed",
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
        completed: counts?.completed ?? 0,
        dropped: counts?.dropped ?? 0,
        total: counts?.total ?? 0,
      };
    }

    return watchStateItems.reduce(
      (acc, item: any) => {
        const status = item.status as keyof typeof acc;
        if (status in acc) {
          acc[status] += 1;
        }
        acc.total += 1;
        return acc;
      },
      { watchlist: 0, watching: 0, completed: 0, dropped: 0, total: 0 },
    );
  }, [counts, watchStateItems]);

  const filterOptions = useMemo(
    () => [
      { value: "all", label: "All", count: effectiveCounts.total },
      { value: "watchlist", label: "Watchlist", count: effectiveCounts.watchlist },
      { value: "watching", label: "Watching", count: effectiveCounts.watching },
      { value: "completed", label: "Completed", count: effectiveCounts.completed },
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
      const isLastInRow = index % NUM_COLS === NUM_COLS - 1;
      return (
        <View
          style={{
            width: ITEM_WIDTH,
            marginRight: isLastInRow ? 0 : GAP,
            marginBottom: GAP,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              guardedPush(`/show/${item.show._id}`);
            }}
            className="active:opacity-80"
          >
            <Poster
              uri={item.show.posterUrl}
              width={ITEM_WIDTH}
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
          </Pressable>
        </View>
      );
    },
    []
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
      case "completed":
        return {
          title: "No completed shows",
          description: "Mark shows as completed when you finish them.",
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
    <Screen>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">My Shows</Text>
        <Text className="mt-1 text-sm text-text-tertiary">
          Track what you're watching
        </Text>

        {/* Filter dropdown */}
        <View className="mt-4">
          <FilterDropdown
            options={filterOptions}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
        </View>

        {/* Sort picker */}
        <View className="mt-4">
          <SegmentedControl
            options={sortOptions}
            value={sortBy}
            onChange={(v) => setSortBy(v as SortOption)}
          />
        </View>

        <View className="mt-6 flex-1">
          {items.length > 0 ? (
            <FlashList
              data={items}
              renderItem={renderItem}
              keyExtractor={(item: WatchlistItem) => item.state._id}
              numColumns={NUM_COLS}
              estimatedItemSize={ITEM_WIDTH * 1.5 + 48}
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
