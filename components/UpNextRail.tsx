import { Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { formatShortDate } from "../lib/format";
import { Poster } from "./Poster";

type UpNextItem = {
  showId: Id<"shows">;
  show: {
    title: string;
    posterUrl?: string | null;
  };
  totalWatched: number;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
  nextAirDate?: number | null;
  isUpcoming?: boolean;
};

export function UpNextRail() {
  const upNextItems = useQuery(api.episodeProgress.getUpNext) as
    | UpNextItem[]
    | undefined;
  const toggleEpisode = useMutation(api.episodeProgress.toggleEpisode);

  if (!upNextItems || upNextItems.length === 0) return null;

  return (
    <View className="mt-6">
      <View className="px-6">
        <Text
          className="text-xs font-bold uppercase text-text-tertiary"
          style={{ letterSpacing: 1.5 }}
        >
          Up Next
        </Text>
        <Text className="mt-1 text-sm text-text-tertiary">
          Continue where you left off.
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingRight: 16,
          gap: 14,
        }}
      >
        {upNextItems.map((item) => {
          if (!item) return null;
          const nextSeason = item.nextSeasonNumber || 1;
          const nextEpisode = item.nextEpisodeNumber || 1;
          const isUpcoming = item.isUpcoming && typeof item.nextAirDate === "number";
          const label = `S${String(nextSeason).padStart(2, "0")}E${String(nextEpisode).padStart(2, "0")}`;

          return (
            <Pressable
              key={item.showId}
              className="active:opacity-80"
              style={{ width: 140 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/show/${item.showId}`);
              }}
            >
              <View className="relative">
                <Poster uri={item.show.posterUrl} size="lg" />
                {!isUpcoming && (
                  <Pressable
                    className="absolute bottom-2 right-2 rounded-full active:opacity-60"
                    style={{
                      backgroundColor: "#0ea5e9",
                      width: 32,
                      height: 32,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.4,
                      shadowRadius: 4,
                      elevation: 4,
                    }}
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      toggleEpisode({
                        showId: item.showId,
                        seasonNumber: nextSeason,
                        episodeNumber: nextEpisode,
                      });
                    }}
                  >
                    <Ionicons name="checkmark" size={18} color="white" />
                  </Pressable>
                )}
              </View>
              <Text
                className="mt-2 text-sm font-semibold text-text-primary"
                numberOfLines={1}
              >
                {item.show.title}
              </Text>
              <Text className="mt-0.5 text-xs font-medium text-brand-400">
                {label}
              </Text>
              {isUpcoming ? (
                <Text className="mt-0.5 text-xs text-text-tertiary">
                  Airs {formatShortDate(item.nextAirDate!)}
                </Text>
              ) : item.totalWatched > 0 ? (
                <Text className="mt-0.5 text-xs text-text-tertiary">
                  {item.totalWatched} episodes watched
                </Text>
              ) : (
                <Text className="mt-0.5 text-xs text-text-tertiary">
                  Ready to start
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
