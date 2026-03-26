import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { usePaginatedQuery, useQuery } from "convex/react";

import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { UserRow } from "../../components/UserRow";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useConvexAuth } from "convex/react";

export default function FollowersScreen() {
  const params = useLocalSearchParams();
  const userId = typeof params.id === "string" ? params.id : "";
  const userIdValue = userId as Id<"users">;
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  const profile = useQuery(api.users.profile, { userId: userIdValue });
  const {
    results: followers,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.follows.listFollowersDetailed,
    { userId: userIdValue },
    { initialNumItems: 30 },
  );

  const listContentStyle = useMemo(() => ({ paddingVertical: 16 }), []);

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const isSelf = me?._id === item.user._id;
      return (
        <UserRow
          userId={item.user._id}
          displayName={item.user.displayName ?? item.user.name}
          username={item.user.username}
          avatarUrl={item.avatarUrl}
          isFollowing={item.isFollowing}
          followsYou={item.followsYou}
          isMutualFollow={item.isMutualFollow}
          mutualCount={item.mutualCount}
          inContacts={item.inContacts}
          showFollowButton={!isSelf}
          subtitle={isSelf ? "You" : undefined}
        />
      );
    },
    [me?._id],
  );

  const profileName = profile?.user.displayName ?? profile?.user.name;

  return (
    <Screen>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">Followers</Text>
        <Text className="mt-1 text-sm text-text-tertiary">
          {profileName
            ? `People following ${profileName}`
            : "People following this profile."}
        </Text>

        <View className="mt-6 flex-1">
          {followers.length > 0 ? (
            <FlashList
              data={followers}
              renderItem={renderItem}
              keyExtractor={(item: any) => item.user._id}
              estimatedItemSize={92}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              contentContainerStyle={listContentStyle}
              onEndReached={() => {
                if (status === "CanLoadMore") {
                  loadMore(30);
                }
              }}
              onEndReachedThreshold={0.5}
            />
          ) : (
            <View className="mt-4">
              <EmptyState
                title="No followers yet"
                description="Share your profile to start building your audience."
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
