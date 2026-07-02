import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

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
export const HOME_SCHEDULE_SEGMENTED_TAB_TOUCH_TARGET = 44;

type TabKey = "tonight" | "week";

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

export function getHomeScheduleSubtitle({
  tab,
  tonightCount,
  weekCount,
}: {
  tab: TabKey;
  tonightCount: number;
  weekCount: number;
}) {
  if (tab === "week") {
    if (weekCount > 0) {
      return `${weekCount} this week.`;
    }
    if (tonightCount > 0) {
      return `${tonightCount} tonight.`;
    }
  }

  if (tonightCount > 0) {
    return `${tonightCount} tonight.`;
  }

  return "Upcoming.";
}

export function getHomeScheduleTabAccessibilityLabel({
  label,
  badge,
  active,
  disabled = false,
}: {
  label: string;
  badge: number;
  active: boolean;
  disabled?: boolean;
}) {
  const releaseWord = badge === 1 ? "release" : "releases";
  return [
    label,
    `${badge} ${releaseWord}`,
    active ? "selected" : null,
    disabled ? "unavailable" : null,
  ]
    .filter(Boolean)
    .join(", ");
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

  const initialTab: TabKey = tonightCount > 0 ? "tonight" : "week";
  const [tab, setTab] = useState<TabKey>(initialTab);

  // Snap tab when data arrives.
  useEffect(() => {
    if (tonightCount === 0 && weekCount > 0) {
      setTab("week");
    } else if (tonightCount > 0) {
      setTab("tonight");
    }
  }, [tonightCount, weekCount]);

  if (!isAuthenticated || !preview) {
    return null;
  }

  if (tonightCount === 0 && weekCount === 0) {
    return null;
  }

  const items = tab === "tonight" ? tonightItems : upcomingItems;

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker="Schedule"
        title="Releases"
        accent={ACCENT}
        icon="radio"
      />

      <View className="mt-3 px-6">
        <View
          style={styles.segmented}
          accessibilityRole="tablist"
          accessibilityLabel="Release schedule"
        >
          <SegmentedTab
            label="Tonight"
            testID="home-schedule-tab-tonight"
            badge={tonightCount}
            active={tab === "tonight"}
            disabled={tonightCount === 0}
            onPress={() => setTab("tonight")}
          />
          <SegmentedTab
            label="This week"
            testID="home-schedule-tab-week"
            badge={weekCount}
            active={tab === "week"}
            disabled={weekCount === 0}
            onPress={() => setTab("week")}
          />
        </View>
      </View>

      <ScrollView
        accessibilityLabel={`${tab === "tonight" ? "Tonight" : "This week"} releases rail`}
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
            isTonight={tab === "tonight"}
            index={index}
            today={today}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SegmentedTab({
  label,
  testID,
  badge,
  active,
  disabled,
  onPress,
}: {
  label: string;
  testID: string;
  badge: number;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      testID={testID}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={() => {
        if (disabled) return;
        Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      style={[
        styles.tab,
        active && styles.tabActive,
        Platform.OS === "web" && focused && styles.tabWebFocus,
        disabled && styles.tabDisabled,
      ]}
      accessibilityRole="tab"
      accessibilityLabel={getHomeScheduleTabAccessibilityLabel({
        label,
        badge,
        active,
        disabled,
      })}
      accessibilityState={{ selected: active, disabled }}
      aria-selected={active}
      aria-disabled={disabled}
    >
      <Text
        className={`text-[12px] font-bold ${active ? "text-text-primary" : "text-text-tertiary"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ScheduleCard({
  item,
  isTonight,
  index,
  today,
}: {
  item: any;
  isTonight: boolean;
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
            router.push(`/show/${item.show._id}`);
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

        {!isTonight ? (
          <View style={styles.dateBadge}>
            <Text
              className="text-[10px] font-bold text-white/85"
              style={{ letterSpacing: 0 }}
            >
              {dateLabel}
            </Text>
          </View>
        ) : null}

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
  segmented: {
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
  },
  tab: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: HOME_SCHEDULE_SEGMENTED_TAB_TOUCH_TARGET,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabActive: {
    borderBottomColor: ACCENT,
  },
  tabWebFocus: {
    borderBottomColor: "rgba(56,189,248,0.72)",
  },
  tabDisabled: {
    opacity: 0.4,
  },
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
  pointerNone: {
    pointerEvents: "none",
  },
});
