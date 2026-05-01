import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, Text, View } from "react-native";
import { FlashList } from "../../../components/FlashList";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { usePaginatedQuery, useQuery } from "../../../lib/plotlist/react";

import { EmptyState } from "../../../components/EmptyState";
import { Poster } from "../../../components/Poster";
import { Screen } from "../../../components/Screen";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { api } from "../../../lib/plotlist/api";
import type { Id } from "../../../lib/plotlist/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PADDING = 24;
const GAP = 12;
const NUM_COLS = 3;
const ITEM_WIDTH =
  (SCREEN_WIDTH - H_PADDING * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS;

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

export default function PublicWatchlistScreen() {
  const params = useLocalSearchParams();
  const userId = typeof params.id === "string" ? params.id : "";
  const userIdValue = userId as Id<"users">;
  const [sortBy, setSortBy] = useState<SortOption>("date");

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
    () => rawItems.filter((item): item is WatchlistItem => Boolean(item.show)),
    [rawItems],
  );

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
              router.push(`/show/${item.show!._id}`);
            }}
            className="active:opacity-80"
          >
            <Poster uri={item.show?.posterUrl} width={ITEM_WIDTH} />
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
    [],
  );

  const profileName = profile?.user?.displayName ?? profile?.user?.name ?? "This user";

  return (
    <Screen>
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
                  data={items}
                  renderItem={renderItem}
                  keyExtractor={(item: WatchlistItem) => item.state._id}
                  numColumns={NUM_COLS}
                  estimatedItemSize={ITEM_WIDTH * 1.5 + 48}
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
