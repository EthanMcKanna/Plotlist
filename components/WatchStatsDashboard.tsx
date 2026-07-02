import { Fragment, useMemo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { formatEpisodeCode } from "../lib/format";
import type { WatchStatsPayload } from "../lib/watchStats";
import { GlassPressable, GlassSurface } from "./NativeGlass";
import { Poster } from "./Poster";
import { Screen } from "./Screen";

const DEFAULT_STATUS_COUNTS = {
  watchlist: 0,
  watching: 0,
  completed: 0,
  dropped: 0,
  total: 0,
};

const DEFAULT_WEEKDAY_ACTIVITY = [
  { label: "Sun", count: 0 },
  { label: "Mon", count: 0 },
  { label: "Tue", count: 0 },
  { label: "Wed", count: 0 },
  { label: "Thu", count: 0 },
  { label: "Fri", count: 0 },
  { label: "Sat", count: 0 },
];

const DEFAULT_TIME_OF_DAY_ACTIVITY = [
  { label: "Morning", count: 0 },
  { label: "Afternoon", count: 0 },
  { label: "Evening", count: 0 },
  { label: "Late night", count: 0 },
];

const DEFAULT_REVIEW_STATS: WatchStatsPayload["reviewStats"] = {
  totalReviews: 0,
  ratedShows: 0,
  averageRating: null,
  fiveStarCount: 0,
  topRated: [],
};

const TV_GENRES: Record<number, string> = {
  10759: "Action",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi",
  10766: "Soap",
  10767: "Talk",
  10768: "War",
  37: "Western",
};

type WatchStatsDashboardProps = {
  stats: WatchStatsPayload;
  onBack: () => void;
  onSearch: () => void;
  onMyShows: () => void;
  onShow: (showId: string) => void;
};

function impact() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function formatWatchTime(totalMinutes = 0) {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatCompactDate(timestamp?: number | null) {
  if (!timestamp) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function formatOptionalCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function safeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function getFallbackMonthlyActivity() {
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    return {
      key: monthDate.toISOString().slice(0, 7),
      label: monthFormatter.format(monthDate),
      count: 0,
    };
  });
}

function getTopGenre(topShows: WatchStatsPayload["topShows"] | undefined) {
  const counts = new Map<number, number>();
  for (const item of topShows ?? []) {
    for (const genreId of item.show?.genreIds ?? []) {
      counts.set(genreId, (counts.get(genreId) ?? 0) + item.episodes);
    }
  }
  const winner = Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0];
  return winner ? TV_GENRES[winner[0]] ?? "TV" : "TV";
}

function HeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <GlassPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => {
        impact();
        onPress();
      }}
      radius={8}
      contentStyle={{
        alignItems: "center",
        height: 40,
        justifyContent: "center",
        width: 40,
      }}
    >
      <Ionicons name={icon} size={20} color="#F1F3F7" />
    </GlassPressable>
  );
}

function MetricTile({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
}) {
  return (
    <GlassSurface
      radius={8}
      variant="surface"
      contentStyle={{ gap: 10, minHeight: 104, padding: 14 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
          {label}
        </Text>
        <Ionicons name={icon} size={17} color={tone} />
      </View>
      <Text
        selectable
        className="text-2xl font-black text-text-primary"
        style={{ color: tone, fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
      <Text className="text-xs leading-4 text-text-tertiary">{detail}</Text>
    </GlassSurface>
  );
}

function Section({
  title,
  icon,
  children,
  aside,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  aside?: string;
}) {
  return (
    <GlassSurface radius={8} variant="surface" contentStyle={{ padding: 16 }}>
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <Ionicons name={icon} size={16} color="#7dd3fc" />
          <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
            {title}
          </Text>
        </View>
        {aside ? (
          <Text selectable className="text-xs font-semibold text-text-secondary">
            {aside}
          </Text>
        ) : null}
      </View>
      {children}
    </GlassSurface>
  );
}

function ProgressRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = value > 0 && max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium text-text-secondary">{label}</Text>
        <Text selectable className="text-xs font-semibold text-text-tertiary">
          {value}
        </Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-dark-elevated">
        <View
          className="h-1.5 rounded-full"
          style={{ backgroundColor: value > 0 ? color : "transparent", width: `${width}%` }}
        />
      </View>
    </View>
  );
}

function InlineEmpty({ title, description }: { title: string; description: string }) {
  return (
    <View className="items-center gap-1 border border-dashed border-dark-border px-4 py-6" style={{ borderRadius: 8 }}>
      <Text className="text-center text-sm font-semibold text-text-primary">{title}</Text>
      <Text className="text-center text-xs leading-4 text-text-tertiary">{description}</Text>
    </View>
  );
}

function StartCallout({
  hasLibrary,
  hasAnyStats,
  onSearch,
  onMyShows,
}: {
  hasLibrary: boolean;
  hasAnyStats: boolean;
  onSearch: () => void;
  onMyShows: () => void;
}) {
  if (hasAnyStats && hasLibrary) {
    return (
      <GlassSurface radius={8} variant="surface" contentStyle={{ gap: 6, padding: 16 }}>
        <Text className="text-base font-bold text-text-primary">Library found. Episodes next.</Text>
        <Text className="text-sm leading-5 text-text-tertiary">
          You have saved shows or ratings, but no watched episodes yet. Mark an episode watched to unlock pace, streaks, and top-show stats.
        </Text>
      </GlassSurface>
    );
  }

  if (hasAnyStats) return null;

  return (
    <GlassSurface radius={8} variant="prominent" contentStyle={{ gap: 14, padding: 16 }}>
      <View className="gap-1">
        <Text className="text-base font-bold text-text-primary">
          Your stats will fill in as you watch.
        </Text>
        <Text className="text-sm leading-5 text-text-tertiary">
          Search for a show, add it to your library, then mark episodes watched from the show page.
        </Text>
      </View>
      <View className="flex-row gap-3">
        <GlassPressable
          accessibilityRole="button"
          onPress={() => {
            impact();
            onSearch();
          }}
          radius={8}
          variant="control"
          style={{ flex: 1 }}
          contentStyle={{ alignItems: "center", justifyContent: "center", minHeight: 46 }}
        >
          <Text className="text-sm font-bold text-text-primary">Search</Text>
        </GlassPressable>
        <GlassPressable
          accessibilityRole="button"
          onPress={() => {
            impact();
            onMyShows();
          }}
          radius={8}
          variant="control"
          style={{ flex: 1 }}
          contentStyle={{ alignItems: "center", justifyContent: "center", minHeight: 46 }}
        >
          <Text className="text-sm font-bold text-text-primary">My Shows</Text>
        </GlassPressable>
      </View>
    </GlassSurface>
  );
}

function TopShows({
  items,
  onShow,
}: {
  items: WatchStatsPayload["topShows"];
  onShow: (showId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <InlineEmpty
        title="No top shows yet"
        description="Watched episodes will rank your most-played shows here."
      />
    );
  }

  return (
    <View>
      {items.map((item, index) => (
        <Fragment key={item.show._id}>
          {index > 0 ? <View className="h-px bg-dark-border" /> : null}
          <Pressable
            onPress={() => {
              impact();
              onShow(item.show._id);
            }}
            className="flex-row items-center gap-3 py-3 active:opacity-75"
          >
            <Text
              selectable
              className="w-7 text-center text-lg font-black text-text-tertiary"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {index + 1}
            </Text>
            <Poster uri={item.show.posterUrl} width={50} />
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
                {item.show.title ?? "Unknown show"}
              </Text>
              <Text className="text-xs text-text-tertiary">
                {item.episodes.toLocaleString()} episodes · {formatWatchTime(item.minutes)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#5A6070" />
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}

function MonthlyPace({
  items,
  max,
}: {
  items: WatchStatsPayload["monthlyActivity"];
  max: number;
}) {
  return (
    <View className="h-36 flex-row items-end gap-2">
      {items.map((item) => (
        <View key={item.key} className="flex-1 items-center">
          <View
            className="w-full rounded-t-md"
            style={{
              backgroundColor: item.count > 0 ? "#38bdf8" : "rgba(255,255,255,0.12)",
              height: `${Math.max(8, Math.round((item.count / max) * 100))}%`,
            }}
          />
          <Text className="mt-2 text-xs text-text-tertiary">{item.label}</Text>
          <Text selectable className="mt-0.5 text-xs font-semibold text-text-secondary">
            {item.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Achievement({
  icon,
  title,
  description,
  unlocked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  unlocked: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: unlocked ? "rgba(56,189,248,0.16)" : "rgba(255,255,255,0.06)" }}
      >
        <Ionicons name={icon} size={17} color={unlocked ? "#7dd3fc" : "#5A6070"} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-text-primary">{title}</Text>
        <Text className="text-xs leading-4 text-text-tertiary">{description}</Text>
      </View>
      <Ionicons
        name={unlocked ? "checkmark-circle" : "ellipse-outline"}
        size={18}
        color={unlocked ? "#22C55E" : "#5A6070"}
      />
    </View>
  );
}

function Ratings({
  reviewStats,
  averageRating,
  hasReviews,
  onShow,
}: {
  reviewStats: WatchStatsPayload["reviewStats"];
  averageRating: number | null | undefined;
  hasReviews: boolean;
  onShow: (showId: string) => void;
}) {
  return (
    <View className="gap-4">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text
            selectable
            className="text-3xl font-black text-amber-300"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {averageRating ? averageRating.toFixed(1) : "-"}
          </Text>
          <Text className="mt-1 text-xs text-text-tertiary">average rating</Text>
        </View>
        <View className="flex-1">
          <Text
            selectable
            className="text-3xl font-black text-text-primary"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {reviewStats.fiveStarCount}
          </Text>
          <Text className="mt-1 text-xs text-text-tertiary">near-perfect scores</Text>
        </View>
      </View>

      {!hasReviews ? (
        <InlineEmpty title="No ratings yet" description="Rate a show or episode to see your taste stats." />
      ) : reviewStats.topRated.length > 0 ? (
        <View>
          {reviewStats.topRated.map((item, index) => (
            <Fragment key={item.review._id}>
              {index > 0 ? <View className="h-px bg-dark-border" /> : null}
              <Pressable
                onPress={() => {
                  if (!item.show?._id) return;
                  impact();
                  onShow(item.show._id);
                }}
                className="flex-row items-center justify-between gap-3 py-3 active:opacity-75"
              >
                <Text className="flex-1 text-sm text-text-secondary" numberOfLines={1}>
                  {item.show?.title ?? "Untitled"}
                </Text>
                <Text
                  selectable
                  className="text-sm font-bold text-amber-300"
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {item.review.rating.toFixed(1)}
                </Text>
              </Pressable>
            </Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RecentEpisodes({
  items,
  onShow,
}: {
  items: WatchStatsPayload["recentEpisodes"];
  onShow: (showId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <InlineEmpty
        title="No recent episodes"
        description="Episodes you mark watched will appear here."
      />
    );
  }

  return (
    <View>
      {items.map((item, index) => (
        <Fragment key={item._id}>
          {index > 0 ? <View className="h-px bg-dark-border" /> : null}
          <Pressable
            onPress={() => {
              if (!item.show?._id) return;
              impact();
              onShow(item.show._id);
            }}
            className="flex-row items-center gap-3 py-3 active:opacity-75"
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-dark-elevated">
              <Ionicons name="tv" size={16} color="#7dd3fc" />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-sm font-semibold text-text-primary" numberOfLines={1}>
                {item.show?.title ?? "Unknown show"}
              </Text>
              <Text className="text-xs text-text-tertiary">
                {formatEpisodeCode(item.seasonNumber, item.episodeNumber)} · {formatCompactDate(item.watchedAt)}
              </Text>
            </View>
            <Text selectable className="text-xs font-semibold text-text-tertiary">
              {item.runtimeMinutes}m
            </Text>
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}

export function WatchStatsDashboard({
  stats,
  onBack,
  onSearch,
  onMyShows,
  onShow,
}: WatchStatsDashboardProps) {
  const topShows = Array.isArray(stats.topShows) ? stats.topShows : [];
  const recentEpisodes = Array.isArray(stats.recentEpisodes) ? stats.recentEpisodes : [];
  const totalEpisodes = safeNumber(stats.totalEpisodes);
  const totalMinutes = safeNumber(stats.totalMinutes);
  const showsWithProgress = safeNumber(stats.showsWithProgress);
  const reportedAverageEpisodeMinutes = safeNumber(stats.averageEpisodeMinutes);
  const averageEpisodeMinutes =
    reportedAverageEpisodeMinutes || (totalEpisodes > 0 ? Math.round(totalMinutes / totalEpisodes) : 0);
  const episodesLast30Days = safeNumber(stats.episodesLast30Days);
  const activeDays = safeNumber(stats.activeDays);
  const currentStreak = safeNumber(stats.currentStreak);
  const longestStreak = safeNumber(stats.longestStreak);
  const firstWatchedAt = safeTimestamp(stats.firstWatchedAt);
  const latestWatchedAt = safeTimestamp(stats.latestWatchedAt);
  const rawStatusCounts = stats.statusCounts ?? DEFAULT_STATUS_COUNTS;
  const statusCounts = {
    watchlist: safeNumber(rawStatusCounts.watchlist),
    watching: safeNumber(rawStatusCounts.watching),
    completed: safeNumber(rawStatusCounts.completed),
    dropped: safeNumber(rawStatusCounts.dropped),
    total: safeNumber(rawStatusCounts.total),
  };
  if (statusCounts.total === 0) {
    statusCounts.total =
      statusCounts.watchlist + statusCounts.watching + statusCounts.completed + statusCounts.dropped;
  }
  const rawReviewStats = stats.reviewStats ?? DEFAULT_REVIEW_STATS;
  const reviewStats: WatchStatsPayload["reviewStats"] = {
    totalReviews: safeNumber(rawReviewStats.totalReviews),
    ratedShows: safeNumber(rawReviewStats.ratedShows),
    averageRating:
      typeof rawReviewStats.averageRating === "number" && Number.isFinite(rawReviewStats.averageRating)
        ? rawReviewStats.averageRating
        : null,
    fiveStarCount: safeNumber(rawReviewStats.fiveStarCount),
    topRated: Array.isArray(rawReviewStats.topRated) ? rawReviewStats.topRated : [],
  };
  const monthlyActivity = useMemo(
    () =>
      Array.isArray(stats.monthlyActivity) && stats.monthlyActivity.length
        ? stats.monthlyActivity
        : getFallbackMonthlyActivity(),
    [stats.monthlyActivity],
  );
  const weekdayActivity = Array.isArray(stats.weekdayActivity) && stats.weekdayActivity.length
    ? stats.weekdayActivity
    : DEFAULT_WEEKDAY_ACTIVITY;
  const timeOfDayActivity = Array.isArray(stats.timeOfDayActivity) && stats.timeOfDayActivity.length
    ? stats.timeOfDayActivity
    : DEFAULT_TIME_OF_DAY_ACTIVITY;
  const hasEpisodes = totalEpisodes > 0;
  const hasLibrary = statusCounts.total > 0;
  const hasReviews = reviewStats.totalReviews > 0;
  const hasAnyStats = hasEpisodes || hasLibrary || hasReviews;
  const maxMonth = useMemo(
    () => Math.max(1, ...monthlyActivity.map((item) => item.count)),
    [monthlyActivity],
  );
  const maxWeekday = useMemo(
    () => Math.max(1, ...weekdayActivity.map((item) => item.count)),
    [weekdayActivity],
  );
  const maxDaypart = useMemo(
    () => Math.max(1, ...timeOfDayActivity.map((item) => item.count)),
    [timeOfDayActivity],
  );
  const topDaypart = useMemo(
    () => [...timeOfDayActivity].sort((left, right) => right.count - left.count)[0],
    [timeOfDayActivity],
  );
  const topGenre = useMemo(() => getTopGenre(topShows), [topShows]);
  const completionRate = statusCounts.total
    ? `${Math.round((statusCounts.completed / statusCounts.total) * 100)}%`
    : "-";
  const heroDetail = hasEpisodes
    ? `Across ${totalEpisodes.toLocaleString()} episodes and ${showsWithProgress.toLocaleString()} tracked shows`
    : hasLibrary
      ? "Ready when you mark your first episode watched"
      : "Start tracking shows to build your dashboard";

  return (
    <Screen scroll>
      <View className="gap-5 px-5 pb-12 pt-3">
        <View className="flex-row items-center justify-between">
          <HeaderButton icon="chevron-back" label="Back" onPress={onBack} />
          <View className="items-end">
            <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
              Private
            </Text>
            <Text className="text-lg font-black text-text-primary">Watch Stats</Text>
          </View>
        </View>

        <GlassSurface
          radius={8}
          variant="prominent"
          tintColor="rgba(56,189,248,0.18)"
          contentStyle={{ gap: 18, padding: 18 }}
        >
          <View className="gap-2">
            <Text className="text-xs font-bold uppercase tracking-widest text-sky-100/80">
              Total watch time
            </Text>
            <Text
              selectable
              className="text-5xl font-black leading-tight text-white"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {formatWatchTime(totalMinutes)}
            </Text>
            <Text className="text-sm font-medium leading-5 text-sky-50/80">
              {heroDetail}
            </Text>
          </View>

          <View className="h-px bg-white/15" />

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text selectable className="text-lg font-black text-white">
                {formatOptionalCount(episodesLast30Days)}
              </Text>
              <Text className="text-xs text-sky-50/70">last 30 days</Text>
            </View>
            <View className="flex-1">
              <Text selectable className="text-lg font-black text-white">
                {longestStreak}d
              </Text>
              <Text className="text-xs text-sky-50/70">best streak</Text>
            </View>
            <View className="flex-1">
              <Text className="text-lg font-black text-white" numberOfLines={1}>
                {topGenre}
              </Text>
              <Text className="text-xs text-sky-50/70">top lane</Text>
            </View>
          </View>
        </GlassSurface>

        <StartCallout
          hasAnyStats={hasAnyStats}
          hasLibrary={hasLibrary}
          onMyShows={onMyShows}
          onSearch={onSearch}
        />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <MetricTile
              icon="timer"
              label="Average"
              value={`${averageEpisodeMinutes}m`}
              detail="per episode"
              tone="#4ade80"
            />
          </View>
          <View className="flex-1">
            <MetricTile
              icon="checkmark-done"
              label="Complete"
              value={completionRate}
              detail="library rate"
              tone="#fbbf24"
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <MetricTile
              icon="flag"
              label="First"
              value={formatCompactDate(firstWatchedAt)}
              detail="episode logged"
              tone="#c084fc"
            />
          </View>
          <View className="flex-1">
            <MetricTile
              icon="sparkles"
              label="Latest"
              value={formatCompactDate(latestWatchedAt)}
              detail="episode"
              tone="#38bdf8"
            />
          </View>
        </View>

        <Section title="Top Shows" icon="trophy" aside={`${topShows.length}/5`}>
          <TopShows items={topShows} onShow={onShow} />
        </Section>

        <Section title="Rhythm" icon="pulse" aside={`${activeDays} active days`}>
          <View className="gap-4">
            <View className="gap-1">
              <Text className="text-base font-bold text-text-primary">
                {hasEpisodes && topDaypart?.count > 0
                  ? `You mostly watch in the ${topDaypart.label.toLowerCase()}.`
                  : "No watch rhythm yet."}
              </Text>
              <Text className="text-xs leading-4 text-text-tertiary">
                Current streak: {currentStreak} day{currentStreak === 1 ? "" : "s"}.
              </Text>
            </View>
            {timeOfDayActivity.map((item, index) => (
              <ProgressRow
                key={item.label}
                label={item.label}
                value={item.count}
                max={maxDaypart}
                color={["#38bdf8", "#fbbf24", "#a78bfa", "#60a5fa"][index] ?? "#38bdf8"}
              />
            ))}
          </View>
        </Section>

        <Section title="Monthly Pace" icon="calendar" aside="6 months">
          <MonthlyPace items={monthlyActivity} max={maxMonth} />
        </Section>

        <Section title="Weekday Heat" icon="stats-chart" aside="UTC">
          <View className="gap-3">
            {weekdayActivity.map((item) => (
              <ProgressRow
                key={item.label}
                label={item.label}
                value={item.count}
                max={maxWeekday}
                color="#22C55E"
              />
            ))}
          </View>
        </Section>

        <Section title="Library Mix" icon="albums" aside={`${statusCounts.total} shows`}>
          <View className="gap-3">
            <ProgressRow label="Watching" value={statusCounts.watching} max={statusCounts.total} color="#22C55E" />
            <ProgressRow label="Completed" value={statusCounts.completed} max={statusCounts.total} color="#38bdf8" />
            <ProgressRow label="Watchlist" value={statusCounts.watchlist} max={statusCounts.total} color="#f59e0b" />
            <ProgressRow label="Dropped" value={statusCounts.dropped} max={statusCounts.total} color="#ef4444" />
          </View>
        </Section>

        <Section title="Achievements" icon="sparkles">
          <View>
            <Achievement icon="play-circle" title="Pilot episode" description="Log your first watched episode." unlocked={totalEpisodes >= 1} />
            <View className="h-px bg-dark-border" />
            <Achievement icon="flame" title="Weekend arc" description="Build a 3-day watch streak." unlocked={longestStreak >= 3} />
            <View className="h-px bg-dark-border" />
            <Achievement icon="trophy" title="Seasoned" description="Cross 100 tracked episodes." unlocked={totalEpisodes >= 100} />
            <View className="h-px bg-dark-border" />
            <Achievement icon="star" title="Critic mode" description="Rate at least 10 shows or episodes." unlocked={reviewStats.totalReviews >= 10} />
          </View>
        </Section>

        <Section title="Ratings" icon="star" aside={`${reviewStats.totalReviews} total`}>
          <Ratings
            averageRating={reviewStats.averageRating}
            hasReviews={hasReviews}
            onShow={onShow}
            reviewStats={reviewStats}
          />
        </Section>

        <Section title="Recent Episodes" icon="time">
          <RecentEpisodes items={recentEpisodes} onShow={onShow} />
        </Section>
      </View>
    </Screen>
  );
}
