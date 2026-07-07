import { useCallback, useRef } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import type { Id } from "../lib/plotlist/types";
import { useMutation, useQuery } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
import { formatShortDate } from "../lib/format";
import { guardedPush } from "../lib/navigation";
import { buildEpisodeDeepLinkParams } from "../lib/episodeDeepLink";
import { optimisticMarkEpisodeWatched } from "../lib/episodeProgressOptimistic";
import type { EpisodeSeasonSummary } from "../lib/episodeProgressState";
import { HomeArtworkFallback } from "./HomeArtworkFallback";
import { HomeSectionHeader } from "./HomeSectionHeader";

export type ContinueWatchingItem = {
  showId: Id<"shows">;
  show: {
    _id?: string | null;
    showId?: string | null;
    externalSource?: string | null;
    externalId?: string | null;
    title: string;
    posterUrl?: string | null;
    backdropUrl?: string | null;
  };
  totalWatched: number;
  totalEpisodes?: number;
  progressPct?: number;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
  nextAirDate?: number | null;
  nextReleaseDate?: number | null;
  nextEpisodeReleasedToday?: boolean;
  nextEpisodeStillUrl?: string | null;
  nextEpisodeName?: string | null;
  nextEpisodeOverview?: string | null;
  nextEpisodeRuntime?: number | null;
  lastWatchedAt?: number | null;
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  optimisticCaughtUp?: boolean;
  seasons?: EpisodeSeasonSummary[];
};

type ContinueWatchingRailProps = {
  items?: ContinueWatchingItem[] | null;
  hideWhenEmpty?: boolean;
  index?: number;
};

// Continue watching leads the home surface, so its cards run larger than any
// other rail — episode stills (16:9 thumbnails) are reserved for this rail.
const CARD_WIDTH = 300;
const IMAGE_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);
const ACCENT = "#0EA5E9";
const ENABLE_ENTRY_ANIMATIONS = Platform.OS !== "web";
export const CONTINUE_WATCHING_MARK_WATCHED_TOUCH_TARGET = 44;

export function getContinueWatchingSubtitle(item: {
  isUpcoming?: boolean;
  nextAirDate?: number | null;
  totalEpisodes?: number;
  totalWatched?: number;
  isCaughtUp?: boolean;
}) {
  const totalEpisodes = item.totalEpisodes ?? 0;
  const watchedCount = item.totalWatched ?? 0;
  if (item.isUpcoming) {
    return item.nextAirDate ? `Airs ${formatShortDate(item.nextAirDate)}` : "Coming soon";
  }
  if (isContinueWatchingComplete(item)) {
    return "All caught up";
  }
  if (totalEpisodes > 0) {
    return `Episode ${Math.min(watchedCount + 1, totalEpisodes)} of ${totalEpisodes}`;
  }
  if (watchedCount > 0) return `${watchedCount} watched`;
  return "Ready to start";
}

export function formatContinueWatchingRuntime(runtime?: number | null) {
  if (typeof runtime !== "number" || !Number.isFinite(runtime) || runtime <= 0) {
    return null;
  }
  const minutes = Math.round(runtime);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

// The bold first line of the card's meta block: the actual next-episode
// title when we have it, a plain pointer when we don't.
export function getContinueWatchingEpisodeTitle(item: {
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  totalEpisodes?: number;
  totalWatched?: number;
  nextEpisodeName?: string | null;
  nextEpisodeNumber?: number;
}) {
  if (isContinueWatchingComplete(item)) {
    return "All caught up";
  }
  const episodeName = item.nextEpisodeName?.trim();
  if (episodeName) return episodeName;
  return `Episode ${item.nextEpisodeNumber ?? 1}`;
}

// The quiet second line: progress plus runtime, or the air date for
// not-yet-released episodes.
export function getContinueWatchingMetaLine(item: {
  isUpcoming?: boolean;
  nextAirDate?: number | null;
  nextEpisodeRuntime?: number | null;
  totalEpisodes?: number;
  totalWatched?: number;
  isCaughtUp?: boolean;
}) {
  if (isContinueWatchingComplete(item)) {
    return "You're up to date";
  }
  const runtime = formatContinueWatchingRuntime(item.nextEpisodeRuntime);
  return [getContinueWatchingSubtitle(item), runtime].filter(Boolean).join(" · ");
}

export function getContinueWatchingContextLine(item: {
  isUpcoming?: boolean;
  nextAirDate?: number | null;
  nextEpisodeName?: string | null;
  totalEpisodes?: number;
  totalWatched?: number;
  isCaughtUp?: boolean;
}) {
  const subtitle = getContinueWatchingSubtitle(item);
  const episodeName = item.nextEpisodeName?.trim();
  if (!episodeName || subtitle === "All caught up") return subtitle;
  return `${episodeName} · ${subtitle}`;
}

export function getContinueWatchingVisibleContextLine(item: {
  isUpcoming?: boolean;
  nextAirDate?: number | null;
  nextEpisodeName?: string | null;
  totalEpisodes?: number;
  totalWatched?: number;
  isCaughtUp?: boolean;
}) {
  const subtitle = getContinueWatchingSubtitle(item);
  const episodeName = item.nextEpisodeName?.trim();
  if (!episodeName || subtitle === "All caught up") return subtitle;
  if (item.isUpcoming) return `${episodeName} · ${subtitle}`;
  return episodeName;
}

export function getContinueWatchingFreshnessLabel(item: {
  isUpcoming?: boolean;
  nextAirDate?: number | null;
  nextReleaseDate?: number | null;
  nextEpisodeReleasedToday?: boolean;
  totalEpisodes?: number;
  totalWatched?: number;
  isCaughtUp?: boolean;
}) {
  if (isContinueWatchingComplete(item)) return null;
  if (item.nextEpisodeReleasedToday) return "New";
  if (item.isUpcoming) return null;
  if (item.nextReleaseDate) return "New";
  return null;
}

export function isContinueWatchingComplete(item: {
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  totalEpisodes?: number;
  totalWatched?: number;
}) {
  if (item.isCaughtUp !== undefined) {
    return !item.isUpcoming && item.isCaughtUp;
  }
  const totalEpisodes = item.totalEpisodes ?? 0;
  const watchedCount = item.totalWatched ?? 0;
  return !item.isUpcoming && totalEpisodes > 0 && watchedCount >= totalEpisodes;
}

export function getContinueWatchingProgressRatio(item: {
  progressPct?: number;
  totalEpisodes?: number;
  totalWatched?: number;
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
}) {
  if (isContinueWatchingComplete(item)) return 1;
  if (typeof item.progressPct === "number" && Number.isFinite(item.progressPct)) {
    return Math.min(1, Math.max(0, item.progressPct));
  }
  const totalEpisodes = item.totalEpisodes ?? 0;
  if (totalEpisodes <= 0) return 0;
  return Math.min(1, Math.max(0, (item.totalWatched ?? 0) / totalEpisodes));
}

export function getContinueWatchingBadgeLabel(item: {
  isUpcoming?: boolean;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
  totalEpisodes?: number;
  totalWatched?: number;
  isCaughtUp?: boolean;
}) {
  if (isContinueWatchingComplete(item)) {
    return "Complete";
  }
  const season = item.nextSeasonNumber ?? 1;
  const episode = item.nextEpisodeNumber ?? 1;
  return `S${String(season).padStart(2, "0")} · E${String(episode).padStart(2, "0")}`;
}

export function getContinueWatchingVisibleBadgeLabel(item: {
  isUpcoming?: boolean;
  nextSeasonNumber?: number;
  nextEpisodeNumber?: number;
  totalEpisodes?: number;
  totalWatched?: number;
  isCaughtUp?: boolean;
}) {
  if (isContinueWatchingComplete(item)) {
    return "Complete";
  }
  const season = item.nextSeasonNumber ?? 1;
  const episode = item.nextEpisodeNumber ?? 1;
  return `S${season} E${episode}`;
}

export function getContinueWatchingAccessibilityLabel(item: ContinueWatchingItem) {
  if (isContinueWatchingComplete(item)) {
    return `${item.show.title} is caught up`;
  }

  return [
    `Continue ${item.show.title}`,
    getContinueWatchingBadgeLabel(item),
    getContinueWatchingFreshnessLabel(item),
    getContinueWatchingContextLine(item),
  ]
    .filter(Boolean)
    .join(". ");
}

export function getContinueWatchingMarkWatchedLabel(item: ContinueWatchingItem) {
  return `Mark ${item.show.title} ${getContinueWatchingBadgeLabel(item)} watched`;
}

export function getActiveContinueWatchingItems(
  items: ContinueWatchingItem[] | null | undefined,
) {
  // Items an optimistic update just marked caught-up stay in the rail (shown
  // as "Complete") until the server confirms — dropping them immediately
  // makes the card vanish and flash back whenever more episodes exist.
  return (items ?? []).filter(
    (item) => !isContinueWatchingComplete(item) || item.optimisticCaughtUp === true,
  );
}

export function useContinueWatchingItems(enabled = true) {
  return useQuery(
    api.episodeProgress.getUpNext,
    enabled ? {} : "skip",
  ) as ContinueWatchingItem[] | undefined;
}

export function getContinueWatchingPreviewItems(
  items: ContinueWatchingItem[] | null | undefined,
) {
  return getActiveContinueWatchingItems(items).flatMap((item) => {
    const title = item.show?.title?.trim();
    if (!title) return [];
    return [{ key: String(item.showId), title }];
  });
}

export function shouldRenderContinueWatchingEmptyState(
  items: ContinueWatchingItem[] | null | undefined,
  hideWhenEmpty = false,
) {
  return Array.isArray(items) && items.length === 0 && !hideWhenEmpty;
}

export function ContinueWatchingRail({
  items: providedItems,
  hideWhenEmpty = false,
  index = 1,
}: ContinueWatchingRailProps = {}) {
  const queriedItems = useContinueWatchingItems(providedItems === undefined);
  const items = providedItems === undefined ? queriedItems : providedItems ?? undefined;
  const markEpisodeWatched = useMutation(
    api.episodeProgress.markEpisodeWatched,
  ).withOptimisticUpdate(optimisticMarkEpisodeWatched);
  const pendingMarkShowIds = useRef<Set<string>>(new Set());

  const handleMarkWatched = useCallback(
    (item: ContinueWatchingItem) => {
      const showId = String(item.showId);
      // One in-flight mark per show: repeated taps before the server responds
      // would walk the optimistic pointer past episodes that don't exist.
      if (pendingMarkShowIds.current.has(showId) || isContinueWatchingComplete(item)) {
        return;
      }
      pendingMarkShowIds.current.add(showId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const season = item.nextSeasonNumber ?? 1;
      const episode = item.nextEpisodeNumber ?? 1;
      void markEpisodeWatched({
        showId: item.showId,
        seasonNumber: season,
        episodeNumber: episode,
        episodeTitle: item.nextEpisodeName ?? undefined,
        createLog: true,
      })
        .catch(() => {})
        .finally(() => {
          pendingMarkShowIds.current.delete(showId);
        });
    },
    [markEpisodeWatched],
  );

  if (!items) {
    return null;
  }

  if (items.length === 0 && !shouldRenderContinueWatchingEmptyState(items, hideWhenEmpty)) {
    return null;
  }

  if (items.length === 0) {
    return (
      <View className="mt-8">
        <HomeSectionHeader
          index={index}
          kicker="Resume"
          title="Continue"
          accessibilityTitle="Continue watching"
          accent={ACCENT}
          icon="play"
        />
        <View className="mt-4 px-6">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              guardedPush("/search");
            }}
            style={styles.emptyCard}
            className="active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Find a show to watch"
          >
            <View
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no-hide-descendants"
              style={styles.emptyIcon}
            >
              <Ionicons name="play" size={20} color={ACCENT} />
            </View>
            <View className="flex-1 ml-4">
              <Text className="text-[15px] font-bold text-text-primary">
                Find a show
              </Text>
            </View>
            <Ionicons
              name="arrow-forward"
              size={18}
              color="#9BA1B0"
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          </Pressable>
        </View>
      </View>
    );
  }

  const activeItems = getActiveContinueWatchingItems(items);

  if (activeItems.length === 0) {
    return (
      <View className="mt-8">
        <HomeSectionHeader
          index={index}
          kicker="Resume"
          title="Continue"
          accessibilityTitle="Continue watching"
          accent={ACCENT}
          icon="play"
        />
        <View className="mt-4 px-6">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              guardedPush("/search");
            }}
            style={styles.emptyCard}
            className="active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Find a fresh show to watch"
          >
            <View
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no-hide-descendants"
              style={styles.emptyIcon}
            >
              <Ionicons name="checkmark" size={20} color={ACCENT} />
            </View>
            <View className="flex-1 ml-4">
              <Text className="text-[15px] font-bold text-text-primary">
                Find something new
              </Text>
            </View>
            <Ionicons
              name="arrow-forward"
              size={18}
              color="#9BA1B0"
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker="Resume"
        title="Continue"
        accessibilityTitle="Continue watching"
        accent={ACCENT}
        icon="play"
      />
      <ScrollView
        accessibilityLabel="Continue watching rail"
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 14}
        snapToAlignment="start"
      >
        {activeItems.map((item, index) => (
          <ContinueWatchingCard
            key={item.showId}
            item={item}
            index={index}
            onMarkWatched={handleMarkWatched}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ContinueWatchingCard({
  item,
  index,
  onMarkWatched,
}: {
  item: ContinueWatchingItem;
  index: number;
  onMarkWatched: (item: ContinueWatchingItem) => void;
}) {
  const epLabel = getContinueWatchingVisibleBadgeLabel(item);
  const freshnessLabel = getContinueWatchingFreshnessLabel(item);
  const imageUrl =
    item.nextEpisodeStillUrl ?? item.show.backdropUrl ?? item.show.posterUrl ?? null;
  const episodeTitle = getContinueWatchingEpisodeTitle(item);
  const metaLine = getContinueWatchingMetaLine(item);
  const progressRatio = getContinueWatchingProgressRatio(item);
  const complete = isContinueWatchingComplete(item);
  const showProgressBar = !item.isUpcoming && (item.totalEpisodes ?? 0) > 0;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (complete) {
      guardedPush({ pathname: "/show/[id]", params: { id: item.showId } });
      return;
    }
    guardedPush({
      pathname: "/show/[id]",
      params: buildEpisodeDeepLinkParams(item, item.showId),
    });
  }, [complete, item]);

  return (
    <Animated.View
      entering={
        ENABLE_ENTRY_ANIMATIONS
          ? FadeInRight.delay(index * 35).duration(300)
          : undefined
      }
      style={{ width: CARD_WIDTH }}
    >
      <View style={styles.cardWrap}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={getContinueWatchingAccessibilityLabel(item)}
          style={styles.card}
          className="active:opacity-90"
        >
          <View style={styles.media}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={200}
              />
            ) : (
              <HomeArtworkFallback
                testID={`continue-artwork-fallback-${item.showId}`}
                title={item.show.title}
                subtitle={null}
                accent={ACCENT}
                compact
                markVisible={false}
              />
            )}

            <LinearGradient
              colors={["rgba(13,15,20,0.30)", "rgba(13,15,20,0.0)", "rgba(13,15,20,0.55)"]}
              locations={[0, 0.4, 1]}
              style={[StyleSheet.absoluteFill, styles.pointerNone]}
            />

            <View style={styles.badgeRow}>
              <View
                testID={`continue-episode-chip-${item.showId}`}
                style={styles.epBadge}
              >
                <Text
                  className="text-[10px] font-bold text-white/85"
                  style={{ letterSpacing: 0.2 }}
                >
                  {epLabel}
                </Text>
              </View>
              {freshnessLabel ? (
                <View
                  testID={`continue-freshness-chip-${item.showId}`}
                  style={styles.freshBadge}
                >
                  <Text className="text-[10px] font-black text-white" style={{ letterSpacing: 0.4 }}>
                    {freshnessLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {showProgressBar ? (
              <View
                testID={`continue-progress-track-${item.showId}`}
                style={styles.progressTrack}
              >
                <View
                  testID={`continue-progress-fill-${item.showId}`}
                  style={[styles.progressFill, { width: `${Math.round(progressRatio * 100)}%` }]}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.meta}>
            <View style={styles.metaCopy}>
              <Text
                className="text-[11px] font-semibold text-text-secondary uppercase"
                style={{ letterSpacing: 0.6 }}
                numberOfLines={1}
              >
                {item.show.title}
              </Text>
              <Text
                className="text-[15px] font-bold text-text-primary mt-0.5"
                numberOfLines={1}
              >
                {episodeTitle}
              </Text>
              <Text className="text-[12px] text-text-tertiary mt-0.5" numberOfLines={1}>
                {metaLine}
              </Text>
            </View>
          </View>
        </Pressable>

        {!item.isUpcoming && !complete ? (
          <Pressable
            onPress={() => {
              onMarkWatched(item);
            }}
            style={styles.checkButton}
            className="active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={getContinueWatchingMarkWatchedLabel(item)}
            hitSlop={4}
          >
            <View
              testID={`continue-mark-watched-glyph-${item.showId}`}
              style={styles.checkButtonGlyph}
            >
              <Ionicons
                name="checkmark"
                size={18}
                color="#FFFFFF"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
            </View>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  cardWrap: {
    position: "relative",
    width: CARD_WIDTH,
  },
  card: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    width: CARD_WIDTH,
  },
  media: {
    height: IMAGE_HEIGHT,
    position: "relative",
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  badgeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    left: 10,
    position: "absolute",
    right: 10,
    top: 10,
  },
  epBadge: {
    backgroundColor: "rgba(13,15,20,0.55)",
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  freshBadge: {
    backgroundColor: "rgba(14,165,233,0.92)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  progressTrack: {
    backgroundColor: "rgba(255,255,255,0.22)",
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
  },
  progressFill: {
    backgroundColor: ACCENT,
    height: "100%",
  },
  meta: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaCopy: {
    flex: 1,
    paddingRight: 44,
  },
  checkButton: {
    alignItems: "center",
    bottom: 8,
    height: CONTINUE_WATCHING_MARK_WATCHED_TOUCH_TARGET,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    width: CONTINUE_WATCHING_MARK_WATCHED_TOUCH_TARGET,
  },
  checkButtonGlyph: {
    alignItems: "center",
    backgroundColor: "rgba(14,165,233,0.92)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: "rgba(14,165,233,0.16)",
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
