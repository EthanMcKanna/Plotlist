import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import {
  getHomeSignalReleaseDistanceDays,
  hasReleaseWindowHomeSignal,
} from "../lib/homeCurrentSignal";
import { formatHomeDatedSignalLabel } from "../lib/homeDisplayMeta";

export type HeroEyebrow = "trending" | "current" | "tonight" | "for-you" | "fresh";

export type HeroSlide = {
  key: string;
  showId?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  title: string;
  overview?: string | null;
  backdropUrl?: string | null;
  posterUrl?: string | null;
  year?: number | null;
  tmdbVoteAverage?: number | null;
  genreIds?: number[] | null;
  signal?: string | null;
  eyebrow: HeroEyebrow;
  reason?: string | null;
};

export type HeroSaveState = "idle" | "saving" | "saved";

type HeroEyebrowDisplay = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
};

const EYEBROW_LABELS: Record<HeroEyebrow, HeroEyebrowDisplay> = {
  trending: { label: "On the rise", icon: "flame", tint: "#F59E0B" },
  current: { label: "Now", icon: "radio", tint: "#F59E0B" },
  tonight: { label: "Airing tonight", icon: "radio", tint: "#38BDF8" },
  "for-you": { label: "For you", icon: "sparkles", tint: "#22C55E" },
  fresh: { label: "New", icon: "ribbon", tint: "#FB7185" },
};

const GENRE_LABELS: Record<number, string> = {
  16: "Animated",
  18: "Drama",
  35: "Comedy",
  37: "Western",
  80: "Crime",
  99: "Docuseries",
  9648: "Mystery",
  10751: "Family",
  10759: "Action",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-fi",
  10766: "Soap",
  10767: "Talk",
  10768: "War",
};

const ROTATE_INTERVAL_MS = 14_000;
export const HERO_CTA_TOUCH_TARGET = 44;

type HeroCarouselProps = {
  slides: HeroSlide[];
  scrollY: SharedValue<number>;
  onPressSlide: (slide: HeroSlide) => void;
  onSavePress?: (slide: HeroSlide) => void;
  saveStateByKey?: Partial<Record<string, HeroSaveState>>;
  topInset: number;
  now?: Date | number | string;
  reduceMotionEnabled?: boolean;
};

function pushUniqueMetaLabel(labels: string[], value: string | null | undefined) {
  const label = value?.trim();
  if (!label) return;
  const key = label.toLowerCase();
  if (labels.some((existing) => existing.toLowerCase() === key)) return;
  labels.push(label);
}

function normalizeHeroMetaKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

export function buildHeroMeta(slide: HeroSlide): string[] {
  const parts: string[] = [];
  const firstGenre = slide.genreIds?.[0];
  const genreLabel = firstGenre ? GENRE_LABELS[firstGenre] : null;
  const yearLabel = slide.year ? String(slide.year) : null;
  const ratingLabel =
    typeof slide.tmdbVoteAverage === "number" && slide.tmdbVoteAverage > 0
      ? `${slide.tmdbVoteAverage.toFixed(1)} TMDB`
      : null;
  const signalLabel = slide.signal ? formatHomeDatedSignalLabel(slide.signal) : null;
  const signalKey = normalizeHeroMetaKey(signalLabel);
  const signalAddsContext = Boolean(
    signalKey &&
      signalKey !== normalizeHeroMetaKey(genreLabel) &&
      signalKey !== normalizeHeroMetaKey(yearLabel) &&
      signalKey !== normalizeHeroMetaKey(ratingLabel),
  );

  pushUniqueMetaLabel(parts, genreLabel);
  pushUniqueMetaLabel(parts, signalLabel);
  if (!signalAddsContext) {
    pushUniqueMetaLabel(parts, ratingLabel);
    pushUniqueMetaLabel(parts, yearLabel);
  }
  return parts.slice(0, 3);
}

function shouldHeroSignalStandAlone(signal: string | null | undefined) {
  const label = signal?.trim();
  if (!label) return false;
  if (/^\d+(?:\.\d+)?(?:\s+TMDB)?$/i.test(label)) return false;
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|airing|returns|finale|premiere|now|top\s+10|justwatch|chart|s\d+)\b/i.test(
    label,
  );
}

export function buildHeroVisibleMeta(slide: HeroSlide): string[] {
  const signalLabel = slide.signal ? formatHomeDatedSignalLabel(slide.signal) : null;
  if (signalLabel && shouldHeroSignalStandAlone(slide.signal)) {
    return [signalLabel];
  }
  return buildHeroMeta(slide).slice(0, 2);
}

function normalizeHeroReason(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function isGenericHeroReason(reason: string) {
  return (
    /matched\s+from\s+your\s+taste\s+profile/i.test(reason) ||
    /\btaste\s+match\b/i.test(reason)
  );
}

function normalizeHeroAccessibilityPart(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

export function getHeroReasonLabel(slide: HeroSlide) {
  const reason = normalizeHeroReason(slide.reason);
  const title = normalizeHeroReason(slide.title);
  const overview = normalizeHeroReason(slide.overview);
  const normalizedReason = reason?.toLowerCase();
  if (
    !reason ||
    isGenericHeroReason(reason) ||
    normalizedReason === title?.toLowerCase() ||
    normalizedReason === overview?.toLowerCase()
  ) {
    return null;
  }
  return reason;
}

export function getHeroOpenAccessibilityLabel(slide: HeroSlide) {
  const title = normalizeHeroAccessibilityPart(slide.title);
  const reason = getHeroReasonLabel(slide);
  const metaLine = buildHeroMeta(slide).join(" · ");

  return [`Open ${title ?? "show"}`, reason, metaLine || null]
    .filter(Boolean)
    .join(". ");
}

export function getHeroTitleAccessibilityLabel(
  slide: HeroSlide,
  now: Date | number | string = new Date(),
  carouselPosition?: {
    index: number;
    total: number;
  },
) {
  const title = normalizeHeroAccessibilityPart(slide.title);
  const eyebrow = getHeroEyebrowDisplay(slide, now)?.label;
  const metaLine = buildHeroMeta(slide).join(" · ");
  const position =
    carouselPosition &&
    Number.isInteger(carouselPosition.index) &&
    Number.isInteger(carouselPosition.total) &&
    carouselPosition.total > 1 &&
    carouselPosition.index >= 0 &&
    carouselPosition.index < carouselPosition.total
      ? `${carouselPosition.index + 1} of ${carouselPosition.total}`
      : null;

  return ["Lead pick", position, title, eyebrow, metaLine || null]
    .filter(Boolean)
    .join(". ");
}

function isReturnSignal(signal: string | null | undefined) {
  return /\b(return|returns|returning)\b/i.test(signal?.trim() ?? "");
}

function isSeasonSignal(signal: string | null | undefined) {
  return /\b(season|s\d+)\b/i.test(signal?.trim() ?? "");
}

export function shouldAutoRotateHero({
  autoPaused,
  reduceMotionEnabled,
  slideCount,
}: {
  autoPaused: boolean;
  reduceMotionEnabled: boolean;
  slideCount: number;
}) {
  return !reduceMotionEnabled && !autoPaused && slideCount > 1;
}

function useReduceMotionPreference(override?: boolean) {
  const [enabled, setEnabled] = useState(Boolean(override));

  useEffect(() => {
    if (typeof override === "boolean") {
      setEnabled(override);
      return;
    }

    let mounted = true;
    const reduceMotionPromise = AccessibilityInfo.isReduceMotionEnabled?.();
    void reduceMotionPromise?.then((value) => {
      if (mounted) setEnabled(Boolean(value));
    });
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (value) => setEnabled(Boolean(value)),
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [override]);

  return typeof override === "boolean" ? override : enabled;
}

export function getHeroEyebrowDisplay(
  slide: HeroSlide,
  now: Date | number | string = new Date(),
): HeroEyebrowDisplay | null {
  const fallback = EYEBROW_LABELS[slide.eyebrow] ?? null;
  if (!fallback) return null;
  if (slide.eyebrow !== "fresh" || !hasReleaseWindowHomeSignal(slide)) {
    return fallback;
  }

  const releaseDistance = getHomeSignalReleaseDistanceDays(slide, now);
  if (releaseDistance === 0) {
    return { label: "New", icon: "sparkles", tint: "#38BDF8" };
  }
  if (releaseDistance !== null && releaseDistance < 0 && releaseDistance >= -6) {
    return { label: "New", icon: "sparkles", tint: "#38BDF8" };
  }
  if (isReturnSignal(slide.signal)) {
    return { label: "Returning", icon: "return-up-forward", tint: "#FB7185" };
  }
  if (isSeasonSignal(slide.signal)) {
    return { label: "New season", icon: "albums", tint: "#FB7185" };
  }
  if (releaseDistance !== null && releaseDistance > 0 && releaseDistance <= 7) {
    return { label: "This week", icon: "calendar", tint: "#38BDF8" };
  }
  return fallback;
}

export function HeroCarousel({
  slides,
  scrollY,
  onPressSlide,
  onSavePress,
  saveStateByKey,
  topInset,
  now,
  reduceMotionEnabled,
}: HeroCarouselProps) {
  const { width: windowWidth } = useWindowDimensions();
  const heroHeight = Math.min(Math.max(windowWidth * 0.82, 360), 468);
  const totalHeight = topInset + heroHeight;

  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const prefersReducedMotion = useReduceMotionPreference(reduceMotionEnabled);

  const safeSlides = useMemo(() => slides.slice(0, 5), [slides]);
  const activeSlide = safeSlides[activeIndex] ?? safeSlides[0];

  // Parallax: translate + scale the backdrop while scrolling.
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [-200, 0, heroHeight],
          [-100, 0, heroHeight * 0.4],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          scrollY.value,
          [-200, 0, heroHeight],
          [1.18, 1, 1.04],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // Content fades + lifts as it scrolls off.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [0, heroHeight * 0.55],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, heroHeight * 0.55],
          [0, -36],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // Auto-rotate.
  useEffect(() => {
    if (
      !shouldAutoRotateHero({
        autoPaused,
        reduceMotionEnabled: prefersReducedMotion,
        slideCount: safeSlides.length,
      })
    ) {
      return;
    }
    const timer = setTimeout(() => {
      const nextIndex = (activeIndex + 1) % safeSlides.length;
      scrollRef.current?.scrollTo({ x: nextIndex * windowWidth, animated: true });
      setActiveIndex(nextIndex);
    }, ROTATE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [activeIndex, autoPaused, prefersReducedMotion, safeSlides.length, windowWidth]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (windowWidth <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
      if (next !== activeIndex) {
        setActiveIndex(next);
      }
    },
    [activeIndex, windowWidth],
  );

  if (safeSlides.length === 0) {
    return (
      <View
        style={[styles.fallback, { height: totalHeight, paddingTop: topInset + 24 }]}
      >
        <View style={styles.fallbackBadge}>
          <Ionicons
            name="sparkles"
            size={20}
            color="#38BDF8"
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
        </View>
        <Text className="mt-4 text-3xl font-black text-text-primary">Plotlist</Text>
        <Text className="mt-2 text-sm leading-5 text-text-tertiary">
          Loading picks.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height: totalHeight, overflow: "hidden" }}>
      <Animated.View
        style={[
          styles.backdropContainer,
          { height: totalHeight },
          backdropStyle,
          styles.pointerNone,
        ]}
      >
        <ScrollView
          ref={scrollRef}
          accessibilityLabel="Lead picks carousel"
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollBegin={() => setAutoPaused(true)}
          onMomentumScrollEnd={(e) => {
            handleMomentumEnd(e);
            setAutoPaused(false);
          }}
          onTouchStart={() => setAutoPaused(true)}
          onTouchEnd={() => {
            // Resume auto rotate once the user lifts off (small grace period).
            setTimeout(() => setAutoPaused(false), 1_500);
          }}
          style={{ width: windowWidth, height: totalHeight }}
        >
          {safeSlides.map((slide) => (
            <HeroBackdropSlide
              key={slide.key}
              slide={slide}
              width={windowWidth}
              height={totalHeight}
              onPress={onPressSlide}
              now={now}
              reduceMotionEnabled={prefersReducedMotion}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {/* Top-to-bottom gradient: solid edge → dark fade → transparent → bottom floor.
         The fully opaque top band hides the seam against the page background when
         the user overscrolls/pulls down. */}
      <LinearGradient
        colors={[
          "rgba(13,15,20,1)",
          "rgba(13,15,20,1)",
          "rgba(13,15,20,0.85)",
          "rgba(13,15,20,0.0)",
          "rgba(13,15,20,0.55)",
          "rgba(13,15,20,1)",
        ]}
        locations={[0, 0.04, 0.1, 0.34, 0.72, 1]}
        style={[styles.gradient, styles.pointerNone, { height: totalHeight }]}
      />
      {/* Subtle left-side darken so headline pops on busy backdrops */}
      <LinearGradient
        colors={["rgba(13,15,20,0.55)", "rgba(13,15,20,0.0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 0.55, y: 0.5 }}
        style={[styles.gradient, styles.pointerNone, { height: totalHeight }]}
      />

      <Animated.View
        style={[
          styles.content,
          styles.pointerBoxNone,
          { paddingTop: topInset + 12 },
          contentStyle,
        ]}
      >
        <ActiveContent
          slide={activeSlide}
          onPress={onPressSlide}
          onSave={onSavePress}
          saveState={activeSlide ? saveStateByKey?.[activeSlide.key] ?? "idle" : "idle"}
          now={now}
          carouselPosition={{ index: activeIndex, total: safeSlides.length }}
        />

        {safeSlides.length > 1 ? (
          <View style={[styles.dots, styles.pointerNone]}>
            {safeSlides.map((slide, idx) => {
              const tint =
                EYEBROW_LABELS[slide.eyebrow]?.tint ?? "#F1F3F7";
              const active = idx === activeIndex;
              return (
                <View
                  key={slide.key}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: active ? tint : "rgba(255,255,255,0.35)",
                      width: active ? 22 : 6,
                    },
                  ]}
                />
              );
            })}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function HeroBackdropSlide({
  slide,
  width,
  height,
  onPress,
  now,
  reduceMotionEnabled,
}: {
  slide: HeroSlide;
  width: number;
  height: number;
  onPress: (slide: HeroSlide) => void;
  now?: Date | number | string;
  reduceMotionEnabled: boolean;
}) {
  const imageUrl = slide.backdropUrl ?? slide.posterUrl ?? null;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [imageUrl]);

  const eyebrow = getHeroEyebrowDisplay(slide, now);
  const tint = eyebrow?.tint ?? "#38BDF8";
  const shouldShowImage = Boolean(imageUrl && !imageFailed);
  const shouldShowFallback = !imageUrl || imageFailed || !imageLoaded;

  return (
    <Pressable
      testID={`hero-backdrop-pressable-${slide.key}`}
      accessible={false}
      accessibilityElementsHidden
      focusable={false}
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      onPress={() => onPress(slide)}
      style={{ width, height }}
      tabIndex={-1}
    >
      {shouldShowImage ? (
        <Image
          testID={`hero-backdrop-image-${slide.key}`}
          source={{ uri: imageUrl ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={reduceMotionEnabled ? 0 : 260}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {shouldShowFallback ? (
        <HeroBackdropFallback
          testID={`hero-backdrop-fallback-${slide.key}`}
          tint={tint}
        />
      ) : null}
    </Pressable>
  );
}

function HeroBackdropFallback({
  testID,
  tint,
}: {
  testID: string;
  tint: string;
}) {
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.heroFallbackRoot]}
    >
      <LinearGradient
        colors={[
          `${tint}30`,
          "rgba(24,30,42,0.96)",
          "rgba(13,15,20,0.98)",
        ]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.heroFallbackBeam, { backgroundColor: `${tint}24` }]} />
      <View
        style={[
          styles.heroFallbackBeam,
          styles.heroFallbackBeamLower,
          { backgroundColor: `${tint}18` },
        ]}
      />
    </View>
  );
}

function ActiveContent({
  slide,
  onPress,
  onSave,
  saveState,
  now,
  carouselPosition,
}: {
  slide: HeroSlide;
  onPress: (slide: HeroSlide) => void;
  onSave?: (slide: HeroSlide) => void;
  saveState: HeroSaveState;
  now?: Date | number | string;
  carouselPosition: {
    index: number;
    total: number;
  };
}) {
  const meta = buildHeroVisibleMeta(slide);
  const saving = saveState === "saving";
  const saved = saveState === "saved";
  const saveIcon = saved ? "bookmark" : saving ? "time-outline" : "bookmark-outline";
  const saveAccessibilityLabel = saved
    ? `${slide.title} saved to watchlist`
    : saving
      ? `Saving ${slide.title} to watchlist`
      : `Save ${slide.title} to watchlist`;

  return (
    <View style={styles.contentInner}>
      <Text
        accessibilityRole="header"
        accessibilityLabel={getHeroTitleAccessibilityLabel(
          slide,
          now,
          carouselPosition,
        )}
        className="text-[34px] font-black leading-[37px] text-white"
        numberOfLines={3}
      >
        {slide.title}
      </Text>

      {meta.length > 0 ? (
        <View style={styles.metaRow}>
          {meta.map((label, idx) => (
            <View key={label} style={styles.metaItem}>
              {idx > 0 ? (
                <View style={styles.metaSeparator} />
              ) : null}
              <Text className="text-[12px] font-semibold text-white/85">
                {label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={getHeroOpenAccessibilityLabel(slide)}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress(slide);
          }}
          style={styles.primaryCta}
          className="active:opacity-85"
        >
          <Ionicons
            name="open-outline"
            size={16}
            color="#0D0F14"
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
        </Pressable>

        {onSave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saveAccessibilityLabel}
            accessibilityState={{
              disabled: saving || saved,
              selected: saved,
            }}
            disabled={saving || saved}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSave(slide);
            }}
            style={[
              styles.secondaryCta,
              saving ? styles.secondaryCtaSaving : null,
              saved ? styles.secondaryCtaSaved : null,
            ]}
            className="active:opacity-80"
          >
            <Ionicons
              name={saveIcon}
              size={14}
              color={saved ? "#22C55E" : "#F1F3F7"}
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropContainer: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  backdrop: {
    height: "100%",
    width: "100%",
  },
  heroFallbackRoot: {
    backgroundColor: "#141923",
    overflow: "hidden",
  },
  heroFallbackBeam: {
    height: 96,
    left: -80,
    opacity: 0.72,
    position: "absolute",
    top: 92,
    transform: [{ rotate: "-18deg" }],
    width: "78%",
  },
  heroFallbackBeamLower: {
    left: "44%",
    top: 330,
    width: "72%",
  },
  gradient: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  content: {
    bottom: 0,
    flex: 1,
    justifyContent: "flex-end",
    left: 0,
    paddingBottom: 18,
    paddingHorizontal: 24,
    position: "absolute",
    right: 0,
    top: 0,
  },
  contentInner: {
    width: "100%",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  metaItem: {
    alignItems: "center",
    flexDirection: "row",
  },
  metaSeparator: {
    backgroundColor: "rgba(255,255,255,0.45)",
    borderRadius: 1.5,
    height: 3,
    marginHorizontal: 9,
    width: 3,
  },
  ctaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  primaryCta: {
    alignItems: "center",
    backgroundColor: "#F1F3F7",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    height: HERO_CTA_TOUCH_TARGET,
    minHeight: HERO_CTA_TOUCH_TARGET,
    minWidth: HERO_CTA_TOUCH_TARGET,
    paddingHorizontal: 0,
    width: HERO_CTA_TOUCH_TARGET,
  },
  secondaryCta: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    height: HERO_CTA_TOUCH_TARGET,
    justifyContent: "center",
    minHeight: HERO_CTA_TOUCH_TARGET,
    minWidth: HERO_CTA_TOUCH_TARGET,
    width: HERO_CTA_TOUCH_TARGET,
  },
  secondaryCtaSaving: {
    opacity: 0.78,
  },
  secondaryCtaSaved: {
    backgroundColor: "rgba(34,197,94,0.14)",
    borderColor: "rgba(34,197,94,0.42)",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
  },
  dot: {
    borderRadius: 4,
    height: 6,
  },
  fallback: {
    alignItems: "flex-start",
    backgroundColor: "#161A22",
    paddingHorizontal: 22,
  },
  fallbackBadge: {
    alignItems: "center",
    backgroundColor: "rgba(56,189,248,0.14)",
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  pointerBoxNone: {
    pointerEvents: "box-none",
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
