import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

import { EmptyState } from "../components/EmptyState";
import { FlashList } from "../components/FlashList";
import {
  PersonChip,
  getFriendsActivityPeople,
  FriendActivityRow,
} from "../components/FriendsActivity";
import { GlassPressable } from "../components/NativeGlass";
import { Screen } from "../components/Screen";
import { ShimmerBlock } from "../components/ShowDetailSkeleton";
import { api } from "../lib/plotlist/api";
import { buildFriendActivity, type FriendActivityEntry } from "../lib/friendsActivity";
import { useAuth, usePaginatedQuery, useQuery } from "../lib/plotlist/react";

const PAGE_SIZE = 40;

function ActivityRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 py-3">
      <ShimmerBlock width={40} height={40} radius={20} />
      <View className="flex-1 gap-2">
        <ShimmerBlock width="70%" height={14} radius={7} />
        <ShimmerBlock width="40%" height={11} radius={6} />
      </View>
      <ShimmerBlock width={40} height={60} radius={8} />
    </View>
  );
}

export default function FriendsScreen() {
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const hasProfile = Boolean(me?._id);

  const {
    results: feed,
    status,
    loadMore,
  } = usePaginatedQuery(api.feed.listForUser, hasProfile ? {} : "skip", {
    initialNumItems: PAGE_SIZE,
  });

  // Same query keys as the home Friends section, so this screen opens warm.
  const contactStatus =
    useQuery(api.contacts.getStatus, hasProfile ? {} : "skip") ?? null;
  const contactMatches =
    useQuery(
      api.contacts.getMatches,
      hasProfile && contactStatus?.hasSynced ? { limit: 4 } : "skip",
    ) ?? [];
  const suggested =
    useQuery(api.users.suggested, hasProfile ? { limit: 4 } : "skip") ?? [];

  const entries = useMemo(
    () => buildFriendActivity(feed, { viewerId: me?._id ?? null }),
    [feed, me?._id],
  );
  const people = useMemo(
    () =>
      getFriendsActivityPeople(
        [
          { source: "contacts", people: contactMatches },
          { source: "suggested", people: suggested },
        ],
        me?._id ?? null,
      ),
    [contactMatches, suggested, me?._id],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FriendActivityEntry; index: number }) => (
      <FriendActivityRow entry={item} isLast={index === entries.length - 1} />
    ),
    [entries.length],
  );

  const listHeader = useMemo(() => {
    if (people.length === 0) return null;
    return (
      <View className="pb-3">
        <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-text-tertiary">
          Add friends
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
        >
          {people.map((person, idx) => (
            <PersonChip key={person.user._id} person={person} index={idx} />
          ))}
        </ScrollView>
      </View>
    );
  }, [people]);

  return (
    <Screen>
      <View className="flex-1 px-6 pt-2">
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
            <Text className="text-2xl font-black text-text-primary">Friends</Text>
            <Text className="mt-0.5 text-xs text-text-tertiary">
              What people you follow are watching
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/search?mode=people");
            }}
            accessibilityRole="button"
            accessibilityLabel="Find people"
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full border border-dark-border bg-dark-card active:bg-dark-hover"
          >
            <Ionicons name="person-add-outline" size={17} color="#9BA1B0" />
          </Pressable>
        </View>

        <View className="mt-4 flex-1">
          {status === "LoadingFirstPage" ? (
            <View className="pt-2">
              {Array.from({ length: 8 }, (_, index) => (
                <ActivityRowSkeleton key={index} />
              ))}
            </View>
          ) : entries.length > 0 ? (
            <FlashList
              data={entries}
              renderItem={renderItem}
              keyExtractor={(item: FriendActivityEntry) => item.key}
              estimatedItemSize={78}
              contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
              ListHeaderComponent={listHeader}
              ListFooterComponent={
                status === "LoadingMore" ? (
                  <View className="items-center py-6">
                    <ActivityIndicator color="#38BDF8" />
                  </View>
                ) : null
              }
              onEndReached={() => {
                if (status === "CanLoadMore") {
                  loadMore(PAGE_SIZE);
                }
              }}
              onEndReachedThreshold={0.5}
            />
          ) : (
            <View className="pt-2">
              {listHeader}
              <EmptyState
                title="No activity yet"
                description="Follow people to see what they watch, rate, and review — it all lands here."
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
