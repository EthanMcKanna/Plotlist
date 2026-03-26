import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "./Avatar";

type FriendItem = {
  user: {
    _id: string;
    username?: string;
    displayName?: string;
    name?: string;
  } | null;
  avatarUrl: string | null;
  watchStatus: "watching" | "completed" | "dropped";
  rating: number | null;
};

export function FriendsActivityRail({ friends }: { friends: FriendItem[] }) {
  const router = useRouter();

  if (friends.length === 0) return null;

  return (
    <View className="mt-4">
      <Text
        className="mb-2.5 px-6 text-xs font-bold uppercase text-text-tertiary"
        style={{ letterSpacing: 1.5 }}
      >
        Friends
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
      >
        {friends.map((friend) => {
          if (!friend.user) return null;
          const label =
            friend.user.displayName ??
            friend.user.name ??
            friend.user.username;

          return (
            <Pressable
              key={friend.user._id}
              onPress={() => router.push(`/profile/${friend.user!._id}`)}
              className="items-center"
              style={{ width: 52 }}
            >
              <Avatar uri={friend.avatarUrl} label={label} size={36} />
              {friend.rating !== null ? (
                <View className="mt-1 flex-row items-center gap-0.5">
                  <Ionicons name="star" size={10} color="#FBBF24" />
                  <Text className="text-[10px] font-semibold text-amber-300">
                    {friend.rating % 1 === 0
                      ? friend.rating.toFixed(0)
                      : friend.rating.toFixed(1)}
                  </Text>
                </View>
              ) : (
                <View className="mt-1 flex-row items-center">
                  <Ionicons
                    name={
                      friend.watchStatus === "completed"
                        ? "checkmark-circle"
                        : friend.watchStatus === "watching"
                          ? "play-circle"
                          : "close-circle"
                    }
                    size={12}
                    color="#5A6070"
                  />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
