import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useAction,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { EmptyState } from "../../components/EmptyState";
import { ReviewRow } from "../../components/ReviewRow";
import { StarRating } from "../../components/StarRating";
import { CastMember } from "../../components/CastMember";
import { VideoPlayer } from "../../components/VideoPlayer";
import { SimilarShowCard } from "../../components/SimilarShowCard";
import { Avatar } from "../../components/Avatar";
import { formatDate } from "../../lib/format";
import { StatusSelector } from "../../components/StatusSelector";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BACKDROP_HEIGHT = 340;
const POSTER_HEIGHT = 240;
const POSTER_WIDTH = 160;
const INITIAL_VISIBLE_SEASONS = 3;

export default function ShowScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showId = (typeof params.id === "string" ? params.id : "") as Id<"shows">;

  const { isAuthenticated } = useConvexAuth();
  const show = useQuery(api.shows.get, { showId });
  const me = useQuery(api.users.me);
  const watchState = useQuery(
    api.watchStates.getForShow,
    isAuthenticated ? { showId } : "skip"
  );
  const {
    results: reviews,
    status: reviewsStatus,
    loadMore: loadMoreReviews,
  } = usePaginatedQuery(
    api.reviews.listForShowDetailed,
    { showId },
    { initialNumItems: 20 }
  );
  const { results: lists } = usePaginatedQuery(
    api.lists.listForUser,
    isAuthenticated && me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 20 }
  );

  const setStatus = useMutation(api.watchStates.setStatus).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(
        api.watchStates.getForShow,
        { showId: args.showId },
        {
          _id: `optimistic:${args.showId}`,
          userId: "me",
          showId: args.showId,
          status: args.status,
          updatedAt: Date.now(),
        }
      );
    }
  );
  const removeStatus = useMutation(api.watchStates.removeStatus).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(
        api.watchStates.getForShow,
        { showId: args.showId },
        null
      );
    }
  );
  const createReview = useMutation(api.reviews.create);
  const toggleListItem = useMutation(api.listItems.toggle);
  const listMembership = useQuery(
    api.listItems.getShowMembership,
    isAuthenticated ? { showId } : "skip",
  );
  const memberSet = useMemo(
    () => new Set(listMembership ?? []),
    [listMembership],
  );
  const getExtendedDetails = useAction(api.shows.getExtendedDetails);
  const getSeasonDetails = useAction(api.shows.getSeasonDetails);

  const [extendedDetails, setExtendedDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [seasonDetailsByNumber, setSeasonDetailsByNumber] = useState<Record<number, any>>(
    {}
  );
  const [loadingSeasonNumbers, setLoadingSeasonNumbers] = useState<Set<number>>(new Set());
  const [episodeGuideExpanded, setEpisodeGuideExpanded] = useState<boolean | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<{
    episode: any;
    seasonName: string;
  } | null>(null);
  const [episodeSheetVisible, setEpisodeSheetVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [listPickerVisible, setListPickerVisible] = useState(false);
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);

  useEffect(() => {
    const fetchExtendedDetails = async () => {
      if (!show?.externalId) return;
      setLoadingDetails(true);
      try {
        const details = await getExtendedDetails({ externalId: show.externalId });
        setExtendedDetails(details);
      } catch (error) {
        console.error("Failed to fetch extended details:", error);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchExtendedDetails();
  }, [show?.externalId, getExtendedDetails]);

  const seasonOptions = useMemo(
    () =>
      (extendedDetails?.seasons ?? [])
        .filter((season: any) => season.season_number > 0)
        .sort((a: any, b: any) => a.season_number - b.season_number),
    [extendedDetails?.seasons]
  );

  useEffect(() => {
    setSeasonDetailsByNumber({});
    setLoadingSeasonNumbers(new Set());
    setEpisodeGuideExpanded(null);
    setSelectedEpisode(null);
    setEpisodeSheetVisible(false);
  }, [show?.externalId]);

  // Clear episode content after sheet dismiss animation (fallback if onDismiss doesn't fire)
  useEffect(() => {
    if (!episodeSheetVisible && selectedEpisode) {
      const id = setTimeout(() => setSelectedEpisode(null), 400);
      return () => clearTimeout(id);
    }
  }, [episodeSheetVisible, selectedEpisode]);

  const visibleSeasonNumbers = useMemo<number[]>(
    () =>
      (episodeGuideExpanded ?? false
        ? seasonOptions
        : seasonOptions.slice(0, INITIAL_VISIBLE_SEASONS)
      ).map((season: any) => season.season_number),
    [episodeGuideExpanded, seasonOptions],
  );

  useEffect(() => {
    if (!show?.externalId || visibleSeasonNumbers.length === 0) return;

    let cancelled = false;
    const missingSeasonNumbers = visibleSeasonNumbers.filter(
      (seasonNumber: number) =>
        seasonDetailsByNumber[seasonNumber] === undefined &&
        !loadingSeasonNumbers.has(seasonNumber),
    );

    if (missingSeasonNumbers.length === 0) return;

    const loadVisibleSeasons = async () => {
      await Promise.all(
        missingSeasonNumbers.map(async (seasonNumber: number) => {
          setLoadingSeasonNumbers((prev) => new Set(prev).add(seasonNumber));
          try {
            const details = await getSeasonDetails({
              externalId: show.externalId,
              seasonNumber,
            });
            if (cancelled) return;
            setSeasonDetailsByNumber((current) => ({
              ...current,
              [seasonNumber]: details,
            }));
          } catch (error) {
            if (!cancelled) {
              console.error("Failed to fetch season details:", error);
            }
          } finally {
            if (!cancelled) {
              setLoadingSeasonNumbers((prev) => {
                const next = new Set(prev);
                next.delete(seasonNumber);
                return next;
              });
            }
          }
        }),
      );
    };

    loadVisibleSeasons();

    return () => {
      cancelled = true;
    };
  }, [
    getSeasonDetails,
    show?.externalId,
    visibleSeasonNumbers,
  ]);

  const handleStatus = useCallback(
    async (value: "watchlist" | "watching" | "completed" | "dropped") => {
      if (!isAuthenticated) {
        Alert.alert("Sign in required", "Set your watch status after signing in.");
        return;
      }
      await setStatus({ showId, status: value });
    },
    [isAuthenticated, setStatus, showId]
  );

  const handleRemoveStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    await removeStatus({ showId });
  }, [isAuthenticated, removeStatus, showId]);

  const handleReview = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Post a review after signing in.");
      return;
    }
    if (rating < 0.5 || rating > 5) {
      Alert.alert("Invalid rating", "Tap the stars to set a rating.");
      return;
    }
    if (!reviewText) {
      Alert.alert("Missing review", "Write a short review first.");
      return;
    }
    try {
      await createReview({ showId, rating, reviewText, spoiler });
      setRating(0);
      setReviewText("");
      setSpoiler(false);
      setReviewSheetVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Could not publish review", String(error));
    }
  }, [createReview, isAuthenticated, rating, reviewText, showId, spoiler]);

  const handleToggleList = useCallback(
    async (listId: Id<"lists">) => {
      if (!isAuthenticated) {
        Alert.alert("Sign in required", "Add to a list after signing in.");
        return;
      }
      const isCurrentlyIn = memberSet.has(listId);
      Haptics.impactAsync(
        isCurrentlyIn
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium,
      );
      try {
        await toggleListItem({ listId, showId });
      } catch (error) {
        Alert.alert("Error", String(error));
      }
    },
    [toggleListItem, isAuthenticated, showId, memberSet],
  );

  const renderReview = useCallback(
    ({ item }: { item: any }) => (
      <ReviewRow
        id={item.review._id}
        rating={item.review.rating}
        reviewText={item.review.reviewText}
        authorName={
          item.author?.displayName ?? item.author?.name ?? item.author?.username ?? "Someone"
        }
        authorUsername={item.author?.username}
        authorAvatarUrl={item.authorAvatarUrl}
        createdAt={item.review.createdAt}
        spoiler={item.review.spoiler}
      />
    ),
    []
  );

  // Build metadata line: "2024 · Drama, Thriller · 52m"
  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (show?.year) parts.push(String(show.year));
    if (extendedDetails?.genres?.length > 0) {
      parts.push(
        extendedDetails.genres
          .slice(0, 3)
          .map((g: any) => g.name)
          .join(", ")
      );
    }
    if (extendedDetails?.episodeRunTime) {
      parts.push(`${extendedDetails.episodeRunTime}m`);
    }
    return parts.join("  ·  ");
  }, [show?.year, extendedDetails?.genres, extendedDetails?.episodeRunTime]);

  const ratingDisplay = extendedDetails?.voteAverage
    ? extendedDetails.voteAverage.toFixed(1)
    : null;

  const communitySummary = useMemo(() => {
    if (reviews.length === 0) {
      return null;
    }

    const averageRating =
      reviews.reduce((sum: number, item: any) => sum + item.review.rating, 0) / reviews.length;
    const recentReviewers = reviews
      .map((item: any) => {
        const label =
          item.author?.displayName ?? item.author?.name ?? item.author?.username ?? null;
        if (!label) return null;
        return {
          id: item.review._id,
          label,
          avatarUrl: item.authorAvatarUrl ?? null,
        };
      })
      .filter(Boolean)
      .slice(0, 3);

    return {
      averageRating,
      recentReviewers,
      reviewCount: reviews.length,
    };
  }, [reviews]);

  const handleProviderPress = useCallback(async (provider: { deepLinkUrl?: string | null }) => {
    if (!provider.deepLinkUrl) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL(provider.deepLinkUrl);
    } catch (error) {
      Alert.alert("Couldn't open provider", "Try again in a moment.");
    }
  }, []);

  return (
    <View className="flex-1 bg-dark-bg">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Cinematic Hero ─── */}
        <View style={{ height: BACKDROP_HEIGHT + POSTER_HEIGHT * 0.45 }}>
          {/* Backdrop */}
          <View style={{ height: BACKDROP_HEIGHT, width: SCREEN_WIDTH }}>
            {extendedDetails?.backdropPath ? (
              <Image
                source={{ uri: extendedDetails.backdropPath }}
                style={{ width: SCREEN_WIDTH, height: BACKDROP_HEIGHT }}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <View
                style={{ width: SCREEN_WIDTH, height: BACKDROP_HEIGHT }}
                className="bg-dark-elevated"
              />
            )}
            {/* Gradient overlay — dissolves backdrop into background */}
            <LinearGradient
              colors={[
                "rgba(13, 15, 20, 0)",
                "rgba(13, 15, 20, 0.4)",
                "rgba(13, 15, 20, 0.85)",
                "rgba(13, 15, 20, 1)",
              ]}
              locations={[0, 0.45, 0.75, 1]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: BACKDROP_HEIGHT,
              }}
            />
            {/* Subtle side vignette */}
            <LinearGradient
              colors={["rgba(13, 15, 20, 0.6)", "transparent", "rgba(13, 15, 20, 0.6)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
            />
          </View>

          {/* Poster — floating centered over backdrop bottom edge */}
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <View
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.6,
                shadowRadius: 24,
                elevation: 20,
              }}
            >
              <Image
                source={show?.posterUrl ? { uri: show.posterUrl } : undefined}
                style={{
                  width: POSTER_WIDTH,
                  height: POSTER_HEIGHT,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
                contentFit="cover"
                transition={300}
              />
            </View>
          </View>
        </View>

        {/* Navigation overlay — back button & activity menu */}
        <View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            right: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="active:opacity-70"
          >
            <BlurView
              intensity={60}
              tint="dark"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Ionicons name="chevron-back" size={22} color="#F1F3F7" />
            </BlurView>
          </Pressable>

          <View style={{ width: 40 }} />
        </View>

        {/* ─── Title & Metadata ─── */}
        <View className="items-center px-8 pt-5">
          <Text
            className="text-center text-2xl font-bold text-text-primary"
            style={{ letterSpacing: 0.3 }}
          >
            {show?.title ?? "Loading..."}
          </Text>

          {metaLine ? (
            <Text
              className="mt-2 text-center text-sm text-text-secondary"
              style={{ letterSpacing: 0.8 }}
            >
              {metaLine}
            </Text>
          ) : null}

          {/* Tagline */}
          {extendedDetails?.tagline ? (
            <Text
              className="mt-3 text-center text-sm italic text-text-tertiary"
              style={{ lineHeight: 20 }}
            >
              "{extendedDetails.tagline}"
            </Text>
          ) : null}

          {/* Rating & Content Rating */}
          <View className="mt-4 flex-row items-center gap-4">
            {ratingDisplay && (
              <View className="flex-row items-center gap-2">
                <Ionicons name="star" size={16} color="#FBBF24" />
                <Text className="text-lg font-bold text-text-primary">
                  {ratingDisplay}
                </Text>
                <Text className="text-sm text-text-tertiary">/10</Text>
                {extendedDetails?.voteCount ? (
                  <Text className="text-xs text-text-tertiary">
                    ({extendedDetails.voteCount.toLocaleString()})
                  </Text>
                ) : null}
              </View>
            )}
            {extendedDetails?.contentRating && (
              <View className="rounded-md border border-text-tertiary px-2 py-0.5">
                <Text
                  className="text-xs font-bold text-text-secondary"
                  style={{ letterSpacing: 0.5 }}
                >
                  {extendedDetails.contentRating}
                </Text>
              </View>
            )}
          </View>

        </View>

        {/* ─── Status + Actions ─── */}
        <View className="mt-6 px-6">
          <View className="flex-row items-center gap-2.5">
            <View className="flex-1">
              <StatusSelector
                currentStatus={watchState?.status as any}
                onSelect={handleStatus}
                onRemove={handleRemoveStatus}
              />
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setReviewSheetVisible(true);
              }}
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#2A2E38",
                backgroundColor: "#161A22",
                alignItems: "center",
                justifyContent: "center",
              }}
              className="active:opacity-70"
            >
              <Ionicons name="create-outline" size={22} color="#F59E0B" />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setListPickerVisible(true);
              }}
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: memberSet.size > 0 ? "rgba(34, 197, 94, 0.25)" : "#2A2E38",
                backgroundColor: memberSet.size > 0 ? "rgba(34, 197, 94, 0.1)" : "#161A22",
                alignItems: "center",
                justifyContent: "center",
              }}
              className="active:opacity-70"
            >
              <Ionicons
                name={memberSet.size > 0 ? "list" : "list-outline"}
                size={22}
                color={memberSet.size > 0 ? "#22C55E" : "#9BA1B0"}
              />
            </Pressable>
          </View>
        </View>

        {/* ─── Overview ─── */}
        <View className="mt-8 px-6">
          <Text
            className="text-sm text-text-secondary"
            style={{ lineHeight: 22 }}
          >
            {show?.overview ?? "No overview available."}
          </Text>
        </View>

        {/* ─── At a Glance ─── */}
        {!loadingDetails && extendedDetails && (
          <View className="mx-6 mt-8 flex-row rounded-2xl border border-dark-border bg-dark-card">
            <GlanceItem
              label="Seasons"
              value={String(extendedDetails.numberOfSeasons ?? "—")}
              border
            />
            <GlanceItem
              label="Episodes"
              value={String(extendedDetails.numberOfEpisodes ?? "—")}
              border
            />
            <GlanceItem
              label="Status"
              value={
                extendedDetails.status === "Returning Series"
                  ? "Returning"
                  : extendedDetails.status === "Ended"
                    ? "Ended"
                    : extendedDetails.status ?? "—"
              }
            />
          </View>
        )}

        {/* ─── Details ─── */}
        {!loadingDetails && extendedDetails && (
          <View className="mx-6 mt-8">
            <Text
              className="mb-4 text-xs font-bold uppercase text-text-tertiary"
              style={{ letterSpacing: 1.5 }}
            >
              Details
            </Text>

            {extendedDetails.firstAirDate && (
              <DetailRow
                label="First aired"
                value={formatDate(new Date(extendedDetails.firstAirDate).getTime())}
              />
            )}
            {extendedDetails.lastAirDate && extendedDetails.status === "Ended" && (
              <DetailRow
                label="Last aired"
                value={formatDate(new Date(extendedDetails.lastAirDate).getTime())}
              />
            )}
            {extendedDetails.episodeRunTime && (
              <DetailRow
                label="Runtime"
                value={`${extendedDetails.episodeRunTime} min per episode`}
              />
            )}
            {extendedDetails.networks?.length > 0 && (
              <DetailRow
                label="Network"
                value={extendedDetails.networks.map((n: any) => n.name).join(", ")}
              />
            )}
            {extendedDetails.createdBy?.length > 0 && (
              <DetailRow
                label="Created by"
                value={extendedDetails.createdBy.map((c: any) => c.name).join(", ")}
              />
            )}
          </View>
        )}

        {!loadingDetails &&
          extendedDetails?.watchProviders &&
          extendedDetails.watchProviders.length > 0 && (
            <View className="mt-8 px-6">
              <View className="mb-3">
                <View>
                  <Text
                    className="text-xs font-bold uppercase text-text-tertiary"
                    style={{ letterSpacing: 1.5 }}
                  >
                    Where to Watch
                  </Text>
                  <Text className="mt-2 text-sm text-text-secondary">
                    Streaming availability in the US.
                  </Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 8 }}
              >
                {extendedDetails.watchProviders.map((provider: any) => (
                  <Pressable
                    key={provider.id}
                    disabled={!provider.deepLinkUrl}
                    onPress={() => handleProviderPress(provider)}
                    className="mr-2.5 flex-row items-center gap-2 rounded-full border border-dark-border bg-dark-card px-3 py-2 active:opacity-80"
                  >
                    {provider.logoUrl ? (
                      <Image
                        source={{ uri: provider.logoUrl }}
                        style={{ width: 24, height: 24, borderRadius: 6 }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View className="h-6 w-6 items-center justify-center rounded-md bg-dark-elevated">
                        <Ionicons name="play-circle-outline" size={14} color="#9BA1B0" />
                      </View>
                    )}
                    <Text className="text-sm font-medium text-text-primary">
                      {provider.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

        {/* ─── Genres ─── */}
        {!loadingDetails &&
          extendedDetails?.genres &&
          extendedDetails.genres.length > 0 && (
            <View className="mt-8 px-6">
              <Text
                className="mb-3 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Genres
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {extendedDetails.genres.map((genre: any) => (
                  <View
                    key={genre.id}
                    className="rounded-full border border-dark-border bg-dark-card px-3.5 py-1.5"
                  >
                    <Text className="text-xs font-medium text-text-secondary">
                      {genre.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        {/* ─── Cast ─── */}
        {!loadingDetails &&
          extendedDetails?.cast &&
          extendedDetails.cast.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Cast
              </Text>
              <FlashList
                data={extendedDetails.cast}
                renderItem={({ item }: { item: any }) => (
                  <CastMember
                    name={item.name}
                    role={item.character}
                    profilePath={item.profilePath}
                  />
                )}
                keyExtractor={(item: any) => String(item.id)}
                estimatedItemSize={120}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 4 }}
              />
            </View>
          )}

        {/* ─── Crew ─── */}
        {!loadingDetails &&
          extendedDetails?.crew &&
          extendedDetails.crew.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Crew
              </Text>
              <FlashList
                data={extendedDetails.crew}
                renderItem={({ item }: { item: any }) => (
                  <CastMember
                    name={item.name}
                    role={item.job}
                    profilePath={item.profilePath}
                  />
                )}
                keyExtractor={(item: any) => String(item.id)}
                estimatedItemSize={120}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 4 }}
              />
            </View>
          )}

        {/* ─── Episode Guide ─── */}
        {!loadingDetails && seasonOptions.length > 0 && (() => {
          const seasonsWithEpisodes = seasonOptions.filter((s: any) => {
            const details = seasonDetailsByNumber[s.season_number];
            const episodes = details?.episodes ?? [];
            const epCount = s.episode_count ?? 0;
            return details ? episodes.length > 0 : epCount > 0;
          });

          if (seasonsWithEpisodes.length === 0) return null;

          const hasMore = seasonsWithEpisodes.length > INITIAL_VISIBLE_SEASONS;
          const isExpanded = episodeGuideExpanded ?? false;
          const visibleSeasons = isExpanded
            ? seasonsWithEpisodes
            : seasonsWithEpisodes.slice(0, INITIAL_VISIBLE_SEASONS);

          return (
          <View className="mt-10">
            <View className="px-6">
              <Text
                className="text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Episode Guide
              </Text>
              <Text
                className="mt-2 text-sm text-text-secondary"
                style={{ lineHeight: 21 }}
              >
                Browse episodes by season.
              </Text>
            </View>

            <View className="mt-4 gap-10">
            {visibleSeasons.map((season: any) => {
              const details = seasonDetailsByNumber[season.season_number];
              const isLoading = loadingSeasonNumbers.has(season.season_number);
              const episodes = details?.episodes ?? [];

              return (
                <View key={season.id}>
                  <View className="flex-row items-center gap-3 px-6 mb-4">
                    <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                      {season.name}
                    </Text>
                    <View className="rounded-full bg-dark-elevated px-2 py-0.5">
                      <Text className="text-xs font-medium text-text-tertiary">
                        {episodes.length > 0 ? episodes.length : season.episode_count}{" "}
                        eps
                      </Text>
                    </View>
                    {season.air_date ? (
                      <Text className="text-xs text-text-tertiary">
                        {new Date(season.air_date).getFullYear()}
                      </Text>
                    ) : null}
                    <View className="flex-1 h-px bg-dark-border" />
                  </View>

                  {isLoading ? (
                    <View className="items-center justify-center py-12">
                      <ActivityIndicator color="#38bdf8" size="small" />
                      <Text className="mt-2 text-sm text-text-tertiary">
                        Loading episodes...
                      </Text>
                    </View>
                  ) : episodes.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{
                        paddingHorizontal: 24,
                        gap: 14,
                        paddingRight: 24,
                      }}
                    >
                      {episodes.map((episode: any) => {
                        const rating =
                          episode.voteCount > 0 && episode.voteAverage > 0
                            ? episode.voteAverage.toFixed(1)
                            : "N/A";
                        return (
                          <Pressable
                            key={episode.id}
                            className="active:opacity-80"
                            style={{ width: 144 }}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSelectedEpisode({
                                episode,
                                seasonName: season.name,
                              });
                              setEpisodeSheetVisible(true);
                            }}
                          >
                            <View
                              className="overflow-hidden rounded-xl border border-dark-border bg-dark-card"
                              style={{ width: 144, height: 180 }}
                            >
                              {episode.stillPath ? (
                                <Image
                                  source={{ uri: episode.stillPath }}
                                  style={{
                                    width: 144,
                                    height: 81,
                                    borderRadius: 0,
                                  }}
                                  contentFit="cover"
                                  transition={200}
                                />
                              ) : (
                                <View
                                  className="items-center justify-center bg-dark-elevated"
                                  style={{ width: 144, height: 81 }}
                                >
                                  <Ionicons name="tv-outline" size={24} color="#5A6070" />
                                </View>
                              )}
                              <View className="flex-1 w-full p-2">
                                <Text
                                  className="text-sm font-semibold text-text-primary"
                                  numberOfLines={2}
                                >
                                  {episode.name}
                                </Text>
                                <View className="mt-1 flex-row items-center gap-1">
                                  <Ionicons name="star" size={11} color="#FBBF24" />
                                  <Text className="text-xs font-medium text-text-secondary">
                                    {rating}
                                  </Text>
                                </View>
                                <Text
                                  className="mt-1 text-xs text-text-tertiary"
                                  numberOfLines={2}
                                >
                                  {episode.overview || "No synopsis available."}
                                </Text>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View className="px-6">
                      <Text className="text-sm text-text-tertiary">
                        No episodes found for this season.
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {hasMore && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEpisodeGuideExpanded(!isExpanded);
                }}
                className="mx-6 flex-row items-center justify-center gap-2 rounded-xl border border-dark-border bg-dark-elevated py-3 active:opacity-80"
              >
                  <Text className="text-sm font-semibold text-text-secondary">
                  {isExpanded
                    ? "Show less"
                    : `Show ${seasonsWithEpisodes.length - INITIAL_VISIBLE_SEASONS} more seasons`}
                </Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#5A6070"
                />
              </Pressable>
            )}
            </View>
          </View>
          );
        })()}

        {/* ─── Trailers & Videos ─── */}
        {!loadingDetails &&
          extendedDetails?.videos &&
          extendedDetails.videos.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Trailers & Videos
              </Text>
              <FlashList
                data={extendedDetails.videos}
                renderItem={({ item }: { item: any }) => (
                  <View style={{ width: 256, marginRight: 16 }}>
                    <VideoPlayer
                      videoKey={item.key}
                      title={item.name}
                      type={item.type}
                    />
                  </View>
                )}
                keyExtractor={(item: any) => item.id}
                estimatedItemSize={272}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingRight: 16 }}
              />
            </View>
          )}

        {/* ─── Divider ─── */}
        <View className="mx-6 mt-10 h-px bg-dark-border" />

        {/* ─── Community Reviews ─── */}
        <View className="mt-8 px-6">
          <Text
            className="mb-4 text-xs font-bold uppercase text-text-tertiary"
            style={{ letterSpacing: 1.5 }}
          >
            Community Reviews
          </Text>
          {communitySummary ? (
            <View className="mb-4 flex-row items-center rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
              <View className="mr-3 flex-row">
                {communitySummary.recentReviewers.map((reviewer: any, index: number) => (
                  <View
                    key={reviewer.id}
                    style={{ marginLeft: index === 0 ? 0 : -8 }}
                    className="rounded-full border-2 border-dark-card"
                  >
                    <Avatar uri={reviewer.avatarUrl} label={reviewer.label} size={28} />
                  </View>
                ))}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-primary">
                  {communitySummary.averageRating.toFixed(1)} out of 5 from recent reviews
                </Text>
                <Text className="mt-1 text-xs text-text-tertiary">
                  Based on {communitySummary.reviewCount} community review
                  {communitySummary.reviewCount === 1 ? "" : "s"}.
                </Text>
              </View>
            </View>
          ) : null}
          {reviews.length > 0 ? (
            <View>
              <FlashList
                data={reviews}
                renderItem={renderReview}
                keyExtractor={(item: any) => item.review._id}
                estimatedItemSize={120}
                contentContainerStyle={{ paddingBottom: 8 }}
                scrollEnabled={false}
              />
              {reviewsStatus === "CanLoadMore" ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    loadMoreReviews(20);
                  }}
                  className="mt-2 self-start rounded-full border border-dark-border px-4 py-2"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Load more
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <EmptyState
              title="No reviews yet"
              description="Be the first to review this show!"
            />
          )}
        </View>

        {/* ─── Similar Shows ─── */}
        {!loadingDetails &&
          extendedDetails?.similar &&
          extendedDetails.similar.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Similar Shows
              </Text>
              <FlashList
                data={extendedDetails.similar}
                renderItem={({ item }: { item: any }) => (
                  <SimilarShowCard
                    externalId={String(item.id)}
                    title={item.title}
                    posterPath={item.posterPath}
                    rating={item.voteAverage}
                  />
                )}
                keyExtractor={(item: any) => String(item.id)}
                estimatedItemSize={160}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingRight: 16 }}
              />
            </View>
          )}

        {/* Bottom spacing */}
        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>

      {/* List picker sheet */}
      <Modal
        visible={listPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setListPickerVisible(false)}
      >
        <Pressable
          onPress={() => setListPickerVisible(false)}
          className="flex-1 justify-end bg-black/50"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl bg-dark-elevated pb-8 pt-4"
          >
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-dark-border" />
            </View>
            <Text className="mb-4 px-6 text-lg font-semibold text-text-primary">
              Add to list
            </Text>
            <View className="px-4">
              {lists.length > 0 ? (
                <View className="gap-2">
                  {lists.map((list) => {
                    const isIn = memberSet.has(list._id);
                    return (
                      <Pressable
                        key={list._id}
                        onPress={() => handleToggleList(list._id)}
                        className={`flex-row items-center gap-3 rounded-xl px-4 py-3.5 active:opacity-80 ${
                          isIn ? "bg-brand-500/10" : ""
                        }`}
                      >
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-full ${
                            isIn ? "bg-brand-500" : "border-2 border-dark-border"
                          }`}
                        >
                          {isIn ? (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          ) : null}
                        </View>
                        <Text
                          className={`flex-1 text-base font-medium ${
                            isIn ? "text-text-primary" : "text-text-secondary"
                          }`}
                        >
                          {list.title}
                        </Text>
                        {isIn ? (
                          <Text className="text-xs text-brand-400">Added</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View className="items-center py-6">
                  <Ionicons name="list-outline" size={28} color="#5A6070" />
                  <Text className="mt-2 text-sm text-text-tertiary">No lists yet</Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setListPickerVisible(false);
                      router.push("/me/lists");
                    }}
                    className="mt-2"
                  >
                    <Text className="text-sm font-medium text-brand-400">
                      Create a list
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Review sheet */}
      <Modal
        visible={reviewSheetVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        statusBarTranslucent
        onRequestClose={() => setReviewSheetVisible(false)}
      >
        <View className="flex-1 bg-dark-bg" style={{ backgroundColor: "#0D0F14" }}>
          <View className="flex-row items-center justify-between border-b border-dark-border px-6 py-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setReviewSheetVisible(false);
              }}
            >
              <Text className="text-base text-text-tertiary">Cancel</Text>
            </Pressable>
            <Text className="text-base font-semibold text-text-primary">
              Write a Review
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleReview();
              }}
              disabled={rating < 0.5 || !reviewText}
            >
              <Text
                className={`text-base font-semibold ${
                  rating >= 0.5 && reviewText
                    ? "text-brand-500"
                    : "text-text-tertiary"
                }`}
              >
                Publish
              </Text>
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 24,
              paddingBottom: insets.bottom + 32,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="mb-6">
              <Text className="mb-3 text-sm font-semibold text-text-secondary">
                Your rating
              </Text>
              <StarRating value={rating} onChange={setRating} size={36} />
              {rating > 0 && (
                <Text className="mt-2 text-sm text-text-tertiary">
                  {rating} out of 5 stars
                </Text>
              )}
            </View>

            <Text className="mb-2 text-sm font-semibold text-text-secondary">
              Review
            </Text>
            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Share your thoughts..."
              placeholderTextColor="#5A6070"
              multiline
              autoFocus
              className="min-h-[140px] rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-base text-text-primary"
              style={{ textAlignVertical: "top" }}
            />

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSpoiler((prev) => !prev);
              }}
              className={`mt-4 flex-row items-center gap-2 self-start rounded-full border px-3.5 py-2 ${
                spoiler
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-dark-border bg-dark-card"
              }`}
            >
              <Ionicons
                name={spoiler ? "warning" : "warning-outline"}
                size={14}
                color={spoiler ? "#EF4444" : "#9BA1B0"}
              />
              <Text
                className={`text-sm font-medium ${
                  spoiler ? "text-red-400" : "text-text-secondary"
                }`}
              >
                {spoiler ? "Contains spoilers" : "No spoilers"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Episode Detail Sheet */}
      <Modal
        visible={episodeSheetVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        statusBarTranslucent
        onRequestClose={() => setEpisodeSheetVisible(false)}
        onDismiss={() => setSelectedEpisode(null)}
      >
        {selectedEpisode && (
          <View className="flex-1 bg-dark-bg" style={{ backgroundColor: "#0D0F14" }}>
            <View className="flex-row items-center justify-between border-b border-dark-border px-6 py-4">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEpisodeSheetVisible(false);
                }}
              >
                <Text className="text-base text-text-tertiary">Close</Text>
              </Pressable>
              <Text className="text-base font-semibold text-text-primary">
                Episode Details
              </Text>
              <View style={{ width: 48 }} />
            </View>

            <ScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              {selectedEpisode.episode.stillPath ? (
                <Image
                  source={{ uri: selectedEpisode.episode.stillPath }}
                  style={{
                    width: SCREEN_WIDTH,
                    height: 200,
                    backgroundColor: "#1C2028",
                  }}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}

              <View className="px-6 pt-6">
                <Text className="text-xl font-bold text-text-primary">
                  {selectedEpisode.episode.name}
                </Text>
                <View className="mt-2 flex-row flex-wrap items-center gap-2">
                  <Text className="text-sm text-text-tertiary">
                    {selectedEpisode.seasonName} • E
                    {String(selectedEpisode.episode.episodeNumber).padStart(2, "0")}
                  </Text>
                  {selectedEpisode.episode.airDate ? (
                    <Text className="text-sm text-text-tertiary">
                      {formatDate(new Date(selectedEpisode.episode.airDate).getTime())}
                    </Text>
                  ) : null}
                  {selectedEpisode.episode.runtime ? (
                    <Text className="text-sm text-text-tertiary">
                      {selectedEpisode.episode.runtime} min
                    </Text>
                  ) : null}
                </View>

                {(selectedEpisode.episode.voteCount > 0 &&
                  selectedEpisode.episode.voteAverage > 0) && (
                  <View className="mt-4 flex-row items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-2 self-start">
                    <Ionicons name="star" size={16} color="#FBBF24" />
                    <Text className="text-base font-semibold text-text-primary">
                      {selectedEpisode.episode.voteAverage.toFixed(1)}
                    </Text>
                    <Text className="text-sm text-text-tertiary">
                      ({selectedEpisode.episode.voteCount.toLocaleString()} ratings)
                    </Text>
                  </View>
                )}

                {selectedEpisode.episode.overview ? (
                  <View className="mt-6">
                    <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                      Overview
                    </Text>
                    <Text className="mt-2 text-sm text-text-secondary leading-6">
                      {selectedEpisode.episode.overview}
                    </Text>
                  </View>
                ) : null}

                {selectedEpisode.episode.crew?.length > 0 ? (
                  <View className="mt-6">
                    <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                      Crew
                    </Text>
                    <View className="mt-2 flex-row flex-wrap gap-2">
                      {selectedEpisode.episode.crew.map((person: any) => (
                        <View
                          key={`${selectedEpisode.episode.id}-${person.id}-${person.job}`}
                          className="rounded-full border border-dark-border bg-dark-card px-3 py-1.5"
                        >
                          <Text className="text-xs text-text-secondary">
                            {person.name} · {person.job}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {selectedEpisode.episode.guestStars?.length > 0 ? (
                  <View className="mt-6">
                    <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                      Guest Stars
                    </Text>
                    <View className="mt-2 flex-row flex-wrap gap-2">
                      {selectedEpisode.episode.guestStars.map((person: any) => (
                        <View
                          key={`${selectedEpisode.episode.id}-guest-${person.id}`}
                          className="rounded-full border border-brand-500/15 bg-brand-500/10 px-3 py-1.5"
                        >
                          <Text className="text-xs text-text-secondary">
                            {person.name}
                            {person.character ? ` as ${person.character}` : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

/* ─── Inline Sub-components ─── */

function GlanceItem({
  label,
  value,
  border,
}: {
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <View
      className={`flex-1 items-center py-4 ${
        border ? "border-r border-dark-border" : ""
      }`}
    >
      <Text className="text-lg font-bold text-text-primary">{value}</Text>
      <Text className="mt-1 text-xs text-text-tertiary">{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center border-b border-dark-border/50 py-3">
      <Text className="w-28 text-sm text-text-tertiary">{label}</Text>
      <Text className="flex-1 text-sm font-medium text-text-primary">{value}</Text>
    </View>
  );
}
