import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import { useAction, useAuth, useQuery } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
import { formatCalendarDay, formatEpisodeCode } from "../lib/format";
import { recordHomeWarmSchedule } from "../lib/homeWarmCache";
import { getLocalDateString } from "../lib/releaseCalendar";
import { queryClient } from "../lib/queryClient";
import { HomeArtworkFallback } from "./HomeArtworkFallback";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { HorizontalRail } from "./HorizontalRail";
import { LinkPressable } from "./LinkPressable";

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
// Kept in the same visual family as the continue rail's banners: 16:9 art,
// text over a scrim, one size smaller so resume stays the headliner.
export const SCHEDULE_CARD_WIDTH = 240;
export const SCHEDULE_CARD_HEIGHT = Math.round((SCHEDULE_CARD_WIDTH * 9) / 16);
const CARD_WIDTH = SCHEDULE_CARD_WIDTH;
const CARD_HEIGHT = SCHEDULE_CARD_HEIGHT;
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

  // Remember what the schedule looked like so the next cold start can decide
  // whether to hold the strip's slot with a skeleton before data arrives.
  useEffect(() => {
    if (!enabled || !isAuthenticated || preview === undefined) return;
    recordHomeWarmSchedule({ today, tonightCount, weekCount });
  }, [enabled, isAuthenticated, preview, today, tonightCount, weekCount]);

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

/** Bold line of the card: the episode's own title or its signal moment. */
export function getScheduleCardHeadline(item: any) {
  return (
    getScheduleCardVisibleEpisodeSignal(item) ??
    formatEpisodeCode(item.seasonNumber, item.episodeNumber)
  );
}

/** Quiet line under the headline: episode code and provider. */
export function getScheduleCardMetaLine(item: any) {
  const headline = getScheduleCardHeadline(item);
  const code = formatEpisodeCode(item.seasonNumber, item.episodeNumber);
  const providerName = getScheduleProviderName(item);
  const showCode = headline !== code && !item.isPremiere;
  return [showCode ? code : null, providerName].filter(Boolean).join(" · ");
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
        actionHref="/calendar"
      />

      <HorizontalRail
        accessibilityLabel="Releases rail"
        decelerationRate="fast"
        contentContainerStyle={styles.rail}
        snapToInterval={CARD_WIDTH + 14}
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
      </HorizontalRail>
    </View>
  );
}

function CalendarTailCard() {
  return (
    <LinkPressable
      href="/calendar"
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      accessibilityRole="button"
      accessibilityLabel="Open the full release calendar"
      testID="home-schedule-calendar-card"
      style={[styles.card, styles.tailCard]}
      className="active:opacity-85 hover:opacity-90 web:transition-opacity"
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
    </LinkPressable>
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
  const isTonight = item.airDate === today;
  const headline = getScheduleCardHeadline(item);
  const metaLine = getScheduleCardMetaLine(item);

  const cardProps = {
    accessibilityRole: "button" as const,
    accessibilityLabel: getScheduleCardAccessibilityLabel({ item, dateLabel }),
    style: styles.card,
    className: "active:opacity-90 hover:opacity-90 web:transition-opacity",
  };

  const cardBody = (
    <>
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
          subtitle={getScheduleCardVisibleSubline(item)}
          accent={ACCENT}
          compact
          copyVisible={false}
          markVisible={false}
          haloVisible={false}
          ornamentsVisible={false}
        />
      )}

      {/* Same scrim recipe as the continue banners: readable chips up top,
          art in the middle, deep floor under the copy. */}
      <LinearGradient
        colors={[
          "rgba(13,15,20,0.34)",
          "rgba(13,15,20,0.02)",
          "rgba(13,15,20,0.42)",
          "rgba(13,15,20,0.92)",
        ]}
        locations={[0, 0.3, 0.62, 1]}
        style={[StyleSheet.absoluteFill, styles.pointerNone]}
      />

      <View
        testID={`schedule-date-chip-${item.show?._id ?? "show"}`}
        style={[styles.dateBadge, isTonight ? styles.dateBadgeTonight : null]}
      >
        <Text
          className={
            isTonight
              ? "text-[10px] font-black text-white"
              : "text-[10px] font-bold text-white/85"
          }
          style={{ letterSpacing: isTonight ? 0.4 : 0.2 }}
        >
          {dateLabel}
        </Text>
      </View>

      <View style={styles.bottomContent}>
        {item.show?.title ? (
          <Text
            className="text-[10px] font-semibold text-white/60 uppercase"
            style={{ letterSpacing: 1 }}
            numberOfLines={1}
          >
            {item.show?.title}
          </Text>
        ) : null}
        <Text className="mt-0.5 text-[14px] font-black text-white" numberOfLines={1}>
          {headline}
        </Text>
        {metaLine ? (
          <Text
            className="mt-0.5 text-[11px] font-semibold text-white/60"
            numberOfLines={1}
          >
            {metaLine}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <Animated.View
      entering={
        ENABLE_ENTRY_ANIMATIONS
          ? FadeInRight.delay(index * 30).duration(280)
          : undefined
      }
      style={{ width: CARD_WIDTH }}
    >
      {item.show?._id ? (
        <LinkPressable
          href={`/show/${item.show._id}`}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          {...cardProps}
        >
          {cardBody}
        </LinkPressable>
      ) : (
        // No show id yet (stale preview): keep the plain pressable so the
        // haptic still answers the tap without navigating anywhere.
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          {...cardProps}
        >
          {cardBody}
        </Pressable>
      )}
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
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
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
    backgroundColor: "rgba(13,15,20,0.55)",
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    borderWidth: 1,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: "absolute",
    top: 12,
  },
  dateBadgeTonight: {
    backgroundColor: "rgba(56,189,248,0.92)",
    borderColor: "transparent",
  },
  bottomContent: {
    bottom: 13,
    left: 13,
    position: "absolute",
    right: 13,
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
