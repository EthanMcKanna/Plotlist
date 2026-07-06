import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import { guardedPush } from "../lib/navigation";
import { useAction, useAuth, useQuery } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
import { formatCalendarDay, formatEpisodeCode } from "../lib/format";
import { getLocalDateString } from "../lib/releaseCalendar";
import { queryClient } from "../lib/queryClient";
import { HomeArtworkFallback } from "./HomeArtworkFallback";
import { HomeSectionHeader } from "./HomeSectionHeader";

export type ReleaseGroup = { airDate: string; airDateTs: number; items?: any[] };
export type HomeSchedulePreview = {
  tonightGroups?: ReleaseGroup[];
  upcomingGroups?: ReleaseGroup[];
  staleShowIds?: string[];
};
export type HomeSchedulePreviewState = {
  isAuthenticated: boolean;
  today: string;
  preview: HomeSchedulePreview | null | undefined;
  tonightItems: any[];
  upcomingItems: any[];
  tonightCount: number;
  weekCount: number;
  hasScheduleItems: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ACCENT = "#38BDF8";
const CARD_WIDTH = 224;
const CARD_HEIGHT = (CARD_WIDTH * 9) / 16;
const SCHEDULE_TODAY_POLL_INTERVAL_MS = 60 * 1000;
const ENABLE_ENTRY_ANIMATIONS = Platform.OS !== "web";

function flattenGroups(groups?: ReleaseGroup[]) {
  return (groups ?? []).flatMap((group) => group.items ?? []);
}

export function getHomeSchedulePreviewItems(
  preview: HomeSchedulePreview | null | undefined,
  today: string,
) {
  const tonightItems = flattenGroups(preview?.tonightGroups).slice(0, 8);
  const upcomingItems = flattenGroups(preview?.upcomingGroups)
    .filter((item) => item.airDate !== today)
    .slice(0, 8);

  return {
    tonightItems,
    upcomingItems,
  };
}

export function getHomeSchedulePreviewCounts(
  preview: HomeSchedulePreview | null | undefined,
  today: string,
) {
  const { tonightItems, upcomingItems } = getHomeSchedulePreviewItems(
    preview,
    today,
  );

  return {
    tonightCount: tonightItems.length,
    weekCount: upcomingItems.length,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getScheduleItemDayTs(item: { airDate?: string | null; airDateTs?: number }) {
  // Prefer the air-date string (parsed as UTC midnight) so timezone offsets
  // cannot shift a release across day boundaries; see getScheduleCardDateLabel.
  if (item.airDate) {
    const ts = Date.parse(`${item.airDate}T00:00:00Z`);
    if (Number.isFinite(ts)) return ts;
  }
  return typeof item.airDateTs === "number" ? item.airDateTs : Number.NaN;
}

/**
 * Split upcoming items into "this week" (within the next 7 days) and
 * "later". The preview's upcoming window runs longer than a week, so the
 * raw item count must never be presented as a weekly count.
 */
export function getHomeScheduleWindowCounts(
  upcomingItems: Array<{ airDate?: string | null; airDateTs?: number }>,
  today: string,
) {
  const todayTs = Date.parse(`${today}T00:00:00Z`);
  const weekEndTs = todayTs + 7 * DAY_MS;
  let weekCount = 0;
  let laterCount = 0;
  upcomingItems.forEach((item) => {
    const dayTs = getScheduleItemDayTs(item);
    if (!Number.isFinite(dayTs) || dayTs <= todayTs) return;
    if (dayTs <= weekEndTs) {
      weekCount += 1;
    } else {
      laterCount += 1;
    }
  });
  return { weekCount, laterCount };
}

export function getHomeScheduleSubtitle({
  tonightCount,
  weekCount,
  laterCount = 0,
}: {
  tonightCount: number;
  weekCount: number;
  laterCount?: number;
}) {
  const parts = [
    tonightCount > 0 ? `${tonightCount} tonight` : null,
    weekCount > 0
      ? `${weekCount}${tonightCount > 0 ? " more" : ""} this week`
      : null,
  ].filter(Boolean);
  if (parts.length === 0) {
    return laterCount > 0
      ? `${laterCount} coming up`
      : "Upcoming";
  }
  return parts.join(" · ");
}

export function shouldRefreshHomeSchedulePreview(
  preview: HomeSchedulePreview | null | undefined,
) {
  return (preview?.staleShowIds?.length ?? 0) > 0;
}

type RefreshForMeAction = (args?: { today?: string }) => Promise<unknown>;
type InvalidateHomeScheduleQueries = (args: {
  queryKey: ["plotlist-rpc"];
  refetchType: "active";
}) => Promise<unknown>;

export async function refreshHomeSchedulePreviewData(
  refreshForMe: RefreshForMeAction,
  invalidateQueries: InvalidateHomeScheduleQueries = (args) =>
    queryClient.invalidateQueries(args),
  today = getLocalDateString(),
) {
  await refreshForMe({ today });
  await invalidateQueries({
    queryKey: ["plotlist-rpc"],
    refetchType: "active",
  });
}

export function useHomeSchedulePreview(enabled = true): HomeSchedulePreviewState {
  const { isAuthenticated } = useAuth();
  const refreshForMe = useAction(api.releaseCalendar.refreshForMe);
  const staleRefreshKeyRef = useRef<string | null>(null);
  const [today, setToday] = useState(() => getLocalDateString());
  const preview = useQuery(
    api.releaseCalendar.getHomePreview,
    enabled && isAuthenticated ? { today } : "skip",
  ) as HomeSchedulePreview | undefined;
  const { tonightItems, upcomingItems } = useMemo(
    () => getHomeSchedulePreviewItems(preview, today),
    [preview, today],
  );
  const tonightCount = tonightItems.length;
  const weekCount = upcomingItems.length;

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    setToday(getLocalDateString());
    const interval = setInterval(() => {
      setToday((current) => {
        const next = getLocalDateString();
        return next === current ? current : next;
      });
    }, SCHEDULE_TODAY_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled, isAuthenticated]);

  const refresh = useCallback(async () => {
    setToday(getLocalDateString());
    if (!enabled || !isAuthenticated) return;

    await refreshHomeSchedulePreviewData(refreshForMe, undefined, getLocalDateString());
  }, [enabled, isAuthenticated, refreshForMe]);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !shouldRefreshHomeSchedulePreview(preview)) {
      staleRefreshKeyRef.current = null;
      return;
    }

    const staleKey = `${today}:${[...(preview?.staleShowIds ?? [])].sort().join("|")}`;
    if (staleRefreshKeyRef.current === staleKey) return;
    staleRefreshKeyRef.current = staleKey;
    void refresh().catch(() => {
      if (staleRefreshKeyRef.current === staleKey) {
        staleRefreshKeyRef.current = null;
      }
    });
  }, [enabled, isAuthenticated, preview, refresh, today]);

  return {
    isAuthenticated,
    today,
    preview,
    tonightItems,
    upcomingItems,
    tonightCount,
    weekCount,
    hasScheduleItems: tonightCount > 0 || weekCount > 0,
    loading: enabled && isAuthenticated && preview === undefined,
    refresh,
  };
}

function getScheduleProviderName(item: any) {
  const providers = Array.isArray(item.providers) ? item.providers : [];
  return providers.find((provider: any) => provider?.name?.trim())?.name?.trim() ?? null;
}

export function getScheduleCardSubline(item: any) {
  const episodeTitle = item.episodeTitle?.trim();
  const providerName = getScheduleProviderName(item);
  return [episodeTitle, providerName].filter(Boolean).join(" · ");
}

function getScheduleCardVisibleEpisodeSignal(item: any) {
  const episodeTitle = item.episodeTitle?.trim().toLowerCase();
  if (!episodeTitle) return null;
  if (item.isPremiere && /^(season )?premiere$/.test(episodeTitle)) {
    return "Premiere";
  }
  if (item.isSeasonFinale && /^(season )?finale$/.test(episodeTitle)) {
    return "Finale";
  }
  return item.episodeTitle.trim();
}

export function getScheduleCardVisibleSubline(item: any) {
  const providerName = getScheduleProviderName(item);
  const episodeSignal = getScheduleCardVisibleEpisodeSignal(item);
  return [episodeSignal, providerName].filter(Boolean).join(" · ");
}

export function getScheduleCardAccessibilityLabel({
  item,
  dateLabel,
}: {
  item: any;
  dateLabel: string;
}) {
  return [
    `Open ${item.show?.title ?? "show"}`,
    dateLabel,
    formatEpisodeCode(item.seasonNumber, item.episodeNumber),
    getScheduleCardSubline(item),
  ]
    .filter(Boolean)
    .join(". ");
}

export function getScheduleCardDateLabel(item: {
  airDate?: string | null;
  airDateTs: number;
}, today: string) {
  return item.airDate === today
    ? "Tonight"
    : formatCalendarDay(item.airDate ?? item.airDateTs);
}

export function TonightStrip({
  schedule,
  index = 2,
}: {
  schedule?: HomeSchedulePreviewState;
  index?: number;
} = {}) {
  const localSchedule = useHomeSchedulePreview(!schedule);
  const activeSchedule = schedule ?? localSchedule;
  const {
    isAuthenticated,
    preview,
    today,
    tonightItems,
    upcomingItems,
    tonightCount,
    weekCount,
  } = activeSchedule;

  if (!isAuthenticated || !preview) {
    return null;
  }

  if (tonightCount === 0 && weekCount === 0) {
    return null;
  }

  // One rail: tonight leads, the rest of the week follows. Every card
  // carries its own date chip, so no tab switching is needed.
  const items = [...tonightItems, ...upcomingItems];
  const windowCounts = getHomeScheduleWindowCounts(upcomingItems, today);

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker="Schedule"
        title="Releases"
        subtitle={getHomeScheduleSubtitle({ tonightCount, ...windowCounts })}
        accent={ACCENT}
        icon="radio"
        actionLabel="Calendar"
        onAction={() => guardedPush("/calendar")}
      />

      <ScrollView
        accessibilityLabel="Releases rail"
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 14}
        snapToAlignment="start"
      >
        {items.map((item, index) => (
          <ScheduleCard
            key={`${item.show?._id ?? "show"}-${item.seasonNumber}-${item.episodeNumber}`}
            item={item}
            index={index}
            today={today}
          />
        ))}
        <CalendarTailCard />
      </ScrollView>
    </View>
  );
}

function CalendarTailCard() {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        guardedPush("/calendar");
      }}
      accessibilityRole="button"
      accessibilityLabel="Open the full release calendar"
      testID="home-schedule-calendar-card"
      style={[styles.card, styles.tailCard]}
      className="active:opacity-85"
    >
      <View style={styles.tailIcon}>
        <Ionicons
          name="calendar-outline"
          size={18}
          color={ACCENT}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      </View>
      <Text className="mt-2 text-[13px] font-bold text-text-primary">
        Full calendar
      </Text>
      <Text className="mt-0.5 text-[11px] font-semibold text-text-tertiary">
        Everything coming up
      </Text>
    </Pressable>
  );
}

function ScheduleCard({
  item,
  index,
  today,
}: {
  item: any;
  index: number;
  today: string;
}) {
  const imageUrl = item.show?.backdropUrl ?? item.show?.posterUrl ?? null;
  const dateLabel = getScheduleCardDateLabel(item, today);
  const visibleSubline = getScheduleCardVisibleSubline(item);
  const visibleEpisodeCode = item.isPremiere
    ? null
    : formatEpisodeCode(item.seasonNumber, item.episodeNumber);
  const hasVisibleEpisodeRow = Boolean(visibleEpisodeCode);

  return (
    <Animated.View
      entering={
        ENABLE_ENTRY_ANIMATIONS
          ? FadeInRight.delay(index * 30).duration(280)
          : undefined
      }
      style={{ width: CARD_WIDTH }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (item.show?._id) {
            guardedPush(`/show/${item.show._id}`);
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={getScheduleCardAccessibilityLabel({ item, dateLabel })}
        style={styles.card}
        className="active:opacity-90"
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <HomeArtworkFallback
            testID={`schedule-artwork-fallback-${item.show?._id ?? "show"}`}
            title={item.show?.title}
            subtitle={visibleSubline}
            accent={ACCENT}
            compact
            copyVisible={false}
            markVisible={false}
            haloVisible={false}
            ornamentsVisible={false}
          />
        )}

        <LinearGradient
          colors={["rgba(13,15,20,0.0)", "rgba(13,15,20,0.92)"]}
          locations={[0.32, 1]}
          style={[StyleSheet.absoluteFill, styles.pointerNone]}
        />

        <View style={styles.dateBadge}>
          <Text
            className="text-[10px] font-bold text-white/85"
            style={{ letterSpacing: 0 }}
          >
            {dateLabel}
          </Text>
        </View>

        <View style={styles.bottomContent}>
          {item.show?.title ? (
            <View
              style={[
                styles.cardCopy,
                !hasVisibleEpisodeRow && styles.cardCopyLast,
              ]}
            >
              <Text
                className="text-[14px] font-black text-white"
                numberOfLines={1}
              >
                {item.show?.title}
              </Text>
              {visibleSubline ? (
                <Text
                  className="mt-0.5 text-[11px] font-bold text-white/65"
                  numberOfLines={1}
                >
                  {visibleSubline}
                </Text>
              ) : null}
            </View>
          ) : null}
          {hasVisibleEpisodeRow ? (
            <View style={styles.episodeRow}>
              <Text
                className="text-[10px] font-black text-white"
                style={{ letterSpacing: 0 }}
              >
                {visibleEpisodeCode}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  card: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    height: CARD_HEIGHT,
    overflow: "hidden",
    width: CARD_WIDTH,
  },
  image: {
    height: "100%",
    width: "100%",
  },
  dateBadge: {
    backgroundColor: "rgba(13,15,20,0.66)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    borderWidth: 1,
    left: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    position: "absolute",
    top: 12,
  },
  bottomContent: {
    bottom: 11,
    left: 11,
    position: "absolute",
    right: 11,
  },
  cardCopy: {
    marginBottom: 7,
  },
  cardCopyLast: {
    marginBottom: 0,
  },
  episodeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  tailCard: {
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 16,
    width: 148,
  },
  tailIcon: {
    alignItems: "center",
    backgroundColor: "rgba(56,189,248,0.12)",
    borderColor: "rgba(56,189,248,0.28)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
