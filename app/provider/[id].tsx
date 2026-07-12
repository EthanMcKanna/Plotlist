import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { FlashList } from "../../components/FlashList";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAction, useAuth } from "../../lib/plotlist/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "../../components/NativeGlass";
import { Poster } from "../../components/Poster";
import { guardedPush } from "../../lib/navigation";
import { api } from "../../lib/plotlist/api";
import { SHOW_BACK_BUTTON, usePosterGridLayout,
  useWebPageStyle,
  WEB_PAGE_MAX_WIDTH } from "../../lib/webLayout";
import {
  getProviderCatalogSignalLabel,
  hasProviderCatalogMore,
  mergeProviderCatalogItems,
  pinProviderCatalogTitle,
  type ProviderCatalogItem,
} from "../../lib/providerDiscovery";
import type { HomeEditorialProviderKey } from "../../lib/homeEditorialSeeds";

const TMDB_LOGO = (path: string) => `https://image.tmdb.org/t/p/w92${path}`;

const GAP = 12;

type ProviderConfig = {
  category: HomeEditorialProviderKey;
  label: string;
  logoUrl: string;
};

const PROVIDERS: Record<string, ProviderConfig> = {
  netflix: { category: "netflix", label: "Netflix", logoUrl: TMDB_LOGO("/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg") },
  apple_tv: { category: "apple_tv", label: "Apple TV+", logoUrl: TMDB_LOGO("/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg") },
  max: { category: "max", label: "Max", logoUrl: TMDB_LOGO("/jbe4gVSfRlbPTdESXhEKpornsfu.jpg") },
  disney_plus: { category: "disney_plus", label: "Disney+", logoUrl: TMDB_LOGO("/97yvRBw1GzX7fXprcF80er19ot.jpg") },
  hulu: { category: "hulu", label: "Hulu", logoUrl: TMDB_LOGO("/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg") },
  peacock: { category: "peacock", label: "Peacock", logoUrl: TMDB_LOGO("/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg") },
  prime_video: { category: "prime_video", label: "Prime Video", logoUrl: TMDB_LOGO("/pvske1MyAoymrs5bguRfVqYiM9a.jpg") },
  paramount_plus: { category: "paramount_plus", label: "Paramount+", logoUrl: TMDB_LOGO("/fts6X10Jn4QT0X6ac3udKEn2tJA.jpg") },
  mgm_plus: { category: "mgm_plus", label: "MGM+", logoUrl: TMDB_LOGO("/ctiRpS16dlaTXQBSsiFncMrgWmh.jpg") },
};

export default function ProviderScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const providerId = typeof params.id === "string" ? params.id : "";
  const featuredTitle =
    typeof params.featuredTitle === "string" ? params.featuredTitle : null;
  const provider = PROVIDERS[providerId];
  const { numColumns, itemWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });
  const pageStyle = useWebPageStyle(WEB_PAGE_MAX_WIDTH);

  const getTmdbList = useAction(api.shows.getTmdbList);
  const ingestFromCatalog = useAction(api.shows.ingestFromCatalog);

  const [shows, setShows] = useState<ProviderCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const nextPage = useRef(1);
  const hasMore = useRef(true);

  const loadPage = useCallback(
    async (page: number) => {
      if (!provider || !isAuthenticated) return [];
      const results = await getTmdbList({ category: provider.category, limit: 20, page });
      const pageResults = Array.isArray(results) ? results : [];
      if (!hasProviderCatalogMore(pageResults)) hasMore.current = false;
      return pageResults;
    },
    [provider, isAuthenticated, getTmdbList],
  );

  useEffect(() => {
    if (!provider || !isAuthenticated) return;
    let cancelled = false;
    setIsLoading(true);
    nextPage.current = 1;
    hasMore.current = true;

    Promise.allSettled([loadPage(1), loadPage(2), loadPage(3)])
      .then((pageResults) => {
        if (cancelled) return;
        const pages = pageResults.flatMap((result) => {
          return result.status === "fulfilled" ? [result.value] : [];
        });
        setShows(
          pinProviderCatalogTitle(
            mergeProviderCatalogItems({
              providerKey: provider.category,
              pages,
            }),
            featuredTitle,
          ),
        );
        nextPage.current = 4;
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [provider, isAuthenticated, loadPage, featuredTitle]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore.current) return;
    setIsLoadingMore(true);
    try {
      const page = nextPage.current;
      const results = await loadPage(page);
      if (results.length > 0) {
        setShows((prev) => {
          return pinProviderCatalogTitle(
            mergeProviderCatalogItems({
              providerKey: provider.category,
              pages: [prev, results],
            }),
            featuredTitle,
          );
        });
        nextPage.current = page + 1;
      }
    } catch {
      // silently fail on pagination
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, loadPage, provider?.category, featuredTitle]);

  const handlePress = useCallback(
    async (item: ProviderCatalogItem) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (!item.externalId) return;
        const showId = await ingestFromCatalog({
          externalSource: item.externalSource ?? "tmdb",
          externalId: item.externalId,
          title: item.title,
          year: item.year,
          overview: item.overview,
          posterUrl: item.posterUrl,
        });
        guardedPush(`/show/${showId}`);
      } catch {
        // ignore - user navigated away or show already exists
      }
    },
    [ingestFromCatalog],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ProviderCatalogItem; index: number }) => {
      const isLastInRow = index % numColumns === numColumns - 1;
      const signalLabel = getProviderCatalogSignalLabel(item);
      return (
        <View
          style={{
            width: itemWidth,
            marginRight: isLastInRow ? 0 : GAP,
            marginBottom: GAP,
          }}
        >
          <Pressable
            onPress={() => handlePress(item)}
            className="active:opacity-80"
          >
            <Poster uri={item.posterUrl} width={itemWidth} />
            <Text
              className="mt-2 text-xs font-medium text-text-primary"
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {signalLabel ? (
              <Text
                className="mt-1 text-[11px] font-semibold text-sky-300"
                numberOfLines={1}
              >
                {signalLabel}
              </Text>
            ) : null}
            {item.year ? (
              <Text className="mt-0.5 text-xs text-text-tertiary">
                {item.year}
              </Text>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [handlePress, itemWidth, numColumns],
  );

  if (!provider) {
    return (
      <View className="flex-1 bg-dark-bg items-center justify-center">
        <Text className="text-text-tertiary">Unknown provider</Text>
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

            <Image
              source={{ uri: provider.logoUrl }}
              style={{ width: 36, height: 36, borderRadius: 9 }}
              contentFit="cover"
            />
            <View className="flex-1">
              <Text className="text-xl font-black text-text-primary">
                {provider.label}
              </Text>
              <Text className="text-xs font-semibold text-text-tertiary">
                What's on right now
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Grid */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : (
        <View className="flex-1 px-6 pt-6" style={pageStyle}>
          <FlashList
            key={`grid-${numColumns}`}
            data={shows}
            renderItem={renderItem}
            numColumns={numColumns}
            estimatedItemSize={itemWidth * 1.5 + 48}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            keyExtractor={(item: ProviderCatalogItem) =>
              item.externalId ?? item.title
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center px-4 py-20">
                <Ionicons name="sparkles" size={28} color="#6B7280" />
                <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
                  Nothing fresh here yet
                </Text>
                <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
                  We refresh this room as new shows and seasons land.
                </Text>
              </View>
            }
            ListFooterComponent={
              isLoadingMore ? (
                <View className="py-6 items-center">
                  <ActivityIndicator size="small" color="#0ea5e9" />
                </View>
              ) : null
            }
          />
        </View>
      )}
    </View>
  );
}
