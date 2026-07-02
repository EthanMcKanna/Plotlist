import { useMemo } from "react";
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
import { FeedItem, type FeedItemProps } from "./FeedItem";
import { HomeSectionHeader } from "./HomeSectionHeader";
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
};

type FriendsActivityProps = {
  index?: number;
  viewerId?: Id<"users"> | null;
  contactMatches: PersonPreview[];
  similarTaste: PersonPreview[];
  suggested: PersonPreview[];
  feedItems: FeedItemProps[];
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

export function getFriendsActivityFeedItems(
  items: FeedItemProps[],
  viewerId?: Id<"users"> | null,
  limit = 3,
): FeedItemProps[] {
  const out: FeedItemProps[] = [];
  for (const item of items) {
    const userId = item.user?._id;
    if (!userId) continue;
    if (viewerId && userId === viewerId) continue;
    out.push(item);
    if (out.length >= limit) return out;
  }
  return out;
}

export function FriendsActivity({
  index,
  viewerId,
  contactMatches,
  similarTaste,
  suggested,
  feedItems,
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
  const visibleFeed = useMemo(
    () => getFriendsActivityFeedItems(feedItems, viewerId, 3),
    [feedItems, viewerId],
  );
  const feedSettled = feedEmpty || feedItems.length > 0;

  if (people.length === 0 && visibleFeed.length === 0 && feedSettled) {
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
        actionLabel={visibleFeed.length > 0 ? "See all" : undefined}
        actionLabelVisible={false}
        onAction={
          visibleFeed.length > 0
            ? () => router.push("/search")
            : undefined
        }
      />

      {people.length > 0 ? (
        <View className="mt-4">
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

      {visibleFeed.length > 0 ? (
        <View className="mt-5 gap-5 px-6">
          {visibleFeed.map((item, idx) => (
            <Animated.View
              key={`${item.type}-${idx}-${item.timestamp}`}
              entering={
                ENABLE_ENTRY_ANIMATIONS
                  ? FadeInUp.delay(idx * 35).duration(280)
                  : undefined
              }
            >
              <FeedItem item={item} />
            </Animated.View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PersonChip({
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
