import { useEffect, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../convex/_generated/api";
import { formatCalendarDay, formatEpisodeCode } from "../lib/format";
import { getLocalDateString } from "../lib/releaseCalendar";
import { SectionHeader } from "./SectionHeader";

function flattenGroups(groups?: Array<{ items?: any[] }>) {
  return (groups ?? []).flatMap((group) => group.items ?? []);
}

const CARD_WIDTH = 240;

export function ReleaseCalendarPreview() {
  const { isAuthenticated } = useConvexAuth();
  const refreshForMe = useAction(api.releaseCalendar.refreshForMe);
  const today = useMemo(() => getLocalDateString(), []);
  const preview = useQuery(
    api.releaseCalendar.getHomePreview,
    isAuthenticated ? { today } : "skip",
  );

  useEffect(() => {
    if (!isAuthenticated || !preview || preview.staleShowIds.length === 0) {
      return;
    }

    void refreshForMe({}).catch(() => {
      // Keep Home rendering even if the refresh fails.
    });
  }, [isAuthenticated, preview, refreshForMe]);

  if (!isAuthenticated || !preview) {
    return null;
  }

  const tonightItems = flattenGroups(preview.tonightGroups).slice(0, 6);
  const upcomingItems = flattenGroups(preview.upcomingGroups)
    .filter((item) => item.airDate !== today)
    .slice(0, 6);
  const items = tonightItems.length > 0 ? tonightItems : upcomingItems;
  const isTonight = tonightItems.length > 0;

  if (items.length === 0) {
    return null;
  }

  return (
    <View className="mt-10">
      <View className="px-6">
        <SectionHeader
          title={isTonight ? "On Tonight" : "Coming Up"}
          action={
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/calendar");
              }}
              className="flex-row items-center gap-1 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-text-tertiary">All releases</Text>
              <Ionicons name="chevron-forward" size={14} color="#5A6070" />
            </Pressable>
          }
        />
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
        {items.map((item) => {
          const imageUrl = item.show.backdropUrl || null;

          return (
            <Pressable
              key={`${item.show._id}-${item.seasonNumber}-${item.episodeNumber}`}
              className="active:opacity-80"
              style={{ width: CARD_WIDTH }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/show/${item.show._id}`);
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

                {/* Bottom gradient */}
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

                {/* Episode badge + date on image */}
                <View className="absolute bottom-2.5 left-3 right-3 flex-row items-center justify-between">
                  <Text
                    className="text-xs font-bold text-white"
                    style={{
                      textShadowColor: "rgba(0,0,0,0.6)",
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    {formatEpisodeCode(item.seasonNumber, item.episodeNumber)}
                  </Text>
                  <View className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: isTonight ? "rgba(56, 189, 248, 0.85)" : "rgba(255,255,255,0.2)" }}>
                    <Text className="text-[10px] font-bold text-white">
                      {item.airDate === today
                        ? "Tonight"
                        : formatCalendarDay(item.airDateTs)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Text below thumbnail */}
              <View className="mt-2 px-0.5">
                <Text
                  className="text-[13px] font-semibold text-text-primary"
                  numberOfLines={1}
                >
                  {item.show.title}
                </Text>
                {item.episodeTitle ? (
                  <Text
                    className="mt-0.5 text-xs text-text-secondary"
                    numberOfLines={1}
                  >
                    {item.episodeTitle}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
