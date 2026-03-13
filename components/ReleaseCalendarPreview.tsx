import { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "../convex/_generated/api";
import { formatCalendarDay, formatEpisodeCode } from "../lib/format";
import { getLocalDateString } from "../lib/releaseCalendar";
import { Poster } from "./Poster";
import { SectionHeader } from "./SectionHeader";

function flattenGroups(groups?: Array<{ items?: any[] }>) {
  return (groups ?? []).flatMap((group) => group.items ?? []);
}

export function ReleaseCalendarPreview() {
  const { isAuthenticated } = useConvexAuth();
  const refreshForMe = useAction(api.releaseCalendar.refreshForMe);
  const today = useMemo(() => getLocalDateString(), []);
  const preview = useQuery(
    api.releaseCalendar.getHomePreview,
    isAuthenticated ? { today } : "skip",
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void refreshForMe({}).catch(() => {
      // Keep Home rendering even if the refresh fails.
    });
  }, [isAuthenticated, refreshForMe]);

  if (!isAuthenticated || !preview) {
    return null;
  }

  const tonightItems = flattenGroups(preview.tonightGroups).slice(0, 2);
  const upcomingItems = flattenGroups(preview.upcomingGroups)
    .filter((item) => item.airDate !== today)
    .slice(0, 2);
  const items = tonightItems.length > 0 ? tonightItems : upcomingItems;
  const isTonight = tonightItems.length > 0;

  if (items.length === 0) {
    return null;
  }

  return (
    <View className="mt-10 px-6">
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

      <View className="mt-4 gap-2.5">
        {items.map((item, index) => (
          <Animated.View
            key={`${item.show._id}-${item.seasonNumber}-${item.episodeNumber}`}
            entering={FadeInDown.delay(index * 50).duration(300)}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/show/${item.show._id}`);
              }}
              className="flex-row items-center rounded-2xl border border-dark-border bg-dark-card px-3 py-3 active:opacity-80"
            >
              <Poster uri={item.show.posterUrl} width={52} />

              <View className="ml-3 flex-1">
                <Text
                  className="text-[15px] font-semibold text-text-primary"
                  numberOfLines={1}
                >
                  {item.show.title}
                </Text>

                {/* Episode code + title */}
                <View className="mt-1 flex-row items-center gap-2">
                  <Text className="text-sm font-medium text-brand-400">
                    {formatEpisodeCode(item.seasonNumber, item.episodeNumber)}
                  </Text>
                  {item.episodeTitle ? (
                    <>
                      <View
                        className="rounded-full bg-text-tertiary"
                        style={{ width: 3, height: 3 }}
                      />
                      <Text
                        className="flex-1 text-sm text-text-secondary"
                        numberOfLines={1}
                      >
                        {item.episodeTitle}
                      </Text>
                    </>
                  ) : null}
                </View>

                {/* Date */}
                <View className="mt-1 flex-row items-center gap-1">
                  <Ionicons
                    name={isTonight ? "moon-outline" : "calendar-outline"}
                    size={12}
                    color="#5A6070"
                  />
                  <Text className="text-xs text-text-tertiary">
                    {item.airDate === today
                      ? "Tonight"
                      : formatCalendarDay(item.airDateTs)}
                  </Text>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
