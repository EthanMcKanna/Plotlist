import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { formatShortDate } from "../lib/format";

type UpNextItem = {
  showId: Id<"shows">;
  show: {
    title: string;
    posterUrl?: string | null;
    backdropUrl?: string | null;
  };
  totalWatched: number;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
  nextAirDate?: number | null;
  nextEpisodeStillUrl?: string | null;
  nextEpisodeName?: string | null;
  isUpcoming?: boolean;
};

const CARD_WIDTH = 240;

export function UpNextRail() {
  const upNextItems = useQuery(api.episodeProgress.getUpNext) as
    | UpNextItem[]
    | undefined;
  const toggleEpisode = useMutation(api.episodeProgress.toggleEpisode);

  const handleMarkWatched = useCallback(
    (item: UpNextItem) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const nextSeason = item.nextSeasonNumber || 1;
      const nextEpisode = item.nextEpisodeNumber || 1;
      toggleEpisode({
        showId: item.showId,
        seasonNumber: nextSeason,
        episodeNumber: nextEpisode,
      });
    },
    [toggleEpisode],
  );

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
          paddingBottom: 4,
          gap: 14,
        }}
      >
        {upNextItems.map((item) => {
          if (!item) return null;
          const nextSeason = item.nextSeasonNumber || 1;
          const nextEpisode = item.nextEpisodeNumber || 1;
          const isUpcoming =
            item.isUpcoming && typeof item.nextAirDate === "number";
          const label = `S${String(nextSeason).padStart(2, "0")} E${String(nextEpisode).padStart(2, "0")}`;
          const imageUrl =
            item.nextEpisodeStillUrl || item.show.backdropUrl || null;

          return (
            <Pressable
              key={item.showId}
              className="active:opacity-80"
              style={{ width: CARD_WIDTH }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/show/[id]",
                  params: {
                    id: item.showId,
                    openSeason: String(nextSeason),
                    openEpisode: String(nextEpisode),
                  },
                });
              }}
            >
              {/* Thumbnail */}
              <View
                className="relative overflow-hidden rounded-2xl"
                style={{ aspectRatio: 16 / 9 }}
              >
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center bg-surface-secondary">
                    <Ionicons name="tv-outline" size={28} color="#4b5563" />
                  </View>
                )}

                {/* Bottom gradient for legibility */}
                <LinearGradient
                  colors={["transparent", "rgba(0, 0, 0, 0.7)"]}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "55%",
                  }}
                />

                {/* Episode badge */}
                <View className="absolute bottom-2.5 left-3 flex-row items-center gap-1.5">
                  <Text
                    className="text-xs font-bold text-white"
                    style={{
                      textShadowColor: "rgba(0,0,0,0.6)",
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    {label}
                  </Text>
                  {isUpcoming && (
                    <View className="rounded-full bg-amber-500/90 px-1.5 py-0.5">
                      <Text className="text-[10px] font-bold text-white">
                        {formatShortDate(item.nextAirDate!)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Mark watched button */}
                {!isUpcoming && (
                  <Pressable
                    className="absolute bottom-2 right-2 items-center justify-center rounded-full active:opacity-60"
                    style={{
                      backgroundColor: "rgba(14, 165, 233, 0.95)",
                      width: 34,
                      height: 34,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.5,
                      shadowRadius: 6,
                      elevation: 6,
                    }}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleMarkWatched(item);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="checkmark" size={18} color="white" />
                  </Pressable>
                )}
              </View>

              {/* Text below thumbnail */}
              <View className="mt-2 px-0.5">
                <Text
                  className="text-[13px] font-semibold text-text-primary"
                  numberOfLines={1}
                >
                  {item.show.title}
                </Text>
                {item.nextEpisodeName ? (
                  <Text
                    className="mt-0.5 text-xs text-text-secondary"
                    numberOfLines={1}
                  >
                    {item.nextEpisodeName}
                  </Text>
                ) : null}
                <Text className="mt-0.5 text-[11px] text-text-tertiary">
                  {isUpcoming
                    ? "Upcoming"
                    : item.totalWatched > 0
                      ? `${item.totalWatched} watched`
                      : "Ready to start"}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
