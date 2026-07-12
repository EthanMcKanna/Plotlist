import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { FlashList } from "../../components/FlashList";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAction, useAuth, useMutation, usePaginatedQuery, useQuery } from "../../lib/plotlist/react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { FanPreviewCard } from "../../components/FanPreviewCard";
import { Poster } from "../../components/Poster";
import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { ReportModal } from "../../components/ReportModal";
import { api } from "../../lib/plotlist/api";
import { formatEpisodeCode, formatRelativeTime } from "../../lib/format";
import { guardedPush } from "../../lib/navigation";
import { usePosterGridLayout, useWebPageStyle } from "../../lib/webLayout";
import { getFollowButtonState } from "../../lib/profilePrivacy";
import { sharePlotlistLink } from "../../lib/share";
import type { Id } from "../../lib/plotlist/types";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { Avatar } from "../../components/Avatar";
import { PageTitle } from "../../components/PageTitle";
import { SpoilerShield } from "../../components/SpoilerShield";
import { GlassSurface } from "../../components/NativeGlass";
import { ShimmerBlock } from "../../components/ShowDetailSkeleton";
import { TasteMatchSummary, TasteMatchSummarySkeleton } from "../../components/TasteMatchSummary";

// Public profile reads as a single centered column on desktop web.
const WEB_PROFILE_MAX_WIDTH = 960;

type ProfileShowPreview = {
  _id: string;
  title: string;
  posterUrl?: string | null;
  year?: number;
};

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

// Instant placeholder mirroring the real layout (gradient header, centered
// avatar/name, stats bar, poster rail) so opening a profile never flashes an
// empty screen while queries resolve.
function ProfileSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={["#0D2B3C", "#0D1821", "#0D0F14"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ paddingTop: insets.top + 16, paddingBottom: 16 }}
      >
        <View className="items-center px-6">
          <ShimmerBlock width={88} height={88} radius={44} />
          <ShimmerBlock width={170} height={24} radius={8} style={{ marginTop: 14 }} />
          <ShimmerBlock width={110} height={14} radius={7} style={{ marginTop: 8 }} />
        </View>
      </LinearGradient>
      <View className="px-6">
        <ShimmerBlock width="100%" height={62} radius={8} />
        <ShimmerBlock width="34%" height={13} radius={7} style={{ marginTop: 30 }} />
        <View className="mt-3 flex-row" style={{ gap: 12 }}>
          <ShimmerBlock width={100} height={150} radius={12} />
          <ShimmerBlock width={100} height={150} radius={12} />
          <ShimmerBlock width={100} height={150} radius={12} />
        </View>
      </View>
    </View>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <View className="flex-row items-center" style={styles.starRow}>
      {Array.from({ length: 5 }, (_, index) => {
        const name =
          rating >= index + 1 ? "star" : rating >= index + 0.5 ? "star-half" : "star-outline";
        return (
          <Ionicons
            key={index}
            name={name}
            size={13}
            color={name === "star-outline" ? "#4B5563" : "#F59E0B"}
          />
        );
      })}
    </View>
  );
}

// Diary-style review row borrowed from the Log page's visual language: flat,
// hairline-divided, small poster, inline stars — no card chrome.
function ProfileReviewRow({ item, isLast }: { item: any; isLast: boolean }) {
  const router = useRouter();
  const review = item.review;
  const episodeLabel =
    typeof review.seasonNumber === "number" && typeof review.episodeNumber === "number"
      ? formatEpisodeCode(review.seasonNumber, review.episodeNumber)
      : null;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/review/${review._id}`);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Review for ${item.show?.title ?? "Unknown"}`}
      className="active:opacity-85"
    >
      <View
        className="flex-row gap-3 py-3"
        style={isLast ? undefined : styles.reviewRowDivider}
      >
        <Poster uri={item.show?.posterUrl} width={42} />
        <View className="min-w-0 flex-1 justify-center">
          <View className="flex-row items-center justify-between gap-3">
            <Text
              className="flex-1 text-[15px] font-semibold text-text-primary"
              numberOfLines={1}
            >
              {item.show?.title ?? "Unknown"}
            </Text>
            {review.createdAt ? (
              <Text className="text-[11px] font-medium text-text-tertiary">
                {formatRelativeTime(review.createdAt)}
              </Text>
            ) : null}
          </View>
          <View className="mt-1 flex-row items-center gap-2">
            <ReviewStars rating={review.rating} />
            {episodeLabel ? (
              <Text
                className="flex-1 text-[12px] font-semibold text-brand-300"
                numberOfLines={1}
              >
                {episodeLabel}
              </Text>
            ) : null}
          </View>
          {review.reviewText ? (
            <View className="mt-1.5">
              <SpoilerShield active={Boolean(review.spoiler)}>
                <Text
                  className="text-[13px] leading-5 text-text-secondary"
                  numberOfLines={3}
                >
                  {review.reviewText}
                </Text>
              </SpoilerShield>
            </View>
          ) : null}
          {review.spoiler ? (
            <View className="mt-1.5 flex-row items-center gap-1">
              <Ionicons name="eye-off-outline" size={11} color="#5A6070" />
              <Text className="text-[11px] font-medium text-text-tertiary">Spoilers</Text>
            </View>
          ) : null}
        </View>
      </View>
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
  const webPageStyle = useWebPageStyle(WEB_PROFILE_MAX_WIDTH);
  // Two cards per row on phones; wider columns add cards (desktop web).
  const publicListGrid = usePosterGridLayout({
    maxWidth: WEB_PROFILE_MAX_WIDTH,
    horizontalPadding: 48,
    gap: 12,
    minColumns: 2,
    targetItemWidth: 280,
  });
  const publicListCardWidth = publicListGrid.itemWidth;
  const userId = typeof params.id === "string" ? params.id : "";

  const userIdValue = userId as Id<"users">;
  const { isAuthenticated } = useAuth();

  const me = useQuery(api.users.me);
  const profile = useQuery(api.users.profile, {
    userId: userIdValue,
  });
  const getProfileTasteExperience = useAction(api.embeddings.getProfileTasteExperience);

  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);
  const blockUser = useMutation(api.blocks.block);
  const unblockUser = useMutation(api.blocks.unblock);
  const createReport = useMutation(api.reports.create);

  const [followPending, setFollowPending] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

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
    ({ item, index }: { item: any; index: number }) => (
      <ProfileReviewRow item={item} isLast={index === reviews.length - 1} />
    ),
    [reviews.length],
  );

  const renderPublicList = useCallback(
    (item: any) => (
      <FanPreviewCard
        key={item._id}
        title={item.title}
        accent="#38BDF8"
        posters={Array.isArray(item.previewPosters) ? item.previewPosters : []}
        meta={
          typeof item.itemCount === "number"
            ? `${item.itemCount} ${item.itemCount === 1 ? "show" : "shows"}`
            : null
        }
        width={publicListCardWidth}
        height={200}
        accessibilityLabel={`Open list ${item.title}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          guardedPush(`/list/${item._id}`);
        }}
      />
    ),
    [publicListCardWidth],
  );

  const relationshipSummary = useMemo(() => {
    const relationship = profile?.relationship;
    if (!relationship) return null;

    const parts: string[] = [];
    if (relationship.inContacts) parts.push("In your contacts");
    if (relationship.isMutualFollow) parts.push("Mutual follow");
    else if (relationship.followsYou) parts.push("Follows you");
    return parts.join(" · ") || null;
  }, [profile?.relationship]);

  const mutualPreview = profile?.relationship?.mutualPreview ?? [];
  const mutualsLine = useMemo(() => {
    const relationship = profile?.relationship;
    const preview = relationship?.mutualPreview ?? [];
    if (!relationship || relationship.mutualCount <= 0 || preview.length === 0) return null;

    const names = preview
      .slice(0, 2)
      .map(
        (person: any) =>
          person.displayName ?? (person.username ? `@${person.username}` : "someone"),
      );
    const others = relationship.mutualCount - names.length;
    if (others <= 0) {
      return names.length === 2
        ? `Followed by ${names[0]} and ${names[1]}`
        : `Followed by ${names[0]}`;
    }
    return `Followed by ${names.join(", ")} and ${others} other${others === 1 ? "" : "s"}`;
  }, [profile?.relationship]);

  const isOwnProfile = me && me._id === userIdValue;
  const relationship = profile?.relationship ?? null;
  const isBlockedByViewer = Boolean(relationship?.blockedByViewer);
  const contentLocked = Boolean(profile?.contentLocked) && !isBlockedByViewer;
  const followState = getFollowButtonState({
    isFollowing: Boolean(relationship?.isFollowing),
    hasPendingRequest: Boolean(relationship?.hasPendingRequest),
  });

  const handleToggleFollow = useCallback(async () => {
    if (followPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowPending(true);
    try {
      if (followState === "follow") {
        await follow({ userIdToFollow: userIdValue });
      } else {
        // "following" unfollows; "requested" withdraws the pending request.
        await unfollow({ userIdToUnfollow: userIdValue });
      }
    } catch (error) {
      console.warn("Failed to update follow", error);
    } finally {
      setFollowPending(false);
    }
  }, [follow, followPending, followState, unfollow, userIdValue]);

  const handleBlock = useCallback(() => {
    const name = profile?.user?.displayName ?? profile?.user?.username ?? "this user";
    Alert.alert(
      `Block ${name}?`,
      "They won't be able to follow you or see your activity, and you won't see theirs. Any follow relationship is removed. They aren't notified.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser({ userId: userIdValue });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert("Could not block", String(error));
            }
          },
        },
      ],
    );
  }, [blockUser, profile?.user?.displayName, profile?.user?.username, userIdValue]);

  const handleUnblock = useCallback(async () => {
    try {
      await unblockUser({ userId: userIdValue });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Could not unblock", String(error));
    }
  }, [unblockUser, userIdValue]);

  const handleSubmitReport = useCallback(
    async (reason?: string) => {
      try {
        await createReport({ targetType: "user", targetId: userIdValue, reason });
        Alert.alert("Report submitted", "Thanks — we'll take a look.");
      } catch (error) {
        Alert.alert("Could not submit report", String(error));
      }
    },
    [createReport, userIdValue],
  );

  const handleShareProfile = useCallback(() => {
    const name =
      profile?.user?.displayName ?? profile?.user?.name ?? profile?.user?.username;
    void sharePlotlistLink(
      `/profile/${userIdValue}`,
      name ? `${name} on Plotlist` : "Check out this profile on Plotlist",
    );
  }, [profile?.user?.displayName, profile?.user?.name, profile?.user?.username, userIdValue]);

  const menuOptions = useMemo<ActionSheetOption[]>(() => {
    const options: ActionSheetOption[] = [
      {
        label: "Share profile",
        icon: "share-outline" as const,
        onPress: handleShareProfile,
      },
    ];
    if (!isOwnProfile) {
      options.push(
        {
          label: "Report user",
          icon: "flag-outline" as const,
          onPress: () => setReportVisible(true),
        },
        isBlockedByViewer
          ? {
              label: "Unblock user",
              icon: "person-add-outline" as const,
              onPress: () => void handleUnblock(),
            }
          : {
              label: "Block user",
              icon: "remove-circle-outline" as const,
              destructive: true,
              onPress: handleBlock,
            },
      );
    }
    return options;
  }, [handleBlock, handleShareProfile, handleUnblock, isBlockedByViewer, isOwnProfile]);

  const [tasteExperience, setTasteExperience] = useState<any | null>(null);
  const [tasteLoading, setTasteLoading] = useState(false);
  const memberSince = formatMemberSince(profile?.memberSince ?? null);

  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isAuthenticated || !me?._id || me._id === userIdValue) {
      setTasteExperience(null);
      setTasteLoading(false);
      return;
    }

    let cancelled = false;
    setTasteLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) {
          setTasteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getProfileTasteExperience, isAuthenticated, me?._id, userIdValue]);

  // Still resolving: show the skeleton rather than an empty shell of
  // placeholder text and zeroed stats.
  if (profile === undefined) {
    return <ProfileSkeleton />;
  }

  // The server returns null when the account doesn't exist or has blocked
  // the viewer; both read as unavailable.
  if (profile === null) {
    return (
      <View className="flex-1 bg-dark-bg">
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View className="flex-1 items-center justify-center px-10">
          <EmptyState
            title="Profile unavailable"
            description="This account doesn't exist or can't be viewed."
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-bg">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={profile?.user?.username ? `@${profile.user.username}` : undefined}
        options={menuOptions}
      />
      <PageTitle
        title={profile?.user?.displayName ?? profile?.user?.name ?? null}
      />
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={handleSubmitReport}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
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
          {me ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMenuVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Profile options"
              hitSlop={10}
              className="absolute right-4 z-10 h-9 w-9 items-center justify-center rounded-full bg-black/30 active:bg-black/50"
              style={{ top: insets.top + 12 }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color="#F1F3F7" />
            </Pressable>
          ) : null}
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

            {/* ── Mutual followers preview ── */}
            {mutualsLine ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  guardedPush(`/profile/${userIdValue}/mutuals`);
                }}
                accessibilityRole="button"
                accessibilityLabel={mutualsLine}
                accessibilityHint="Shows the full list of mutual followers"
                className="mt-3 flex-row items-center active:opacity-70"
              >
                <View className="flex-row">
                  {mutualPreview.slice(0, 3).map((person: any, index: number) => (
                    <View
                      key={person._id}
                      style={{
                        marginLeft: index === 0 ? 0 : -9,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: "#0D1821",
                        zIndex: 3 - index,
                      }}
                    >
                      <Avatar
                        uri={person.avatarUrl}
                        label={person.displayName ?? person.username}
                        size={24}
                      />
                    </View>
                  ))}
                </View>
                <Text
                  className="ml-2 text-xs leading-4 text-text-secondary"
                  style={{ flexShrink: 1 }}
                  numberOfLines={2}
                >
                  {mutualsLine}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </LinearGradient>

        <View className="px-6" style={webPageStyle}>
          {/* ── Stats Bar ── */}
          <GlassSurface
            radius={8}
            variant="surface"
            contentStyle={{ alignItems: "center", flexDirection: "row" }}
          >
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
          </GlassSurface>

          {/* ── Blocked banner ── */}
          {isBlockedByViewer ? (
            <View className="mt-4">
              <GlassSurface radius={8} variant="surface" contentStyle={{ padding: 16 }}>
                <View className="flex-row items-center gap-2">
                  <Ionicons name="remove-circle" size={18} color="#EF4444" />
                  <Text className="flex-1 text-sm font-semibold text-text-primary">
                    You blocked this account
                  </Text>
                </View>
                <Text className="mt-1.5 text-sm leading-5 text-text-tertiary">
                  They can't follow you or see your activity, and their content is hidden
                  from you.
                </Text>
                <SecondaryButton label="Unblock" onPress={handleUnblock} className="mt-3" />
              </GlassSurface>
            </View>
          ) : null}

          {/* ── Follow / Request Button ── */}
          {me && !isOwnProfile && !isBlockedByViewer ? (
            <View className="mt-4">
              <PrimaryButton
                label={
                  followState === "following"
                    ? "Unfollow"
                    : followState === "requested"
                      ? "Requested · Tap to cancel"
                      : profile?.user?.isPrivate
                        ? "Request to follow"
                        : "Follow"
                }
                onPress={handleToggleFollow}
                loading={followPending}
              />
            </View>
          ) : null}

          {/* ── Private account lock ── */}
          {contentLocked ? (
            <View className="mt-4">
              <GlassSurface radius={8} variant="surface" contentStyle={{ padding: 20 }}>
                <View className="items-center">
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-dark-elevated">
                    <Ionicons name="lock-closed" size={22} color="#9BA1B0" />
                  </View>
                  <Text className="mt-3 text-base font-semibold text-text-primary">
                    This account is private
                  </Text>
                  <Text className="mt-1 text-center text-sm leading-5 text-text-tertiary">
                    {followState === "requested"
                      ? "Your follow request is pending approval."
                      : "Follow this account to see their shows, reviews, and lists."}
                  </Text>
                </View>
              </GlassSurface>
            </View>
          ) : null}

          {!isOwnProfile && !contentLocked && tasteLoading && !tasteExperience ? (
            <View className="mt-4">
              <TasteMatchSummarySkeleton />
            </View>
          ) : null}

          {!isOwnProfile && tasteExperience?.tasteMatch ? (
            <View className="mt-4">
              <TasteMatchSummary
                percent={tasteExperience.tasteMatch.percent}
                sharedFavoriteShows={tasteExperience.tasteMatch.sharedFavoriteShows ?? []}
                sharedFacets={tasteExperience.tasteMatch.sharedFacets ?? []}
                hasPicks={(tasteExperience.tasteMatch.picksForViewer ?? []).length > 0}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  guardedPush(`/profile/${userIdValue}/taste`);
                }}
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
                    onPress={() => guardedPush(`/show/${show._id}`)}
                  />
                ))}
              </ScrollView>
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
                    onPress={() => guardedPush(`/show/${show._id}`)}
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
                    onPress={() => guardedPush(`/show/${show._id}`)}
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

          {!contentLocked && !isBlockedByViewer ? (
          <>
          {/* ── Public Lists ── */}
          <View className="mt-7">
            <SectionHeader title="Public Lists" />
            {publicListsStatus === "LoadingFirstPage" ? (
              <View className="mt-4" style={{ flexDirection: "row", gap: 12 }}>
                <ShimmerBlock width={publicListCardWidth} height={200} radius={20} />
                <ShimmerBlock width={publicListCardWidth} height={200} radius={20} />
              </View>
            ) : publicLists.length > 0 ? (
              <View>
                <View
                  className="mt-4 mb-4"
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                >
                  {publicLists.map(renderPublicList)}
                </View>
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
            {reviewsStatus === "LoadingFirstPage" ? (
              <View className="mt-4" style={{ gap: 12 }}>
                <ShimmerBlock width="100%" height={88} radius={12} />
                <ShimmerBlock width="100%" height={88} radius={12} />
              </View>
            ) : reviews.length > 0 ? (
              <View>
                <FlashList
                  data={reviews}
                  renderItem={renderReview}
                  keyExtractor={(item: any) => item.review._id}
                  estimatedItemSize={96}
                  contentContainerStyle={{ paddingVertical: 8 }}
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
          </>
          ) : null}
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the Log page's hairline row divider.
  reviewRowDivider: {
    borderBottomColor: "rgba(255,255,255,0.07)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  starRow: {
    gap: 2,
  },
});
