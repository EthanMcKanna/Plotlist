import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp } from "react-native-reanimated";

import { Avatar } from "./Avatar";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { Poster } from "./Poster";
import { formatRelativeTime } from "../lib/format";
import {
  getFriendActivityActorName,
  getFriendWatchedPhrase,
  type FriendActivityEntry,
} from "../lib/friendsActivity";
import { guardedPush } from "../lib/navigation";
import { useMutation } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
import type { Id } from "../lib/plotlist/types";

const ACCENT = "#A855F7";
const ENABLE_ENTRY_ANIMATIONS = Platform.OS !== "web";
export const FRIENDS_ACTIVITY_TOUCH_TARGET = 44;

export type PersonPreview = {
  user: {
    _id: Id<"users">;
    displayName?: string | null;
    name?: string | null;
    username?: string | null;
  };
  avatarUrl?: string | null;
  isFollowing?: boolean;
  followsYou?: boolean;
  isMutualFollow?: boolean;
  inContacts?: boolean;
  mutualCount?: number;
  sharedShowCount?: number;
  sharedGenreCount?: number;
  // Calibrated recs-v2 similarity percent (present when both users have
  // taste profiles; 50 = an average pair of watchers).
  tasteMatchPercent?: number;
};

type FriendsActivityProps = {
  index?: number;
  viewerId?: Id<"users"> | null;
  contactMatches: PersonPreview[];
  similarTaste: PersonPreview[];
  suggested: PersonPreview[];
  activity: FriendActivityEntry[];
  feedEmpty: boolean;
  onSyncContacts?: () => void;
  syncingContacts?: boolean;
  hasSyncedContacts?: boolean;
};

type PeopleGroup = {
  source: "contacts" | "taste" | "suggested";
  people: PersonPreview[];
};

function hasPersonalSignal(person: PersonPreview, source: PeopleGroup["source"]) {
  if (source === "contacts") return true;
  if (person.inContacts || person.followsYou || person.isMutualFollow) return true;
  if ((person.mutualCount ?? 0) > 0) return true;
  if ((person.sharedShowCount ?? 0) > 0) return true;
  if ((person.tasteMatchPercent ?? 0) >= 60) return true;
  if (source === "taste" && (person.sharedGenreCount ?? 0) >= 2) return true;
  return false;
}

export function getFriendsActivityPeople(
  groups: PeopleGroup[],
  viewerId?: Id<"users"> | null,
  limit = 6,
): PersonPreview[] {
  const seen = new Set<string>();
  const out: PersonPreview[] = [];
  for (const group of groups) {
    for (const candidate of group.people) {
      if (!candidate?.user?._id) continue;
      if (viewerId && candidate.user._id === viewerId) continue;
      if (seen.has(candidate.user._id)) continue;
      if (candidate.isFollowing) continue;
      if (!hasPersonalSignal(candidate, group.source)) continue;
      seen.add(candidate.user._id);
      out.push(candidate);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function ActivityStars({ rating }: { rating: number }) {
  return (
    <View className="flex-row items-center" style={styles.starRow}>
      {Array.from({ length: 5 }, (_, index) => {
        const name =
          rating >= index + 1 ? "star" : rating >= index + 0.5 ? "star-half" : "star-outline";
        return (
          <Ionicons
            key={index}
            name={name}
            size={12}
            color={name === "star-outline" ? "#4B5563" : "#F59E0B"}
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
        );
      })}
    </View>
  );
}

export function getFriendActivityRowLabel(entry: FriendActivityEntry) {
  const name = getFriendActivityActorName(entry.actor);
  if (entry.kind === "follow") {
    return `${name} followed ${getFriendActivityActorName(entry.followedUser)}`;
  }
  if (entry.kind === "list") {
    return `${name} created the list ${entry.listTitle}`;
  }
  const title = entry.show.title ?? "a show";
  if (entry.kind === "review") {
    return `${name} rated ${title}`;
  }
  const phrase = getFriendWatchedPhrase(entry);
  return `${name} ${phrase} ${title}`;
}

// One diary-style line per moment: avatar, "<name> watched <show>" headline,
// meta line (episode / stars · time), optional review snippet, poster on the
// right. Shared between the home Friends section and the /friends screen.
export function FriendActivityRow({
  entry,
  isLast,
}: {
  entry: FriendActivityEntry;
  isLast: boolean;
}) {
  const name = getFriendActivityActorName(entry.actor);
  const timeLabel = formatRelativeTime(entry.timestamp);
  const isReview = entry.kind === "review";
  const isWatched = entry.kind === "watched";

  const openTarget = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (entry.kind === "review") {
      router.push(`/review/${entry.reviewId}`);
      return;
    }
    if (entry.kind === "follow") {
      router.push(`/profile/${entry.followedUser._id}`);
      return;
    }
    if (entry.kind === "list") {
      guardedPush(`/list/${entry.listId}`);
      return;
    }
    guardedPush(`/show/${entry.show._id}`);
  };

  const openProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${entry.actor._id}`);
  };

  const openLogComments = () => {
    if (entry.kind !== "watched" || !entry.logId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/comments?targetType=log&targetId=${encodeURIComponent(entry.logId)}`,
    );
  };

  let headline: ReactNode;
  if (entry.kind === "follow") {
    headline = (
      <>
        <Text className="font-bold text-text-primary">{name}</Text>
        {" followed "}
        <Text className="font-semibold text-text-primary">
          {getFriendActivityActorName(entry.followedUser)}
        </Text>
      </>
    );
  } else if (entry.kind === "list") {
    headline = (
      <>
        <Text className="font-bold text-text-primary">{name}</Text>
        {" created "}
        <Text className="font-semibold text-text-primary">{entry.listTitle}</Text>
      </>
    );
  } else {
    headline = (
      <>
        <Text className="font-bold text-text-primary">{name}</Text>
        {` ${isReview ? "rated" : getFriendWatchedPhrase(entry)} `}
        <Text className="font-semibold text-text-primary">
          {entry.show.title ?? "a show"}
        </Text>
      </>
    );
  }

  const metaLabel =
    entry.kind === "review" || entry.kind === "watched" ? entry.episodeLabel : null;
  const snippet =
    entry.kind === "review" && entry.reviewText && !entry.spoiler
      ? entry.reviewText
      : entry.kind === "list"
        ? entry.listDescription
        : null;

  // Avatar and row content are sibling pressables (never nested) so the web
  // output stays valid HTML — a button may not contain another button.
  return (
    <View
      className="flex-row items-center gap-3 py-3"
      style={isLast ? undefined : styles.rowDivider}
    >
      <Pressable
        onPress={openProfile}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
        hitSlop={6}
        className="active:opacity-80"
      >
        <Avatar uri={entry.avatarUrl} label={name} size={40} />
      </Pressable>

      <Pressable
        onPress={openTarget}
        accessibilityRole="button"
        accessibilityLabel={getFriendActivityRowLabel(entry)}
        className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-85"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] leading-[19px] text-text-secondary" numberOfLines={2}>
            {headline}
          </Text>

          <View className="mt-1 flex-row items-center gap-2">
            {isReview ? <ActivityStars rating={entry.rating} /> : null}
            {metaLabel ? (
              <Text className="text-[12px] font-semibold text-brand-300" numberOfLines={1}>
                {metaLabel}
              </Text>
            ) : null}
            {entry.kind === "list" ? (
              <Text className="text-[12px] font-semibold text-brand-300" numberOfLines={1}>
                New list
              </Text>
            ) : null}
            <Text className="text-[11px] font-medium text-text-tertiary" numberOfLines={1}>
              {timeLabel}
            </Text>
          </View>

          {snippet ? (
            <Text
              className="mt-1 text-[13px] leading-[18px] text-text-tertiary"
              numberOfLines={2}
            >
              {snippet}
            </Text>
          ) : null}
          {isReview && entry.spoiler ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Ionicons
                name="eye-off-outline"
                size={11}
                color="#5A6070"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
              <Text className="text-[11px] font-medium text-text-tertiary">
                Spoilers hidden
              </Text>
            </View>
          ) : null}
        </View>

        {entry.kind === "follow" ? (
          <Avatar
            uri={entry.followedAvatarUrl}
            label={getFriendActivityActorName(entry.followedUser)}
            size={40}
          />
        ) : entry.kind === "list" ? (
          <View style={styles.listBadge}>
            <Ionicons
              name="albums-outline"
              size={18}
              color="#9BA1B0"
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          </View>
        ) : (
          <Poster uri={entry.show.posterUrl} width={40} />
        )}
      </Pressable>

      {isWatched && entry.logId ? (
        <Pressable
          onPress={openLogComments}
          accessibilityRole="button"
          accessibilityLabel="View comments on this watch"
          hitSlop={8}
          className="active:opacity-70"
        >
          <Ionicons name="chatbubble-outline" size={16} color="#5A6070" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function FriendsActivity({
  index,
  viewerId,
  contactMatches,
  similarTaste,
  suggested,
  activity,
  feedEmpty,
  onSyncContacts,
  syncingContacts = false,
  hasSyncedContacts = false,
}: FriendsActivityProps) {
  const people = useMemo(
    () =>
      getFriendsActivityPeople(
        [
          { source: "contacts", people: contactMatches },
          { source: "taste", people: similarTaste },
          { source: "suggested", people: suggested },
        ],
        viewerId,
      ),
    [contactMatches, similarTaste, suggested, viewerId],
  );
  const visibleActivity = useMemo(() => activity.slice(0, 3), [activity]);
  const feedSettled = feedEmpty || activity.length > 0;

  if (people.length === 0 && visibleActivity.length === 0 && feedSettled) {
    const syncLabel = hasSyncedContacts ? "Refresh contacts" : "Sync contacts";

    return (
      <View className="mt-8">
        <HomeSectionHeader
          index={index}
          kicker="People"
          title="Friends"
          accent={ACCENT}
          icon="people"
        />
        <View className="mt-4 px-6">
          <View style={styles.emptyCard}>
            <View style={styles.emptyActions}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/search");
                }}
                testID="friends-empty-find-people"
                style={styles.primaryEmptyButton}
                className="active:opacity-85"
                accessibilityRole="button"
                accessibilityLabel="Find people"
              >
                <Ionicons
                  name="search"
                  size={15}
                  color="#0D0F14"
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden={true}
                  importantForAccessibility="no"
                />
                <Text className="text-[13px] font-bold text-text-inverse">
                  Find people
                </Text>
              </Pressable>

              {onSyncContacts ? (
                <Pressable
                  onPress={() => {
                    if (syncingContacts) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSyncContacts();
                  }}
                  disabled={syncingContacts}
                  testID="friends-empty-sync-contacts"
                  style={[
                    styles.secondaryEmptyButton,
                    syncingContacts ? styles.disabledEmptyButton : null,
                  ]}
                  className="active:opacity-80"
                  accessibilityRole="button"
                  accessibilityLabel={syncLabel}
                  accessibilityState={{
                    disabled: syncingContacts,
                    busy: syncingContacts,
                  }}
                >
                  {syncingContacts ? (
                    <ActivityIndicator size="small" color="#D6DAE6" />
                  ) : (
                    <Ionicons
                      name="sync"
                      size={15}
                      color="#D6DAE6"
                      accessible={false}
                      accessibilityElementsHidden
                      aria-hidden={true}
                      importantForAccessibility="no"
                    />
                  )}
                  <Text className="text-[13px] font-bold text-text-primary">
                    {syncLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {onSyncContacts ? (
              <View style={styles.emptyMetaRow}>
                <Ionicons
                  name="lock-closed"
                  size={12}
                  color="#9BA1B0"
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden={true}
                  importantForAccessibility="no"
                />
                <Text className="text-[11px] font-semibold text-text-tertiary">
                  Contacts stay private
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker="People"
        title="Friends"
        accent={ACCENT}
        icon="people"
        actionLabel={visibleActivity.length > 0 ? "All activity" : undefined}
        actionLabelVisible={false}
        onAction={
          visibleActivity.length > 0
            ? () => router.push("/friends")
            : undefined
        }
      />

      {visibleActivity.length > 0 ? (
        <View className="mt-2 px-6">
          {visibleActivity.map((entry, idx) => (
            <Animated.View
              key={entry.key}
              entering={
                ENABLE_ENTRY_ANIMATIONS
                  ? FadeInUp.delay(idx * 35).duration(280)
                  : undefined
              }
            >
              <FriendActivityRow
                entry={entry}
                isLast={idx === visibleActivity.length - 1}
              />
            </Animated.View>
          ))}
        </View>
      ) : null}

      {people.length > 0 ? (
        <View className={visibleActivity.length > 0 ? "mt-2" : "mt-4"}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.peopleRail}
            decelerationRate="fast"
          >
            {people.map((person, idx) => (
              <PersonChip key={person.user._id} person={person} index={idx} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function PersonChip({
  person,
  index,
}: {
  person: PersonPreview;
  index: number;
}) {
  const follow = useMutation(api.follows.follow);
  const label =
    person.user.displayName ?? person.user.name ?? person.user.username ?? "User";
  const username = person.user.username ? `@${person.user.username}` : null;
  const subtitle =
    person.inContacts
      ? "In contacts"
      : person.followsYou
        ? "Follows you"
      : (person.tasteMatchPercent ?? 0) >= 55
        ? `${person.tasteMatchPercent}% match`
      : (person.mutualCount ?? 0) > 0
        ? `${person.mutualCount} mutual`
        : (person.sharedShowCount ?? 0) > 0
          ? `${person.sharedShowCount} shared show${person.sharedShowCount === 1 ? "" : "s"}`
          : (person.sharedGenreCount ?? 0) >= 2
            ? `${person.sharedGenreCount} shared genres`
            : null;
  const visibleHandle = subtitle ? null : username;

  return (
    <Animated.View
      entering={
        ENABLE_ENTRY_ANIMATIONS
          ? FadeInUp.delay(index * 30).duration(260)
          : undefined
      }
      style={styles.personCard}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/profile/${person.user._id}`);
        }}
        className="active:opacity-85"
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
        style={styles.personPress}
      >
        <Avatar uri={person.avatarUrl ?? null} label={label} size={56} />
        <Text
          className="mt-3 text-center text-[13px] font-bold text-text-primary"
          numberOfLines={1}
        >
          {label}
        </Text>
        {visibleHandle ? (
          <Text className="text-[11px] text-text-tertiary" numberOfLines={1}>
            {visibleHandle}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            className="mt-1 text-center text-[11px] font-semibold text-text-secondary"
            style={{ color: ACCENT }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          void follow({ userIdToFollow: person.user._id });
        }}
        accessibilityRole="button"
        accessibilityLabel={`Follow ${label}`}
        style={styles.followButton}
        className="active:opacity-80"
      >
        <Ionicons
          name="add"
          size={17}
          color="#0D0F14"
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  peopleRail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 2,
  },
  personCard: {
    alignItems: "center",
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
    width: 152,
  },
  personPress: {
    alignItems: "center",
    width: "100%",
  },
  followButton: {
    alignItems: "center",
    backgroundColor: "#F1F3F7",
    borderRadius: 999,
    height: FRIENDS_ACTIVITY_TOUCH_TARGET,
    justifyContent: "center",
    minHeight: FRIENDS_ACTIVITY_TOUCH_TARGET,
    minWidth: FRIENDS_ACTIVITY_TOUCH_TARGET,
    width: FRIENDS_ACTIVITY_TOUCH_TARGET,
  },
  rowDivider: {
    borderBottomColor: "rgba(255,255,255,0.07)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listBadge: {
    alignItems: "center",
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    width: 40,
  },
  starRow: {
    gap: 1,
  },
  emptyCard: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryEmptyButton: {
    alignItems: "center",
    backgroundColor: "#F1F3F7",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    minHeight: FRIENDS_ACTIVITY_TOUCH_TARGET,
    minWidth: FRIENDS_ACTIVITY_TOUCH_TARGET,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  secondaryEmptyButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: FRIENDS_ACTIVITY_TOUCH_TARGET,
    minWidth: FRIENDS_ACTIVITY_TOUCH_TARGET,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  disabledEmptyButton: {
    opacity: 0.58,
  },
  emptyMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
});
