import { useCallback, useMemo } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { LinkPressable } from "../../components/LinkPressable";
import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { Poster } from "../../components/Poster";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import type { AccentTheme } from "../../lib/appearance";
import { useAccent } from "../../lib/appearanceStore";
import { guardedPush } from "../../lib/navigation";
import { formatEpisodeCode, formatRelativeDay, formatWatchTimeLabel } from "../../lib/format";
import { getDayAnchoredWatchedAt } from "../../lib/watchLogDates";
import { queryDataUpdatedAt, useAuth, useQueryState } from "../../lib/plotlist/react";
import { presentProPaywall } from "../../lib/purchases";
import { queryClient } from "../../lib/queryClient";
import type { WatchInsights, WatchInsightsPayload } from "../../lib/watchInsights";
import { SHOW_BACK_BUTTON } from "../../lib/webLayout";

function SectionTitle({ title, aside }: { title: string; aside?: string | null }) {
  return (
    <View className="mb-3 flex-row items-baseline justify-between">
      <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
        {title}
      </Text>
      {aside ? <Text className="text-xs text-text-tertiary">{aside}</Text> : null}
    </View>
  );
}

function StatChip({
  icon,
  color,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <View className="flex-1 items-center gap-1 py-3">
      <Ionicons name={icon} size={16} color={color} />
      <Text className="text-lg font-bold tabular-nums text-text-primary">{value}</Text>
      <Text className="text-[11px] text-text-tertiary">{label}</Text>
    </View>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  valueLabel,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  valueLabel?: string;
}) {
  const ratio = max > 0 ? value / max : 0;
  return (
    <View className="gap-1.5 py-1.5">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-sm text-text-secondary">{label}</Text>
        <Text className="text-xs tabular-nums text-text-tertiary">
          {valueLabel ?? value.toLocaleString()}
        </Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <View
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${Math.max(ratio * 100, value > 0 ? 3 : 0)}%` }}
        />
      </View>
    </View>
  );
}

// Bars use explicit pixel heights: percentage heights inside auto-sized flex
// columns resolve to 0 on web, which rendered this chart blank there.
const MONTHLY_CHART_BAR_AREA = 76;

function MonthlyChart({ months }: { months: WatchInsights["monthlyActivity"] }) {
  const accent = useAccent();
  const max = Math.max(1, ...months.map((month) => month.episodes));
  return (
    <View className="flex-row gap-1.5">
      {months.map((month) => (
        <View key={month.key} className="flex-1 items-center gap-1.5">
          <View className="w-full justify-end" style={{ height: MONTHLY_CHART_BAR_AREA }}>
            <View
              className="w-full rounded-md"
              style={{
                height: Math.max(
                  (month.episodes / max) * MONTHLY_CHART_BAR_AREA,
                  month.episodes > 0 ? 5 : 2,
                ),
                backgroundColor:
                  month.episodes > 0 ? accent.ramp[400] : "rgba(255,255,255,0.08)",
              }}
            />
          </View>
          <Text className="text-[9px] text-text-tertiary">{month.label}</Text>
        </View>
      ))}
    </View>
  );
}

const daypartColors = (accent: AccentTheme) => [
  accent.ramp[400],
  "#F59E0B",
  "#A78BFA",
  "#22D3EE",
];
const genreColors = (accent: AccentTheme) => [
  accent.ramp[400],
  "#22C55E",
  "#F59E0B",
  "#A78BFA",
  "#F472B6",
];

// Shown to free accounts in place of the all-time sections. A successful
// purchase invalidates every cached query so the redacted insights refetch
// unredacted immediately.
function AllTimeLockedCard() {
  const handleUnlock = async () => {
    const outcome = await presentProPaywall();
    if (outcome === "purchased" || outcome === "restored") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries();
    } else if (outcome === "unavailable") {
      guardedPush("/settings");
    }
  };

  return (
    <View className="mt-8">
      <SectionTitle title="All-time insights" aside="Plotlist Pro" />
      <GlassSurface
        radius={12}
        variant="surface"
        fallbackColor="rgba(250,204,21,0.08)"
        borderColor="rgba(250,204,21,0.22)"
        contentStyle={{ padding: 20 }}
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="lock-closed" size={14} color="#FACC15" />
          <Text className="text-sm font-bold text-text-primary">
            Your full watch history, unlocked
          </Text>
        </View>
        <Text className="mt-2 text-xs leading-5 text-text-secondary">
          Every month you've watched, your all-time most-watched shows and
          genres, when you watch, and your best streak — across your whole
          history, not just this year.
        </Text>
        <GlassPressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void handleUnlock();
          }}
          accessibilityRole="button"
          accessibilityLabel="Unlock all-time insights with Plotlist Pro"
          radius={10}
          variant="accent"
          style={{ marginTop: 14 }}
          contentStyle={{ alignItems: "center", paddingVertical: 11 }}
        >
          <Text className="text-sm font-bold text-brand-100">Unlock with Pro</Text>
        </GlassPressable>
      </GlassSurface>
    </View>
  );
}

export default function WatchStatsScreen() {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const utcOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);
  const insightsQuery = useQueryState(
    api.watchStats.getInsights,
    isAuthenticated ? { utcOffsetMinutes } : "skip",
  );
  const insights = insightsQuery.data as WatchInsightsPayload | undefined;

  // Mutations already invalidate this query, but streaks and pace windows
  // also shift at midnight with no mutation at all. Refetch on focus when the
  // cached payload is older than a few seconds — the server's fingerprint
  // check makes a no-change refetch nearly free.
  const refetchInsights = insightsQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;
      const updatedAt = queryDataUpdatedAt(api.watchStats.getInsights, { utcOffsetMinutes });
      if (updatedAt !== null && Date.now() - updatedAt > 15_000) {
        refetchInsights();
      }
    }, [isAuthenticated, refetchInsights, utcOffsetMinutes]),
  );

  if (isLoading || (isAuthenticated && !insights && !insightsQuery.isError)) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={accent.ramp[400]} />
        </View>
      </Screen>
    );
  }

  if (isAuthenticated && !insights && insightsQuery.isError) {
    return (
      <Screen>
        <View className="flex-1 justify-center px-6">
          <EmptyState
            title="Couldn't load your stats"
            description="Check your connection and try again."
          />
          <GlassPressable
            onPress={() => refetchInsights()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading watch stats"
            radius={12}
            variant="tinted"
            style={{ marginTop: 16 }}
            contentStyle={{ alignItems: "center", padding: 14 }}
          >
            <Text className="text-sm font-semibold text-brand-400">Try again</Text>
          </GlassPressable>
        </View>
      </Screen>
    );
  }

  if (!isAuthenticated) {
    return (
      <Screen>
        <View className="flex-1 justify-center px-6">
          <EmptyState
            title="Sign in to see watch stats"
            description="Your watch stats are private and follow your Plotlist profile."
          />
        </View>
      </Screen>
    );
  }

  if (!insights) {
    return null;
  }

  const time = formatWatchTimeLabel(insights.totals.minutes);
  const hasHistory = insights.totals.episodes > 0;
  const maxWeekday = Math.max(1, ...insights.weekdayActivity.map((day) => day.episodes));
  const maxDaypart = Math.max(1, ...insights.daypartActivity.map((part) => part.episodes));
  const maxGenreMinutes = Math.max(1, ...insights.topGenres.map((genre) => genre.minutes));
  const daypartPalette = daypartColors(accent);
  const genrePalette = genreColors(accent);
  // Full watch-status-v2 tiers; zero-count rows are noise, so only what the
  // user actually has renders.
  const librarySeries: Array<{ label: string; value: number; color: string }> = [
    { label: "Watching", value: insights.library.watching, color: "#22C55E" },
    { label: "Caught up", value: insights.library.caught_up, color: "#22D3EE" },
    { label: "Finished", value: insights.library.finished, color: accent.ramp[400] },
    { label: "Watchlist", value: insights.library.watchlist, color: "#F59E0B" },
    { label: "Paused", value: insights.library.paused, color: "#94A3B8" },
    { label: "Dropped", value: insights.library.dropped, color: "#EF4444" },
  ].filter((entry) => entry.value > 0);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      >
        <View className="px-6 pt-2">
          {/* Header */}
          <View className="flex-row items-center gap-3">
            {SHOW_BACK_BUTTON ? (
              <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              radius={20}
              variant="control"
              contentStyle={{
                alignItems: "center",
                height: 40,
                justifyContent: "center",
                width: 40,
              }}
            >
              <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
            </GlassPressable>
            ) : null}
            <View>
              <Text className="text-2xl font-black text-text-primary">Watch Stats</Text>
              <Text className="text-xs text-text-tertiary">
                Private to you · updates as you watch
              </Text>
            </View>
          </View>

          {/* Hero */}
          <GlassSurface
            radius={12}
            variant="surface"
            fallbackColor={accent.rgba(500, 0.14)}
            borderColor={accent.rgba(300, 0.28)}
            style={{ marginTop: 20 }}
            contentStyle={{ padding: 20 }}
          >
            <Text className="text-xs font-bold uppercase tracking-widest text-brand-200/80">
              Total time watched
            </Text>
            <Text className="mt-2 text-5xl font-black text-white">{time.value}</Text>
            <Text className="mt-1 text-sm text-brand-100/70">
              {hasHistory
                ? `${insights.totals.episodes.toLocaleString()} episodes across ${insights.totals.shows.toLocaleString()} shows`
                : "Mark episodes watched to start building your stats."}
            </Text>
          </GlassSurface>

          {!hasHistory ? (
            <View className="mt-6">
              <GlassPressable
                onPress={() => guardedPush("/search")}
                radius={12}
                variant="tinted"
                contentStyle={{ alignItems: "center", padding: 16 }}
              >
                <Text className="text-sm font-semibold text-brand-400">
                  Find a show to start watching
                </Text>
              </GlassPressable>
            </View>
          ) : (
            <>
              {/* Shareable year-so-far cards. Optional-chained: a client can
                  briefly run against a worker that predates yearToDate. */}
              {(insights.yearToDate?.episodes ?? 0) > 0 ? (
                <GlassPressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    guardedPush("/me/stats-share");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Share your year so far"
                  radius={12}
                  variant="accent"
                  style={{ marginTop: 12 }}
                  contentStyle={{
                    alignItems: "center",
                    flexDirection: "row",
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                  }}
                >
                  <Ionicons name="sparkles" size={18} color={accent.ramp[300]} />
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-brand-100">
                      Share your {insights.yearToDate.year} so far
                    </Text>
                    <Text className="mt-0.5 text-xs text-brand-100/60">
                      {insights.yearToDate.episodes.toLocaleString()} episodes, ready to post
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={accent.ramp[300]} />
                </GlassPressable>
              ) : null}

              {/* Pace + streaks */}
              <GlassSurface radius={12} variant="surface" style={{ marginTop: 12 }}>
                <View className="flex-row">
                  <StatChip
                    icon="flash"
                    color={accent.ramp[400]}
                    value={insights.window.episodesLast7Days.toLocaleString()}
                    label="Last 7 days"
                  />
                  <View className="w-px self-stretch bg-dark-border" />
                  <StatChip
                    icon="flame"
                    color="#F59E0B"
                    value={`${insights.streaks.current}d`}
                    label="Current streak"
                  />
                  <View className="w-px self-stretch bg-dark-border" />
                  <StatChip
                    icon="trophy"
                    color="#22C55E"
                    value={insights.allTimeLocked ? "Pro" : `${insights.streaks.longest}d`}
                    label="Best streak"
                  />
                  <View className="w-px self-stretch bg-dark-border" />
                  <StatChip
                    icon="calendar"
                    color="#A78BFA"
                    value={insights.totals.activeDays.toLocaleString()}
                    label="Active days"
                  />
                </View>
              </GlassSurface>

              {/* All-time depth is Pro; free accounts get one upsell card in
                  place of the four sections (server already redacted data). */}
              {insights.allTimeLocked ? (
                <AllTimeLockedCard />
              ) : (
                <>
              {/* Monthly pace */}
              <View className="mt-8">
                <SectionTitle
                  title="Past 12 months"
                  aside={`${insights.window.episodesLast30Days} episode${
                    insights.window.episodesLast30Days === 1 ? "" : "s"
                  } in the last 30 days`}
                />
                <GlassSurface radius={12} variant="surface" contentStyle={{ padding: 16 }}>
                  <MonthlyChart months={insights.monthlyActivity} />
                </GlassSurface>
              </View>

              {/* Top shows */}
              {insights.topShows.length > 0 ? (
                <View className="mt-8">
                  <SectionTitle title="Most watched" />
                  <GlassSurface radius={12} variant="surface">
                    {insights.topShows.map((show, index) => (
                      <LinkPressable
                        key={show.showId}
                        href={`/show/${show.showId}`}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        className={`flex-row items-center gap-3 px-4 py-3 active:bg-dark-hover hover:bg-dark-hover web:transition-colors ${
                          index !== insights.topShows.length - 1
                            ? "border-b border-dark-border"
                            : ""
                        }`}
                      >
                        <Text className="w-5 text-center text-sm font-bold tabular-nums text-text-tertiary">
                          {index + 1}
                        </Text>
                        <Poster uri={show.posterUrl} width={40} />
                        <View className="flex-1">
                          <Text
                            className="text-sm font-semibold text-text-primary"
                            numberOfLines={1}
                          >
                            {show.title ?? "Unknown show"}
                          </Text>
                          <Text className="mt-0.5 text-xs text-text-tertiary">
                            {show.episodes.toLocaleString()} episodes ·{" "}
                            {Math.round(show.minutes / 60).toLocaleString()}h
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={15} color="#5A6070" />
                      </LinkPressable>
                    ))}
                  </GlassSurface>
                </View>
              ) : null}

              {/* Genres */}
              {insights.topGenres.length > 0 ? (
                <View className="mt-8">
                  <SectionTitle title="Your genres" />
                  <GlassSurface radius={12} variant="surface" contentStyle={{ padding: 16 }}>
                    {insights.topGenres.map((genre, index) => (
                      <BarRow
                        key={genre.genreId}
                        label={genre.label}
                        value={genre.minutes}
                        max={maxGenreMinutes}
                        color={genrePalette[index % genrePalette.length]}
                        valueLabel={`${Math.round(genre.minutes / 60).toLocaleString()}h`}
                      />
                    ))}
                  </GlassSurface>
                </View>
              ) : null}

              {/* Rhythm */}
              <View className="mt-8">
                <SectionTitle
                  title="When you watch"
                  aside={
                    insights.busiestDay
                      ? `Busiest day: ${insights.busiestDay.episodes} episodes`
                      : null
                  }
                />
                <GlassSurface radius={12} variant="surface" contentStyle={{ padding: 16 }}>
                  {insights.daypartActivity.map((part, index) => (
                    <BarRow
                      key={part.label}
                      label={part.label}
                      value={part.episodes}
                      max={maxDaypart}
                      color={daypartPalette[index % daypartPalette.length]}
                    />
                  ))}
                  <View className="my-3 h-px bg-dark-border" />
                  {insights.weekdayActivity.map((day) => (
                    <BarRow
                      key={day.label}
                      label={day.label}
                      value={day.episodes}
                      max={maxWeekday}
                      color="#22C55E"
                    />
                  ))}
                </GlassSurface>
              </View>
                </>
              )}

              {/* Library mix */}
              {librarySeries.length > 0 ? (
                <View className="mt-8">
                  <SectionTitle
                    title="Library"
                    aside={`${insights.library.total.toLocaleString()} shows`}
                  />
                  <GlassSurface radius={12} variant="surface" contentStyle={{ padding: 16 }}>
                    {librarySeries.map((entry) => (
                      <BarRow
                        key={entry.label}
                        label={entry.label}
                        value={entry.value}
                        max={Math.max(1, insights.library.total)}
                        color={entry.color}
                      />
                    ))}
                  </GlassSurface>
                </View>
              ) : null}

              {/* Ratings */}
              {insights.reviews.total > 0 ? (
                <View className="mt-8">
                  <SectionTitle
                    title="Ratings"
                    aside={`${insights.reviews.total.toLocaleString()} reviews`}
                  />
                  <GlassSurface radius={12} variant="surface" contentStyle={{ padding: 16 }}>
                    <View className="flex-row">
                      <View className="flex-1 items-center">
                        <Text className="text-2xl font-bold text-amber-300">
                          {insights.reviews.averageRating?.toFixed(1) ?? "—"}
                        </Text>
                        <Text className="mt-0.5 text-xs text-text-tertiary">Avg rating</Text>
                      </View>
                      <View className="w-px self-stretch bg-dark-border" />
                      <View className="flex-1 items-center">
                        <Text className="text-2xl font-bold text-text-primary">
                          {insights.reviews.fiveStarCount.toLocaleString()}
                        </Text>
                        <Text className="mt-0.5 text-xs text-text-tertiary">5-star ratings</Text>
                      </View>
                      <View className="w-px self-stretch bg-dark-border" />
                      <View className="flex-1 items-center">
                        <Text className="text-2xl font-bold text-text-primary">
                          {insights.reviews.ratedShows.toLocaleString()}
                        </Text>
                        <Text className="mt-0.5 text-xs text-text-tertiary">Shows rated</Text>
                      </View>
                    </View>
                  </GlassSurface>
                </View>
              ) : null}

              {/* Recent episodes */}
              {insights.recentEpisodes.length > 0 ? (
                <View className="mt-8">
                  <SectionTitle title="Recently watched" />
                  <GlassSurface radius={12} variant="surface">
                    {insights.recentEpisodes.map((episode, index) => (
                      <LinkPressable
                        key={episode.id}
                        href={`/show/${episode.showId}`}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        className={`flex-row items-center gap-3 px-4 py-3 active:bg-dark-hover hover:bg-dark-hover web:transition-colors ${
                          index !== insights.recentEpisodes.length - 1
                            ? "border-b border-dark-border"
                            : ""
                        }`}
                      >
                        <Poster uri={episode.posterUrl} width={40} />
                        <View className="flex-1">
                          <Text
                            className="text-sm font-semibold text-text-primary"
                            numberOfLines={1}
                          >
                            {episode.title ?? "Unknown show"}
                          </Text>
                          <Text className="mt-0.5 text-xs text-text-tertiary">
                            {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} ·{" "}
                            {episode.runtimeMinutes}m
                          </Text>
                        </View>
                        <Text className="text-[11px] font-medium tabular-nums text-text-tertiary">
                          {formatRelativeDay(getDayAnchoredWatchedAt(episode.watchedAt))}
                        </Text>
                      </LinkPressable>
                    ))}
                  </GlassSurface>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
