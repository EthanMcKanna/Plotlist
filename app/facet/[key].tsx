import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, Text, View } from "react-native";
import { FlashList } from "../../components/FlashList";
import { Ionicons } from "@expo/vector-icons";
import { useAction } from "../../lib/plotlist/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "../../components/NativeGlass";
import { Poster } from "../../components/Poster";
import { guardedPush } from "../../lib/navigation";
import { api } from "../../lib/plotlist/api";
import { facetByKey, FACET_GROUPS } from "../../lib/plotlist/facets";
import { queryClient } from "../../lib/queryClient";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PADDING = 24;
const GAP = 12;
const NUM_COLS = 3;
const ITEM_WIDTH =
  (SCREEN_WIDTH - H_PADDING * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS;

type FacetItem = {
  _id: string;
  score: number;
  show: {
    _id: string;
    title: string;
    year?: number | null;
    overview?: string | null;
    posterUrl?: string | null;
  } & Record<string, unknown>;
};

// Category screen fed by the recs v2 facet index (show_facets in D1); every
// item is a local show, so taps navigate directly with a seeded query cache.
export default function FacetScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const facetKey = typeof params.key === "string" ? params.key : "";
  const facet = facetByKey(facetKey);

  const getFacetShows = useAction(api.embeddings.getFacetShows);

  const [items, setItems] = useState<FacetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!facet) return;
    let cancelled = false;
    setIsLoading(true);
    getFacetShows({ facetKey: facet.key, limit: 60 })
      .then((result: any) => {
        if (cancelled) return;
        const nextItems = Array.isArray(result?.items) ? result.items : [];
        setItems(nextItems.filter((item: any) => item?.show?.posterUrl));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facet, getFacetShows]);

  const handlePress = useCallback((item: FacetItem) => {
    const show = item?.show;
    const showId = show?._id;
    if (!showId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const showQueryKey = ["plotlist-rpc", "query", "shows:get", { showId }];
    if (!queryClient.getQueryData(showQueryKey)) {
      queryClient.setQueryData(showQueryKey, { ...show, extendedDetails: null });
      void queryClient.invalidateQueries({ queryKey: showQueryKey });
    }
    guardedPush(`/show/${showId}`);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: FacetItem; index: number }) => {
      const isLastInRow = index % NUM_COLS === NUM_COLS - 1;
      return (
        <View
          style={{
            width: ITEM_WIDTH,
            marginRight: isLastInRow ? 0 : GAP,
            marginBottom: GAP,
          }}
        >
          <Pressable onPress={() => handlePress(item)} className="active:opacity-80">
            <Poster uri={item.show.posterUrl ?? undefined} width={ITEM_WIDTH} />
            <Text
              className="mt-2 text-xs font-medium text-text-primary"
              numberOfLines={2}
            >
              {item.show.title}
            </Text>
            {item.show.year ? (
              <Text className="mt-0.5 text-xs text-text-tertiary">
                {item.show.year}
              </Text>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [handlePress],
  );

  if (!facet) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <Text className="text-text-tertiary">Unknown category</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-bg">
      {/* Header */}
      <View
        className="px-6 pb-4 border-b border-dark-border"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center gap-3">
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

          <View className="flex-1">
            <Text className="text-xl font-black text-text-primary">
              {facet.title}
            </Text>
            <Text className="text-xs font-semibold text-text-tertiary">
              {FACET_GROUPS[facet.group]?.title ?? "Category"}
            </Text>
          </View>
        </View>
        <Text
          className="mt-3 text-[13px] leading-5 text-text-secondary"
          numberOfLines={3}
        >
          {facet.description}
        </Text>
      </View>

      {/* Grid */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : (
        <View className="flex-1 px-6 pt-6">
          <FlashList
            data={items}
            renderItem={renderItem}
            numColumns={NUM_COLS}
            estimatedItemSize={ITEM_WIDTH * 1.5 + 48}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            keyExtractor={(item: FacetItem) => item._id}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center px-4 py-20">
                <Ionicons name="sparkles" size={28} color="#6B7280" />
                <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
                  Nothing here yet
                </Text>
                <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
                  This category fills in as the catalog is indexed.
                </Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}
