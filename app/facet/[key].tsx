import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlashList } from "../../components/FlashList";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
import {
  getFacetsForGroup,
  getGenreExplorerGroup,
  withAlpha,
} from "../../lib/genreExplorer";
import { queryClient } from "../../lib/queryClient";
import { SHOW_BACK_BUTTON, usePosterGridLayout,
  useWebPageStyle,
  WEB_PAGE_MAX_WIDTH } from "../../lib/webLayout";

const GAP = 12;

type FacetItem = {
  _id: string;
  score: number;
  show: {
    _id: string;
    title: string;
    year?: number | null;
    overview?: string | null;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    tmdbVoteAverage?: number | null;
  } & Record<string, unknown>;
};

export function splitFacetFeature(items: FacetItem[]): {
  hero: FacetItem | null;
  rest: FacetItem[];
} {
  // The hero needs backdrop art; the ranking already leads with the facet's
  // defining shows, so take the first of the top 5 that can carry the card.
  const hero =
    items
      .slice(0, 5)
      .find((item) => item.show?.backdropUrl && item.show?.title) ?? null;
  return {
    hero,
    rest: hero ? items.filter((item) => item._id !== hero._id) : items,
  };
}

function GridSkeleton() {
  const { numColumns, itemWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });
  const pageStyle = useWebPageStyle(WEB_PAGE_MAX_WIDTH);
  return (
    <View className="flex-1 px-6 pt-6" style={pageStyle}>
      <View className="flex-row flex-wrap">
        {Array.from({ length: 9 }, (_, index) => (
          <View
            key={index}
            style={{
              width: itemWidth,
              marginRight: index % numColumns === numColumns - 1 ? 0 : GAP,
              marginBottom: GAP + 8,
            }}
          >
            <View
              className="rounded-xl bg-dark-elevated"
              style={{ height: itemWidth * 1.5 }}
            />
            <View className="mt-2 h-3 w-4/5 rounded bg-dark-elevated" />
          </View>
        ))}
      </View>
    </View>
  );
}

// Category screen fed by the recs v2 facet index (show_facets in D1); every
// item is a local show, so taps navigate directly with a seeded query cache.
export default function FacetScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const facetKey = typeof params.key === "string" ? params.key : "";
  const facet = facetByKey(facetKey);
  const group = facet ? getGenreExplorerGroup(facet.group) : null;
  const { numColumns, itemWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });
  const pageStyle = useWebPageStyle(WEB_PAGE_MAX_WIDTH);

  const getFacetShows = useAction(api.embeddings.getFacetShows);

  const [items, setItems] = useState<FacetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!facet) return;
    let cancelled = false;
    setIsLoading(true);
    setItems([]);
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

  const relatedFacets = useMemo(
    () =>
      facet
        ? getFacetsForGroup(facet.group).filter(
            (candidate) => candidate.key !== facet.key,
          )
        : [],
    [facet],
  );

  const { hero, rest } = useMemo(() => splitFacetFeature(items), [items]);

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
      const isLastInRow = index % numColumns === numColumns - 1;
      return (
        <View
          style={{
            width: itemWidth,
            marginRight: isLastInRow ? 0 : GAP,
            marginBottom: GAP,
          }}
        >
          <Pressable onPress={() => handlePress(item)} className="active:opacity-80">
            <Poster uri={item.show.posterUrl ?? undefined} width={itemWidth} />
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
    [handlePress, itemWidth, numColumns],
  );

  const listHeader = useMemo(() => {
    if (!hero || !group) return null;
    const vote =
      typeof hero.show.tmdbVoteAverage === "number" &&
      hero.show.tmdbVoteAverage > 0
        ? hero.show.tmdbVoteAverage.toFixed(1)
        : null;
    return (
      <View className="pb-5">
        <Pressable
          onPress={() => handlePress(hero)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${hero.show.title}, featured in ${facet?.title}`}
          style={styles.heroCard}
          className="active:opacity-90"
        >
          <Image
            source={{ uri: hero.show.backdropUrl ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={220}
          />
          <LinearGradient
            colors={["transparent", "rgba(13,15,20,0.55)", "rgba(13,15,20,0.94)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroContent}>
            <View
              style={[styles.heroBadge, { backgroundColor: group.accent }]}
            >
              <Ionicons
                name="star"
                size={10}
                color="#0D0F14"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
              <Text className="text-[10px] font-black uppercase text-text-inverse">
                Featured
              </Text>
            </View>
            <Text
              className="mt-2 text-[22px] font-black leading-[26px] text-text-primary"
              numberOfLines={2}
            >
              {hero.show.title}
            </Text>
            <View className="mt-1 flex-row items-center gap-2">
              {hero.show.year ? (
                <Text className="text-[13px] font-semibold text-text-secondary">
                  {hero.show.year}
                </Text>
              ) : null}
              {vote ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons
                    name="star"
                    size={11}
                    color="#FACC15"
                    accessible={false}
                    accessibilityElementsHidden
                    aria-hidden={true}
                    importantForAccessibility="no"
                  />
                  <Text className="text-[13px] font-semibold text-text-secondary">
                    {vote}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View className="mt-6 mb-1 flex-row items-center gap-2">
          <Text className="text-[11px] font-bold uppercase text-text-tertiary">
            All shows
          </Text>
          <View className="flex-1 h-px bg-dark-border" />
        </View>
      </View>
    );
  }, [facet?.title, group, handlePress, hero]);

  if (!facet || !group) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <Text className="text-text-tertiary">Unknown category</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-bg">
      {/* Header (band is full-bleed; inner content tracks the page column) */}
      <View
        className="pb-4 border-b border-dark-border"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="px-6" style={pageStyle}>
          <View className="flex-row items-center gap-3">
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
              <Text className="text-xl font-black text-text-primary">
                {facet.title}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <Ionicons
                  name={group.icon}
                  size={11}
                  color={group.accent}
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden={true}
                  importantForAccessibility="no"
                />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: group.accent }}
                >
                  {FACET_GROUPS[facet.group]?.title ?? "Category"}
                </Text>
              </View>
            </View>
          </View>
          <Text
            className="mt-3 text-[13px] leading-5 text-text-secondary"
            numberOfLines={3}
          >
            {facet.description}
          </Text>

          {relatedFacets.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-3 -mx-6"
              contentContainerStyle={styles.relatedRow}
              accessibilityLabel={`More ${group.title} categories`}
            >
              {relatedFacets.map((related) => (
                <Pressable
                  key={related.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.replace(`/facet/${related.key}`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Browse ${related.title}`}
                  style={[
                    styles.relatedChip,
                    {
                      backgroundColor: withAlpha(group.accent, 0.1),
                      borderColor: withAlpha(group.accent, 0.3),
                    },
                  ]}
                  className="active:opacity-75"
                >
                  <Text className="text-[12px] font-semibold text-text-secondary">
                    {related.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>

      {/* Featured + grid */}
      {isLoading ? (
        <GridSkeleton />
      ) : (
        <View className="flex-1 px-6 pt-5" style={pageStyle}>
          <FlashList
            key={`grid-${numColumns}`}
            data={rest}
            renderItem={renderItem}
            numColumns={numColumns}
            estimatedItemSize={itemWidth * 1.5 + 48}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            keyExtractor={(item: FacetItem) => item._id}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              hero ? null : (
                <View className="flex-1 items-center justify-center px-4 py-20">
                  <Ionicons name="sparkles" size={28} color="#6B7280" />
                  <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
                    Nothing here yet
                  </Text>
                  <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
                    This category fills in as the catalog is indexed.
                  </Text>
                </View>
              )
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroCard: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: 190,
    overflow: "hidden",
  },
  heroContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  relatedChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  relatedRow: {
    paddingHorizontal: 24,
  },
});
