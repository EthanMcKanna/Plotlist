import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAction, useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { ReviewRow } from "../../components/ReviewRow";
import { ListRow } from "../../components/ListRow";
import { Poster } from "../../components/Poster";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Avatar } from "../../components/Avatar";
import { TasteMatchSummary } from "../../components/TasteMatchSummary";

const GENRE_COLORS: Record<string, { bg: string; text: string }> = {
  "Action & Adventure": { bg: "bg-red-500/15", text: "text-red-400" },
  Animation: { bg: "bg-violet-500/15", text: "text-violet-400" },
  Comedy: { bg: "bg-amber-500/15", text: "text-amber-400" },
  Crime: { bg: "bg-slate-500/15", text: "text-slate-300" },
  Documentary: { bg: "bg-teal-500/15", text: "text-teal-400" },
  Drama: { bg: "bg-blue-500/15", text: "text-blue-400" },
  Family: { bg: "bg-green-500/15", text: "text-green-400" },
  Kids: { bg: "bg-pink-500/15", text: "text-pink-400" },
  Mystery: { bg: "bg-purple-500/15", text: "text-purple-400" },
  Reality: { bg: "bg-orange-500/15", text: "text-orange-400" },
  "Sci-Fi & Fantasy": { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  Soap: { bg: "bg-rose-500/15", text: "text-rose-400" },
  Talk: { bg: "bg-lime-500/15", text: "text-lime-400" },
  "War & Politics": { bg: "bg-stone-500/15", text: "text-stone-300" },
  Western: { bg: "bg-yellow-500/15", text: "text-yellow-400" },
};

type ProfileShowPreview = {
  _id: string;
  title: string;
  posterUrl?: string | null;
  year?: number;
};

type TopRatedPreview = {
  reviewId: string;
  rating: number;
  showId: string;
  title: string;
  posterUrl?: string | null;
};

function GenreChip({ genre }: { genre: string }) {
  const colors = GENRE_COLORS[genre] ?? { bg: "bg-dark-elevated", text: "text-text-secondary" };
  return (
    <View className={`rounded-full px-3.5 py-1.5 ${colors.bg}`}>
      <Text className={`text-xs font-semibold ${colors.text}`}>{genre}</Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string | number;
  onPress?: () => void;
}) {
  const content = (
    <View className="items-center">
      <Text className="text-lg font-bold text-text-primary">{value}</Text>
      <Text className="text-[11px] text-text-tertiary">{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        className="flex-1 items-center py-2 active:opacity-70"
      >
        {content}
      </Pressable>
    );
  }
  return <View className="flex-1 items-center py-2">{content}</View>;
}

function StatDivider() {
  return <View className="w-px self-stretch bg-dark-border" />;
}

function ShowPosterCard({
  show,
  onPress,
  badge,
}: {
  show: { _id: string; title: string; posterUrl?: string | null; year?: number };
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="mr-3 w-[100px] active:opacity-80"
    >
      <View className="relative">
        <Poster uri={show.posterUrl} width={100} />
        {badge ? (
          <View className="absolute bottom-1.5 right-1.5 flex-row items-center gap-0.5 rounded-full bg-black/70 px-2 py-0.5">
            <Ionicons name="star" size={10} color="#F59E0B" />
            <Text className="text-[10px] font-bold text-amber-400">{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-1.5 text-xs font-medium text-text-secondary" numberOfLines={2}>
        {show.title}
      </Text>
    </Pressable>
  );
}

function formatMemberSince(timestamp: number | null) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const userId = typeof params.id === "string" ? params.id : "";

  const userIdValue = userId as Id<"users">;
  const { isAuthenticated } = useConvexAuth();

  const me = useQuery(api.users.me);
  const profile = useQuery(api.users.profile, {
    userId: userIdValue,
  });
  const getProfileTasteExperience = useAction(api.embeddings.getProfileTasteExperience);

  const isFollowing = useQuery(
    api.follows.isFollowing,
    isAuthenticated ? { userId: userIdValue } : "skip",
  );

  const follow = useMutation(api.follows.follow).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(api.follows.isFollowing, { userId: args.userIdToFollow }, true);
      const profileQueryArgs = { userId: args.userIdToFollow };
      const currentProfile = localStore.getQuery(api.users.profile, profileQueryArgs);
      if (currentProfile) {
        localStore.setQuery(api.users.profile, profileQueryArgs, {
          ...currentProfile,
          counts: {
            ...currentProfile.counts,
            followers: currentProfile.counts.followers + 1,
          },
        });
      }
    },
  );
  const unfollow = useMutation(api.follows.unfollow).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(api.follows.isFollowing, { userId: args.userIdToUnfollow }, false);
      const profileQueryArgs = { userId: args.userIdToUnfollow };
      const currentProfile = localStore.getQuery(api.users.profile, profileQueryArgs);
      if (currentProfile) {
        localStore.setQuery(api.users.profile, profileQueryArgs, {
          ...currentProfile,
          counts: {
            ...currentProfile.counts,
            followers: Math.max(0, currentProfile.counts.followers - 1),
          },
        });
      }
    },
  );

  const {
    results: publicLists,
    status: publicListsStatus,
    loadMore: loadMorePublicLists,
  } = usePaginatedQuery(
    api.lists.listPublicForUser,
    { userId: userIdValue },
    { initialNumItems: 5 },
  );

  const {
    results: reviews,
    status: reviewsStatus,
    loadMore: loadMoreReviews,
  } = usePaginatedQuery(
    api.reviews.listForUserDetailed,
    { userId: userIdValue },
    { initialNumItems: 10 },
  );

  const renderReview = useCallback(
    ({ item }: { item: any }) => (
      <ReviewRow
        id={item.review._id}
        showTitle={item.show?.title ?? "Unknown"}
        posterUrl={item.show?.posterUrl}
        rating={item.review.rating}
        reviewText={item.review.reviewText}
        createdAt={item.review.createdAt}
        spoiler={item.review.spoiler}
      />
    ),
    [],
  );

  const renderList = useCallback(
    ({ item }: { item: any }) => (
      <ListRow id={item._id} title={item.title} description={item.description} />
    ),
    [],
  );

  const relationshipSummary = useMemo(() => {
    const relationship = profile?.relationship;
    if (!relationship) return null;

    const parts: string[] = [];
    if (relationship.inContacts) parts.push("In your contacts");
    if (relationship.isMutualFollow) parts.push("Mutual follow");
    else if (relationship.followsYou) parts.push("Follows you");
    if (relationship.mutualCount > 0) {
      parts.push(`${relationship.mutualCount} mutual${relationship.mutualCount === 1 ? "" : "s"}`);
    }
    return parts.join(" · ") || null;
  }, [profile?.relationship]);

  const isOwnProfile = me && me._id === userIdValue;
  const [tasteExperience, setTasteExperience] = useState<any | null>(null);
  const memberSince = formatMemberSince(profile?.memberSince ?? null);
  const watchActivityCards = useMemo(
    () =>
      [
        {
          key: "completed",
          label: "Completed",
          value: profile?.counts.completed ?? 0,
          icon: "checkmark-circle" as const,
          iconColor: "#22C55E",
          iconBg: "bg-green-500/15",
        },
        profile?.counts.watching !== null && profile?.counts.watching !== undefined
          ? {
              key: "watching",
              label: "Watching",
              value: profile.counts.watching,
              icon: "eye" as const,
              iconColor: "#0ea5e9",
              iconBg: "bg-brand-500/15",
            }
          : null,
        profile?.counts.watchlist !== null && profile?.counts.watchlist !== undefined
          ? {
              key: "watchlist",
              label: "Watchlist",
              value: profile.counts.watchlist,
              icon: "bookmark" as const,
              iconColor: "#F59E0B",
              iconBg: "bg-amber-500/15",
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null),
    [profile],
  );

  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isAuthenticated || !me?._id || me._id === userIdValue) {
      setTasteExperience(null);
      return;
    }

    let cancelled = false;
    getProfileTasteExperience({ userId: userIdValue })
      .then((result) => {
        if (!cancelled) {
          setTasteExperience(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTasteExperience(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getProfileTasteExperience, isAuthenticated, me?._id, userIdValue]);

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View className="pb-24">
        {/* ── Profile Header ── */}
        <LinearGradient
          colors={["#0D2B3C", "#0D1821", "#0D0F14"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ paddingTop: insets.top + 16, paddingBottom: 16 }}
        >
          <View className="items-center px-6">
            <Avatar
              uri={profile?.avatarUrl}
              label={profile?.user?.displayName ?? profile?.user?.name}
              size={88}
            />
            <Text className="mt-3 text-2xl font-bold text-text-primary">
              {profile?.user?.displayName ?? profile?.user?.name ?? "Profile"}
            </Text>
            <Text className="mt-0.5 text-sm text-text-tertiary">
              @{profile?.user?.username ?? "user"}
            </Text>

            {profile?.user?.bio ? (
              <Text
                className="mt-2.5 text-center text-sm leading-5 text-text-secondary"
                numberOfLines={4}
              >
                {profile.user.bio}
              </Text>
            ) : null}

            <View className="mt-2.5 flex-row items-center gap-3">
              {memberSince ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="calendar-outline" size={12} color="#5A6070" />
                  <Text className="text-xs text-text-tertiary">
                    Joined {memberSince}
                  </Text>
                </View>
              ) : null}
              {relationshipSummary ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="people-outline" size={12} color="#38bdf8" />
                  <Text className="text-xs text-brand-400">{relationshipSummary}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        <View className="px-6">
          {/* ── Stats Bar ── */}
          <View className="flex-row items-center rounded-2xl border border-dark-border bg-dark-card">
            <MiniStat
              label="Followers"
              value={profile?.counts.followers ?? 0}
              onPress={() => router.push(`/followers/${userId}`)}
            />
            <StatDivider />
            <MiniStat
              label="Following"
              value={profile?.counts.following ?? 0}
              onPress={() => router.push(`/following/${userId}`)}
            />
            <StatDivider />
            <MiniStat label="Shows" value={profile?.counts.shows ?? 0} />
            <StatDivider />
            {profile?.averageRating ? (
              <View className="flex-1 items-center py-2">
                <View className="flex-row items-center gap-1">
                  <Ionicons name="star" size={14} color="#F59E0B" />
                  <Text className="text-lg font-bold text-text-primary">
                    {profile.averageRating}
                  </Text>
                </View>
                <Text className="text-[11px] text-text-tertiary">Avg Rating</Text>
              </View>
            ) : (
              <MiniStat label="Reviews" value={profile?.counts.reviews ?? 0} />
            )}
          </View>

          {/* ── Follow / Edit Button ── */}
          {me && !isOwnProfile ? (
            <View className="mt-4">
              <PrimaryButton
                label={isFollowing ? "Unfollow" : "Follow"}
                onPress={() =>
                  isFollowing
                    ? unfollow({ userIdToUnfollow: userIdValue })
                    : follow({ userIdToFollow: userIdValue })
                }
              />
            </View>
          ) : null}

          {!isOwnProfile && tasteExperience?.tasteMatch ? (
            <View className="mt-4">
              <TasteMatchSummary
                percent={tasteExperience.tasteMatch.percent}
                sharedFavoriteShows={tasteExperience.tasteMatch.sharedFavoriteShows ?? []}
              />
            </View>
          ) : null}

          {/* ── Favorite Shows ── */}
          {profile?.favoriteShows && profile.favoriteShows.length > 0 ? (
            <View className="mt-7">
              <SectionHeader
                title="Favorite Shows"
                action={
                  isOwnProfile ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push("/me/favorites");
                      }}
                      className="flex-row items-center gap-1.5 rounded-full border border-dark-border bg-dark-card px-3 py-1.5 active:bg-dark-hover"
                    >
                      <Ionicons name="pencil" size={14} color="#9BA1B0" />
                      <Text className="text-xs font-semibold text-text-secondary">
                        Edit
                      </Text>
                    </Pressable>
                  ) : null
                }
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-3"
              >
                {profile.favoriteShows.map((show: ProfileShowPreview) => (
                  <ShowPosterCard
                    key={show._id}
                    show={show}
                    onPress={() => router.push(`/show/${show._id}`)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* ── Favorite Genres ── */}
          {profile?.favoriteGenres && profile.favoriteGenres.length > 0 ? (
            <View className="mt-7">
              <SectionHeader title="Favorite Genres" />
              <View className="mt-3 flex-row flex-wrap gap-2">
                {profile.favoriteGenres.map((genre: string) => (
                  <GenreChip key={genre} genre={genre} />
                ))}
              </View>
            </View>
          ) : null}

          {/* ── Currently Watching ── */}
          {profile?.currentlyWatching && profile.currentlyWatching.length > 0 ? (
            <View className="mt-7">
              <SectionHeader title="Currently Watching" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-3"
              >
                {profile.currentlyWatching.map((show: ProfileShowPreview) => (
                  <ShowPosterCard
                    key={show._id}
                    show={show}
                    onPress={() => router.push(`/show/${show._id}`)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {profile?.watchlistPreview && profile.watchlistPreview.length > 0 ? (
            <View className="mt-7">
              <SectionHeader title="Watchlist" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-3"
              >
                {profile.watchlistPreview.map((show: ProfileShowPreview) => (
                  <ShowPosterCard
                    key={show._id}
                    show={show}
                    onPress={() => router.push(`/show/${show._id}`)}
                  />
                ))}
              </ScrollView>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (isOwnProfile) {
                    router.push({ pathname: "/me/watchlist", params: { filter: "watchlist" } });
                    return;
                  }
                  router.push(`/profile/${userId}/watchlist`);
                }}
                className="mt-3 self-start rounded-full border border-dark-border px-4 py-2 active:bg-dark-hover"
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  View full watchlist
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* ── Top Rated ── */}
          {profile?.topRated && profile.topRated.length > 0 ? (
            <View className="mt-7">
              <SectionHeader title="Top Rated" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-3"
              >
                {profile.topRated.map((item: TopRatedPreview) => (
                  <ShowPosterCard
                    key={item.reviewId}
                    show={{
                      _id: item.showId,
                      title: item.title,
                      posterUrl: item.posterUrl,
                    }}
                    badge={String(item.rating)}
                    onPress={() => router.push(`/show/${item.showId}`)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* ── Watch Activity Summary ── */}
          {(profile?.counts.shows ?? 0) > 0 && watchActivityCards.length > 0 ? (
            <View className="mt-7">
              <SectionHeader title="Watch Activity" />
              <View className="mt-3 flex-row gap-2.5">
                {watchActivityCards.map((card) => (
                  <View
                    key={card.key}
                    className="flex-1 rounded-2xl border border-dark-border bg-dark-card p-3.5"
                  >
                    <View className="flex-row items-center gap-2">
                      <View
                        className={`h-8 w-8 items-center justify-center rounded-full ${card.iconBg}`}
                      >
                        <Ionicons name={card.icon} size={16} color={card.iconColor} />
                      </View>
                      <Text className="text-xl font-bold text-text-primary">
                        {card.value}
                      </Text>
                    </View>
                    <Text className="mt-1.5 text-xs text-text-tertiary">{card.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* ── Public Lists ── */}
          <View className="mt-7">
            <SectionHeader title="Public Lists" />
            {publicLists.length > 0 ? (
              <View>
                <FlashList
                  data={publicLists}
                  renderItem={renderList}
                  keyExtractor={(item: any) => item._id}
                  ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                  estimatedItemSize={110}
                  contentContainerStyle={{ paddingVertical: 16 }}
                  scrollEnabled={false}
                />
                {publicListsStatus === "CanLoadMore" ? (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      loadMorePublicLists(5);
                    }}
                    className="self-start rounded-full border border-dark-border px-4 py-2"
                  >
                    <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Load more lists
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="mt-4">
                <EmptyState title="No public lists yet" />
              </View>
            )}
          </View>

          {/* ── Recent Reviews ── */}
          <View className="mt-7">
            <SectionHeader title="Recent Reviews" />
            {reviews.length > 0 ? (
              <View>
                <FlashList
                  data={reviews}
                  renderItem={renderReview}
                  keyExtractor={(item: any) => item.review._id}
                  ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                  estimatedItemSize={120}
                  contentContainerStyle={{ paddingVertical: 16 }}
                  scrollEnabled={false}
                />
                {reviewsStatus === "CanLoadMore" ? (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      loadMoreReviews(10);
                    }}
                    className="self-start rounded-full border border-dark-border px-4 py-2"
                  >
                    <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Load more reviews
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="mt-4">
                <EmptyState title="No reviews yet" />
              </View>
            )}
          </View>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}
