import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FlashList } from "../../../components/FlashList";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { usePaginatedQuery, useQuery } from "../../../lib/plotlist/react";

import { EmptyState } from "../../../components/EmptyState";
import { Poster } from "../../../components/Poster";
import { Screen } from "../../../components/Screen";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { api } from "../../../lib/plotlist/api";
import { guardedPush } from "../../../lib/navigation";
import { usePosterGridLayout, WEB_PAGE_MAX_WIDTH } from "../../../lib/webLayout";
import type { Id } from "../../../lib/plotlist/types";

const GAP = 12;

type SortOption = "date" | "title" | "year";

type WatchlistItem = {
  state: { _id: string };
  show: {
    _id: string;
    title?: string | null;
    posterUrl?: string | null;
    year?: number | null;
  } | null;
};

const sortOptions = [
  { value: "date", label: "Recent" },
  { value: "title", label: "A-Z" },
  { value: "year", label: "Year" },
];

function normalizeWatchlistItem(item: any): WatchlistItem | null {
  const state = item?.state ?? item;
  const show = item?.show;
  if (!state?._id || !show?._id) {
    return null;
  }
  return { state, show };
}

export default function PublicWatchlistScreen() {
  const params = useLocalSearchParams();
  const userId = typeof params.id === "string" ? params.id : "";
  const userIdValue = userId as Id<"users">;
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const { numColumns, itemWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });

  const profile = useQuery(api.users.profile, { userId: userIdValue });
  const canViewWatchlist = profile?.permissions.watchlist ?? false;

  const {
    results: rawItems,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.watchStates.listPublicWatchlistDetailed,
    canViewWatchlist
      ? {
          userId: userIdValue,
          sortBy,
        }
      : "skip",
    { initialNumItems: 36 },
  );

  const items = useMemo(
    () =>
      rawItems
        .map(normalizeWatchlistItem)
        .filter((item): item is WatchlistItem => Boolean(item)),
    [rawItems],
  );

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
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              guardedPush(`/show/${item.show!._id}`);
            }}
            className="active:opacity-80"
          >
            <Poster uri={item.show?.posterUrl} width={itemWidth} />
            <Text
              className="mt-2 text-xs font-medium text-text-primary"
              numberOfLines={2}
            >
              {item.show?.title ?? "Unknown"}
            </Text>
            {item.show?.year ? (
              <Text className="mt-0.5 text-xs text-text-tertiary">{item.show.year}</Text>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [itemWidth, numColumns],
  );

  const profileName = profile?.user?.displayName ?? profile?.user?.name ?? "This user";

  return (
    <Screen webMaxWidth={WEB_PAGE_MAX_WIDTH}>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">Watchlist</Text>
        <Text className="mt-1 text-sm text-text-tertiary">
          {profileName}
          {"'s saved shows to watch next"}
        </Text>

        {profile === undefined ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#9BA1B0" />
          </View>
        ) : !profile ? (
          <View className="mt-6">
            <EmptyState
              title="Profile not found"
              description="That profile is unavailable."
            />
          </View>
        ) : !canViewWatchlist ? (
          <View className="mt-6">
            <EmptyState
              title="Watchlist is private"
              description="This user has limited who can see their watchlist."
            />
          </View>
        ) : (
          <>
            <View className="mt-4">
              <SegmentedControl
                options={sortOptions}
                value={sortBy}
                onChange={(value: string) => setSortBy(value as SortOption)}
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
                      loadMore(36);
                    }
                  }}
                  onEndReachedThreshold={0.5}
                />
              ) : (
                <View className="mt-4">
                  <EmptyState
                    title="Watchlist is empty"
                    description="No shows have been added here yet."
                  />
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
