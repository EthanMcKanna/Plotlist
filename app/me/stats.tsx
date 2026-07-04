import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { Poster } from "../../components/Poster";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import { guardedPush } from "../../lib/navigation";
import { formatEpisodeCode, formatShortDate, formatWatchTimeLabel } from "../../lib/format";
import { useAuth, useQuery } from "../../lib/plotlist/react";
import type { WatchInsights } from "../../lib/watchInsights";

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

function MonthlyChart({ months }: { months: WatchInsights["monthlyActivity"] }) {
  const max = Math.max(1, ...months.map((month) => month.episodes));
  return (
    <View className="flex-row items-end gap-1.5" style={{ height: 96 }}>
      {months.map((month) => (
        <View key={month.key} className="flex-1 items-center gap-1.5">
          <View className="w-full flex-1 justify-end">
            <View
              className="w-full rounded-md"
              style={{
                height: `${Math.max((month.episodes / max) * 100, month.episodes > 0 ? 6 : 2)}%`,
                backgroundColor:
                  month.episodes > 0 ? "#38BDF8" : "rgba(255,255,255,0.08)",
              }}
            />
          </View>
          <Text className="text-[9px] text-text-tertiary">{month.label}</Text>
        </View>
      ))}
    </View>
  );
}

const DAYPART_COLORS = ["#38BDF8", "#F59E0B", "#A78BFA", "#22D3EE"];
const GENRE_COLORS = ["#38BDF8", "#22C55E", "#F59E0B", "#A78BFA", "#F472B6"];

export default function WatchStatsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const utcOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);
  const insights = useQuery(
    api.watchStats.getInsights,
    isAuthenticated ? { utcOffsetMinutes } : "skip",
  ) as WatchInsights | undefined;

  if (isLoading || (isAuthenticated && !insights)) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38bdf8" />
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
  const librarySeries: Array<{ label: string; value: number; color: string }> = [
    { label: "Watching", value: insights.library.watching, color: "#22C55E" },
    { label: "Completed", value: insights.library.completed, color: "#38BDF8" },
    { label: "Watchlist", value: insights.library.watchlist, color: "#F59E0B" },
    { label: "Dropped", value: insights.library.dropped, color: "#EF4444" },
  ];

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      >
        <View className="px-6 pt-2">
          {/* Header */}
          <View className="flex-row items-center gap-3">
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
            <View>
              <Text className="text-2xl font-black text-text-primary">Watch Stats</Text>
              <Text className="text-xs text-text-tertiary">
                Private to you · updates as you watch
              </Text>
            </View>
          </View>

          {/* Hero */}
          <GlassSurface radius={12} variant="prominent" style={{ marginTop: 20 }} contentStyle={{ padding: 20 }}>
            <Text className="text-xs font-bold uppercase tracking-widest text-sky-200/80">
              Total time watched
            </Text>
            <Text className="mt-2 text-5xl font-black text-white">{time.value}</Text>
            <Text className="mt-1 text-sm text-sky-100/70">
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
                variant="control"
                contentStyle={{ alignItems: "center", padding: 16 }}
              >
                <Text className="text-sm font-semibold text-brand-400">
                  Find a show to start watching
                </Text>
              </GlassPressable>
            </View>
          ) : (
            <>
              {/* Pace + streaks */}
              <GlassSurface radius={12} variant="surface" style={{ marginTop: 12 }}>
                <View className="flex-row">
                  <StatChip
                    icon="flash"
                    color="#38BDF8"
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
                    value={`${insights.streaks.longest}d`}
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

              {/* Monthly pace */}
              <View className="mt-8">
                <SectionTitle
                  title="Past 12 months"
                  aside={`${insights.window.episodesLast30Days} episodes in the last 30 days`}
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
                      <Pressable
                        key={show.showId}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          guardedPush(`/show/${show.showId}`);
                        }}
                        className={`flex-row items-center gap-3 px-4 py-3 active:bg-dark-hover ${
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
                      </Pressable>
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
                        color={GENRE_COLORS[index % GENRE_COLORS.length]}
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
                      color={DAYPART_COLORS[index % DAYPART_COLORS.length]}
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

              {/* Library mix */}
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
                      <Pressable
                        key={episode.id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          guardedPush(`/show/${episode.showId}`);
                        }}
                        className={`flex-row items-center gap-3 px-4 py-3 active:bg-dark-hover ${
                          index !== insights.recentEpisodes.length - 1
                            ? "border-b border-dark-border"
                            : ""
                        }`}
                      >
                        <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15">
                          <Ionicons name="play" size={15} color="#38BDF8" />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-sm font-semibold text-text-primary"
                            numberOfLines={1}
                          >
                            {episode.title ?? "Unknown show"}
                          </Text>
                          <Text className="mt-0.5 text-xs text-text-tertiary">
                            {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} ·{" "}
                            {formatShortDate(episode.watchedAt)} · {episode.runtimeMinutes}m
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={15} color="#5A6070" />
                      </Pressable>
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
