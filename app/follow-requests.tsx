import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { FlashList } from "../components/FlashList";
import { GlassPressable } from "../components/NativeGlass";
import { Screen } from "../components/Screen";
import { api } from "../lib/plotlist/api";
import { notifyError } from "../lib/dialogs";
import { useMutation, usePaginatedQuery } from "../lib/plotlist/react";
import { SHOW_BACK_BUTTON } from "../lib/webLayout";

function FollowRequestRow({
  item,
  onAccept,
  onDecline,
  busy,
}: {
  item: any;
  onAccept: (requesterId: string) => void;
  onDecline: (requesterId: string) => void;
  busy: boolean;
}) {
  const nameLabel = item.user.displayName ?? item.user.username ?? "User";
  const subtitleParts: string[] = [];
  if (item.inContacts) subtitleParts.push("In your contacts");
  if (item.isFollowing) subtitleParts.push("You follow them");
  if ((item.mutualCount ?? 0) > 0) {
    subtitleParts.push(
      `${item.mutualCount} mutual friend${item.mutualCount === 1 ? "" : "s"}`,
    );
  }

  return (
    <View className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/profile/${item.user._id}`);
          }}
          className="flex-1 flex-row items-center gap-3 active:opacity-80"
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
            {subtitleParts.length > 0 ? (
              <Text className="mt-1 text-xs text-text-tertiary" numberOfLines={1}>
                {subtitleParts.join(" · ")}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </View>
      <View className="mt-3 flex-row gap-2.5">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAccept(item.user._id);
          }}
          disabled={busy}
          className={`flex-1 items-center justify-center rounded-full bg-brand-500 py-2.5 ${
            busy ? "opacity-60" : "active:opacity-80"
          }`}
        >
          <Text className="text-sm font-semibold text-white">Approve</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDecline(item.user._id);
          }}
          disabled={busy}
          className={`flex-1 items-center justify-center rounded-full border border-dark-border bg-dark-card py-2.5 ${
            busy ? "opacity-60" : "active:bg-dark-hover"
          }`}
        >
          <Text className="text-sm font-semibold text-text-primary">Decline</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function FollowRequestsScreen() {
  const {
    results: requests,
    status,
    loadMore,
  } = usePaginatedQuery(api.followRequests.listIncoming, {}, { initialNumItems: 30 });
  const accept = useMutation(api.followRequests.accept);
  const decline = useMutation(api.followRequests.decline);
  const [busyId, setBusyId] = useState<string | null>(null);

  const listContentStyle = useMemo(() => ({ paddingVertical: 12 }), []);

  const handleAccept = useCallback(
    async (requesterId: string) => {
      setBusyId(requesterId);
      try {
        await accept({ requesterId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        notifyError("Could not approve request", String(error));
      } finally {
        setBusyId(null);
      }
    },
    [accept],
  );

  const handleDecline = useCallback(
    async (requesterId: string) => {
      setBusyId(requesterId);
      try {
        await decline({ requesterId });
      } catch (error) {
        notifyError("Could not decline request", String(error));
      } finally {
        setBusyId(null);
      }
    },
    [decline],
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <FollowRequestRow
        item={item}
        onAccept={handleAccept}
        onDecline={handleDecline}
        busy={busyId === item.user._id}
      />
    ),
    [busyId, handleAccept, handleDecline],
  );

  return (
    <Screen>
      <View className="flex-1 px-4 pt-2">
        <View className="flex-row items-center gap-3 px-2">
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
            <Text className="text-2xl font-black text-text-primary">Follow requests</Text>
          </View>
        </View>

        <View className="mt-4 flex-1">
          {status === "LoadingFirstPage" ? (
            <View className="mt-16 items-center">
              <ActivityIndicator color="#5A6070" />
            </View>
          ) : requests.length > 0 ? (
            <FlashList
              data={requests}
              renderItem={renderItem}
              keyExtractor={(item: any) => item.user._id}
              estimatedItemSize={116}
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
                title="No pending requests"
                description="When your account is private, people who want to follow you show up here for approval."
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
