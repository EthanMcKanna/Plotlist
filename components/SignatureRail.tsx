import { useState, type ComponentProps } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import { HomeSectionHeader } from "./HomeSectionHeader";
import { HorizontalRail } from "./HorizontalRail";
import { LinkPressable } from "./LinkPressable";
import { getHomeDisplayMetaLine, getHomeDisplayMetaLabels } from "../lib/homeDisplayMeta";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type SignatureRailItem = {
  key: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  overview?: string | null;
  year?: number | null;
  genreLabel?: string | null;
  signal?: string | null;
  rank?: number | null;
  // Known show destination; when set the card renders as a real link on web.
  // Items that still need ingest omit it and keep the onPressItem fallback.
  href?: Href;
};

type LayoutKind = "feature" | "poster";

type SignatureRailProps = {
  /** Two-digit kicker number ("01", "02"…). */
  index?: number;
  /** Uppercase eyebrow. */
  kicker: string;
  /** Editorial title. */
  title: string;
  /** Optional one-line subtitle. */
  subtitle?: string;
  /** Hex color for accent strip + kicker. */
  accent: string;
  /** Optional Ionicon shown beside the kicker. */
  icon?: IconName;
  /** Layout: feature = wide editorial cards, poster = compact poster cards. */
  layout: LayoutKind;
  /** Items to render. */
  items: SignatureRailItem[];
  /** Optional context label for feature cards that would otherwise only show broad metadata. */
  fallbackMetaLabel?: string;
  /** Width of feature cards (passed in to keep parent in control of sizing). */
  featureCardWidth: number;
  /** Tap handler for each item. */
  onPressItem: (item: SignatureRailItem) => void;
  /** Optional action label rendered top-right. */
  actionLabel?: string;
  /** Tap handler for the action affordance. */
  onAction?: () => void;
  /** Max items to render. */
  limit?: number;
};

export function getSignatureRailItemAccessibilityLabel(
  item: SignatureRailItem,
  fallbackMetaLabel?: string,
  options: { compactSignal?: boolean } = {},
) {
  const metaLine = options.compactSignal
    ? getHomeDisplayMetaLabels(item, { compactSignal: true }).join(" · ")
    : getFeatureMetaLabels(item, fallbackMetaLabel).join(" · ");
  const rankLabel = typeof item.rank === "number" ? `Rank ${item.rank}` : null;

  return [
    `Open ${item.title}`,
    rankLabel,
    metaLine,
  ]
    .filter(Boolean)
    .join(". ");
}

export function SignatureRail({
  index,
  kicker,
  title,
  subtitle,
  accent,
  icon,
  layout,
  items,
  fallbackMetaLabel,
  featureCardWidth,
  onPressItem,
  actionLabel,
  onAction,
  limit,
}: SignatureRailProps) {
  if (items.length === 0) return null;

  const cap = limit ?? (layout === "feature" ? 8 : 14);
  const visible = items.slice(0, cap);

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker={kicker}
        title={title}
        subtitle={subtitle}
        accent={accent}
        icon={icon}
        actionLabel={actionLabel}
        onAction={onAction}
      />
      <HorizontalRail
        accessibilityLabel={`${title} rail`}
        decelerationRate="fast"
        contentContainerStyle={
          layout === "feature" ? styles.featureRail : styles.posterRail
        }
        snapToInterval={
          layout === "feature" ? featureCardWidth + 14 : POSTER_WIDTH + 14
        }
      >
        {visible.map((item, idx) =>
          layout === "feature" ? (
            <FeatureCard
              key={item.key}
              item={item}
              accent={accent}
              width={featureCardWidth}
              fallbackMetaLabel={fallbackMetaLabel}
              index={idx}
              onPress={onPressItem}
            />
          ) : (
            <PosterCard
              key={item.key}
              item={item}
              accent={accent}
              index={idx}
              onPress={onPressItem}
            />
          ),
        )}
      </HorizontalRail>
    </View>
  );
}

function FeatureCard({
  item,
  accent,
  width,
  fallbackMetaLabel,
  index,
  onPress,
}: {
  item: SignatureRailItem;
  accent: string;
  width: number;
  fallbackMetaLabel?: string;
  index: number;
  onPress: (item: SignatureRailItem) => void;
}) {
  const imageUrl = item.backdropUrl?.trim() || item.posterUrl?.trim() || null;
  const meta = getFeatureCardVisibleMetaLabels(item, fallbackMetaLabel);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const shouldShowImage = Boolean(imageUrl && !imageFailed);
  const shouldShowFallback = !imageUrl || imageFailed || !imageLoaded;

  const cardProps = {
    accessibilityRole: "button" as const,
    accessibilityLabel: getSignatureRailItemAccessibilityLabel(
      item,
      fallbackMetaLabel,
    ),
    testID: `feature-card-${item.key}`,
    style: styles.featureCard,
    className: "active:opacity-90 hover:opacity-90 web:transition-opacity",
  };

  const cardBody = (
    <>
      {shouldShowImage ? (
        <Image
          testID={`feature-image-${item.key}`}
          source={{ uri: imageUrl ?? undefined }}
          style={styles.featureImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority={index === 0 ? "high" : "normal"}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {shouldShowFallback ? (
        <FeatureArtworkFallback item={item} accent={accent} />
      ) : null}

      <LinearGradient
        colors={["rgba(13,15,20,0.0)", "rgba(13,15,20,0.6)", "rgba(13,15,20,0.96)"]}
        locations={[0, 0.55, 1]}
        style={[StyleSheet.absoluteFill, styles.pointerNone]}
      />

      <View style={styles.featureContent}>
        <Text
          className="text-[16px] font-black leading-[20px] text-white"
          numberOfLines={2}
        >
          {item.title}
        </Text>

        {meta.length > 0 ? (
          <View style={styles.metaRow}>
            {meta.map((label, idx) => (
              <View key={label} style={styles.metaItem}>
                {idx > 0 ? <View style={styles.metaSep} /> : null}
                <Text className="text-[11px] font-semibold text-white/72">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <Animated.View
      entering={
        ENABLE_ENTRY_ANIMATIONS
          ? FadeInRight.delay(index * 40).duration(320)
          : undefined
      }
      style={{ width }}
    >
      {item.href ? (
        // A known href owns navigation (real link on web); the press handler
        // then only fires the haptic instead of the ingest-and-push fallback.
        <LinkPressable
          href={item.href}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          {...cardProps}
        >
          {cardBody}
        </LinkPressable>
      ) : (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress(item);
          }}
          {...cardProps}
        >
          {cardBody}
        </Pressable>
      )}
    </Animated.View>
  );
}

const POSTER_WIDTH = 118;
const POSTER_HEIGHT = 177;
const FEATURE_CARD_HEIGHT = 168;
const ENABLE_ENTRY_ANIMATIONS = Platform.OS !== "web";

function getFeatureMetaLabels(
  item: SignatureRailItem,
  fallbackMetaLabel?: string,
) {
  const meta = getHomeDisplayMetaLabels(item, { compactSignal: true });
  const fallback = fallbackMetaLabel?.trim();
  const hasSpecificContext = Boolean(
    item.genreLabel?.trim() || item.signal?.trim(),
  );

  if (!fallback || hasSpecificContext) return meta;

  return [
    fallback,
    ...meta.filter((label) => label.toLowerCase() !== fallback.toLowerCase()),
  ].slice(0, 3);
}

function shouldFeatureSignalStandAlone(signal: string | null | undefined) {
  const label = signal?.trim();
  if (!label) return false;
  if (/^\d+(?:\.\d+)?(?:\s+TMDB)?$/i.test(label)) return false;
  if (isVisibleChartSignal(label)) return false;
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|airing|returns|finale|premiere|now|top\s+10|justwatch|chart|s\d+)\b/i.test(
    label,
  );
}

function normalizeVisibleMetaLabel(label: string) {
  if (/^JustWatch\s+#\d+$/i.test(label)) return "Trending";
  if (/^Netflix\s+top\s+10$/i.test(label)) return "Top 10";
  return label;
}

function normalizeVisibleMetaLabels(labels: string[]) {
  const seen = new Set<string>();
  return labels.flatMap((label) => {
    const visible = normalizeVisibleMetaLabel(label).trim();
    if (!visible) return [];
    const key = visible.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [visible];
  });
}

export function getFeatureCardVisibleMetaLabels(
  item: SignatureRailItem,
  fallbackMetaLabel?: string,
) {
  const signalLine = item.signal
    ? getHomeDisplayMetaLine({ signal: item.signal }, { compactSignal: true })
    : null;
  if (signalLine && shouldFeatureSignalStandAlone(item.signal)) {
    return normalizeVisibleMetaLabels([signalLine]);
  }
  return normalizeVisibleMetaLabels(
    getFeatureMetaLabels(item, fallbackMetaLabel),
  ).slice(0, 2);
}

export function getFeatureCardVisibleMetaLine(
  item: SignatureRailItem,
  fallbackMetaLabel?: string,
) {
  return getFeatureCardVisibleMetaLabels(item, fallbackMetaLabel).join(" · ");
}

function isTimelyPosterSignal(signal: string | null | undefined) {
  const label = signal?.trim();
  if (!label) return false;
  if (/^\d+(?:\.\d+)?(?:\s+TMDB)?$/i.test(label)) return false;
  if (isVisibleChartSignal(label)) return false;
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b(?:airing|returns|finale|premiere|now)\b/i.test(
    label,
  );
}

function isVisibleChartSignal(signal: string) {
  return /^(chart mover|trending|netflix top 10|justwatch(?:\s+chart)?\s+#\d+)$/i.test(
    signal.trim(),
  );
}

export function getPosterCardVisibleMetaLine(item: SignatureRailItem) {
  const signal = item.signal?.trim();
  if (signal && isTimelyPosterSignal(signal)) {
    return normalizeVisibleMetaLabels([
      getHomeDisplayMetaLine({ signal }, { compactSignal: true }),
    ]).join(" · ");
  }
  return normalizeVisibleMetaLabels(
    getHomeDisplayMetaLabels(item, { compactSignal: true }),
  ).join(" · ");
}

function PosterCard({
  item,
  accent,
  index,
  onPress,
}: {
  item: SignatureRailItem;
  accent: string;
  index: number;
  onPress: (item: SignatureRailItem) => void;
}) {
  const metaLine = getPosterCardVisibleMetaLine(item);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const posterUrl = item.posterUrl?.trim() || null;
  const shouldShowImage = Boolean(posterUrl && !imageFailed);
  const shouldShowFallback = !posterUrl || imageFailed || !imageLoaded;

  const cardProps = {
    accessibilityRole: "button" as const,
    accessibilityLabel: getSignatureRailItemAccessibilityLabel(item, undefined, {
      compactSignal: true,
    }),
    className: "active:opacity-85 hover:opacity-90 web:transition-opacity",
  };

  const cardBody = (
    <View style={styles.posterFrame}>
      {shouldShowImage ? (
        <Image
          testID={`poster-image-${item.key}`}
          source={{ uri: posterUrl ?? undefined }}
          style={styles.posterImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {shouldShowFallback ? (
        <PosterFallback item={item} accent={accent} metaLine={metaLine} />
      ) : null}
    </View>
  );

  return (
    <Animated.View
      entering={
        ENABLE_ENTRY_ANIMATIONS
          ? FadeInRight.delay(index * 25).duration(280)
          : undefined
      }
      style={{ width: POSTER_WIDTH }}
    >
      {item.href ? (
        // A known href owns navigation (real link on web); the press handler
        // then only fires the haptic instead of the ingest-and-push fallback.
        <LinkPressable
          href={item.href}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          {...cardProps}
        >
          {cardBody}
        </LinkPressable>
      ) : (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress(item);
          }}
          {...cardProps}
        >
          {cardBody}
        </Pressable>
      )}
    </Animated.View>
  );
}

function PosterFallback({
  item,
  accent,
  metaLine,
}: {
  item: SignatureRailItem;
  accent: string;
  metaLine: string | null;
}) {
  return (
    <View
      testID={`poster-fallback-${item.key}`}
      accessible={false}
      accessibilityElementsHidden
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[styles.posterFallback, { backgroundColor: `${accent}14` }]}
    >
      <LinearGradient
        colors={[`${accent}55`, "rgba(22,26,34,0.95)"]}
        locations={[0, 0.72]}
        style={[StyleSheet.absoluteFill, styles.pointerNone]}
      />
      <Text
        className="text-[13px] font-black leading-[17px] text-white"
        numberOfLines={4}
      >
        {item.title}
      </Text>
      {metaLine ? (
        <Text
          className="mt-1 text-[10px] font-semibold leading-[13px] text-white/60"
          numberOfLines={2}
        >
          {metaLine}
        </Text>
      ) : null}
    </View>
  );
}

function FeatureArtworkFallback({
  item,
  accent,
}: {
  item: SignatureRailItem;
  accent: string;
}) {
  return (
    <View
      testID={`feature-fallback-${item.key}`}
      accessible={false}
      accessibilityElementsHidden
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[styles.featureFallback, { backgroundColor: `${accent}12` }]}
    >
      <LinearGradient
        colors={[`${accent}42`, "rgba(22,26,34,0.92)", "#11151D"]}
        locations={[0, 0.58, 1]}
        style={[StyleSheet.absoluteFill, styles.pointerNone]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  featureRail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  posterRail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  featureCard: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    height: FEATURE_CARD_HEIGHT,
    overflow: "hidden",
  },
  featureImage: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    width: "100%",
  },
  featureContent: {
    bottom: 0,
    left: 0,
    padding: 10,
    position: "absolute",
    right: 0,
  },
  featureFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  metaItem: {
    alignItems: "center",
    flexDirection: "row",
  },
  metaSep: {
    backgroundColor: "rgba(255,255,255,0.32)",
    borderRadius: 1.5,
    height: 3,
    marginHorizontal: 5,
    width: 3,
  },
  posterFrame: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    height: POSTER_HEIGHT,
    overflow: "hidden",
    width: POSTER_WIDTH,
  },
  posterImage: {
    ...StyleSheet.absoluteFillObject,
    height: "100%",
    width: "100%",
  },
  posterFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 11,
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
