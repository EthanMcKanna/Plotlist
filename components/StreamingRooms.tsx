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
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import { HomeArtworkFallback } from "./HomeArtworkFallback";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { formatHomeDatedSignalLabel } from "../lib/homeDisplayMeta";
import { getHomeRailTitleKey } from "../lib/homeRailIdentity";

export type ProviderItem = {
  externalId?: string;
  externalSource?: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  homeSignal?: string | null;
};

export type ProviderRoom = {
  key: string;
  label: string;
  logoUrl: string;
  /** Brand tint applied to the card chrome. */
  tint: string;
  items: ProviderItem[];
};

type StreamingRoomsProps = {
  rooms: ProviderRoom[];
  index?: number;
  cardWidth: number;
  kicker?: string;
  mutedHeroTitleKeys?: Set<string>;
  mutedSupportTitleKeys?: Set<string>;
  softMutedSupportTitleKeys?: Set<string>;
  allowMutedFeaturedFallback?: boolean;
};

const ACCENT = "#F97316";
const ENABLE_ENTRY_ANIMATIONS = Platform.OS !== "web";

export function StreamingRooms({
  rooms,
  index,
  cardWidth,
  kicker = "Watch",
  mutedHeroTitleKeys = new Set(),
  mutedSupportTitleKeys = new Set(),
  softMutedSupportTitleKeys = new Set(),
  allowMutedFeaturedFallback = true,
}: StreamingRoomsProps) {
  const visibleRooms = rooms.filter((room) =>
    Boolean(
      getRoomFeaturedItem(
        room.items,
        mutedHeroTitleKeys,
        allowMutedFeaturedFallback,
      ),
    ),
  );

  if (visibleRooms.length === 0) return null;

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker={kicker}
        title="Streaming"
        accent={ACCENT}
        icon="tv"
      />
      <ScrollView
        accessibilityLabel="Streaming rail"
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        decelerationRate="fast"
        snapToInterval={cardWidth + 14}
        snapToAlignment="start"
      >
        {visibleRooms.map((room, idx) => (
          <RoomCard
            key={room.key}
            room={room}
            width={cardWidth}
            index={idx}
            mutedHeroTitleKeys={mutedHeroTitleKeys}
            mutedSupportTitleKeys={mutedSupportTitleKeys}
            softMutedSupportTitleKeys={softMutedSupportTitleKeys}
            allowMutedFeaturedFallback={allowMutedFeaturedFallback}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function RoomCard({
  room,
  width,
  index,
  mutedHeroTitleKeys,
  mutedSupportTitleKeys,
  softMutedSupportTitleKeys,
  allowMutedFeaturedFallback,
}: {
  room: ProviderRoom;
  width: number;
  index: number;
  mutedHeroTitleKeys: Set<string>;
  mutedSupportTitleKeys: Set<string>;
  softMutedSupportTitleKeys: Set<string>;
  allowMutedFeaturedFallback: boolean;
}) {
  const heroShow = getRoomFeaturedItem(
    room.items,
    mutedHeroTitleKeys,
    allowMutedFeaturedFallback,
  );
  const heroImage = heroShow?.backdropUrl ?? heroShow?.posterUrl ?? null;
  const visibleHeroSignal = heroShow
    ? getStreamingRoomVisibleSignal(room, heroShow)
    : null;
  const supportItems = getRoomSupportItems({
    items: room.items,
    featured: heroShow,
    mutedSupportTitleKeys,
    softMutedSupportTitleKeys,
  });

  return (
    <Animated.View
      entering={
        ENABLE_ENTRY_ANIMATIONS
          ? FadeInRight.delay(index * 35).duration(280)
          : undefined
      }
      style={{ width }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: "/provider/[id]",
            params: {
              id: room.key,
              featuredTitle: heroShow?.title ?? "",
            },
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={getStreamingRoomAccessibilityLabel({
          room,
          featured: heroShow,
          supportItems,
        })}
        style={[styles.card, { borderColor: `${room.tint}55` }]}
        testID={`provider-room-card-${room.key}`}
        className="active:opacity-92"
      >
        <View style={styles.imageContainer}>
          {heroImage ? (
            <Image
              source={{ uri: heroImage }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={220}
            />
          ) : (
            <HomeArtworkFallback
              testID={`provider-artwork-fallback-${room.key}`}
              title={heroShow?.title ?? room.label}
              subtitle={visibleHeroSignal ?? room.label}
              accent={room.tint}
              compact
              copyVisible={false}
            />
          )}
          <LinearGradient
            colors={[
              "rgba(13,15,20,0.0)",
              "rgba(13,15,20,0.62)",
              "rgba(13,15,20,0.98)",
            ]}
            locations={[0, 0.58, 1]}
            style={[StyleSheet.absoluteFill, styles.pointerNone]}
          />
          <View
            style={[
              styles.tintBlock,
              { backgroundColor: `${room.tint}1A` },
            ]}
          />
        </View>

        <View
          testID={`provider-room-copy-${room.key}`}
          style={styles.roomContent}
        >
          <Text
            style={[styles.providerLabel, { color: room.tint }]}
            numberOfLines={1}
          >
            {room.label}
          </Text>
          {heroShow?.title ? (
            <Text style={styles.featureTitle} numberOfLines={2}>
              {heroShow.title}
            </Text>
          ) : null}
          {visibleHeroSignal ? (
            <Text style={styles.featureSignal} numberOfLines={1}>
              {visibleHeroSignal}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function getRoomFeaturedItem(
  items: ProviderItem[],
  mutedHeroTitleKeys: Set<string>,
  allowMutedFeaturedFallback = true,
) {
  if (items.length === 0) return undefined;
  const isUnmuted = (show: ProviderItem) => {
    const titleKey = getHomeRailTitleKey(show.title);
    return !titleKey || !mutedHeroTitleKeys.has(titleKey);
  };
  const unmutedItems = items.filter(isUnmuted);
  const firstUnmuted = unmutedItems[0];
  if (!firstUnmuted) return allowMutedFeaturedFallback ? items[0] : undefined;
  if (firstUnmuted.homeSignal?.trim()) return firstUnmuted;

  return (
    unmutedItems.find((show) => show.homeSignal?.trim()) ??
    (allowMutedFeaturedFallback
      ? items.find((show) => show.homeSignal?.trim())
      : undefined) ??
    firstUnmuted
  );
}

export function getSupportItemLabel(show: ProviderItem) {
  const signal = show.homeSignal?.trim();
  return signal ? `${show.title} · ${formatHomeDatedSignalLabel(signal)}` : show.title;
}

function getProviderSignalAliases(room: ProviderRoom) {
  const label = room.label.trim();
  const aliases = new Set<string>([label]);
  if (/^prime video$/i.test(label)) aliases.add("Prime");
  if (/^apple tv\+$/i.test(label)) aliases.add("Apple TV");
  if (/^hulu$/i.test(label)) aliases.add("FX/Hulu");
  return [...aliases].filter(Boolean);
}

export function getStreamingRoomVisibleSignal(
  room: ProviderRoom,
  show: ProviderItem,
) {
  const signal = show.homeSignal?.trim();
  if (!signal) return null;

  for (const alias of getProviderSignalAliases(room)) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefixPattern = new RegExp(`^${escapedAlias}\\s+`, "i");
    const trimmedSignal = signal.replace(prefixPattern, "").trim();
    if (trimmedSignal !== signal) {
      return formatHomeDatedSignalLabel(trimmedSignal || signal);
    }
  }

  return formatHomeDatedSignalLabel(signal);
}

export function getStreamingRoomVisibleItemLabel(
  room: ProviderRoom,
  show: ProviderItem,
) {
  const signal = getStreamingRoomVisibleSignal(room, show);
  return signal ? `${show.title} · ${signal}` : show.title;
}

export function getRoomSupportItems({
  items,
  featured,
  mutedSupportTitleKeys,
  softMutedSupportTitleKeys,
  limit = 3,
}: {
  items: ProviderItem[];
  featured?: ProviderItem;
  mutedSupportTitleKeys: Set<string>;
  softMutedSupportTitleKeys: Set<string>;
  limit?: number;
}) {
  return items
    .filter((show) => show !== featured)
    .map((show, originalIndex) => {
      const titleKey = getHomeRailTitleKey(show.title);
      const hasSignal = Boolean(show.homeSignal?.trim());
      const priority = titleKey
        ? mutedSupportTitleKeys.has(titleKey)
          ? 2
          : softMutedSupportTitleKeys.has(titleKey) && !hasSignal
            ? 1
            : 0
        : 0;
      return { show, originalIndex, priority };
    })
    .filter((entry) => entry.priority < 2)
    .sort((left, right) => {
      const priorityDelta = left.priority - right.priority;
      if (priorityDelta !== 0) return priorityDelta;
      return left.originalIndex - right.originalIndex;
    })
    .slice(0, limit)
    .map((entry) => entry.show);
}

export function getStreamingRoomAccessibilityLabel({
  room,
  featured,
  supportItems = [],
}: {
  room: ProviderRoom;
  featured?: ProviderItem;
  supportItems?: ProviderItem[];
}) {
  const pickLabel = `${room.items.length} ${room.items.length === 1 ? "title" : "titles"}`;
  const featuredLabel = featured?.title ? getSupportItemLabel(featured) : null;
  const supportLabel =
    supportItems.length > 0
      ? `Also ${supportItems.slice(0, 2).map(getSupportItemLabel).join(", ")}`
      : null;

  return [`Browse ${room.label}`, pickLabel, featuredLabel, supportLabel]
    .filter(Boolean)
    .join(". ");
}

const styles = StyleSheet.create({
  rail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  card: {
    backgroundColor: "#161A22",
    borderRadius: 8,
    borderWidth: 1,
    height: 148,
    overflow: "hidden",
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
  },
  tintBlock: {
    ...StyleSheet.absoluteFillObject,
  },
  roomContent: {
    bottom: 0,
    left: 0,
    padding: 12,
    position: "absolute",
    right: 0,
  },
  providerLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 14,
  },
  featureTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
    marginTop: 4,
  },
  featureSignal: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 1,
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
