import { useCallback } from "react";
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
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import type { Id } from "../lib/plotlist/types";
import { useMutation, useQuery } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
import { formatShortDate } from "../lib/format";
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
  isUpcoming?: boolean;
  isCaughtUp?: boolean;
  seasons?: EpisodeSeasonSummary[];
};

type ContinueWatchingRailProps = {
  items?: ContinueWatchingItem[] | null;
  hideWhenEmpty?: boolean;
  index?: number;
};

const CARD_WIDTH = 236;
const CARD_HEIGHT = (CARD_WIDTH * 9) / 16;
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
  return (items ?? []).filter((item) => !isContinueWatchingComplete(item));
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

  const handleMarkWatched = useCallback(
    (item: ContinueWatchingItem) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const season = item.nextSeasonNumber ?? 1;
      const episode = item.nextEpisodeNumber ?? 1;
      void markEpisodeWatched({
        showId: item.showId,
        seasonNumber: season,
        episodeNumber: episode,
        createLog: true,
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
              router.push("/search");
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
              router.push("/search");
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
  const season = item.nextSeasonNumber ?? 1;
  const episode = item.nextEpisodeNumber ?? 1;
  const epLabel = getContinueWatchingVisibleBadgeLabel(item);
  const imageUrl =
    item.nextEpisodeStillUrl ?? item.show.backdropUrl ?? item.show.posterUrl ?? null;
  const visibleContextLine = getContinueWatchingVisibleContextLine(item);
  const complete = isContinueWatchingComplete(item);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (complete) {
      router.push({ pathname: "/show/[id]", params: { id: item.showId } });
      return;
    }
    router.push({
      pathname: "/show/[id]",
      params: {
        id: item.showId,
        openSeason: String(season),
        openEpisode: String(episode),
      },
    });
  }, [complete, episode, item.showId, season]);

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
              subtitle={visibleContextLine}
              accent={ACCENT}
              compact
              markVisible={false}
            />
          )}

          <LinearGradient
            colors={["rgba(13,15,20,0.0)", "rgba(13,15,20,0.92)"]}
            locations={[0.35, 1]}
            style={[StyleSheet.absoluteFill, styles.pointerNone]}
          />

          {imageUrl ? (
            <View style={styles.imageCopy}>
              <Text
                className="text-[14px] font-black text-white"
                numberOfLines={1}
              >
                {item.show.title}
              </Text>
            </View>
          ) : null}

          <View style={styles.badgeRow}>
            <View
              testID={`continue-episode-chip-${item.showId}`}
              style={styles.epBadge}
            >
              <Text
                className="text-[10px] font-bold text-white/80"
                style={{ letterSpacing: 0 }}
              >
                {epLabel}
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
          >
            <View
              testID={`continue-mark-watched-glyph-${item.showId}`}
              style={styles.checkButtonGlyph}
            >
              <Ionicons
                name="checkmark"
                size={15}
                color="#C9D1DA"
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
    height: CARD_HEIGHT,
    position: "relative",
    width: CARD_WIDTH,
  },
  card: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    height: CARD_HEIGHT,
    overflow: "hidden",
    position: "relative",
    width: CARD_WIDTH,
  },
  image: {
    height: "100%",
    width: "100%",
  },
  imageCopy: {
    bottom: 16,
    left: 13,
    position: "absolute",
    right: 48,
  },
  badgeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    left: 11,
    position: "absolute",
    right: 11,
    top: 11,
  },
  epBadge: {
    backgroundColor: "rgba(13,15,20,0.42)",
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
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
    backgroundColor: "rgba(13,15,20,0.26)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
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
