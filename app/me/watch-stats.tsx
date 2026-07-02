import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { EmptyState } from "../../components/EmptyState";
import { GlassPressable } from "../../components/NativeGlass";
import { Screen } from "../../components/Screen";
import { WatchStatsDashboard } from "../../components/WatchStatsDashboard";
import { api } from "../../lib/plotlist/api";
import { useAuth, useQuery } from "../../lib/plotlist/react";
import type { WatchStatsPayload } from "../../lib/watchStats";

export default function WatchStatsScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const stats = useQuery(
    api.episodeProgress.getStats,
    isAuthenticated ? {} : "skip",
  ) as WatchStatsPayload | undefined;

  if (isLoading || (isAuthenticated && !stats)) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38bdf8" />
        </View>
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return (
      <Screen>
        <View className="flex-1 justify-center px-6">
          <EmptyState
            title="Sign in to see watch stats"
            description="Your watch stats are private and follow your Plotlist profile."
          />
          <GlassPressable
            accessibilityRole="button"
            onPress={() => router.replace("/sign-in")}
            radius={8}
            variant="prominent"
            surfaceStyle={{ marginTop: 16 }}
            contentStyle={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: 48,
              paddingHorizontal: 16,
            }}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="log-in" size={16} color="#0D0F14" />
              <Text className="text-sm font-bold text-text-inverse">Sign in</Text>
            </View>
          </GlassPressable>
        </View>
      </Screen>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <WatchStatsDashboard
      stats={stats}
      onBack={() => router.back()}
      onSearch={() => router.push("/search")}
      onMyShows={() => router.push("/me/watchlist")}
      onShow={(showId) => router.push(`/show/${showId}`)}
    />
  );
}
