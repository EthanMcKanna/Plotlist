import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { Screen } from "../../components/Screen";
import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { ReviewRow } from "../../components/ReviewRow";
import { ListRow } from "../../components/ListRow";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Avatar } from "../../components/Avatar";

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

  const isFollowing = useQuery(
    api.follows.isFollowing,
    isAuthenticated ? { userId: userIdValue } : "skip",
  );

  const follow = useMutation(api.follows.follow).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(api.follows.isFollowing, { userId: args.userIdToFollow }, true);
      const profileQueryArgs = { userId: args.userIdToFollow };
      const profile = localStore.getQuery(api.users.profile, profileQueryArgs);
      if (profile) {
        localStore.setQuery(api.users.profile, profileQueryArgs, {
          ...profile,
          counts: {
            ...profile.counts,
            followers: profile.counts.followers + 1,
          },
        });
      }
    },
  );
  const unfollow = useMutation(api.follows.unfollow).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(api.follows.isFollowing, { userId: args.userIdToUnfollow }, false);
      const profileQueryArgs = { userId: args.userIdToUnfollow };
      const profile = localStore.getQuery(api.users.profile, profileQueryArgs);
      if (profile) {
        localStore.setQuery(api.users.profile, profileQueryArgs, {
          ...profile,
          counts: {
            ...profile.counts,
            followers: Math.max(0, profile.counts.followers - 1),
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
    if (!relationship) {
      return null;
    }

    const parts: string[] = [];
    if (relationship.inContacts) {
      parts.push("In your contacts");
    }
    if (relationship.isMutualFollow) {
      parts.push("Mutual follow");
    } else if (relationship.followsYou) {
      parts.push("Follows you");
    }
    if (relationship.mutualCount > 0) {
      parts.push(`${relationship.mutualCount} mutual${relationship.mutualCount === 1 ? "" : "s"}`);
    }

    return parts.join(" · ") || null;
  }, [profile?.relationship]);

  return (
    <Screen scroll>
      <View className="px-6 pt-6">
        <View className="flex-row items-center gap-4">
          <Avatar
            uri={profile?.avatarUrl}
            label={profile?.user.displayName ?? profile?.user.name}
            size={72}
          />
          <View>
            <Text className="text-2xl font-semibold text-text-primary">
              {profile?.user.displayName ?? profile?.user.name ?? "Profile"}
            </Text>
            <Text className="mt-1 text-sm text-text-tertiary">
              @{profile?.user.username ?? "user"}
            </Text>
            {relationshipSummary ? (
              <Text className="mt-2 text-xs text-brand-400">{relationshipSummary}</Text>
            ) : null}
          </View>
        </View>

        <View className="mt-4 flex-row gap-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/followers/${userId}`);
            }}
            disabled={!profile}
            className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3 active:bg-dark-hover"
          >
            <Text className="text-xs text-text-tertiary">Followers</Text>
            <Text className="text-base font-semibold text-text-primary">
              {profile?.counts.followers ?? 0}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/following/${userId}`);
            }}
            disabled={!profile}
            className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3 active:bg-dark-hover"
          >
            <Text className="text-xs text-text-tertiary">Following</Text>
            <Text className="text-base font-semibold text-text-primary">
              {profile?.counts.following ?? 0}
            </Text>
          </Pressable>
          <View className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
            <Text className="text-xs text-text-tertiary">Reviews</Text>
            <Text className="text-base font-semibold text-text-primary">
              {profile?.counts.reviews ?? 0}
            </Text>
          </View>
        </View>

        {me && me._id !== userIdValue ? (
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

        <View className="mt-8">
          <SectionHeader title="Public lists" />
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

        <View className="mt-8">
          <SectionHeader title="Recent reviews" />
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
    </Screen>
  );
}
