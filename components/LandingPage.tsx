import { useEffect, type ReactNode } from "react";
import {
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
import { router } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { CURATED_SHOWS } from "../lib/curatedShows";

// ─────────────────────────────────────────────────────────────────────────
// The signed-out web front door. A cinematic, Apple-style product page built
// from the app's own visual language: real artwork, the same accent system
// as the home rails, and vignettes that are miniature recreations of the UI.
// Web-only — native users land on sign-in directly.
// ─────────────────────────────────────────────────────────────────────────

const ACCENTS = {
  track: "#22C55E",
  log: "#F59E0B",
  discover: "#38BDF8",
  friends: "#F472B6",
  calendar: "#A3E635",
};

const POSTER_W = 148;
const POSTER_H = 222;
const POSTER_GAP = 14;

const WIDE_BREAKPOINT = 920;
const CONTENT_MAX_WIDTH = 1080;

function goToSignIn() {
  router.push("/sign-in");
}

// ── Marquee poster rows ──────────────────────────────────────────────────

function MarqueeRow({
  shows,
  duration,
  reverse,
}: {
  shows: typeof CURATED_SHOWS;
  duration: number;
  reverse?: boolean;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const rowWidth = shows.length * (POSTER_W + POSTER_GAP);
  const start = reverse ? -2 * rowWidth : -rowWidth;
  const end = reverse ? -rowWidth : -2 * rowWidth;
  const tx = useSharedValue(start);

  useEffect(() => {
    tx.value = start;
    tx.value = withRepeat(
      withTiming(end, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [tx, start, end, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  const copies = Math.max(3, Math.ceil(viewportWidth / rowWidth) + 2);
  const tiled = Array.from({ length: copies }, () => shows).flat();

  return (
    <View style={styles.marqueeRowClip}>
      <Animated.View style={[styles.marqueeRow, style]}>
        {tiled.map((show, index) => (
          <View key={`${show.id}-${index}`} style={styles.marqueePoster}>
            <Image
              source={{ uri: show.p }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function HeroPosterWall() {
  return (
    <View pointerEvents="none" style={styles.wallFrame}>
      <View style={styles.wallTilt}>
        <MarqueeRow shows={CURATED_SHOWS.slice(0, 7)} duration={90000} />
        <MarqueeRow shows={CURATED_SHOWS.slice(6, 13)} duration={110000} reverse />
        <MarqueeRow shows={CURATED_SHOWS.slice(12, 19)} duration={80000} />
      </View>
      {/* Dissolve the wall into the page */}
      <LinearGradient
        colors={["rgba(9,11,16,0.66)", "rgba(9,11,16,0.5)", "rgba(13,15,20,0.97)", "#0D0F14"]}
        locations={[0, 0.38, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["#0D0F14", "transparent", "transparent", "#0D0F14"]}
        locations={[0, 0.2, 0.8, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

// ── Shared building blocks ───────────────────────────────────────────────

function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <View
      style={[
        styles.brandMark,
        { width: size, height: size, borderRadius: size * 0.3 },
      ]}
    >
      <Ionicons
        name="film"
        size={size * 0.56}
        color="#0B0D12"
        accessible={false}
        aria-hidden={true}
      />
    </View>
  );
}

function PrimaryCta({ label, large }: { label: string; large?: boolean }) {
  return (
    <Pressable
      onPress={goToSignIn}
      accessibilityRole="link"
      accessibilityLabel={label}
      className="items-center justify-center rounded-full bg-brand-400 transition-opacity hover:opacity-90 active:opacity-80"
      style={large ? styles.ctaLarge : styles.ctaSmall}
    >
      <Text
        className="font-bold text-text-inverse"
        style={{ fontSize: large ? 17 : 15 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GhostCta({ label }: { label: string }) {
  return (
    <Pressable
      onPress={goToSignIn}
      accessibilityRole="link"
      accessibilityLabel={label}
      className="items-center justify-center rounded-full border border-white/15 transition-colors hover:bg-white/5 active:bg-white/10"
      style={styles.ctaSmall}
    >
      <Text className="text-[15px] font-semibold text-text-primary">
        {label}
      </Text>
    </Pressable>
  );
}

function Kicker({ label, accent }: { label: string; accent: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <View style={[styles.kickerDash, { backgroundColor: accent }]} />
      <Text
        className="text-[13px] font-extrabold uppercase"
        style={{ color: accent, letterSpacing: 2.4 }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── UI vignettes — miniature, honest recreations of the product ──────────

function VignetteCard({ children }: { children: ReactNode }) {
  return (
    <View style={styles.vignetteCard}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(255,255,255,0.045)", "rgba(255,255,255,0)"]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

function ProgressBar({ value, tint }: { value: number; tint: string }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.round(value * 100)}%`, backgroundColor: tint },
        ]}
      />
    </View>
  );
}

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <View className="flex-row items-center" style={{ gap: 2 }}>
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = value >= index + 1;
        const half = !filled && value > index;
        return (
          <Ionicons
            key={index}
            name={filled ? "star" : half ? "star-half" : "star-outline"}
            size={size}
            color={filled || half ? "#F59E0B" : "#3A3F4B"}
            accessible={false}
            aria-hidden={true}
          />
        );
      })}
    </View>
  );
}

function TrackVignette() {
  const bear = CURATED_SHOWS.find((show) => show.id === "bear")!;
  const sev = CURATED_SHOWS.find((show) => show.id === "sev")!;
  const andor = CURATED_SHOWS.find((show) => show.id === "and")!;
  return (
    <VignetteCard>
      <View style={styles.trackHero}>
        <Image
          source={{ uri: bear.b }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
        <LinearGradient
          colors={["rgba(13,15,20,0)", "rgba(13,15,20,0.55)", "rgba(13,15,20,0.96)"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.trackHeroBadge}>
          <Text className="text-[11px] font-bold text-white/90">S3 E4</Text>
        </View>
        <View style={styles.trackHeroFooter}>
          <View className="min-w-0 flex-1 pr-3">
            <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
              The Bear
            </Text>
            <Text className="mt-0.5 text-[17px] font-black text-white" numberOfLines={1}>
              Violet
            </Text>
          </View>
          <View style={styles.watchedCheck}>
            <Ionicons
              name="checkmark"
              size={16}
              color="#0B0D12"
              accessible={false}
              aria-hidden={true}
            />
          </View>
        </View>
      </View>
      <View className="px-5 pb-2 pt-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-[12px] font-semibold text-text-secondary">
            7 of 10 episodes
          </Text>
          <Text className="text-[12px] font-semibold" style={{ color: ACCENTS.track }}>
            70%
          </Text>
        </View>
        <View className="mt-2">
          <ProgressBar value={0.7} tint={ACCENTS.track} />
        </View>
      </View>
      <View className="gap-1 px-3 pb-4 pt-3">
        {[
          { show: sev, code: "S2 E7", title: "Chikhai Bardo", meta: "Up next" },
          { show: andor, code: "S2 E1", title: "One Year Later", meta: "New season" },
        ].map((row) => (
          <View key={row.code} style={styles.upNextRow}>
            <View style={styles.upNextThumb}>
              <Image
                source={{ uri: row.show.p }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-bold text-text-primary" numberOfLines={1}>
                {row.show.t}
              </Text>
              <Text className="mt-0.5 text-[11.5px] text-text-tertiary" numberOfLines={1}>
                {row.code} · {row.title}
              </Text>
            </View>
            <Text
              className="text-[10.5px] font-bold uppercase tracking-wider"
              style={{ color: ACCENTS.track }}
            >
              {row.meta}
            </Text>
          </View>
        ))}
      </View>
    </VignetteCard>
  );
}

function LogVignette() {
  const shogun = CURATED_SHOWS.find((show) => show.id === "sho")!;
  const bcs = CURATED_SHOWS.find((show) => show.id === "bcs")!;
  return (
    <VignetteCard>
      <View className="gap-1 p-3">
        <Text className="px-2 pb-1 pt-1 text-[11px] font-extrabold uppercase text-text-tertiary" style={{ letterSpacing: 2 }}>
          March 2026 · 2 entries
        </Text>
        {[
          {
            show: shogun,
            day: "14",
            dow: "SAT",
            rating: 5,
            note: "Crimson Sky. Cannot stop thinking about that final shot.",
            spoiler: true,
          },
          {
            show: bcs,
            day: "11",
            dow: "WED",
            rating: 4.5,
            note: "A rewatch, and somehow even better the second time.",
            spoiler: false,
          },
        ].map((entry) => (
          <View key={entry.day} style={styles.diaryRow}>
            <View className="w-9 items-center pt-0.5">
              <Text className="text-[17px] font-black text-text-primary">{entry.day}</Text>
              <Text className="text-[9px] font-bold tracking-widest text-text-tertiary">
                {entry.dow}
              </Text>
            </View>
            <View style={styles.diaryThumb}>
              <Image
                source={{ uri: entry.show.p }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13.5px] font-bold text-text-primary" numberOfLines={1}>
                {entry.show.t}
              </Text>
              <View className="mt-1 flex-row items-center gap-2">
                <Stars value={entry.rating} />
              </View>
              <Text className="mt-1.5 text-[12px] leading-4 text-text-secondary" numberOfLines={2}>
                {entry.note}
              </Text>
              {entry.spoiler ? (
                <View className="mt-1.5 flex-row">
                  <View style={styles.spoilerChip}>
                    <Ionicons
                      name="eye-off-outline"
                      size={10}
                      color="#9BA1B0"
                      accessible={false}
                      aria-hidden={true}
                    />
                    <Text className="text-[10px] font-semibold text-text-secondary">
                      Spoilers hidden
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </VignetteCard>
  );
}

function DiscoverVignette() {
  const results = ["td", "pb", "sop", "wire"].map(
    (id) => CURATED_SHOWS.find((show) => show.id === id)!,
  );
  return (
    <VignetteCard>
      <View className="p-5">
        <View style={styles.searchField}>
          <Ionicons
            name="sparkles"
            size={15}
            color={ACCENTS.discover}
            accessible={false}
            aria-hidden={true}
          />
          <Text className="flex-1 text-[14px] text-text-primary" numberOfLines={1}>
            a slow-burn crime drama with a moral spiral
          </Text>
        </View>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {["Dark & Gritty", "Slow Burn", "Character Study"].map((chip) => (
            <View key={chip} style={styles.moodChip}>
              <Text className="text-[11px] font-semibold text-text-secondary">{chip}</Text>
            </View>
          ))}
        </View>
        <View className="mt-5 flex-row" style={{ gap: 10 }}>
          {results.map((show, index) => (
            <View key={show.id} style={[styles.resultPoster, index === 0 && styles.resultPosterLead]}>
              <Image
                source={{ uri: show.p }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
              {index === 0 ? (
                <View style={styles.matchBadge}>
                  <Text className="text-[9.5px] font-extrabold text-text-inverse">98% match</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </VignetteCard>
  );
}

function FriendsVignette() {
  const arcane = CURATED_SHOWS.find((show) => show.id === "arc")!;
  const tlou = CURATED_SHOWS.find((show) => show.id === "tlou")!;
  return (
    <VignetteCard>
      <View className="gap-1 p-3">
        {[
          {
            initial: "M",
            tint: "#F472B6",
            name: "Maya",
            action: "rated",
            show: arcane,
            rating: 5,
            time: "2h",
            likes: 4,
            comment: "“Season 2 broke me. In a good way.”",
          },
          {
            initial: "J",
            tint: "#38BDF8",
            name: "Jonah",
            action: "finished",
            show: tlou,
            rating: 4.5,
            time: "5h",
            likes: 2,
            comment: null,
          },
        ].map((item) => (
          <View key={item.name} style={styles.activityRow}>
            <View style={[styles.avatar, { backgroundColor: `${item.tint}26`, borderColor: `${item.tint}55` }]}>
              <Text className="text-[13px] font-black" style={{ color: item.tint }}>
                {item.initial}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] leading-[18px] text-text-secondary" numberOfLines={2}>
                <Text className="font-bold text-text-primary">{item.name}</Text>
                {` ${item.action} `}
                <Text className="font-bold text-text-primary">{item.show.t}</Text>
              </Text>
              <View className="mt-1 flex-row items-center gap-2">
                <Stars value={item.rating} size={11} />
                <Text className="text-[11px] text-text-tertiary">{item.time}</Text>
              </View>
              {item.comment ? (
                <View style={styles.commentBubble}>
                  <Text className="text-[12px] leading-4 text-text-secondary" numberOfLines={2}>
                    {item.comment}
                  </Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row items-center gap-1 pt-1">
              <Ionicons
                name="heart"
                size={13}
                color="#F472B6"
                accessible={false}
                aria-hidden={true}
              />
              <Text className="text-[11px] font-semibold text-text-tertiary">{item.likes}</Text>
            </View>
          </View>
        ))}
      </View>
    </VignetteCard>
  );
}

function CalendarVignette() {
  const rows = [
    { id: "sev", label: "TONIGHT", code: "S3 E1", title: "Severance", note: "Season premiere" },
    { id: "and", label: "THU", code: "S2 E9", title: "Andor", note: "9:00 PM" },
    { id: "tlou", label: "SUN", code: "S3 E4", title: "The Last of Us", note: "Season finale" },
  ].map((row) => ({
    ...row,
    show: CURATED_SHOWS.find((show) => show.id === row.id)!,
  }));
  return (
    <VignetteCard>
      <View className="gap-1 p-3">
        {rows.map((row, index) => (
          <View key={row.id} style={styles.calendarRow}>
            <View className="w-14">
              <Text
                className="text-[10px] font-extrabold tracking-widest"
                style={{ color: index === 0 ? ACCENTS.calendar : "#5A6070" }}
              >
                {row.label}
              </Text>
            </View>
            <View style={styles.calendarThumb}>
              <Image
                source={{ uri: row.show.b }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-bold text-text-primary" numberOfLines={1}>
                {row.title}
              </Text>
              <Text className="mt-0.5 text-[11.5px] text-text-tertiary" numberOfLines={1}>
                {row.code} · {row.note}
              </Text>
            </View>
            {index === 0 ? (
              <View style={[styles.liveDot, { backgroundColor: ACCENTS.calendar }]} />
            ) : null}
          </View>
        ))}
      </View>
    </VignetteCard>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────

type Feature = {
  key: string;
  kicker: string;
  accent: string;
  headline: string;
  body: string;
  vignette: ReactNode;
};

const FEATURES: Feature[] = [
  {
    key: "track",
    kicker: "Track",
    accent: ACCENTS.track,
    headline: "Pick up exactly where you left off.",
    body:
      "Plotlist remembers your place in every series — down to the episode. One tap marks it watched, and your queue quietly lines up what's next.",
    vignette: <TrackVignette />,
  },
  {
    key: "log",
    kicker: "Log",
    accent: ACCENTS.log,
    headline: "A diary for your watching life.",
    body:
      "Rate episodes and seasons the moment the credits roll. Add notes, flag spoilers, and build a history you'll love scrolling back through.",
    vignette: <LogVignette />,
  },
  {
    key: "discover",
    kicker: "Discover",
    accent: ACCENTS.discover,
    headline: "Describe a vibe. Get a show.",
    body:
      "Search the way you actually think — “a slow-burn crime drama with a moral spiral” — and Plotlist matches the mood. Recommendations sharpen with every rating.",
    vignette: <DiscoverVignette />,
  },
  {
    key: "friends",
    kicker: "Friends",
    accent: ACCENTS.friends,
    headline: "Television is better together.",
    body:
      "Follow friends, trade reviews, and argue about finales in the comments. Spoilers stay hidden until you've caught up.",
    vignette: <FriendsVignette />,
  },
  {
    key: "calendar",
    kicker: "Calendar",
    accent: ACCENTS.calendar,
    headline: "Never miss a premiere.",
    body:
      "A release calendar built from your shows tells you exactly what airs tonight, this week, and beyond — with a nudge when it matters.",
    vignette: <CalendarVignette />,
  },
];

const FEATURE_TILES: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}> = [
  {
    icon: "checkmark-circle-outline",
    title: "Episode-level tracking",
    body: "Progress that follows every season, special, and rewatch.",
  },
  {
    icon: "eye-off-outline",
    title: "Spoiler-safe reviews",
    body: "Write freely — spoilers stay blurred for anyone not caught up.",
  },
  {
    icon: "sparkles-outline",
    title: "Vibe search",
    body: "Find shows by mood, not just title. Powered by your taste.",
  },
  {
    icon: "calendar-outline",
    title: "Release calendar",
    body: "Your shows, mapped week by week. Digest alerts optional.",
  },
  {
    icon: "stats-chart-outline",
    title: "Watching insights",
    body: "Streaks, genres, and hours — your year in television.",
  },
  {
    icon: "lock-closed-outline",
    title: "Private by default",
    body: "A private account is one switch away. Your diary is yours.",
  },
];

function LandingNav({ isWide }: { isWide: boolean }) {
  return (
    <View style={styles.nav} pointerEvents="box-none">
      <View style={[styles.navInner, { maxWidth: CONTENT_MAX_WIDTH + 48 }]}>
        <View className="flex-row items-center gap-2.5">
          <BrandMark size={30} />
          <Text className="text-[19px] font-black tracking-tight text-text-primary">
            Plotlist
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          {isWide ? <GhostCta label="Sign in" /> : null}
          <PrimaryCta label="Get started" />
        </View>
      </View>
    </View>
  );
}

function Hero({ isWide }: { isWide: boolean }) {
  return (
    <View style={styles.hero}>
      <HeroPosterWall />
      <View style={styles.heroContent}>
        <View>
          <Text
            className="text-center font-black text-text-primary"
            style={{
              fontSize: isWide ? 84 : 46,
              lineHeight: isWide ? 88 : 50,
              letterSpacing: isWide ? -3 : -1.2,
              maxWidth: 900,
            }}
          >
            Never lose the plot.
          </Text>
        </View>
        <View>
          <Text
            className="mt-6 text-center text-text-secondary"
            style={{
              fontSize: isWide ? 21 : 16.5,
              lineHeight: isWide ? 32 : 25,
              maxWidth: 640,
            }}
          >
            Plotlist is the beautiful way to keep up with television — every
            episode tracked, every rating remembered, every finale argued
            over with friends.
          </Text>
        </View>
        <View className="mt-9 flex-row items-center gap-4">
          <PrimaryCta label="Get started — it's free" large />
        </View>
        <View>
          <Text className="mt-4 text-center text-[13px] text-text-tertiary">
            Sign in with your phone or Apple ID. Also on iPhone.
          </Text>
        </View>
      </View>
    </View>
  );
}

function FeatureSection({
  feature,
  index,
  isWide,
}: {
  feature: Feature;
  index: number;
  isWide: boolean;
}) {
  const flip = index % 2 === 1;
  const copy = (
    <View style={isWide ? styles.featureCopyWide : styles.featureCopyNarrow}>
      <Kicker label={feature.kicker} accent={feature.accent} />
      <Text
        className="mt-4 font-black tracking-tight text-text-primary"
        style={{ fontSize: isWide ? 40 : 30, lineHeight: isWide ? 46 : 36 }}
      >
        {feature.headline}
      </Text>
      <Text
        className="mt-4 text-text-secondary"
        style={{ fontSize: 16.5, lineHeight: 26, maxWidth: 440 }}
      >
        {feature.body}
      </Text>
    </View>
  );
  const visual = (
    <View style={isWide ? styles.featureVisualWide : styles.featureVisualNarrow}>
      {feature.vignette}
    </View>
  );
  return (
    <View
      style={[
        styles.featureSection,
        isWide && {
          flexDirection: flip ? "row-reverse" : "row",
          alignItems: "center",
          gap: 72,
        },
      ]}
    >
      {copy}
      {visual}
    </View>
  );
}

function Interstitial({ isWide }: { isWide: boolean }) {
  return (
    <View style={styles.interstitial}>
      <Text
        className="text-center font-black tracking-tight text-text-primary"
        style={{
          fontSize: isWide ? 44 : 30,
          lineHeight: isWide ? 54 : 38,
          maxWidth: 760,
        }}
      >
        The shows you love deserve better than a
        {" "}
        <Text style={{ color: "#5A6070" }}>half-remembered note</Text>
        {" "}
        on your phone.
      </Text>
    </View>
  );
}

function FeatureGrid({ isWide }: { isWide: boolean }) {
  return (
    <View style={styles.grid}>
      {FEATURE_TILES.map((tile) => (
        <View
          key={tile.title}
          style={[styles.gridTile, { width: isWide ? "31.5%" : "100%" }]}
        >
          <Ionicons
            name={tile.icon}
            size={22}
            color="#38BDF8"
            accessible={false}
            aria-hidden={true}
          />
          <Text className="mt-3 text-[16px] font-bold text-text-primary">
            {tile.title}
          </Text>
          <Text className="mt-1.5 text-[13.5px] leading-5 text-text-secondary">
            {tile.body}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FinalCta({ isWide }: { isWide: boolean }) {
  return (
    <View style={styles.finalCta}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(56,189,248,0.0)", "rgba(56,189,248,0.07)", "rgba(56,189,248,0.0)"]}
        style={StyleSheet.absoluteFill}
      />
      <BrandMark size={44} />
      <Text
        className="mt-7 text-center font-black tracking-tight text-text-primary"
        style={{ fontSize: isWide ? 56 : 36, lineHeight: isWide ? 62 : 42 }}
      >
        Start your Plotlist.
      </Text>
      <Text className="mt-4 max-w-[440px] text-center text-[16px] leading-6 text-text-secondary">
        Free to use, a minute to set up. The next episode is waiting.
      </Text>
      <View className="mt-8">
        <PrimaryCta label="Get started — it's free" large />
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer}>
      <View style={[styles.footerInner, { maxWidth: CONTENT_MAX_WIDTH }]}>
        <View className="flex-row items-center gap-2">
          <BrandMark size={22} />
          <Text className="text-[14px] font-bold text-text-secondary">Plotlist</Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-x-6 gap-y-2">
          {[
            { label: "Terms", href: "/legal/terms" },
            { label: "Privacy", href: "/legal/privacy" },
            { label: "Guidelines", href: "/legal/guidelines" },
            { label: "Sign in", href: "/sign-in" },
          ].map((link) => (
            <Pressable
              key={link.label}
              onPress={() => router.push(link.href as never)}
              accessibilityRole="link"
              className="hover:opacity-80"
            >
              <Text className="text-[13px] font-medium text-text-tertiary">
                {link.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-[12.5px] text-text-tertiary">
          © {new Date().getFullYear()} Plotlist
        </Text>
      </View>
    </View>
  );
}

export function LandingPage() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <Hero isWide={isWide} />
        <View style={[styles.content, { maxWidth: CONTENT_MAX_WIDTH }]}>
          {FEATURES.map((feature, index) => (
            <FeatureSection
              key={feature.key}
              feature={feature}
              index={index}
              isWide={isWide}
            />
          ))}
        </View>
        <Interstitial isWide={isWide} />
        <View style={[styles.content, { maxWidth: CONTENT_MAX_WIDTH }]}>
          <FeatureGrid isWide={isWide} />
        </View>
        <FinalCta isWide={isWide} />
        <Footer />
      </ScrollView>
      <LandingNav isWide={isWide} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
  content: {
    alignSelf: "center",
    paddingHorizontal: 24,
    width: "100%",
  },

  // Nav
  nav: {
    alignItems: "center",
    left: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 50,
  },
  navInner: {
    alignItems: "center",
    backgroundColor: "rgba(13,15,20,0.72)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
    width: "100%",
    ...(typeof document !== "undefined"
      ? { backdropFilter: "blur(18px)" as unknown as undefined }
      : null),
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: "#38BDF8",
    justifyContent: "center",
  },

  // CTAs
  ctaSmall: {
    minHeight: 40,
    paddingHorizontal: 18,
  },
  ctaLarge: {
    minHeight: 52,
    paddingHorizontal: 28,
  },

  // Hero
  hero: {
    minHeight: 620,
    overflow: "hidden",
    paddingBottom: 40,
  },
  wallFrame: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  wallTilt: {
    left: "-6%",
    position: "absolute",
    right: "-6%",
    top: -60,
    transform: [{ rotateZ: "-3deg" }],
  },
  marqueeRowClip: {
    height: POSTER_H,
    marginBottom: POSTER_GAP,
    overflow: "hidden",
  },
  marqueeRow: {
    flexDirection: "row",
    gap: POSTER_GAP,
  },
  marqueePoster: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    height: POSTER_H,
    overflow: "hidden",
    width: POSTER_W,
  },
  heroContent: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 220,
  },

  // Kicker
  kickerDash: {
    borderRadius: 2,
    height: 3,
    width: 22,
  },

  // Feature sections
  featureSection: {
    paddingVertical: 72,
  },
  featureCopyWide: {
    flex: 41,
  },
  featureCopyNarrow: {
    marginBottom: 28,
  },
  featureVisualWide: {
    flex: 59,
  },
  featureVisualNarrow: {},

  // Vignettes
  vignetteCard: {
    backgroundColor: "#11141B",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    ...(typeof document !== "undefined"
      ? { boxShadow: "0 32px 80px rgba(0,0,0,0.45)" }
      : null),
  },
  trackHero: {
    height: 240,
  },
  trackHeroBadge: {
    backgroundColor: "rgba(11,13,18,0.72)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    borderWidth: 1,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: "absolute",
    top: 14,
  },
  trackHeroFooter: {
    alignItems: "flex-end",
    bottom: 0,
    flexDirection: "row",
    left: 0,
    padding: 18,
    position: "absolute",
    right: 0,
  },
  watchedCheck: {
    alignItems: "center",
    backgroundColor: "#38BDF8",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  progressTrack: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    height: 5,
    overflow: "hidden",
  },
  progressFill: {
    borderRadius: 3,
    height: "100%",
  },
  upNextRow: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  upNextThumb: {
    backgroundColor: "#1A1F29",
    borderRadius: 8,
    height: 54,
    overflow: "hidden",
    width: 36,
  },
  diaryRow: {
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  diaryThumb: {
    backgroundColor: "#1A1F29",
    borderRadius: 9,
    height: 66,
    overflow: "hidden",
    width: 44,
  },
  spoilerChip: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  searchField: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(56,189,248,0.35)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  moodChip: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  resultPoster: {
    aspectRatio: 2 / 3,
    backgroundColor: "#1A1F29",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
  },
  resultPosterLead: {
    borderColor: "rgba(56,189,248,0.55)",
  },
  matchBadge: {
    backgroundColor: "#38BDF8",
    borderRadius: 999,
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: "absolute",
  },
  activityRow: {
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  commentBubble: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    borderTopLeftRadius: 4,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  calendarRow: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  calendarThumb: {
    backgroundColor: "#1A1F29",
    borderRadius: 9,
    height: 44,
    overflow: "hidden",
    width: 78,
  },
  liveDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },

  // Interstitial / grid / final
  interstitial: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 110,
  },
  grid: {
    columnGap: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    paddingBottom: 40,
    rowGap: 20,
  },
  gridTile: {
    backgroundColor: "#11141B",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
    borderWidth: 1,
    flexGrow: 1,
    padding: 22,
  },
  finalCta: {
    alignItems: "center",
    marginTop: 40,
    paddingHorizontal: 24,
    paddingVertical: 110,
  },
  footer: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.07)",
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  footerInner: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
    width: "100%",
  },
});
