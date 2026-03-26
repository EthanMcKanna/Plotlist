import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useConvex, useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";

import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { FeedItem, FeedItemProps } from "../../components/FeedItem";
import { Poster } from "../../components/Poster";
import { SecondaryButton } from "../../components/SecondaryButton";
import { UpNextRailContent } from "../../components/UpNextRail";
import { api } from "../../convex/_generated/api";

/* ── Types ──────────────────────────────────────────── */

type SectionData =
  | { type: "header" }
  | { type: "up-next" }
  | { type: "popular"; items: Array<{ rank: number; reviewCount: number; avgRating: number; show: any }> }
  | { type: "friends-popular"; items: Array<{ rank: number; friendCount: number; show: any; friends: Array<{ _id: string; displayName?: string; username?: string; avatarUrl: string | null }> }> }
  | { type: "feed-divider" }
  | { type: "feed-item"; item: FeedItemProps }
  | { type: "feed-empty" }
  | { type: "feed-loading" };

/* ── Popular Show Card ──────────────────────────────── */

function PopularShowCard({
  show,
  rank,
  reviewCount,
  avgRating,
}: {
  show: any;
  rank: number;
  reviewCount: number;
  avgRating: number;
}) {
  if (!show) return null;
  return (
    <Animated.View entering={FadeInRight.delay(rank * 60).duration(400)}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (show._id) router.push(`/show/${show._id}`);
        }}
        className="w-[110px] active:opacity-80"
      >
        <View>
          <Poster uri={show.posterUrl} size="md" width={110} />
          {/* Rank badge */}
          <View
            className="absolute -left-1.5 -top-1.5 items-center justify-center rounded-full bg-dark-bg"
            style={{ width: 26, height: 26, borderWidth: 2, borderColor: "#2A2E38" }}
          >
            <Text className="text-xs font-bold text-text-primary">{rank}</Text>
          </View>
        </View>
        <Text className="mt-2 text-sm font-semibold text-text-primary" numberOfLines={2}>
          {show.title}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <Text className="text-xs text-amber-400">★ {avgRating.toFixed(1)}</Text>
          <Text className="text-xs text-text-tertiary">·</Text>
          <Text className="text-xs text-text-tertiary">
            {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ── Friends Popular Card ───────────────────────────── */

function FriendsPopularCard({
  show,
  friendCount,
  friends,
  index,
}: {
  show: any;
  friendCount: number;
  friends: Array<{ _id: string; displayName?: string; username?: string; avatarUrl: string | null }>;
  index: number;
}) {
  if (!show) return null;
  return (
    <Animated.View entering={FadeInRight.delay(index * 60).duration(400)}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (show._id) router.push(`/show/${show._id}`);
        }}
        className="w-[110px] active:opacity-80"
      >
        <Poster uri={show.posterUrl} size="md" width={110} />
        <Text className="mt-2 text-sm font-semibold text-text-primary" numberOfLines={2}>
          {show.title}
        </Text>
        <View className="mt-1.5 flex-row items-center gap-1">
          <Ionicons name="people-outline" size={12} color="#5A6070" />
          <Text className="flex-1 text-xs text-text-tertiary" numberOfLines={1}>
            {friendCount === 1
              ? friends[0]?.displayName ?? friends[0]?.username ?? "1 friend"
              : `${friendCount} friends`}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ── Home Screen ────────────────────────────────────── */

export default function HomeScreen() {
  const convex = useConvex();
  const isScreenFocused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [mostReviewed, setMostReviewed] = useState<Array<{ rank: number; reviewCount: number; avgRating: number; show: any }>>([]);
  const [friendsPopular, setFriendsPopular] = useState<Array<{ rank: number; friendCount: number; show: any; friends: Array<{ _id: string; displayName?: string; username?: string; avatarUrl: string | null }> }>>([]);
  const me = useQuery(api.users.me, isAuthenticated && isScreenFocused ? {} : "skip");
  const hasProfile = Boolean(me?._id);

  const {
    results: feed,
    status: feedStatus,
    loadMore,
  } = usePaginatedQuery(
    api.feed.listForUser,
    hasProfile && isScreenFocused ? {} : "skip",
    { initialNumItems: 20 },
  );

  const loadHomeSnapshots = useCallback(async () => {
    if (!isScreenFocused) {
      return null;
    }

    const [popular, friends] = await Promise.all([
      convex.query(api.trending.mostReviewed, { limit: 10 }),
      hasProfile
        ? convex.query(api.trending.popularWithFriends, { limit: 10 })
        : Promise.resolve([]),
    ]);

    return { popular, friends };
  }, [convex, hasProfile, isScreenFocused]);

  useEffect(() => {
    let cancelled = false;

    if (!isScreenFocused) {
      return;
    }

    void loadHomeSnapshots()
      .then((snapshots) => {
        if (!cancelled && snapshots) {
          setMostReviewed(snapshots.popular);
          setFriendsPopular(snapshots.friends);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMostReviewed([]);
          setFriendsPopular([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isScreenFocused, loadHomeSnapshots]);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      const snapshots = await loadHomeSnapshots();
      if (snapshots) {
        setMostReviewed(snapshots.popular);
        setFriendsPopular(snapshots.friends);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      setRefreshing(false);
    }
  }, [loadHomeSnapshots]);

  /* ── Build section list ─── */
  const sections: SectionData[] = useMemo(() => {
    const result: SectionData[] = [{ type: "header" }];

    if (hasProfile && isScreenFocused) {
      result.push({ type: "up-next" });
    }

    // Friends Popular — top social signal
    if (friendsPopular.length > 0) {
      result.push({ type: "friends-popular", items: friendsPopular });
    }

    // Popular on Plotlist
    if (mostReviewed.length > 0) {
      result.push({ type: "popular", items: mostReviewed });
    }

    // Feed divider
    result.push({ type: "feed-divider" });

    // Feed content
    if (feed.length > 0) {
      feed.forEach((item) => {
        result.push({ type: "feed-item", item });
      });
    } else if (feedStatus === "LoadingFirstPage") {
      result.push({ type: "feed-loading" });
    } else {
      result.push({ type: "feed-empty" });
    }

    return result;
  }, [feed, feedStatus, friendsPopular, hasProfile, isScreenFocused, mostReviewed]);

  /* ── Section renderer ─── */
  const renderSection = useCallback(
    ({ item }: { item: SectionData }) => {
      switch (item.type) {
        case "header":
          return (
            <Animated.View entering={FadeIn.duration(500)} className="px-6 pt-6 pb-1">
              <Text className="text-3xl font-bold tracking-tight text-text-primary">Home</Text>
            </Animated.View>
          );

        case "up-next":
          return <UpNextRailContent enabled={isScreenFocused} />;

        case "friends-popular":
          return (
            <View className="mt-6">
              <View className="px-6 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="people" size={16} color="#a78bfa" />
                  <Text className="text-lg font-semibold text-text-primary">
                    Popular with Friends
                  </Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, gap: 14, paddingTop: 16 }}
              >
                {item.items.map((entry, index) => (
                  <FriendsPopularCard
                    key={entry.show?._id ?? index}
                    show={entry.show}
                    friendCount={entry.friendCount}
                    friends={entry.friends}
                    index={index}
                  />
                ))}
              </ScrollView>
            </View>
          );

        case "popular":
          return (
            <View className="mt-8">
              <View className="px-6 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="star" size={16} color="#f59e0b" />
                  <Text className="text-lg font-semibold text-text-primary">
                    Popular on Plotlist
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/search?mode=shows");
                  }}
                  className="active:opacity-80"
                >
                  <Text className="text-sm font-medium text-text-tertiary">See all</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, gap: 14, paddingTop: 16 }}
              >
                {item.items.map((entry) => (
                  <PopularShowCard
                    key={entry.show?._id ?? entry.rank}
                    show={entry.show}
                    rank={entry.rank}
                    reviewCount={entry.reviewCount}
                    avgRating={entry.avgRating}
                  />
                ))}
              </ScrollView>
            </View>
          );

        case "feed-divider":
          return (
            <View className="mt-8 mb-2 px-6">
              <View className="h-px bg-dark-border" />
              <View className="mt-5 flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-text-primary">Activity</Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/search?mode=people");
                  }}
                  className="active:opacity-80"
                >
                  <Text className="text-sm font-medium text-text-tertiary">Find friends</Text>
                </Pressable>
              </View>
            </View>
          );

        case "feed-item":
          return (
            <View className="px-6 py-2">
              <FeedItem item={item.item} />
            </View>
          );

        case "feed-loading":
          return (
            <View className="items-center justify-center py-16">
              <ActivityIndicator size="small" color="#0ea5e9" />
            </View>
          );

        case "feed-empty":
          return (
            <View className="px-6 pt-4">
              <EmptyState
                title="Your feed is quiet"
                description="Follow friends and review shows — their activity will appear here."
              />
              <View className="mt-4 flex-row gap-3">
                <SecondaryButton
                  label="Find friends"
                  onPress={() => router.push("/search?mode=people")}
                  className="flex-1"
                />
                <SecondaryButton
                  label="Browse shows"
                  onPress={() => router.push("/search?mode=shows")}
                  className="flex-1"
                />
              </View>
            </View>
          );

        default:
          return null;
      }
    },
    [isScreenFocused],
  );

  return (
    <Screen hasTabBar>
      <FlashList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item: SectionData, index: number) => `${item.type}-${index}`}
        estimatedItemSize={120}
        contentContainerStyle={{ paddingBottom: 100 }}
        onEndReached={() => {
          if (feedStatus === "CanLoadMore") {
            loadMore(20);
          }
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0ea5e9"
          />
        }
        ListFooterComponent={
          feedStatus === "LoadingMore" ? (
            <View className="px-6 py-4">
              <Text className="text-sm text-text-tertiary">Loading more…</Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
