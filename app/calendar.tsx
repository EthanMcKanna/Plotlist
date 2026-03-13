import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";

import { EmptyState } from "../components/EmptyState";
import { Poster } from "../components/Poster";
import { Screen } from "../components/Screen";
import { SegmentedControl } from "../components/SegmentedControl";
import { api } from "../convex/_generated/api";
import { formatCalendarDay, formatEpisodeCode } from "../lib/format";
import {
  RELEASE_CALENDAR_VIEWS,
  getLocalDateString,
  type ReleaseCalendarView,
} from "../lib/releaseCalendar";

/* ─── Badge ───────────────────────────────────────────────────────── */

function EventBadge({
  label,
  tone,
}: {
  label: string;
  tone: "primary" | "accent" | "neutral";
}) {
  const bg =
    tone === "primary"
      ? "rgba(14, 165, 233, 0.12)"
      : tone === "accent"
        ? "rgba(34, 197, 94, 0.12)"
        : "rgba(90, 96, 112, 0.1)";
  const fg =
    tone === "primary"
      ? "#7dd3fc"
      : tone === "accent"
        ? "#4ade80"
        : "#9BA1B0";

  return (
    <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="font-semibold" style={{ fontSize: 11, color: fg }}>
        {label}
      </Text>
    </View>
  );
}

/* ─── Empty states ────────────────────────────────────────────────── */

function getEmptyCopy(view: ReleaseCalendarView) {
  switch (view) {
    case "tonight":
      return {
        title: "Nothing airing tonight",
        description:
          "No watchlist or currently watching shows have episodes scheduled for today.",
      };
    case "premieres":
      return {
        title: "No premieres on deck",
        description:
          "New series premieres from your saved shows will appear here.",
      };
    case "returning":
      return {
        title: "No returning seasons",
        description:
          "Season returns from your saved shows will show up here.",
      };
    case "finales":
      return {
        title: "No finales scheduled",
        description:
          "Season and series finales will appear here when they are upcoming.",
      };
    default:
      return {
        title: "No upcoming releases",
        description:
          "Add more shows to your watchlist or mark them as watching to build this calendar.",
      };
  }
}

/* ─── Main screen ─────────────────────────────────────────────────── */

export default function CalendarScreen() {
  const { isAuthenticated } = useConvexAuth();
  const refreshForMe = useAction(api.releaseCalendar.refreshForMe);
  const [view, setView] = useState<ReleaseCalendarView>("upcoming");
  const today = useMemo(() => getLocalDateString(), []);
  const data = useQuery(
    api.releaseCalendar.listForMe,
    isAuthenticated
      ? { view, today, limit: 100 }
      : "skip",
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void refreshForMe({}).catch(() => {
      // Render cached data even if refresh fails.
    });
  }, [isAuthenticated, refreshForMe]);

  if (!isAuthenticated) {
    return (
      <Screen>
        <View className="flex-1 px-6 pt-6">
          <EmptyState
            title="Sign in to see your release calendar"
            description="Your saved shows power upcoming episodes, premieres, and finales."
          />
        </View>
      </Screen>
    );
  }

  const emptyCopy = getEmptyCopy(view);

  return (
    <Screen scroll keyboardShouldPersistTaps="always">
      <View className="px-6 pb-24 pt-6">
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={12}
            className="active:opacity-70"
          >
            <Ionicons name="chevron-back" size={28} color="#E8EAED" />
          </Pressable>
          <Text className="text-2xl font-semibold text-text-primary">
            Releases
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {/* View switcher */}
        <View className="mt-6">
          <SegmentedControl
            options={RELEASE_CALENDAR_VIEWS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            value={view}
            onChange={(next) => setView(next as ReleaseCalendarView)}
          />
        </View>

        {/* Content */}
        {!data ? (
          <View className="items-center justify-center py-16">
            <ActivityIndicator size="small" color="#0ea5e9" />
          </View>
        ) : data.groups.length === 0 ? (
          <View className="pt-10">
            <EmptyState
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          </View>
        ) : (
          <View className="mt-8 gap-10">
            {data.groups.map((group: any, groupIndex: number) => {
              const isToday = group.airDate === today;

              return (
                <Animated.View
                  key={group.airDate}
                  entering={FadeInDown.delay(groupIndex * 60).duration(300)}
                >
                  {/* Date label */}
                  <Text
                    className="font-bold uppercase"
                    style={{
                      fontSize: 11,
                      letterSpacing: 1.8,
                      color: isToday ? "#38bdf8" : "#9BA1B0",
                    }}
                  >
                    {isToday ? "Tonight" : formatCalendarDay(group.airDateTs)}
                  </Text>

                  {/* Cards */}
                  <View className="mt-3 gap-2.5">
                    {group.items.map((item: any, itemIndex: number) => {
                      const hasBadge =
                        item.isPremiere ||
                        item.isReturningSeason ||
                        item.isSeasonFinale ||
                        item.isSeriesFinale;

                      return (
                        <Animated.View
                          key={`${item.show._id}-${item.seasonNumber}-${item.episodeNumber}`}
                          entering={FadeInDown.delay(
                            groupIndex * 60 + itemIndex * 30,
                          ).duration(250)}
                        >
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light,
                              );
                              router.push(`/show/${item.show._id}`);
                            }}
                            className="flex-row items-center rounded-2xl border border-dark-border bg-dark-card px-3.5 py-3 active:opacity-80"
                          >
                            <Poster uri={item.show.posterUrl} width={64} />

                            <View className="ml-3.5 flex-1">
                              {/* Title + chevron */}
                              <View className="flex-row items-center justify-between gap-2">
                                <Text
                                  className="flex-1 text-base font-semibold text-text-primary"
                                  numberOfLines={1}
                                >
                                  {item.show.title}
                                </Text>
                                <Ionicons
                                  name="chevron-forward"
                                  size={16}
                                  color="#5A6070"
                                />
                              </View>

                              {/* Episode code + title */}
                              <View className="mt-1 flex-row items-center gap-2">
                                <Text className="text-sm font-medium text-brand-400">
                                  {formatEpisodeCode(
                                    item.seasonNumber,
                                    item.episodeNumber,
                                  )}
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

                              {/* Badges + providers */}
                              <View className="mt-2 flex-row items-center gap-2">
                                {item.isSeriesFinale ? (
                                  <EventBadge
                                    label="Series finale"
                                    tone="accent"
                                  />
                                ) : null}
                                {item.isSeasonFinale && !item.isSeriesFinale ? (
                                  <EventBadge
                                    label="Season finale"
                                    tone="primary"
                                  />
                                ) : null}
                                {item.isPremiere ? (
                                  <EventBadge label="Premiere" tone="accent" />
                                ) : null}
                                {item.isReturningSeason ? (
                                  <EventBadge
                                    label="New season"
                                    tone="neutral"
                                  />
                                ) : null}

                                {(item.providers ?? [])
                                  .slice(0, 3)
                                  .map((provider: any) =>
                                    provider.logoUrl ? (
                                      <Image
                                        key={provider.name}
                                        source={{ uri: provider.logoUrl }}
                                        style={{
                                          width: 18,
                                          height: 18,
                                          borderRadius: 5,
                                        }}
                                        contentFit="cover"
                                      />
                                    ) : null,
                                  )}
                                {!hasBadge &&
                                  (item.providers ?? []).length === 0 && (
                                    <Text className="text-xs text-text-tertiary">
                                      Service info pending
                                    </Text>
                                  )}
                              </View>
                            </View>
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
