import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "../../../components/NativeGlass";
import { Poster } from "../../../components/Poster";
import { TasteMatchMeter } from "../../../components/TasteMatchSummary";
import { useAction, useAuth, useQuery } from "../../../lib/plotlist/react";
import { guardedPush } from "../../../lib/navigation";
import { api } from "../../../lib/plotlist/api";
import { tasteMatchTier } from "../../../lib/plotlist/recsRanking";
import { queryClient } from "../../../lib/queryClient";
import {
  usePosterGridLayout,
  useWebPageStyle,
  WEB_PAGE_MAX_WIDTH,
} from "../../../lib/webLayout";

const GAP = 12;

function pressShow(show: any) {
  const showId = show?._id ?? show?.id;
  if (!showId) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const showQueryKey = ["plotlist-rpc", "query", "shows:get", { showId }];
  if (!queryClient.getQueryData(showQueryKey)) {
    queryClient.setQueryData(showQueryKey, { ...show, extendedDetails: null });
    void queryClient.invalidateQueries({ queryKey: showQueryKey });
  }
  guardedPush(`/show/${showId}`);
}

// Full taste-match breakdown between the viewer and another user: calibrated
// percent, the shared facets/shows behind it, and "from their shelf, for you"
// — their loved shows the viewer hasn't seen, ranked by the viewer's taste.
export default function TasteBreakdownScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const userIdValue = typeof params.id === "string" ? params.id : "";
  const { numColumns, itemWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });
  const pageStyle = useWebPageStyle(WEB_PAGE_MAX_WIDTH);

  const profile = useQuery(
    api.users.profile,
    isAuthenticated && userIdValue ? { userId: userIdValue } : "skip",
  );
  const getProfileTasteExperience = useAction(api.embeddings.getProfileTasteExperience);

  const [experience, setExperience] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !userIdValue) return;
    let cancelled = false;
    setIsLoading(true);
    getProfileTasteExperience({ userId: userIdValue })
      .then((result) => {
        if (!cancelled) setExperience(result);
      })
      .catch(() => {
        if (!cancelled) setExperience(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getProfileTasteExperience, isAuthenticated, userIdValue]);

  const handlePressFacet = useCallback((facetKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedPush(`/facet/${facetKey}`);
  }, []);

  const match = experience?.tasteMatch;
  const tier = match ? tasteMatchTier(match.percent) : null;
  const profileUser = (profile as any)?.user;
  const displayName: string | null =
    profileUser?.displayName ??
    profileUser?.name ??
    (profileUser?.username ? `@${profileUser.username}` : null);
  const sharedShows: any[] = match?.sharedFavoriteShows ?? [];
  const sharedFacets: any[] = match?.sharedFacets ?? [];
  const picks: any[] = (match?.picksForViewer ?? [])
    .map((pick: any) => pick.show)
    .filter(Boolean);

  return (
    <View className="flex-1 bg-dark-bg">
      {/* Header (band is full-bleed; inner content tracks the page column) */}
      <View
        className="pb-4 border-b border-dark-border"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="px-6" style={pageStyle}>
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
              <Text className="text-xl font-black text-text-primary">Taste match</Text>
              <Text className="text-xs font-semibold text-text-tertiary" numberOfLines={1}>
                {displayName ? `You and ${displayName}` : "The two of you"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : !match ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="sparkles" size={28} color="#6B7280" />
          <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
            Not enough history yet
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
            Taste match appears once you both have a few shows watched, rated, or favorited.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 48, ...pageStyle }}
        >
          {/* Hero */}
          <View className="px-6 pt-6">
            <View className="flex-row items-baseline gap-3">
              <Text className="text-[52px] font-black leading-[56px] text-text-primary">
                {match.percent}%
              </Text>
              <Text className="text-lg font-bold text-brand-300">{tier?.label}</Text>
            </View>
            <Text className="mt-1 text-sm leading-5 text-text-secondary">{tier?.blurb}</Text>
            <View className="mt-4">
              <TasteMatchMeter percent={match.percent} height={8} />
            </View>
            <Text className="mt-2 text-[11px] leading-4 text-text-tertiary">
              Calibrated against real watcher pairs — 50 is an average pair, not a failing
              grade. The tick marks average.
            </Text>
          </View>

          {/* Shared facets */}
          {sharedFacets.length > 0 ? (
            <View className="mt-7 px-6">
              <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                You both gravitate to
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {sharedFacets.map((facet: any) => (
                  <Pressable
                    key={facet.key}
                    onPress={() => handlePressFacet(facet.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${facet.title}`}
                    style={styles.facetChip}
                    className="active:opacity-75"
                  >
                    <Text className="text-[13px] font-semibold text-brand-300">
                      {facet.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color="#7DD3FC" />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* From their shelf, for you */}
          {picks.length > 0 ? (
            <View className="mt-7">
              <View className="px-6">
                <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                  From their shelf, for you
                </Text>
                <Text className="mt-1 text-[13px] leading-5 text-text-secondary">
                  {displayName
                    ? `Shows ${displayName} loves that you haven't seen — sorted by your taste.`
                    : "Shows they love that you haven't seen — sorted by your taste."}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12 }}
              >
                {picks.map((show: any) => (
                  <Pressable
                    key={show._id}
                    onPress={() => pressShow(show)}
                    className="mr-3 w-[118px] active:opacity-80"
                  >
                    <Poster uri={show.posterUrl ?? undefined} width={118} />
                    <Text
                      className="mt-2 text-xs font-medium text-text-primary"
                      numberOfLines={2}
                    >
                      {show.title}
                    </Text>
                    {show.year ? (
                      <Text className="mt-0.5 text-[11px] text-text-tertiary">{show.year}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Shared shows grid */}
          {sharedShows.length > 0 ? (
            <View className="mt-7 px-6">
              <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Shows you share
              </Text>
              <View className="mt-3 flex-row flex-wrap">
                {sharedShows.map((show: any, index: number) => {
                  const isLastInRow = index % numColumns === numColumns - 1;
                  return (
                    <Pressable
                      key={show._id ?? `${show.title}-${index}`}
                      onPress={() => pressShow(show)}
                      className="active:opacity-80"
                      style={{
                        width: itemWidth,
                        marginRight: isLastInRow ? 0 : GAP,
                        marginBottom: GAP,
                      }}
                    >
                      <Poster uri={show.posterUrl ?? undefined} width={itemWidth} />
                      <Text
                        className="mt-2 text-xs font-medium text-text-primary"
                        numberOfLines={2}
                      >
                        {show.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  facetChip: {
    alignItems: "center",
    backgroundColor: "rgba(56,189,248,0.12)",
    borderColor: "rgba(56,189,248,0.4)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
