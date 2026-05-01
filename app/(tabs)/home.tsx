import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { FlashList } from "../../components/FlashList";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useAuth, usePaginatedQuery, useQuery } from "../../lib/plotlist/react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import { ContactsSyncCard } from "../../components/ContactsSyncCard";
import { Screen } from "../../components/Screen";
import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { FeedItem, FeedItemProps } from "../../components/FeedItem";
import { ListRow } from "../../components/ListRow";
import { Poster } from "../../components/Poster";
import { RecommendationRail } from "../../components/RecommendationRail";
import { ReleaseCalendarPreview } from "../../components/ReleaseCalendarPreview";
import { UpNextRail } from "../../components/UpNextRail";
import { SecondaryButton } from "../../components/SecondaryButton";
import { UserRow } from "../../components/UserRow";
import { api } from "../../lib/plotlist/api";
import { getContactSyncAlertCopy } from "../../lib/contactSync";
import { loadDeviceContacts } from "../../lib/deviceContacts";
import { getContactsSyncDismissed, setContactsSyncDismissed } from "../../lib/preferences";

type CatalogItem = {
  externalSource: string;
  externalId: string;
  title: string;
  year?: number;
  posterUrl?: string;
  overview?: string;
};

type ProviderSection = {
  type: "provider";
  key: string;
  label: string;
  logoUrl: string;
  items: CatalogItem[];
};

type RankedCarouselItem = {
  show: (CatalogItem & { _id?: string }) | null | undefined;
  rank?: number;
  _id?: string;
};

type CarouselItem = CatalogItem | RankedCarouselItem;

function isRankedCarouselItem(
  item: CarouselItem,
): item is RankedCarouselItem {
  return "show" in item;
}

function getCarouselShow(item: CarouselItem) {
  const show = isRankedCarouselItem(item) ? item.show : item;

  return show;
}

function getRecommendationItemKey(item: {
  showId?: string;
  _id?: string;
  externalId?: string;
  title?: string;
}) {
  return item.showId ?? item._id ?? item.externalId ?? item.title ?? null;
}

function dedupeRecommendationItems<T extends {
  showId?: string;
  _id?: string;
  externalId?: string;
  title?: string;
}>(items: T[]) {
  const localSeenKeys = new Set<string>();

  return items.filter((item) => {
    const key = getRecommendationItemKey(item);
    if (!key) {
      return true;
    }
    if (localSeenKeys.has(key)) {
      return false;
    }
    localSeenKeys.add(key);
    return true;
  });
}

function selectRecommendationRailItems<T extends {
  showId?: string;
  _id?: string;
  externalId?: string;
  title?: string;
}>(
  items: T[],
  seenKeys: Set<string>,
  minimumFreshItems: number,
) {
  const uniqueItems = dedupeRecommendationItems(items);
  const freshItems = uniqueItems.filter((item) => {
    const key = getRecommendationItemKey(item);
    return !key || !seenKeys.has(key);
  });
  const selectedItems = freshItems.length >= minimumFreshItems ? freshItems : uniqueItems;

  selectedItems.forEach((item) => {
    const key = getRecommendationItemKey(item);
    if (key) {
      seenKeys.add(key);
    }
  });

  return selectedItems;
}

type SectionData =
  | { type: "header" }
  | { type: "up-next" }
  | { type: "release-calendar" }
  | { type: "contact-sync" }
  | { type: "contacts"; items: Array<any> }
  | { type: "for-you"; items: Array<any> }
  | { type: "taste-rail"; title: string; description?: string; items: Array<any> }
  | { type: "similar-taste"; items: Array<any> }
  | { type: "taste-lists"; items: Array<any> }
  | { type: "trending"; items: Array<{ rank: number; score: number; show: any }> }
  | { type: "most-reviewed"; items: Array<{ rank: number; reviewCount: number; avgRating: number; show: any }> }
  | { type: "popular-tmdb"; items: CatalogItem[] }
  | { type: "on-the-air"; items: CatalogItem[] }
  | ProviderSection
  | { type: "suggested"; items: Array<any> }
  | { type: "feed-header" }
  | { type: "feed-item"; item: FeedItemProps }
  | { type: "feed-empty" };

export default function HomeScreen() {
  const { isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [contactsSyncDismissed, setContactsSyncDismissedState] = useState<boolean | null>(null);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const hasProfile = Boolean(me?._id);

  const {
    results: feed,
    status: feedStatus,
    loadMore,
  } = usePaginatedQuery(
    api.feed.listForUser,
    hasProfile ? {} : "skip",
    { initialNumItems: 20 },
  );
  const trending = useQuery(api.trending.shows, { windowHours: 96, limit: 10 }) ?? [];
  const mostReviewed = useQuery(api.trending.mostReviewed, { limit: 10 }) ?? [];
  const contactStatus =
    useQuery(api.contacts.getStatus, hasProfile ? {} : "skip") ?? null;
  const contactMatches =
    useQuery(
      api.contacts.getMatches,
      hasProfile && contactStatus?.hasSynced ? { limit: 3 } : "skip",
    ) ?? [];
  const suggested =
    useQuery(api.users.suggested, hasProfile ? { limit: 3 } : "skip") ?? [];
  const syncContacts = useAction(api.contacts.syncSnapshot);
  const getTmdbList = useAction(api.shows.getTmdbList);
  const ingestFromCatalog = useAction(api.shows.ingestFromCatalog);
  const getPersonalizedRecommendations = useAction(api.embeddings.getPersonalizedRecommendations);
  const getHomeRecommendationRails = useAction(api.embeddings.getHomeRecommendationRails);
  const getSimilarTasteUsers = useAction(api.embeddings.getSimilarTasteUsers);
  const getListsFromSimilarTasteUsers = useAction(api.embeddings.getListsFromSimilarTasteUsers);
  const getSmartLists = useAction(api.embeddings.getSmartLists);

  const feedIsEmpty = feed.length === 0 && feedStatus !== "LoadingFirstPage";

  const [popularShows, setPopularShows] = useState<CatalogItem[]>([]);
  const [onTheAirShows, setOnTheAirShows] = useState<CatalogItem[]>([]);
  const [forYouShows, setForYouShows] = useState<any[]>([]);
  const [tasteRails, setTasteRails] = useState<any[]>([]);
  const [smartLists, setSmartLists] = useState<any[]>([]);
  const [similarTasteUsers, setSimilarTasteUsers] = useState<any[]>([]);
  const [tasteLists, setTasteLists] = useState<any[]>([]);
  const [providerSections, setProviderSections] = useState<
    Array<{ key: string; label: string; logoUrl: string; items: CatalogItem[] }>
  >([]);

  const TMDB_LOGO = (path: string) => `https://image.tmdb.org/t/p/w92${path}`;
  const providers = useMemo(() => [
    { key: "netflix", category: "netflix" as const, label: "Netflix", logoUrl: TMDB_LOGO("/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg") },
    { key: "apple_tv", category: "apple_tv" as const, label: "Apple TV", logoUrl: TMDB_LOGO("/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg") },
    { key: "max", category: "max" as const, label: "HBO Max", logoUrl: TMDB_LOGO("/jbe4gVSfRlbPTdESXhEKpornsfu.jpg") },
    { key: "disney_plus", category: "disney_plus" as const, label: "Disney+", logoUrl: TMDB_LOGO("/97yvRBw1GzX7fXprcF80er19ot.jpg") },
    { key: "hulu", category: "hulu" as const, label: "Hulu", logoUrl: TMDB_LOGO("/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg") },
    { key: "prime_video", category: "prime_video" as const, label: "Prime Video", logoUrl: TMDB_LOGO("/pvske1MyAoymrs5bguRfVqYiM9a.jpg") },
  ], []);

  useEffect(() => {
    if (!hasProfile) return;
    getContactsSyncDismissed().then(setContactsSyncDismissedState);
  }, [hasProfile]);

  useEffect(() => {
    if (!hasProfile) {
      setForYouShows([]);
      setTasteRails([]);
      setSmartLists([]);
      setSimilarTasteUsers([]);
      setTasteLists([]);
      return;
    }

    setForYouShows([]);
    setTasteRails([]);
    setSmartLists([]);
    setSimilarTasteUsers([]);
    setTasteLists([]);

    let cancelled = false;
    const runLoader = async <T,>(
      loader: () => Promise<T>,
      onSuccess: (value: T) => void,
    ) => {
      try {
        const value = await loader();
        if (!cancelled) {
          onSuccess(value);
        }
      } catch {
        // Keep the rest of the home screen rendering even if one rail fails.
      }
    };

    void runLoader(
      () => getPersonalizedRecommendations({ limit: 12 }),
      (personalized) => setForYouShows(personalized),
    );
    void runLoader(
      () => getHomeRecommendationRails({ limitPerRail: 10 }),
      (rails) => setTasteRails(rails),
    );
    void runLoader(
      () => getSimilarTasteUsers({ limit: 4 }),
      (similarUsers) => setSimilarTasteUsers(similarUsers),
    );
    void runLoader(
      () => getListsFromSimilarTasteUsers({ limit: 4 }),
      (lists) => setTasteLists(lists),
    );
    void runLoader(
      () => getSmartLists({ limitPerList: 10 }),
      (smart) => setSmartLists(smart),
    );

    return () => {
      cancelled = true;
    };
  }, [
    getHomeRecommendationRails,
    getListsFromSimilarTasteUsers,
    getPersonalizedRecommendations,
    getSimilarTasteUsers,
    getSmartLists,
    hasProfile,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !feedIsEmpty) return;

    setPopularShows([]);
    setOnTheAirShows([]);
    setProviderSections([]);

    let cancelled = false;
    const providerOrder = new Map(
      providers.map((provider, index) => [provider.key, index]),
    );
    const runLoader = async <T,>(
      loader: () => Promise<T>,
      onSuccess: (value: T) => void,
    ) => {
      try {
        const value = await loader();
        if (!cancelled) {
          onSuccess(value);
        }
      } catch {
        // Ignore individual discovery rail failures so the rest can render.
      }
    };

    void runLoader(
      () => getTmdbList({ category: "popular", limit: 12 }),
      (results) => setPopularShows(results),
    );
    void runLoader(
      () => getTmdbList({ category: "on_the_air", limit: 12 }),
      (results) => setOnTheAirShows(results),
    );

    providers.forEach((provider) => {
      void runLoader(
        () => getTmdbList({ category: provider.category, limit: 12 }),
        (items) => {
          setProviderSections((current) => {
            const next = current.filter((section) => section.key !== provider.key);
            if (items.length > 0) {
              next.push({
                key: provider.key,
                label: provider.label,
                logoUrl: provider.logoUrl,
                items,
              });
            }

            next.sort(
              (left, right) =>
                (providerOrder.get(left.key) ?? 0) - (providerOrder.get(right.key) ?? 0),
            );

            return next;
          });
        },
      );
    });

    return () => { cancelled = true; };
  }, [isAuthenticated, feedIsEmpty, getTmdbList, providers]);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const handleSyncContacts = useCallback(async () => {
    try {
      setSyncingContacts(true);
      const entries = await loadDeviceContacts();
      const result = await syncContacts({ entries });
      await setContactsSyncDismissed(false);
      setContactsSyncDismissedState(false);
      const copy = getContactSyncAlertCopy(result);
      Alert.alert(copy.title, copy.message);
    } catch (error) {
      Alert.alert("Could not sync contacts", String(error));
    } finally {
      setSyncingContacts(false);
    }
  }, [syncContacts]);

  const handleAddFromCatalog = useCallback(
    async (item: CatalogItem) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const showId = await ingestFromCatalog({
          externalSource: item.externalSource,
          externalId: item.externalId,
          title: item.title,
          year: item.year,
          overview: item.overview,
          posterUrl: item.posterUrl,
        });
        router.push(`/show/${showId}`);
      } catch (error) {
        Alert.alert("Could not add show", String(error));
      }
    },
    [ingestFromCatalog],
  );

  const sections: SectionData[] = useMemo(() => {
    const result: SectionData[] = [{ type: "header" }];
    const seenRecommendationKeys = new Set<string>();

    if (
      hasProfile &&
      !contactStatus?.hasSynced &&
      contactsSyncDismissed === false
    ) {
      result.push({ type: "contact-sync" });
    }

    if (contactMatches.length > 0) {
      result.push({ type: "contacts", items: contactMatches });
    }

    if (hasProfile) {
      result.push({ type: "up-next" });
      result.push({ type: "release-calendar" });
    }

    if (trending.length >= 5) {
      result.push({ type: "trending", items: trending });
    }

    const uniqueForYouShows = selectRecommendationRailItems(
      forYouShows,
      seenRecommendationKeys,
      1,
    );
    if (uniqueForYouShows.length > 0) {
      result.push({ type: "for-you", items: uniqueForYouShows });
    }

    tasteRails.forEach((rail) => {
      const uniqueItems = selectRecommendationRailItems(
        rail.items ?? [],
        seenRecommendationKeys,
        5,
      );
      if (uniqueItems.length > 0) {
        result.push({
          type: "taste-rail",
          title: rail.title,
          description: rail.description,
          items: uniqueItems,
        });
      }
    });

    if (similarTasteUsers.length > 0) {
      result.push({ type: "similar-taste", items: similarTasteUsers });
    }

    if (tasteLists.length > 0) {
      result.push({ type: "taste-lists", items: tasteLists });
    }

    smartLists.forEach((rail) => {
      const uniqueItems = selectRecommendationRailItems(
        rail.items ?? [],
        seenRecommendationKeys,
        5,
      );
      if (uniqueItems.length > 0) {
        result.push({
          type: "taste-rail",
          title: rail.title,
          description: rail.description,
          items: uniqueItems,
        });
      }
    });

    if (feedIsEmpty && mostReviewed.length > 0) {
      const trendingShowIds = new Set(
        trending
          .map((t: { show?: { _id?: string } | null }) => t.show?._id)
          .filter((id: string | undefined): id is string => Boolean(id)),
      );
      const dedupedReviewed = mostReviewed.filter(
        (item: { show?: { _id?: string } | null }) =>
          !trendingShowIds.has(item.show?._id ?? ""),
      );
      if (dedupedReviewed.length > 0) {
        result.push({ type: "most-reviewed", items: dedupedReviewed });
      }
    }

    if (feedIsEmpty && popularShows.length > 0) {
      result.push({ type: "popular-tmdb", items: popularShows });
    }

    if (feedIsEmpty && onTheAirShows.length > 0) {
      result.push({ type: "on-the-air", items: onTheAirShows });
    }

    for (const section of providerSections) {
      if (feedIsEmpty && section.items.length > 0) {
        result.push({
          type: "provider",
          key: section.key,
          label: section.label,
          logoUrl: section.logoUrl,
          items: section.items,
        });
      }
    }

    if (suggested.length > 0) {
      result.push({ type: "suggested", items: suggested });
    }

    result.push({ type: "feed-header" });

    if (feed.length > 0) {
      feed.forEach((item) => {
        result.push({ type: "feed-item", item });
      });
    } else {
      result.push({ type: "feed-empty" });
    }

    return result;
  }, [
    contactMatches,
    contactStatus?.hasSynced,
    contactsSyncDismissed,
    feed,
    feedIsEmpty,
    hasProfile,
    mostReviewed,
    onTheAirShows,
    popularShows,
    providerSections,
    forYouShows,
    smartLists,
    suggested,
    similarTasteUsers,
    tasteLists,
    tasteRails,
    trending,
  ]);

  const renderShowCarousel = useCallback(
    (items: CarouselItem[], onPress: (item: CarouselItem) => void) => (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}
      >
        {items.map((item, index) => {
          const show = getCarouselShow(item);
          const key = isRankedCarouselItem(item)
            ? item.show?._id ?? String(index)
            : item.externalId;
          return (
            <Animated.View key={key} entering={FadeInRight.delay(index * 50)}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPress(item);
                }}
                className="w-28 active:opacity-80"
              >
                <Poster uri={show?.posterUrl} size="md" />
                <Text className="mt-2 text-sm font-semibold text-text-primary" numberOfLines={2}>
                  {show?.title ?? "Unknown"}
                </Text>
                {show?.year ? (
                  <Text className="text-xs text-text-tertiary">{show.year}</Text>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    ),
    [],
  );

  const renderSection = useCallback(
    ({ item }: { item: SectionData }) => {
      switch (item.type) {
        case "header":
          return (
            <View className="px-6 pt-6">
              <Text className="text-3xl font-bold tracking-tight text-text-primary">Home</Text>
              <Text className="mt-1 text-sm text-text-tertiary">
                {feedIsEmpty
                  ? "Discover shows and follow friends to build your feed."
                  : "Updates from people you follow and what's trending now."}
              </Text>
            </View>
          );

        case "up-next":
          return <UpNextRail />;

        case "release-calendar":
          return <ReleaseCalendarPreview />;

        case "trending":
          return (
            <View className="mt-6">
              <View className="px-6">
                <SectionHeader title="Trending Now" />
              </View>
              <View className="mt-4 h-56">
                {renderShowCarousel(item.items, (trendingItem) => {
                  if (isRankedCarouselItem(trendingItem) && trendingItem.show?._id) {
                    router.push(`/show/${trendingItem.show._id}`);
                  }
                })}
              </View>
            </View>
          );

        case "for-you":
          return (
            <View className="mt-6">
              <View className="px-6 flex-row items-center gap-2">
                <Ionicons name="sparkles" size={16} color="#22c55e" />
                <Text className="text-lg font-semibold text-text-primary">
                  Picked for You
                </Text>
              </View>
              <View className="mt-4 h-56">
                {renderShowCarousel(
                  item.items.map((entry: any) => ({ show: { ...entry, _id: entry.showId } })),
                  (recommendedItem) => {
                    if (isRankedCarouselItem(recommendedItem) && recommendedItem.show?._id) {
                      router.push(`/show/${recommendedItem.show._id}`);
                    }
                  },
                )}
              </View>
            </View>
          );

        case "taste-rail":
          return (
            <RecommendationRail
              title={item.title}
              description={item.description}
              items={item.items}
            />
          );

        case "similar-taste":
          return (
            <View className="mt-8 px-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-text-primary">People with similar taste</Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/search?mode=people");
                  }}
                  className="active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-text-tertiary">See more</Text>
                </Pressable>
              </View>
              <View className="mt-4 gap-3">
                {item.items.map((candidate) => (
                  <UserRow
                    key={candidate.user._id}
                    userId={candidate.user._id}
                    displayName={candidate.user.displayName ?? candidate.user.name}
                    username={candidate.user.username}
                    avatarUrl={candidate.avatarUrl}
                    isFollowing={candidate.isFollowing}
                    followsYou={candidate.followsYou}
                    isMutualFollow={candidate.isMutualFollow}
                    mutualCount={candidate.mutualCount}
                    inContacts={candidate.inContacts}
                    subtitle={candidate.subtitle}
                    taste={candidate.taste}
                  />
                ))}
              </View>
            </View>
          );

        case "taste-lists":
          return (
            <View className="mt-8 px-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-text-primary">Lists from people like you</Text>
              </View>
              <View className="mt-4 gap-3">
                {item.items.map((listItem) => (
                  <ListRow
                    key={listItem._id}
                    id={listItem._id}
                    title={listItem.title}
                    description={listItem.description ?? `By ${listItem.ownerName}`}
                  />
                ))}
              </View>
            </View>
          );

        case "most-reviewed":
          return (
            <View className="mt-6">
              <View className="px-6 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="star" size={16} color="#f59e0b" />
                  <Text className="text-lg font-semibold text-text-primary">
                    Popular on Plotlist
                  </Text>
                </View>
              </View>
              <View className="mt-4 h-56">
                {renderShowCarousel(item.items, (reviewedItem) => {
                  if (isRankedCarouselItem(reviewedItem) && reviewedItem.show?._id) {
                    router.push(`/show/${reviewedItem.show._id}`);
                  }
                })}
              </View>
            </View>
          );

        case "popular-tmdb":
          return (
            <View className="mt-6">
              <View className="px-6 flex-row items-center gap-2">
                <Ionicons name="flame" size={16} color="#ef4444" />
                <Text className="text-lg font-semibold text-text-primary">
                  Popular Right Now
                </Text>
              </View>
              <View className="mt-4 h-56">
                {renderShowCarousel(item.items, (catalogItem) => {
                  if (!isRankedCarouselItem(catalogItem)) {
                    handleAddFromCatalog(catalogItem as CatalogItem);
                  }
                })}
              </View>
            </View>
          );

        case "on-the-air":
          return (
            <View className="mt-6">
              <View className="px-6 flex-row items-center gap-2">
                <Ionicons name="tv" size={16} color="#0ea5e9" />
                <Text className="text-lg font-semibold text-text-primary">
                  Airing This Week
                </Text>
              </View>
              <View className="mt-4 h-56">
                {renderShowCarousel(item.items, (catalogItem) => {
                  if (!isRankedCarouselItem(catalogItem)) {
                    handleAddFromCatalog(catalogItem as CatalogItem);
                  }
                })}
              </View>
            </View>
          );

        case "provider":
          return (
            <View className="mt-6">
              <View className="px-6 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2.5">
                  <Image
                    source={{ uri: item.logoUrl }}
                    style={{ width: 24, height: 24, borderRadius: 6 }}
                    contentFit="cover"
                  />
                  <Text className="text-lg font-semibold text-text-primary">
                    {item.label}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/provider/${item.key}`);
                  }}
                  className="active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-text-tertiary">See all</Text>
                </Pressable>
              </View>
              <View className="mt-4 h-56">
                {renderShowCarousel(item.items, (catalogItem) => {
                  if (!isRankedCarouselItem(catalogItem)) {
                    handleAddFromCatalog(catalogItem as CatalogItem);
                  }
                })}
              </View>
            </View>
          );

        case "contact-sync":
          return (
            <View className="mt-8 px-6">
              <ContactsSyncCard
                title="Find friends from your contacts"
                description="Sync your address book to surface people you already know on Plotlist."
                buttonLabel="Sync contacts"
                onPress={handleSyncContacts}
                onDismiss={async () => {
                  await setContactsSyncDismissed(true);
                  setContactsSyncDismissedState(true);
                }}
                loading={syncingContacts}
              />
            </View>
          );

        case "contacts":
          return (
            <View className="mt-8 px-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-text-primary">From your contacts</Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/search?mode=people");
                  }}
                  className="active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-text-tertiary">View all</Text>
                </Pressable>
              </View>
              <View className="mt-4 gap-3">
                {item.items.map((contactItem) => (
                  <UserRow
                    key={contactItem.user._id}
                    userId={contactItem.user._id}
                    displayName={contactItem.user.displayName ?? contactItem.user.name}
                    username={contactItem.user.username}
                    avatarUrl={contactItem.avatarUrl}
                    isFollowing={contactItem.isFollowing}
                    followsYou={contactItem.followsYou}
                    isMutualFollow={contactItem.isMutualFollow}
                    mutualCount={contactItem.mutualCount}
                    inContacts={contactItem.inContacts}
                  />
                ))}
              </View>
            </View>
          );

        case "suggested":
          return (
            <View className="mt-8 px-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-semibold text-text-primary">People you may know</Text>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/search?mode=people");
                  }}
                  className="active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-text-tertiary">Find friends</Text>
                </Pressable>
              </View>
              <View className="mt-4 gap-3">
                {item.items.map((suggestedItem) => (
                  <UserRow
                    key={suggestedItem.user._id}
                    userId={suggestedItem.user._id}
                    displayName={suggestedItem.user.displayName ?? suggestedItem.user.name}
                    username={suggestedItem.user.username}
                    avatarUrl={suggestedItem.avatarUrl}
                    isFollowing={suggestedItem.isFollowing}
                    followsYou={suggestedItem.followsYou}
                    isMutualFollow={suggestedItem.isMutualFollow}
                    mutualCount={suggestedItem.mutualCount}
                    inContacts={suggestedItem.inContacts}
                  />
                ))}
              </View>
            </View>
          );

        case "feed-header":
          return (
            <View className="mt-8 px-6">
              <SectionHeader title="Your feed" />
            </View>
          );

        case "feed-item":
          return (
            <View className="px-6 pt-4">
              <FeedItem item={item.item} />
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
    [feedIsEmpty, handleAddFromCatalog, handleSyncContacts, renderShowCarousel, syncingContacts],
  );

  return (
    <Screen hasTabBar>
      <FlashList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item: SectionData, index: number) =>
          item.type === "provider" ? `provider-${item.key}` : `${item.type}-${index}`
        }
        estimatedItemSize={200}
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
          ) : feedStatus === "LoadingFirstPage" ? (
            <View className="items-center justify-center py-16">
              <ActivityIndicator size="small" color="#0ea5e9" />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
