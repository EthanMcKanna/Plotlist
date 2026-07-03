import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useAction, useAuth, useQuery } from "../lib/plotlist/react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { EmptyState } from "../components/EmptyState";
import { guardedPush } from "../lib/navigation";
import { GlassPressable } from "../components/NativeGlass";
import { Screen } from "../components/Screen";
import { api } from "../lib/plotlist/api";
import { formatCalendarDay, formatEpisodeCode } from "../lib/format";
import {
  getLocalDateString,
  RELEASE_CALENDAR_MAX_ITEMS,
  type ReleaseCalendarView,
} from "../lib/releaseCalendar";

const FILTER_OPTIONS: { value: ReleaseCalendarView; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "upcoming", label: "All Upcoming" },
  { value: "premieres", label: "Premieres" },
  { value: "returning", label: "New Seasons" },
  { value: "finales", label: "Finales" },
];

function FilterPill({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <GlassPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      radius={999}
      variant={isActive ? "prominent" : "control"}
      fallbackColor={
        isActive ? "rgba(14, 165, 233, 0.15)" : "rgba(90, 96, 112, 0.1)"
      }
      borderColor={isActive ? "rgba(14, 165, 233, 0.3)" : "transparent"}
      contentStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: isActive ? "#7dd3fc" : "#9BA1B0" }}
      >
        {label}
      </Text>
    </GlassPressable>
  );
}

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
          "New episodes from your saved shows will appear here when they drop today.",
      };
    case "premieres":
      return {
        title: "No premieres on deck",
        description:
          "New series premieres from your saved shows will appear here.",
      };
    case "returning":
      return {
        title: "No new seasons scheduled",
        description:
          "Returning seasons from your saved shows will appear here when dates are available.",
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

/* ─── Release card ────────────────────────────────────────────────── */

function ReleaseCard({
  item,
  isToday,
  today,
}: {
  item: any;
  isToday: boolean;
  today: string;
}) {
  const imageUrl = item.show.backdropUrl || null;
  const hasBadge =
    item.isPremiere ||
    item.isReturningSeason ||
    item.isSeasonFinale ||
    item.isSeriesFinale;
  const providers = Array.isArray(item.providers) ? item.providers : [];
  const providerLogos = providers.filter(
    (provider: any) =>
      typeof provider?.logoUrl === "string" && provider.logoUrl.trim().length > 0,
  );
  const providerLabel =
    providers.find(
      (provider: any) =>
        typeof provider?.name === "string" && provider.name.trim().length > 0,
    )?.name ?? null;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        guardedPush(`/show/${item.show._id}`);
      }}
      className="overflow-hidden rounded-2xl border border-dark-border bg-dark-card active:opacity-80"
    >
      {/* Backdrop image */}
      <View className="relative" style={{ aspectRatio: 16 / 9 }}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View className="h-full w-full items-center justify-center bg-surface-secondary">
            <Ionicons name="tv-outline" size={32} color="#4b5563" />
          </View>
        )}

        {/* Bottom gradient */}
        <LinearGradient
          colors={["transparent", "rgba(0, 0, 0, 0.75)"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "60%",
          }}
        />

        {/* Overlaid info on image */}
        <View className="absolute bottom-3 left-3.5 right-3.5 flex-row items-end justify-between">
          <View className="flex-1 mr-2">
            <Text
              className="text-base font-semibold text-white"
              numberOfLines={1}
              style={{
                textShadowColor: "rgba(0,0,0,0.5)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
              }}
            >
              {item.show.title}
            </Text>
            <Text
              className="mt-0.5 text-xs font-bold text-white/80"
              style={{
                textShadowColor: "rgba(0,0,0,0.5)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
              }}
            >
              {formatEpisodeCode(item.seasonNumber, item.episodeNumber)}
            </Text>
          </View>
          {/* Date pill */}
          <View
            className="rounded-full px-2 py-0.5"
            style={{
              backgroundColor: isToday
                ? "rgba(56, 189, 248, 0.85)"
                : "rgba(255,255,255,0.2)",
            }}
          >
            <Text className="text-[10px] font-bold text-white">
              {item.airDate === today
                ? "Tonight"
                : formatCalendarDay(item.airDate ?? item.airDateTs)}
            </Text>
          </View>
        </View>
      </View>

      {/* Content below image */}
      <View className="px-3.5 py-3">
        {/* Episode title */}
        {item.episodeTitle ? (
          <Text
            className="text-sm text-text-secondary"
            numberOfLines={1}
          >
            {item.episodeTitle}
          </Text>
        ) : null}

        {/* Badges + providers */}
        <View className={`flex-row items-center gap-2 ${item.episodeTitle ? "mt-2" : ""}`}>
          {item.isSeriesFinale ? (
            <EventBadge label="Series finale" tone="accent" />
          ) : null}
          {item.isSeasonFinale && !item.isSeriesFinale ? (
            <EventBadge label="Season finale" tone="primary" />
          ) : null}
          {item.isPremiere ? (
            <EventBadge label="Premiere" tone="accent" />
          ) : null}
          {item.isReturningSeason ? (
            <EventBadge label="New season" tone="neutral" />
          ) : null}

          {providerLogos
            .slice(0, 3)
            .map((provider: any) =>
              <Image
                key={provider.name}
                source={{ uri: provider.logoUrl }}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                }}
                contentFit="cover"
              />,
            )}
          {providerLogos.length === 0 && providerLabel ? (
            <Text className="text-xs font-semibold text-text-tertiary">
              {providerLabel}
            </Text>
          ) : null}
          {!hasBadge && providers.length === 0 && (
            <Text className="text-xs text-text-tertiary">
              Service info pending
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/* ─── Main screen ─────────────────────────────────────────────────── */

export type CalendarSurfaceData = {
  groups: Array<{ airDate: string; airDateTs: number; items: any[] }>;
  staleShowIds: string[];
};

export function CalendarSurface({
  data,
  isAuthenticated,
  onViewChange,
  today,
  view,
}: {
  data: CalendarSurfaceData | undefined;
  isAuthenticated: boolean;
  onViewChange: (view: ReleaseCalendarView) => void;
  today: string;
  view: ReleaseCalendarView;
}) {
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

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 20, gap: 8 }}
        >
          {FILTER_OPTIONS.map((option) => (
            <FilterPill
              key={option.value}
              label={option.label}
              isActive={view === option.value}
              onPress={() => onViewChange(option.value)}
            />
          ))}
        </ScrollView>

        {/* Content */}
        {!data ? (
          <View className="items-center justify-center py-16">
            <ActivityIndicator size="small" color="#0ea5e9" />
          </View>
        ) : (
          <>
            {data.staleShowIds.length > 0 ? (
              <View className="mt-5 flex-row items-center gap-2 rounded-2xl border border-dark-border bg-dark-card px-3 py-2">
                <ActivityIndicator size="small" color="#38bdf8" />
                <Text className="text-xs font-semibold text-text-secondary">
                  Checking latest episode dates
                </Text>
              </View>
            ) : null}

            {data.groups.length === 0 ? (
              <View className="pt-10">
                <EmptyState
                  title={emptyCopy.title}
                  description={emptyCopy.description}
                />
              </View>
            ) : (
              <View className="mt-8 gap-10">
                {data.groups.map((group: any) => {
                  const isToday = group.airDate === today;

                  return (
                    <View key={group.airDate}>
                      {/* Date label */}
                      <Text
                        className="font-bold uppercase"
                        style={{
                          fontSize: 11,
                          letterSpacing: 1.8,
                          color: isToday ? "#38bdf8" : "#9BA1B0",
                        }}
                      >
                        {isToday ? "Tonight" : formatCalendarDay(group.airDate ?? group.airDateTs)}
                      </Text>

                      {/* Cards */}
                      <View className="mt-3 gap-3">
                        {group.items.map((item: any) => (
                          <ReleaseCard
                            key={`${item.show._id}-${item.seasonNumber}-${item.episodeNumber}`}
                            item={item}
                            isToday={isToday}
                            today={today}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

export default function CalendarScreen() {
  const { isAuthenticated } = useAuth();
  const refreshForMe = useAction(api.releaseCalendar.refreshForMe);
  const [view, setView] = useState<ReleaseCalendarView>("upcoming");
  const today = useMemo(() => getLocalDateString(), []);
  const data = useQuery(
    api.releaseCalendar.listForMe,
    isAuthenticated
      ? { view, today, limit: RELEASE_CALENDAR_MAX_ITEMS }
      : "skip",
  );

  useEffect(() => {
    if (!isAuthenticated || !data || data.staleShowIds.length === 0) {
      return;
    }

    void refreshForMe({ today }).catch(() => {
      // Render cached data even if refresh fails.
    });
  }, [data, isAuthenticated, refreshForMe, today]);

  return (
    <CalendarSurface
      data={data}
      isAuthenticated={isAuthenticated}
      onViewChange={setView}
      today={today}
      view={view}
    />
  );
}
