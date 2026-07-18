import { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
import {
  ContinueWatchingCard,
  getContinueWatchingCardMetrics,
  isContinueWatchingComplete,
  type ContinueWatchingItem,
} from "../components/ContinueWatchingRail";
import { HomeSectionHeader } from "../components/HomeSectionHeader";
import { HorizontalRail } from "../components/HorizontalRail";
import { LinkPressable } from "../components/LinkPressable";
import { api } from "../lib/plotlist/api";
import { useAuth, useMutation, useQuery } from "../lib/plotlist/react";
import { buildEpisodeDeepLinkParams } from "../lib/episodeDeepLink";
import { optimisticMarkEpisodeWatched } from "../lib/episodeProgressOptimistic";
import { formatShortDate } from "../lib/format";
import { getUpNextQueryArgs } from "../lib/upNextQueryArgs";
import { SHOW_BACK_BUTTON, WEB_PAGE_MAX_WIDTH } from "../lib/webLayout";

const ACCENT = "#0EA5E9";
const NEW_ACCENT = "#34D399";
const RETURNING_ACCENT = "#A78BFA";
const GAP_ACCENT = "#F59E0B";
const PAUSED_ACCENT = "#FBBF24";
const DROPPED_ACCENT = "#EF4444";
const POSTER_WIDTH = 52;
const POSTER_HEIGHT = 78;

type ContinueEntry = ContinueWatchingItem & {
  status?: string;
  gapCount?: number;
  firstGapSeasonNumber?: number | null;
  firstGapEpisodeNumber?: number | null;
  nextEpisodeAirDateTs?: number | null;
};

type ContinueSurface = {
  resume: ContinueEntry[];
  newEpisodes: ContinueEntry[];
  returning: ContinueEntry[];
  gaps: ContinueEntry[];
  paused: ContinueEntry[];
  dropped: ContinueEntry[];
};

function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function getReturningSubtitle(entry: {
  nextAirDate?: number | null;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
}) {
  if (typeof entry.nextAirDate === "number" && Number.isFinite(entry.nextAirDate)) {
    const code =
      (entry.nextEpisodeNumber ?? 1) === 1
        ? `Season ${entry.nextSeasonNumber ?? 1}`
        : `S${entry.nextSeasonNumber ?? 1} E${entry.nextEpisodeNumber ?? 1}`;
    return `${code} · ${formatShortDate(entry.nextAirDate)}`;
  }
  return "Waiting for new episodes";
}

export function getGapSubtitle(entry: {
  gapCount?: number;
  firstGapSeasonNumber?: number | null;
  firstGapEpisodeNumber?: number | null;
}) {
  const count = entry.gapCount ?? 0;
  const first =
    entry.firstGapSeasonNumber != null && entry.firstGapEpisodeNumber != null
      ? `S${entry.firstGapSeasonNumber} E${entry.firstGapEpisodeNumber}`
      : null;
  if (!first) return count === 1 ? "1 skipped episode" : `${count} skipped episodes`;
  return count > 1 ? `Skipped ${first} + ${count - 1} more` : `Skipped ${first}`;
}

export function getPausedSubtitle(entry: {
  totalWatched?: number;
  totalEpisodes?: number;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
}) {
  if (!isContinueWatchingComplete(entry) && (entry.totalWatched ?? 0) > 0) {
    return `Paused at S${entry.nextSeasonNumber ?? 1} E${entry.nextEpisodeNumber ?? 1}`;
  }
  const watched = entry.totalWatched ?? 0;
  return watched > 0 ? `${watched} watched` : "Not started";
}

function ShowRow({
  entry,
  subtitle,
  subtitleColor,
  trailing,
  href,
  accessibilityLabel,
}: {
  entry: ContinueEntry;
  subtitle: string;
  subtitleColor?: string;
  trailing?: React.ReactNode;
  href: Href;
  accessibilityLabel: string;
}) {
  // The trailing action stays a sibling of the row press target — nesting a
  // Pressable inside another renders nested <button>s on web, which is
  // invalid HTML and breaks hydration.
  return (
    <View style={styles.row} className="web:transition-colors hover:bg-dark-hover">
      <LinkPressable
        href={href}
        onPress={lightHaptic}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.rowPress}
        className="active:opacity-80"
      >
        {entry.show.posterUrl ? (
          <Image
            source={{ uri: entry.show.posterUrl }}
            style={styles.rowPoster}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={[styles.rowPoster, styles.rowPosterFallback]}>
            <Ionicons name="tv-outline" size={18} color="#5A6070" />
          </View>
        )}
        <View className="flex-1 ml-3">
          <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>
            {entry.show.title}
          </Text>
          <Text
            className="text-[12px] font-semibold mt-1"
            style={{ color: subtitleColor ?? "#9BA1B0" }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
      </LinkPressable>
      {trailing}
    </View>
  );
}

function SectionShell({
  index,
  kicker,
  title,
  subtitle,
  accent,
  icon,
  children,
}: {
  index: number;
  kicker: string;
  title: string;
  subtitle?: string;
  accent: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: React.ReactNode;
}) {
  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker={kicker}
        title={title}
        subtitle={subtitle}
        accent={accent}
        icon={icon}
      />
      {children}
    </View>
  );
}

export default function ContinueScreen() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { cardWidth, cardHeight, gap } = getContinueWatchingCardMetrics(width);

  const surface = useQuery(
    api.episodeProgress.getContinue,
    isAuthenticated ? getUpNextQueryArgs() : "skip",
  ) as ContinueSurface | undefined;

  const markEpisodeWatched = useMutation(
    api.episodeProgress.markEpisodeWatched,
  ).withOptimisticUpdate(optimisticMarkEpisodeWatched);
  const setStatus = useMutation(api.watchStates.setStatus);
  const pendingShowIds = useRef<Set<string>>(new Set());

  const handleMarkWatched = useCallback(
    (item: ContinueWatchingItem) => {
      const showId = String(item.showId);
      if (pendingShowIds.current.has(showId) || isContinueWatchingComplete(item)) {
        return;
      }
      pendingShowIds.current.add(showId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void markEpisodeWatched({
        showId: item.showId,
        seasonNumber: item.nextSeasonNumber ?? 1,
        episodeNumber: item.nextEpisodeNumber ?? 1,
        episodeTitle: item.nextEpisodeName ?? undefined,
        createLog: true,
      })
        .catch(() => {})
        .finally(() => {
          pendingShowIds.current.delete(showId);
        });
    },
    [markEpisodeWatched],
  );

  const handleFillGap = useCallback(
    (entry: ContinueEntry) => {
      const showId = String(entry.showId);
      if (
        pendingShowIds.current.has(showId) ||
        entry.firstGapSeasonNumber == null ||
        entry.firstGapEpisodeNumber == null
      ) {
        return;
      }
      pendingShowIds.current.add(showId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void markEpisodeWatched({
        showId: entry.showId,
        seasonNumber: entry.firstGapSeasonNumber,
        episodeNumber: entry.firstGapEpisodeNumber,
        createLog: true,
      })
        .catch(() => {})
        .finally(() => {
          pendingShowIds.current.delete(showId);
        });
    },
    [markEpisodeWatched],
  );

  const handleResume = useCallback(
    (entry: ContinueEntry) => {
      lightHaptic();
      void setStatus({ showId: entry.showId, status: "watching" }).catch(() => {});
    },
    [setStatus],
  );

  const showHref = useCallback(
    (entry: ContinueEntry): Href => ({
      pathname: "/show/[id]",
      params: { id: entry.showId },
    }),
    [],
  );

  // Deep-links straight to the next-up episode sheet; the extra params ride
  // along as query strings on web.
  const showAtNextHref = useCallback(
    (entry: ContinueEntry): Href => ({
      pathname: "/show/[id]",
      params: buildEpisodeDeepLinkParams(entry, entry.showId),
    }),
    [],
  );

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen>
        <View className="flex-1 px-6 pt-6">
          <EmptyState
            title="Sign in to keep watching"
            description="Your episode progress powers what's next, new episodes, and returning seasons."
          />
        </View>
      </Screen>
    );
  }

  const sections = surface
    ? [
        surface.resume.length,
        surface.newEpisodes.length,
        surface.returning.length,
        surface.gaps.length,
        surface.paused.length,
        surface.dropped.length,
      ]
    : [];
  const isEmpty = surface && sections.every((count) => count === 0);
  let sectionCount = 0;
  const nextSectionIndex = () => {
    sectionCount += 1;
    return sectionCount;
  };

  const renderCardRail = (entries: ContinueEntry[]) => (
    <HorizontalRail
      accessibilityLabel="Continue watching rail"
      decelerationRate="fast"
      contentContainerStyle={[styles.rail, { gap }]}
      snapToInterval={cardWidth + gap}
    >
      {entries.map((entry, index) => (
        <ContinueWatchingCard
          key={String(entry.showId)}
          item={entry}
          index={index}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onMarkWatched={handleMarkWatched}
        />
      ))}
    </HorizontalRail>
  );

  return (
    <Screen scroll webMaxWidth={WEB_PAGE_MAX_WIDTH}>
      <View style={{ paddingBottom: insets.bottom + 48 }}>
        <View className="px-6 pb-1 pt-1">
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
          <Text className="mt-2 text-[34px] font-bold text-text-primary">
            Continue
          </Text>
          <Text className="mt-1 text-[14px] leading-5 text-text-tertiary">
            Everything you're watching, waiting on, or set aside.
          </Text>
        </View>

        {!surface ? (
          <View className="mt-16 items-center">
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : isEmpty ? (
          <View className="px-6 pt-10">
            <EmptyState
              title="Nothing in progress"
              description="Start a show and it'll show up here with your next episode ready."
            />
          </View>
        ) : (
          <>
            {surface.newEpisodes.length > 0 ? (
              <SectionShell
                index={nextSectionIndex()}
                kicker="Fresh"
                title="New episodes"
                subtitle="Just released — you're right behind them"
                accent={NEW_ACCENT}
                icon="sparkles"
              >
                {renderCardRail(surface.newEpisodes)}
              </SectionShell>
            ) : null}

            {surface.resume.length > 0 ? (
              <SectionShell
                index={nextSectionIndex()}
                kicker="Resume"
                title="Pick up where you left off"
                accent={ACCENT}
                icon="play"
              >
                {renderCardRail(surface.resume)}
              </SectionShell>
            ) : null}

            {surface.returning.length > 0 ? (
              <SectionShell
                index={nextSectionIndex()}
                kicker="Waiting"
                title="Returning"
                subtitle="Caught up — new seasons and episodes on the way"
                accent={RETURNING_ACCENT}
                icon="calendar"
              >
                <View className="mt-3 px-6">
                  {surface.returning.map((entry) => (
                    <ShowRow
                      key={String(entry.showId)}
                      entry={entry}
                      subtitle={getReturningSubtitle(entry)}
                      subtitleColor={
                        typeof entry.nextAirDate === "number" ? RETURNING_ACCENT : undefined
                      }
                      href={showHref(entry)}
                      accessibilityLabel={`Open ${entry.show.title}. ${getReturningSubtitle(entry)}`}
                    />
                  ))}
                </View>
              </SectionShell>
            ) : null}

            {surface.gaps.length > 0 ? (
              <SectionShell
                index={nextSectionIndex()}
                kicker="Backtrack"
                title="Fill the gaps"
                subtitle="Episodes you skipped along the way"
                accent={GAP_ACCENT}
                icon="git-branch"
              >
                <View className="mt-3 px-6">
                  {surface.gaps.map((entry) => (
                    <ShowRow
                      key={String(entry.showId)}
                      entry={entry}
                      subtitle={getGapSubtitle(entry)}
                      subtitleColor={GAP_ACCENT}
                      href={showHref(entry)}
                      accessibilityLabel={`Open ${entry.show.title}. ${getGapSubtitle(entry)}`}
                      trailing={
                        <Pressable
                          onPress={() => handleFillGap(entry)}
                          style={styles.rowAction}
                          className="web:transition-opacity hover:opacity-90 active:opacity-70"
                          accessibilityRole="button"
                          accessibilityLabel={`Mark ${entry.show.title} S${entry.firstGapSeasonNumber} E${entry.firstGapEpisodeNumber} watched`}
                          {...(Platform.OS === "web"
                            ? {
                                title: `Mark S${entry.firstGapSeasonNumber} E${entry.firstGapEpisodeNumber} watched`,
                              }
                            : null)}
                          hitSlop={6}
                        >
                          <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                        </Pressable>
                      }
                    />
                  ))}
                </View>
              </SectionShell>
            ) : null}

            {surface.paused.length > 0 ? (
              <SectionShell
                index={nextSectionIndex()}
                kicker="On hold"
                title="Paused"
                accent={PAUSED_ACCENT}
                icon="pause"
              >
                <View className="mt-3 px-6">
                  {surface.paused.map((entry) => (
                    <ShowRow
                      key={String(entry.showId)}
                      entry={entry}
                      subtitle={getPausedSubtitle(entry)}
                      href={showAtNextHref(entry)}
                      accessibilityLabel={`Open ${entry.show.title}. ${getPausedSubtitle(entry)}`}
                      trailing={
                        <Pressable
                          onPress={() => handleResume(entry)}
                          style={styles.resumeAction}
                          className="web:transition-opacity hover:opacity-90 active:opacity-70"
                          accessibilityRole="button"
                          accessibilityLabel={`Resume watching ${entry.show.title}`}
                          hitSlop={6}
                        >
                          <Ionicons name="play" size={13} color="#0D0F14" />
                          <Text className="text-[12px] font-bold" style={styles.resumeLabel}>
                            Resume
                          </Text>
                        </Pressable>
                      }
                    />
                  ))}
                </View>
              </SectionShell>
            ) : null}

            {surface.dropped.length > 0 ? (
              <SectionShell
                index={nextSectionIndex()}
                kicker="Shelved"
                title="Dropped"
                accent={DROPPED_ACCENT}
                icon="close"
              >
                <View className="mt-3 px-6">
                  {surface.dropped.map((entry) => (
                    <ShowRow
                      key={String(entry.showId)}
                      entry={entry}
                      subtitle={
                        (entry.totalWatched ?? 0) > 0
                          ? `Stopped after ${entry.totalWatched} episode${(entry.totalWatched ?? 0) === 1 ? "" : "s"}`
                          : "Never started"
                      }
                      href={showHref(entry)}
                      accessibilityLabel={`Open ${entry.show.title}`}
                    />
                  ))}
                </View>
              </SectionShell>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: -10,
    width: 44,
  },
  rail: {
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  row: {
    alignItems: "center",
    backgroundColor: "#141821",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowPress: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
  },
  rowPoster: {
    borderRadius: 8,
    height: POSTER_HEIGHT,
    width: POSTER_WIDTH,
  },
  rowPosterFallback: {
    alignItems: "center",
    backgroundColor: "#1B2029",
    justifyContent: "center",
  },
  rowAction: {
    alignItems: "center",
    backgroundColor: "rgba(245,158,11,0.9)",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    marginLeft: 10,
    width: 32,
  },
  resumeAction: {
    alignItems: "center",
    backgroundColor: "#FBBF24",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  resumeLabel: {
    color: "#0D0F14",
  },
});
