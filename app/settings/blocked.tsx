import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { FlashList } from "../../components/FlashList";
import { LinkPressable } from "../../components/LinkPressable";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import { notifyError } from "../../lib/dialogs";
import { removeRowsFromPaginatedCaches } from "../../lib/optimisticCache";
import { useMutation, usePaginatedQuery } from "../../lib/plotlist/react";
import { queryClient } from "../../lib/queryClient";

function BlockedUserRow({
  item,
  onUnblock,
}: {
  item: any;
  onUnblock: (userId: string) => void;
}) {
  const nameLabel = item.user.displayName ?? item.user.username ?? "User";
  return (
    <View className="flex-row items-center justify-between rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
      <LinkPressable
        href={`/profile/${item.user._id}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        className="flex-1 flex-row items-center gap-3 pr-3 active:opacity-80 hover:opacity-80 web:transition-opacity"
      >
        <Avatar uri={item.avatarUrl} label={nameLabel} size={44} />
        <View className="flex-1">
          <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
            {nameLabel}
          </Text>
          {item.user.username ? (
            <Text className="text-xs text-text-tertiary" numberOfLines={1}>
              @{item.user.username}
            </Text>
          ) : null}
        </View>
      </LinkPressable>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onUnblock(item.user._id);
        }}
        className="items-center justify-center rounded-full border border-dark-border bg-dark-card px-4 py-2 active:bg-dark-hover hover:bg-dark-hover web:transition-colors"
      >
        <Text className="text-xs font-semibold text-text-primary">Unblock</Text>
      </Pressable>
    </View>
  );
}

export default function BlockedAccountsScreen() {
  const {
    results: blockedUsers,
    status,
    loadMore,
  } = usePaginatedQuery(api.blocks.list, {}, { initialNumItems: 30 });
  const unblock = useMutation(api.blocks.unblock);
  // The row leaves on the tap: cache patch for the current page, local
  // hidden set for pages frozen in usePaginatedQuery state.
  const [unblockedIds, setUnblockedIds] = useState<Set<string>>(() => new Set());
  const visibleBlockedUsers = useMemo(
    () => blockedUsers.filter((item: any) => !unblockedIds.has(item.user._id)),
    [blockedUsers, unblockedIds],
  );

  const listContentStyle = useMemo(() => ({ paddingVertical: 16 }), []);

  const handleUnblock = useCallback(
    async (userId: string) => {
      setUnblockedIds((current) => new Set(current).add(userId));
      try {
        await unblock.withOptimisticUpdate((localStore) => {
          removeRowsFromPaginatedCaches(
            localStore,
            queryClient,
            "blocks:list",
            (row) => row?.user?._id === userId,
          );
        })({ userId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        setUnblockedIds((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
        notifyError("Could not unblock", String(error));
      }
    },
    [unblock],
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => <BlockedUserRow item={item} onUnblock={handleUnblock} />,
    [handleUnblock],
  );

  return (
    <Screen>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">Blocked accounts</Text>
        <Text className="mt-1 text-sm text-text-tertiary">
          Blocked accounts can't follow you or see your activity, and you won't see
          theirs. They aren't notified when you block them.
        </Text>

        <View className="mt-6 flex-1">
          {status === "LoadingFirstPage" ? (
            <View className="mt-16 items-center">
              <ActivityIndicator color="#5A6070" />
            </View>
          ) : visibleBlockedUsers.length > 0 ? (
            <FlashList
              data={visibleBlockedUsers}
              renderItem={renderItem}
              keyExtractor={(item: any) => item.user._id}
              estimatedItemSize={72}
              contentContainerStyle={listContentStyle}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
                title="No blocked accounts"
                description="You can block someone from the menu on their profile."
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
