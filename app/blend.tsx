import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { FlashList } from "../components/FlashList";
import { GlassPressable } from "../components/NativeGlass";
import { PageTitle } from "../components/PageTitle";
import { Screen } from "../components/Screen";
import { UserListSkeleton } from "../components/UserListSkeleton";
import { api } from "../lib/plotlist/api";
import { guardedPush } from "../lib/navigation";
import { useAuth, usePaginatedQuery, useQuery } from "../lib/plotlist/react";
import { SHOW_BACK_BUTTON } from "../lib/webLayout";

// Blend picker: choose a watch partner from the people you follow, then
// jump into the pair's blend page (/profile/[id]/blend).

export default function BlendPickerScreen() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const meId = (me as any)?._id ?? (me as any)?.id;

  const {
    results: following,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.follows.listFollowingDetailed,
    meId ? { userId: meId } : "skip",
    { initialNumItems: 30 },
  );

  const listContentStyle = useMemo(() => ({ paddingVertical: 16 }), []);

  const renderItem = useCallback(({ item }: { item: any }) => {
    const displayName =
      item.user.displayName ??
      item.user.name ??
      (item.user.username ? `@${item.user.username}` : "Someone");
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          guardedPush(`/profile/${item.user._id}/blend`);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Blend with ${displayName}`}
        className="flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card px-4 py-3 active:opacity-80 web:transition-colors hover:bg-dark-hover"
      >
        <Avatar uri={item.avatarUrl} label={displayName} size={44} />
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>
            {displayName}
          </Text>
          {item.user.username ? (
            <Text className="mt-0.5 text-[12px] text-text-tertiary" numberOfLines={1}>
              @{item.user.username}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#6B7280" />
      </Pressable>
    );
  }, []);

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen>
        <View className="flex-1 px-6 pt-6">
          <EmptyState
            title="Sign in to make a blend"
            description="Blends mix your taste with a friend's to find shows neither of you has seen."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageTitle title="Blend" />
      <View className="flex-1 px-6 pt-2">
        <View className="flex-row items-center gap-3">
          {SHOW_BACK_BUTTON ? (
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
          ) : null}
          <View className="flex-1">
            <Text className="text-2xl font-black text-text-primary">Blend</Text>
            <Text className="mt-0.5 text-xs text-text-tertiary">
              Pick a partner — get shows neither of you has seen
            </Text>
          </View>
        </View>

        <View className="mt-4 flex-1">
          {status === "LoadingFirstPage" ? (
            <UserListSkeleton />
          ) : following.length > 0 ? (
            <FlashList
              data={following}
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
                title="Follow someone first"
                description="Blends need a partner — follow a friend and their taste joins yours."
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
