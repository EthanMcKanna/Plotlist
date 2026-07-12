import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAction, useAuth, useQuery } from "../lib/plotlist/react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../components/EmptyState";
import { FlashList } from "../components/FlashList";
import { guardedPush } from "../lib/navigation";
import { Screen } from "../components/Screen";
import { api } from "../lib/plotlist/api";
import { formatCalendarDay, formatEpisodeCode } from "../lib/format";
import {
  getLocalDateString,
  RELEASE_CALENDAR_MAX_ITEMS,
} from "../lib/releaseCalendar";
import { queryClient } from "../lib/queryClient";
import { SHOW_BACK_BUTTON } from "../lib/webLayout";
import {
  buildReleaseDiaryRows,
  getReleaseDiaryCounts,
  getReleaseDiaryHeadline,
  getReleaseDiaryWeekActivity,
  type ReleaseDiaryDayActivity,
  type ReleaseDiaryDayLabel,
  type ReleaseDiaryEventRow,
  type ReleaseDiaryMonthRow,
  type ReleaseDiaryRow,
} from "../lib/releaseDiary";

const ACCENT = "#38BDF8";
const DAY_RAIL_WIDTH = 44;
const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 54;

function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/* ─── Row copy helpers ────────────────────────────────────────────── */

export function getReleaseRowEpisodeLine(item: any) {
  const code = formatEpisodeCode(item.seasonNumber, item.episodeNumber);
  const episodeTitle =
    typeof item.episodeTitle === "string" ? item.episodeTitle.trim() : "";
  // "Premiere"/"Finale" placeholder titles are carried by the badge instead.
  const redundantTitle = /^(season )?(premiere|finale)$/i.test(episodeTitle);
  return [code, episodeTitle && !redundantTitle ? episodeTitle : null]
    .filter(Boolean)
    .join(" · ");
}

export function getReleaseRowBadge(item: any):
  | { label: string; tone: "primary" | "accent" | "neutral" }
  | null {
  if (item.isSeriesFinale) return { label: "Series finale", tone: "accent" };
  if (item.isSeasonFinale) return { label: "Season finale", tone: "primary" };
  if (item.isPremiere) return { label: "Premiere", tone: "accent" };
  if (item.isReturningSeason) return { label: "New season", tone: "neutral" };
  return null;
}

export function getReleaseRowProvider(item: any): {
  name: string | null;
  logoUrl: string | null;
} {
  const providers = Array.isArray(item.providers) ? item.providers : [];
  const named = providers.find(
    (provider: any) =>
      typeof provider?.name === "string" && provider.name.trim().length > 0,
  );
  const withLogo = providers.find(
    (provider: any) =>
      typeof provider?.logoUrl === "string" && provider.logoUrl.trim().length > 0,
  );
  return {
    name: named?.name?.trim() ?? null,
    logoUrl: withLogo?.logoUrl ?? null,
  };
}

export function getReleaseRowAccessibilityLabel(row: ReleaseDiaryEventRow) {
  return [
    `Open ${row.item?.show?.title ?? "show"}`,
    row.isToday ? "Tonight" : formatCalendarDay(row.airDate),
    getReleaseRowEpisodeLine(row.item),
    getReleaseRowBadge(row.item)?.label,
  ]
    .filter(Boolean)
    .join(". ");
}

/* ─── Header pulse ────────────────────────────────────────────────── */

// Seven slim bars for the week ahead; tonight reads brand-blue. Mirrors the
// Log page's trailing-week sparkline, pointed forward instead of back.
function WeekAheadPulse({ days }: { days: ReleaseDiaryDayActivity[] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const active = days.filter((day) => day.count > 0).length;
  return (
    <View
      accessibilityLabel={`Releases on ${active} of the next 7 days`}
      style={styles.sparkline}
    >
      {days.map((day) => {
        const height = day.count === 0 ? 4 : 7 + Math.round((day.count / max) * 17);
        return (
          <View
            key={day.key}
            style={[
              styles.sparklineBar,
              {
                height,
                backgroundColor: day.isToday
                  ? ACCENT
                  : day.count > 0
                    ? "rgba(125,211,252,0.42)"
                    : "rgba(255,255,255,0.12)",
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/* ─── Spine + rows ────────────────────────────────────────────────── */

function DayRail({ label }: { label: ReleaseDiaryDayLabel | null }) {
  return (
    <View style={styles.dayRail}>
      {label ? (
        <>
          <Text
            className="text-[17px] font-bold"
            style={{ color: label.isToday ? ACCENT : "#F1F3F7" }}
          >
            {label.day}
          </Text>
          <Text
            className="text-[10px] font-semibold tracking-widest"
            style={{ color: label.isToday ? "rgba(56,189,248,0.75)" : "#5A6070" }}
          >
            {label.isToday ? "TODAY" : label.weekday}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function MonthHeader({ row }: { row: ReleaseDiaryMonthRow }) {
  return (
    <View className="mb-1 mt-6 px-6">
      <View className="flex-row items-baseline justify-between border-b border-dark-border/70 pb-2">
        <Text className="text-[13px] font-bold uppercase tracking-[2px] text-text-secondary">
          {row.label}
        </Text>
        <Text className="text-[12px] font-medium text-text-tertiary">
          {row.entryCount} {row.entryCount === 1 ? "release" : "releases"}
        </Text>
      </View>
    </View>
  );
}

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
        : "rgba(90, 96, 112, 0.14)";
  const fg =
    tone === "primary" ? "#7dd3fc" : tone === "accent" ? "#4ade80" : "#9BA1B0";

  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="font-bold" style={{ fontSize: 10, color: fg }}>
        {label}
      </Text>
    </View>
  );
}

function ReleaseRow({ row }: { row: ReleaseDiaryEventRow }) {
  const item = row.item;
  const imageUrl = item.show?.backdropUrl ?? item.show?.posterUrl ?? null;
  const badge = getReleaseRowBadge(item);
  const provider = getReleaseRowProvider(item);
  const episodeLine = getReleaseRowEpisodeLine(item);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={getReleaseRowAccessibilityLabel(row)}
      onPress={() => {
        lightHaptic();
        if (item.show?._id) {
          guardedPush(`/show/${item.show._id}`);
        }
      }}
      className="active:opacity-85"
    >
      <View className="flex-row px-6">
        <DayRail label={row.dayLabel} />
        <View
          className="flex-1 flex-row gap-3 py-3"
          style={row.isLastOfDay ? undefined : styles.rowDivider}
        >
          <View style={styles.thumb}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.thumbImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
              />
            ) : (
              <View style={styles.thumbFallback}>
                <Ionicons
                  name="tv-outline"
                  size={18}
                  color="#4B5563"
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden={true}
                  importantForAccessibility="no"
                />
              </View>
            )}
          </View>

          <View className="min-w-0 flex-1 justify-center">
            <View className="flex-row items-center justify-between gap-3">
              <Text
                className="flex-1 text-[15px] font-semibold text-text-primary"
                numberOfLines={1}
              >
                {item.show?.title}
              </Text>
              {provider.logoUrl ? (
                <Image
                  source={{ uri: provider.logoUrl }}
                  style={styles.providerLogo}
                  contentFit="cover"
                  accessible={false}
                />
              ) : provider.name ? (
                <Text className="text-[11px] font-semibold text-text-tertiary">
                  {provider.name}
                </Text>
              ) : null}
            </View>

            <View className="mt-1 flex-row items-center gap-2">
              <Text
                className="text-[12px] font-semibold text-brand-300"
                numberOfLines={1}
                style={styles.episodeLine}
              >
                {episodeLine}
              </Text>
              {badge ? <EventBadge label={badge.label} tone={badge.tone} /> : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ─── Header ──────────────────────────────────────────────────────── */

function ReleasesHeader({
  headline,
  days,
  refreshing,
}: {
  headline: string;
  days: ReleaseDiaryDayActivity[];
  refreshing: boolean;
}) {
  return (
    <View className="px-6 pb-2 pt-1">
      {SHOW_BACK_BUTTON ? (
        <Pressable
        onPress={() => {
          lightHaptic();
          router.back();
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={styles.backButton}
        className="active:opacity-70"
      >
        <Ionicons name="chevron-back" size={26} color="#E8EAED" />
      </Pressable>
      ) : null}
      <View className="mt-2 flex-row items-end justify-between">
        <Text className="text-[34px] font-bold text-text-primary">Releases</Text>
        <View className="pb-2">
          <WeekAheadPulse days={days} />
        </View>
      </View>
      <Text className="mt-1 text-[14px] leading-5 text-text-tertiary">
        {headline}
      </Text>
      {refreshing ? (
        <View className="mt-3 flex-row items-center gap-2">
          <ActivityIndicator size="small" color={ACCENT} />
          <Text className="text-[12px] font-semibold text-text-tertiary">
            Checking latest episode dates
          </Text>
        </View>
      ) : null}
    </View>
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
  today,
}: {
  data: CalendarSurfaceData | undefined;
  isAuthenticated: boolean;
  today: string;
}) {
  const insets = useSafeAreaInsets();
  const rows = useMemo(
    () => (data ? buildReleaseDiaryRows(data.groups, today) : []),
    [data, today],
  );
  const counts = useMemo(
    () => getReleaseDiaryCounts(data?.groups ?? [], today),
    [data, today],
  );
  const weekActivity = useMemo(
    () => getReleaseDiaryWeekActivity(data?.groups ?? [], today),
    [data, today],
  );

  const renderRow = useCallback(({ item }: { item: ReleaseDiaryRow }) => {
    if (item.kind === "month") {
      return <MonthHeader row={item} />;
    }
    return <ReleaseRow row={item} />;
  }, []);

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

  return (
    <Screen>
      <FlashList<ReleaseDiaryRow>
        data={rows}
        renderItem={renderRow}
        keyExtractor={(row: ReleaseDiaryRow) => row.id}
        getItemType={(row: ReleaseDiaryRow) => row.kind}
        estimatedItemSize={78}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        ListHeaderComponent={
          <ReleasesHeader
            headline={getReleaseDiaryHeadline(counts)}
            days={weekActivity}
            refreshing={Boolean(data && data.staleShowIds.length > 0)}
          />
        }
        ListEmptyComponent={
          !data ? (
            <View className="items-center justify-center py-16">
              <ActivityIndicator size="small" color={ACCENT} />
            </View>
          ) : (
            <View className="px-6 pt-8">
              <EmptyState
                title="No upcoming releases"
                description="Add more shows to your watchlist or mark them as watching to build this calendar."
              />
            </View>
          )
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <View className="items-center pb-2 pt-6">
              <View className="mb-2 h-px w-12 bg-dark-border" />
              <Text className="text-[12px] font-semibold text-text-tertiary">
                That's everything scheduled
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

export default function CalendarScreen() {
  const { isAuthenticated } = useAuth();
  const refreshForMe = useAction(api.releaseCalendar.refreshForMe);
  const staleRefreshKeyRef = useRef<string | null>(null);
  const today = useMemo(() => getLocalDateString(), []);
  const data = useQuery(
    api.releaseCalendar.listForMe,
    isAuthenticated
      ? { view: "upcoming", today, limit: RELEASE_CALENDAR_MAX_ITEMS }
      : "skip",
  );

  // A show just added to Watching has no synced release events yet, so it
  // arrives in staleShowIds. Sync it, then refetch — actions don't invalidate
  // queries on their own, and without the refetch the new show's releases
  // only appeared after an app restart. The key ref stops a failed sync from
  // re-firing on every render while still allowing a retry when the stale
  // set (or day) changes.
  useEffect(() => {
    if (!isAuthenticated || !data || data.staleShowIds.length === 0) {
      staleRefreshKeyRef.current = null;
      return;
    }

    const staleKey = `${today}:${[...data.staleShowIds].sort().join("|")}`;
    if (staleRefreshKeyRef.current === staleKey) return;
    staleRefreshKeyRef.current = staleKey;

    void refreshForMe({ today })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: ["plotlist-rpc"],
          refetchType: "active",
        }),
      )
      .catch(() => {
        // Render cached data even if refresh fails; clear the key so a later
        // pass can retry.
        if (staleRefreshKeyRef.current === staleKey) {
          staleRefreshKeyRef.current = null;
        }
      });
  }, [data, isAuthenticated, refreshForMe, today]);

  return (
    <CalendarSurface data={data} isAuthenticated={isAuthenticated} today={today} />
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: 40,
    width: 44,
  },
  dayRail: {
    alignItems: "flex-start",
    paddingTop: 14,
    width: DAY_RAIL_WIDTH,
  },
  episodeLine: {
    flexShrink: 1,
  },
  providerLogo: {
    borderRadius: 5,
    height: 18,
    width: 18,
  },
  rowDivider: {
    borderBottomColor: "rgba(255,255,255,0.07)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sparkline: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 3,
    height: 24,
  },
  sparklineBar: {
    borderRadius: 2.5,
    width: 5,
  },
  thumb: {
    borderRadius: 10,
    height: THUMB_HEIGHT,
    overflow: "hidden",
    width: THUMB_WIDTH,
  },
  thumbImage: {
    height: "100%",
    width: "100%",
  },
  thumbFallback: {
    alignItems: "center",
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
});
