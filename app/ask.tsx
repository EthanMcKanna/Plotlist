import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../components/EmptyState";
import { GlassPressable } from "../components/NativeGlass";
import { PageTitle } from "../components/PageTitle";
import { Screen } from "../components/Screen";
import { ShimmerBlock } from "../components/ShowDetailSkeleton";
import {
  ASK_MOOD_CHIPS,
  ASK_TIME_CHIPS,
  REFINEMENT_CHIP_ORDER,
  REFINEMENT_CHIPS,
  type AskMoodChipId,
  type AskTimeChipId,
} from "../lib/askPlotlist";
import { type AccentTheme } from "../lib/appearance";
import { useAccent } from "../lib/appearanceStore";
import { api } from "../lib/plotlist/api";
import { useAuth, useAction, useMutation, useQuery } from "../lib/plotlist/react";
import { notify, notifyError } from "../lib/dialogs";
import { withAlpha } from "../lib/genreExplorer";
import { guardedPush } from "../lib/navigation";
import { presentProPaywall } from "../lib/purchases";
import { STREAMING_PROVIDER_OPTIONS } from "../lib/streamingProviders";
import { SHOW_BACK_BUTTON, WEB_READING_MAX_WIDTH } from "../lib/webLayout";

const PROVIDER_LABEL_BY_KEY = new Map(
  STREAMING_PROVIDER_OPTIONS.map((option) => [option.key, option.label] as const),
);

// Suggestions are tappable, not a rotating placeholder. A placeholder that
// rewrites itself every few seconds moves text under the user while they're
// reading it; these say the same thing and can actually be used.
const EXAMPLE_PROMPTS = [
  "a cozy mystery in a small town",
  "funny but smart, nothing depressing",
  "short sci-fi I can finish this week",
];

const MEMORY_EXAMPLE_PROMPTS = [
  "that show with the time loop I watched last winter",
  "the cooking competition we binged last year",
  "that dark mystery about a missing girl",
];

// Phrases the memory parser understands — tappable tokens that append to the
// query so the time-window feature is discoverable, not a hidden easter egg.
const MEMORY_TIME_TOKENS = ["last winter", "last month", "last year", "recently"] as const;

// Memory mode wears a fixed warm amber (independent of the user's accent
// theme) so the two modes read as two distinct places.
const MEMORY_AMBER = "#F59E0B";
const MEMORY_AMBER_TEXT = "#FBBF24";
const memoryRgba = (alpha: number) => `rgba(245, 158, 11, ${alpha})`;

const MOOD_EMOJI: Record<AskMoodChipId, string> = {
  cozy: "🕯️",
  funny: "😄",
  tense: "😬",
  mind_bending: "🌀",
  background: "📺",
  surprise: "🎲",
};

// `short` keeps the chip row to one line; the full label + duration still
// reaches screen readers through accessibilityLabel.
const TIME_META: Record<
  AskTimeChipId,
  { icon: React.ComponentProps<typeof Ionicons>["name"]; short: string; sub: string }
> = {
  quick: { icon: "flash", short: "Quick", sub: "~30m" },
  full: { icon: "tv", short: "Full", sub: "~1h" },
  binge: { icon: "moon", short: "Binge", sub: "all night" },
};

const REFINEMENT_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  funnier: "happy-outline",
  darker: "moon-outline",
  cozier: "cafe-outline",
  shorter: "flash-outline",
  newer: "sparkles-outline",
  older: "hourglass-outline",
  more_like_1: "copy-outline",
};

type AskMode = "discover" | "memory";

type AskPick = {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  reason: string;
  onWatchlist: boolean;
  providerKeys: string[];
};

type AskConstraintsPayload = {
  semanticQuery: string;
  [key: string]: unknown;
};

type AskResult = {
  sessionId: string;
  picks: AskPick[];
  remaining: number | null;
  // Present once the deployed worker echoes the parsed query back; old
  // responses simply hide the save button.
  constraints?: AskConstraintsPayload;
  displayQuery?: string;
};

type MemoryMatch = {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  watchedLabel: string | null;
  status: string | null;
};

type MemoryResult = {
  matches: MemoryMatch[];
  windowLabel: string | null;
};

const MEMORY_STATUS_META: Record<string, { label: string; color: string }> = {
  watching: { label: "Watching", color: "#38BDF8" },
  caught_up: { label: "Caught up", color: "#38BDF8" },
  finished: { label: "Finished", color: "#34D399" },
  completed: { label: "Finished", color: "#34D399" },
  paused: { label: "Paused", color: "#FACC15" },
  dropped: { label: "Dropped", color: "#9BA1B0" },
};

// One line of text at rest, growing to roughly four before it scrolls. iOS
// sizes a multiline TextInput to its content between these bounds; web pins
// it at the minimum (see the numberOfLines note on the field) and scrolls,
// which is how every other input in the app behaves.
const COMPOSER_MIN_HEIGHT = 48;
const COMPOSER_MAX_HEIGHT = 132;

function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

// ── Building blocks ─────────────────────────────────────────────────────────

// Small uppercase group label, matching SectionHeader's `uppercase` variant.
function GroupLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
      {children}
    </Text>
  );
}

// One chip shape for every optional control on this screen — moods, lengths,
// the services toggle, suggestions, refinements. Dynamic (selected) colors go
// in a static style object and hover/active stay in className: a Pressable
// with a style *function* plus className silently drops the function styles on
// web.
function Chip({
  label,
  selected = false,
  tint,
  icon,
  emoji,
  trailing,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  selected?: boolean;
  tint: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  emoji?: string;
  trailing?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.55) }
          : null,
      ]}
      className="web:transition-colors hover:bg-dark-hover active:opacity-80"
    >
      {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={selected ? tint : "#9BA1B0"}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        className="text-[13px] font-semibold"
        style={{ color: selected ? tint : "#C7CCD6" }}
      >
        {label}
      </Text>
      {trailing ? (
        <Text className="text-[11px] font-semibold text-text-tertiary">{trailing}</Text>
      ) : null}
    </Pressable>
  );
}

// ── Mode switcher: segmented control with a sliding, mode-colored thumb ─────

function ModeSwitch({
  mode,
  accent,
  onChange,
}: {
  mode: AskMode;
  accent: AccentTheme;
  onChange: (mode: AskMode) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const position = useSharedValue(mode === "discover" ? 0 : 1);

  const segmentWidth = trackWidth > 0 ? (trackWidth - 8) / 2 : 0;

  useEffect(() => {
    // Same spring as components/SegmentedControl so both controls settle
    // identically.
    position.value = withSpring(mode === "discover" ? 0 : 1, {
      damping: 20,
      stiffness: 250,
      mass: 0.7,
    });
  }, [mode, position]);

  const thumbStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: position.value * segmentWidth }],
    }),
    [segmentWidth],
  );

  const thumbTint = mode === "discover" ? accent.rgba(400, 0.18) : memoryRgba(0.16);
  const thumbBorder = mode === "discover" ? accent.rgba(400, 0.5) : memoryRgba(0.45);

  return (
    <View
      style={styles.modeTrack}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.modeThumb,
            thumbStyle,
            { width: segmentWidth, backgroundColor: thumbTint, borderColor: thumbBorder },
          ]}
          pointerEvents="none"
        />
      ) : null}
      <Pressable
        onPress={() => {
          lightHaptic();
          onChange("discover");
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === "discover" }}
        accessibilityLabel="Find something new"
        style={styles.modeSegment}
        testID="ask-mode-discover"
      >
        <Ionicons
          name="sparkles"
          size={14}
          color={mode === "discover" ? accent.ramp[400] : "#5A6070"}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
        <Text
          className="text-[14px] font-bold"
          style={{ color: mode === "discover" ? accent.ramp[300] : "#9BA1B0" }}
        >
          Discover
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          lightHaptic();
          onChange("memory");
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: mode === "memory" }}
        accessibilityLabel="Search shows you've already watched"
        style={styles.modeSegment}
        testID="ask-mode-memory"
      >
        <Ionicons
          name="play-back"
          size={14}
          color={mode === "memory" ? MEMORY_AMBER : "#5A6070"}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
        <Text
          className="text-[14px] font-bold"
          style={{ color: mode === "memory" ? MEMORY_AMBER_TEXT : "#9BA1B0" }}
        >
          My history
        </Text>
      </Pressable>
    </View>
  );
}

// ── Result pieces ───────────────────────────────────────────────────────────

function Badge({ label, tone }: { label: string; tone: "watchlist" | "provider" }) {
  return (
    <View
      style={[styles.badge, tone === "watchlist" ? styles.badgeWatchlist : styles.badgeProvider]}
    >
      <Text
        className="text-[10px] font-bold"
        style={{ color: tone === "watchlist" ? "#34D399" : "#9BA1B0" }}
      >
        {label}
      </Text>
    </View>
  );
}

function providerLabelsFor(pick: AskPick) {
  return pick.providerKeys
    .map((key) => PROVIDER_LABEL_BY_KEY.get(key))
    .filter((label): label is string => Boolean(label))
    .slice(0, 2);
}

function PosterThumb({
  uri,
  style,
  iconSize,
}: {
  uri: string | null;
  style: object;
  iconSize: number;
}) {
  if (!uri) {
    return (
      <View style={[style, styles.pickPosterFallback]}>
        <Ionicons name="tv-outline" size={iconSize} color="#5A6070" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
    />
  );
}

function TitleLine({
  title,
  year,
  size,
}: {
  title: string;
  year: number | null;
  size: "lg" | "md";
}) {
  return (
    <Text
      className={
        size === "lg"
          ? "text-[17px] font-bold text-text-primary"
          : "text-[15px] font-bold text-text-primary"
      }
      numberOfLines={1}
    >
      {title}
      {year ? (
        <Text
          className={
            size === "lg"
              ? "text-[14px] font-semibold text-text-tertiary"
              : "text-[13px] font-semibold text-text-tertiary"
          }
        >
          {"  "}
          {year}
        </Text>
      ) : null}
    </Text>
  );
}

// The #1 pick gets a feature treatment: bigger poster, accent ribbon, roomier
// reason. Everything after it stays a compact ranked row.
function TopPickCard({ pick, accent }: { pick: AskPick; accent: AccentTheme }) {
  const providerLabels = providerLabelsFor(pick);
  return (
    <Pressable
      onPress={() => {
        lightHaptic();
        guardedPush(`/show/${pick.showId}`);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${pick.title}, tonight's top pick`}
      style={[styles.topPickCard, { borderColor: accent.rgba(400, 0.35) }]}
      className="web:transition-opacity hover:opacity-90 active:opacity-80"
    >
      <LinearGradient
        colors={[accent.rgba(500, 0.16), "rgba(0,0,0,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <PosterThumb uri={pick.posterUrl} style={styles.topPickPoster} iconSize={22} />
      <View className="ml-3.5 flex-1">
        <View style={[styles.topPickRibbon, { backgroundColor: accent.rgba(400, 0.18) }]}>
          <Ionicons
            name="trophy"
            size={10}
            color={accent.ramp[300]}
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
          <Text
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: accent.ramp[300] }}
          >
            Top pick
          </Text>
        </View>
        <View className="mt-1.5">
          <TitleLine title={pick.title} year={pick.year} size="lg" />
        </View>
        <Text className="mt-1 text-[13px] leading-[19px] text-text-secondary" numberOfLines={3}>
          {pick.reason}
        </Text>
        {pick.onWatchlist || providerLabels.length > 0 ? (
          <View className="mt-2 flex-row flex-wrap" style={styles.badgeRow}>
            {pick.onWatchlist ? <Badge label="On your watchlist" tone="watchlist" /> : null}
            {providerLabels.map((label) => (
              <Badge key={label} label={`On ${label}`} tone="provider" />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// One row shape for both modes: discover passes a rank bubble + reason,
// history passes the watched/status meta line.
function ResultRow({
  showId,
  title,
  year,
  posterUrl,
  rank,
  accent,
  reason,
  badges,
  meta,
}: {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  rank?: number;
  accent?: AccentTheme;
  reason?: string;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={() => {
        lightHaptic();
        guardedPush(`/show/${showId}`);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      style={styles.pickRow}
      className="web:transition-colors hover:bg-dark-hover active:opacity-80"
    >
      {rank !== undefined && accent ? (
        <View style={[styles.rankBubble, { backgroundColor: accent.rgba(400, 0.14) }]}>
          <Text className="text-[11px] font-bold" style={{ color: accent.ramp[300] }}>
            {rank}
          </Text>
        </View>
      ) : null}
      <PosterThumb uri={posterUrl} style={styles.pickPoster} iconSize={18} />
      <View className="ml-3 flex-1">
        <TitleLine title={title} year={year} size="md" />
        {reason ? (
          <Text className="mt-1 text-[13px] leading-[18px] text-text-secondary" numberOfLines={2}>
            {reason}
          </Text>
        ) : null}
        {meta}
        {badges}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color="#5A6070"
        accessible={false}
        accessibilityElementsHidden
        aria-hidden={true}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

function PickRow({ pick, rank, accent }: { pick: AskPick; rank: number; accent: AccentTheme }) {
  const providerLabels = providerLabelsFor(pick);
  return (
    <ResultRow
      showId={pick.showId}
      title={pick.title}
      year={pick.year}
      posterUrl={pick.posterUrl}
      rank={rank}
      accent={accent}
      reason={pick.reason}
      badges={
        pick.onWatchlist || providerLabels.length > 0 ? (
          <View className="mt-1.5 flex-row flex-wrap" style={styles.badgeRow}>
            {pick.onWatchlist ? <Badge label="On your watchlist" tone="watchlist" /> : null}
            {providerLabels.map((label) => (
              <Badge key={label} label={`On ${label}`} tone="provider" />
            ))}
          </View>
        ) : null
      }
    />
  );
}

function MemoryRow({ match }: { match: MemoryMatch }) {
  const statusMeta = match.status ? MEMORY_STATUS_META[match.status] ?? null : null;
  return (
    <ResultRow
      showId={match.showId}
      title={match.title}
      year={match.year}
      posterUrl={match.posterUrl}
      meta={
        <View className="mt-1.5 flex-row items-center" style={styles.memoryMetaRow}>
          {match.watchedLabel ? (
            <View className="flex-row items-center" style={styles.memoryMetaItem}>
              <Ionicons
                name="time-outline"
                size={12}
                color="#9BA1B0"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
              <Text className="text-[12px] text-text-secondary">{match.watchedLabel}</Text>
            </View>
          ) : null}
          {statusMeta ? (
            <View className="flex-row items-center" style={styles.memoryMetaItem}>
              <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
              <Text className="text-[12px] text-text-secondary">{statusMeta.label}</Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

// Mirrors the real row geometry so the list doesn't jump when picks land.
function ResultsSkeleton() {
  return (
    <View testID="ask-results-skeleton">
      <View style={[styles.topPickCard, styles.skeletonCard]}>
        <ShimmerBlock width={66} height={99} radius={10} />
        <View className="ml-3.5 flex-1">
          <ShimmerBlock width={72} height={16} radius={999} />
          <ShimmerBlock width="70%" height={17} radius={6} style={{ marginTop: 8 }} />
          <ShimmerBlock width="100%" height={13} radius={6} style={{ marginTop: 8 }} />
          <ShimmerBlock width="85%" height={13} radius={6} style={{ marginTop: 6 }} />
        </View>
      </View>
      {[0, 1, 2].map((index) => (
        <View key={index} style={[styles.pickRow, styles.skeletonCard]}>
          <ShimmerBlock width={44} height={66} radius={8} />
          <View className="ml-3 flex-1">
            <ShimmerBlock width="60%" height={15} radius={6} />
            <ShimmerBlock width="95%" height={13} radius={6} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AskPlotlistScreen() {
  const accent = useAccent();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const askPlotlist = useAction(api.embeddings.askPlotlist);
  const searchMemory = useAction(api.embeddings.searchMemory);
  const createFromVibe = useMutation(api.lists.createFromVibe);
  const askStatus = useQuery(api.embeddings.getAskStatus, isAuthenticated ? {} : "skip") as
    | { isPro: boolean; remaining: number | null }
    | undefined;

  const [mode, setMode] = useState<AskMode>("discover");
  const [time, setTime] = useState<AskTimeChipId | null>(null);
  const [mood, setMood] = useState<AskMoodChipId | null>(null);
  const [onMyServices, setOnMyServices] = useState(false);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refiningChip, setRefiningChip] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [memoryResult, setMemoryResult] = useState<MemoryResult | null>(null);
  const [savedList, setSavedList] = useState<{ listId: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [remainingOverride, setRemainingOverride] = useState<number | null | undefined>(undefined);
  const busyRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  // Set when a fresh ask/search succeeds so the results block scrolls itself
  // into view once it has laid out. Refinements skip it — you're already
  // looking at the list.
  const pendingScrollRef = useRef(false);
  const resultsYRef = useRef(0);

  const isPro = askStatus?.isPro === true;
  const remaining = remainingOverride !== undefined ? remainingOverride : askStatus?.remaining ?? null;

  // Reveals the results block once we know where it is. Two triggers, because
  // neither covers both cases: the first search learns the offset from
  // onLayout, while a repeat search that returns the same number of rows never
  // re-lays-out and only the state effect fires. Whichever runs first with a
  // measured offset wins; the pending flag keeps it to one scroll.
  const scrollToResults = useCallback(() => {
    if (!pendingScrollRef.current || resultsYRef.current <= 0) return;
    pendingScrollRef.current = false;
    scrollRef.current?.scrollTo({ y: Math.max(0, resultsYRef.current - 16), animated: true });
  }, []);

  useEffect(() => {
    if (!pendingScrollRef.current) return;
    const timer = setTimeout(scrollToResults, 120);
    return () => clearTimeout(timer);
  }, [result, memoryResult, scrollToResults]);

  const runAsk = useCallback(
    async (args: { refinement?: string; sessionId?: string; excludeShowIds?: string[] } = {}) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const isRefinement = Boolean(args.refinement);
      if (isRefinement) {
        setRefiningChip(args.refinement!);
      } else {
        setLoading(true);
      }
      try {
        const response = (await askPlotlist({
          text: text.trim() || undefined,
          chips: { time, mood, onMyServices },
          ...args,
        })) as AskResult;
        setResult(response);
        setSavedList(null);
        setRemainingOverride(response.remaining);
        if (!isRefinement) pendingScrollRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        const code = (error as { code?: string })?.code ?? "";
        const message = String((error as Error)?.message ?? error);
        if (code === "ask_quota_exceeded" || message.includes("ask_quota_exceeded")) {
          const outcome = await presentProPaywall();
          if (outcome === "purchased" || outcome === "restored") {
            busyRef.current = false;
            setLoading(false);
            setRefiningChip(null);
            await runAsk(args);
            return;
          }
        } else {
          notifyError("Couldn't find picks", "Something went wrong. Try again in a moment.");
        }
      } finally {
        busyRef.current = false;
        setLoading(false);
        setRefiningChip(null);
      }
    },
    [askPlotlist, text, time, mood, onMyServices],
  );

  const handleRefine = useCallback(
    (chipId: string) => {
      if (!result) return;
      lightHaptic();
      void runAsk({
        refinement: chipId,
        sessionId: result.sessionId,
        excludeShowIds: result.picks.map((pick) => pick.showId),
      });
    },
    [result, runAsk],
  );

  const runMemorySearch = useCallback(
    async (overrideText?: string) => {
      const query = (overrideText ?? text).trim();
      if (busyRef.current || query.length < 2) return;
      busyRef.current = true;
      setLoading(true);
      try {
        const response = (await searchMemory({
          text: query,
          utcOffsetMinutes: -new Date().getTimezoneOffset(),
        })) as MemoryResult;
        setMemoryResult(response);
        pendingScrollRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        notifyError("Couldn't search your history", "Something went wrong. Try again in a moment.");
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [searchMemory, text],
  );

  // "Save this vibe" → a smart list that keeps updating as new shows are
  // ingested. Pro-only server-side; the paywall handles the upsell.
  const handleSaveVibe = useCallback(async () => {
    if (saving || !result?.constraints) return;
    if (savedList) {
      guardedPush(`/list/${savedList.listId}`);
      return;
    }
    lightHaptic();
    setSaving(true);
    try {
      const saved = (await createFromVibe({
        query: result.displayQuery ?? text.trim() ?? "My vibe",
        constraints: result.constraints,
      })) as { listId: string; added: number; title: string };
      setSavedList({ listId: saved.listId, title: saved.title });
      notify("Vibe saved", `“${saved.title}” will keep updating as new matches are ingested.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      const message = String((error as Error)?.message ?? error);
      if (code === "pro_required" || message.includes("pro_required")) {
        const outcome = await presentProPaywall();
        if (outcome === "purchased" || outcome === "restored") {
          setSaving(false);
          await handleSaveVibe();
          return;
        }
      } else {
        notifyError("Couldn't save this vibe", "Something went wrong. Try again in a moment.");
      }
    } finally {
      setSaving(false);
    }
  }, [saving, savedList, result, createFromVibe, text]);

  const appendTimeToken = useCallback((token: string) => {
    lightHaptic();
    setText((current) => {
      const trimmed = current.trim();
      if (trimmed.toLowerCase().includes(token)) return current;
      return trimmed.length > 0 ? `${trimmed} ${token}` : token;
    });
  }, []);

  const fillPrompt = useCallback(
    (prompt: string, andRun: boolean) => {
      lightHaptic();
      setText(prompt);
      if (andRun) void runMemorySearch(prompt);
      else inputRef.current?.focus();
    },
    [runMemorySearch],
  );

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen>
        <PageTitle title="Ask Plotlist" />
        <View className="flex-1 px-6 pt-6">
          <EmptyState
            title="Sign in to ask"
            description="Ask Plotlist learns your taste to pick tonight's show for you."
          />
        </View>
      </Screen>
    );
  }

  const anyBusy = loading || refiningChip !== null;
  const isDiscover = mode === "discover";
  const modeColor = isDiscover ? accent.ramp[400] : MEMORY_AMBER;
  const glowColor = isDiscover ? accent.rgba(500, 0.1) : memoryRgba(0.09);
  // Discover can run on chips alone; history needs something to match against.
  const canSubmit = isDiscover || text.trim().length >= 2;

  return (
    <Screen
      scroll
      webMaxWidth={WEB_READING_MAX_WIDTH}
      scrollRef={scrollRef}
      backgroundOverlay={
        <LinearGradient colors={[glowColor, "rgba(0,0,0,0)"]} style={styles.headerGlow} />
      }
    >
      <PageTitle title="Ask Plotlist" />
      <View style={{ paddingBottom: insets.bottom + 48 }} className="px-6">
        <View className="flex-row items-center pt-1" style={styles.headerRow}>
          {SHOW_BACK_BUTTON ? (
            <GlassPressable
              onPress={() => {
                lightHaptic();
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              radius={20}
              variant="control"
              contentStyle={styles.backChip}
            >
              <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
            </GlassPressable>
          ) : null}
          <Text
            accessibilityRole="header"
            className="min-w-0 flex-1 text-[28px] font-black leading-[32px] text-text-primary"
          >
            Ask Plotlist
          </Text>
          {isDiscover && !isPro && typeof remaining === "number" ? (
            <View
              style={[
                styles.quotaPill,
                {
                  backgroundColor: accent.rgba(400, 0.12),
                  borderColor: accent.rgba(400, 0.35),
                },
              ]}
              testID="ask-quota-pill"
            >
              <Text className="text-[11px] font-bold" style={{ color: accent.ramp[400] }}>
                {remaining} free ask{remaining === 1 ? "" : "s"} left
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-1.5 text-[13px] leading-[18px] text-text-tertiary">
          {isDiscover
            ? "Tell me what you're in the mood for — I'll pick tonight's show."
            : "Describe a show you half-remember — I'll find it in your history."}
        </Text>

        <View className="mt-4">
          <ModeSwitch mode={mode} accent={accent} onChange={setMode} />
        </View>

        {/* The composer leads. It sits high enough that the ScrollView's
            automaticallyAdjustKeyboardInsets is all the keyboard handling this
            screen needs — no manual scroll-to-keyboard fighting it. */}
        <View
          style={[
            styles.composer,
            { borderColor: focused ? `${modeColor}C7` : "rgba(255,255,255,0.08)" },
          ]}
          className="mt-3 flex-row"
        >
          <Ionicons
            name={isDiscover ? "sparkles-outline" : "play-back-outline"}
            size={16}
            color={focused ? modeColor : "#6D7484"}
            style={styles.composerIcon}
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              isDiscover
                ? "Describe the vibe you're after…"
                : "Describe what you remember…"
            }
            placeholderTextColor="#6D7484"
            accessibilityLabel={
              isDiscover ? "Describe what you want to watch" : "Describe a show you watched"
            }
            multiline
            // Web renders multiline as a <textarea>, which defaults to two
            // rows and would leave a blank second line under the caret.
            // numberOfLines maps to `rows`, but only apply it on web — on iOS
            // it caps growth, and there the field should grow with the text.
            {...(Platform.OS === "web" ? { numberOfLines: 1 } : null)}
            // fontSize only — text-base's lineHeight misaligns iOS inputs.
            className="flex-1 text-[16px] text-text-primary"
            style={[
              styles.composerInput,
              // The frame's border is the focus treatment; without this the
              // browser draws its own ring inside the rounded field.
              Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null,
            ]}
            returnKeyType="search"
            blurOnSubmit
            onSubmitEditing={() => (isDiscover ? void runAsk() : void runMemorySearch())}
          />
          {text.length > 0 ? (
            <Pressable
              onPress={() => {
                lightHaptic();
                setText("");
                inputRef.current?.focus();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear"
              {...(Platform.OS === "web" ? { title: "Clear" } : null)}
              style={styles.composerClear}
              className="web:transition-colors hover:bg-white/20 active:opacity-70"
            >
              <Ionicons
                name="close"
                size={15}
                color="#C7CCD6"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
            </Pressable>
          ) : null}
        </View>

        {/* Suggestions. Discover fills only — running one would silently spend
            a free ask. History searches are free, so those run on tap. */}
        <View className="mt-2.5 flex-row flex-wrap" style={styles.chipRow}>
          {(isDiscover ? EXAMPLE_PROMPTS : MEMORY_EXAMPLE_PROMPTS).map((example) => (
            <Chip
              key={example}
              label={example}
              tint={modeColor}
              icon="chatbubble-ellipses-outline"
              accessibilityLabel={
                isDiscover ? `Use example: ${example}` : `Search for ${example}`
              }
              onPress={() => fillPrompt(example, !isDiscover)}
            />
          ))}
        </View>

        {isDiscover ? (
          <>
            <View className="mt-5">
              <GroupLabel>Mood</GroupLabel>
              <View className="flex-row flex-wrap" style={styles.chipRow}>
                {ASK_MOOD_CHIPS.map((chip) => (
                  <Chip
                    key={chip.id}
                    label={chip.label}
                    emoji={MOOD_EMOJI[chip.id]}
                    tint={modeColor}
                    selected={mood === chip.id}
                    onPress={() => {
                      lightHaptic();
                      setMood((current) => (current === chip.id ? null : chip.id));
                    }}
                  />
                ))}
              </View>
            </View>

            <View className="mt-4">
              <GroupLabel>Length</GroupLabel>
              <View className="flex-row flex-wrap" style={styles.chipRow}>
                {ASK_TIME_CHIPS.map((chip) => {
                  const meta = TIME_META[chip.id];
                  return (
                    <Chip
                      key={chip.id}
                      label={meta.short}
                      trailing={meta.sub}
                      icon={meta.icon}
                      tint={modeColor}
                      selected={time === chip.id}
                      accessibilityLabel={`${chip.label}, ${meta.sub}`}
                      onPress={() => {
                        lightHaptic();
                        setTime((current) => (current === chip.id ? null : chip.id));
                      }}
                    />
                  );
                })}
                <Chip
                  label="Only my services"
                  icon={onMyServices ? "checkmark-circle" : "tv-outline"}
                  tint={modeColor}
                  selected={onMyServices}
                  accessibilityLabel="Only shows on my streaming services"
                  onPress={() => {
                    lightHaptic();
                    setOnMyServices((current) => !current);
                  }}
                />
              </View>
            </View>
          </>
        ) : (
          <View className="mt-5">
            <GroupLabel>Add a time</GroupLabel>
            <View className="flex-row flex-wrap" style={styles.chipRow}>
              {MEMORY_TIME_TOKENS.map((token) => (
                <Chip
                  key={token}
                  label={token}
                  icon="add"
                  tint={MEMORY_AMBER}
                  selected={text.toLowerCase().includes(token)}
                  accessibilityLabel={`Add "${token}" to your search`}
                  onPress={() => appendTimeToken(token)}
                />
              ))}
            </View>
          </View>
        )}

        <Pressable
          onPress={() => {
            lightHaptic();
            if (isDiscover) void runAsk();
            else void runMemorySearch();
          }}
          disabled={anyBusy || !canSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled: anyBusy || !canSubmit, busy: loading }}
          accessibilityLabel={isDiscover ? "Find me something to watch" : "Search my watch history"}
          style={[
            styles.askButton,
            { backgroundColor: modeColor },
            anyBusy || !canSubmit ? styles.askButtonDisabled : null,
          ]}
          className="web:transition-opacity hover:opacity-90 active:opacity-80"
          testID="ask-submit"
        >
          {loading ? (
            <ActivityIndicator color="#0D0F14" size="small" />
          ) : (
            <Ionicons name={isDiscover ? "sparkles" : "search"} size={16} color="#0D0F14" />
          )}
          <Text className="text-[15px] font-bold" style={styles.askButtonLabel}>
            {loading
              ? isDiscover
                ? "Picking…"
                : "Searching…"
              : isDiscover
                ? "Find me something"
                : "Search my history"}
          </Text>
        </Pressable>

        {!isDiscover ? (
          <Text className="mt-2 text-center text-[11px] text-text-tertiary">
            Searches only shows you've watched — doesn't use your asks.
          </Text>
        ) : null}

        {loading ? (
          <View className="mt-8">
            <ResultsSkeleton />
          </View>
        ) : null}

        {/* onLayout belongs on the Animated.View — it is the direct child of
            the page column, so its layout.y is the scroll offset. Measured on
            a child inside it, layout.y would be relative to that animated
            parent, i.e. always 0. */}
        {!loading && !isDiscover && memoryResult ? (
          <Animated.View
            entering={FadeInDown.duration(300)}
            onLayout={(event) => {
              resultsYRef.current = event.nativeEvent.layout.y;
              scrollToResults();
            }}
          >
            <View className="mt-8" testID="memory-results">
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-bold text-text-primary">From your history</Text>
                {memoryResult.windowLabel ? (
                  <View style={styles.windowCapsule}>
                    <Ionicons
                      name="play-back"
                      size={11}
                      color={MEMORY_AMBER}
                      accessible={false}
                      accessibilityElementsHidden
                      aria-hidden={true}
                      importantForAccessibility="no"
                    />
                    <Text
                      className="text-[11px] font-bold"
                      style={{ color: MEMORY_AMBER_TEXT }}
                    >
                      {memoryResult.windowLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="mt-3">
                {memoryResult.matches.length === 0 ? (
                  <EmptyState
                    title="Nothing rang a bell"
                    description="Try describing the plot, setting, or a character — or widen the time frame."
                  />
                ) : (
                  memoryResult.matches.map((match) => (
                    <MemoryRow key={match.showId} match={match} />
                  ))
                )}
              </View>
            </View>
          </Animated.View>
        ) : null}

        {!loading && isDiscover && result ? (
          <Animated.View
            entering={FadeInDown.duration(300)}
            onLayout={(event) => {
              resultsYRef.current = event.nativeEvent.layout.y;
              scrollToResults();
            }}
          >
            <View className="mt-8" testID="ask-results">
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-bold text-text-primary">Tonight's picks</Text>
                {result.picks.length > 0 && result.constraints ? (
                  <Pressable
                    onPress={() => void handleSaveVibe()}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={
                      savedList ? "Open your saved vibe list" : "Save this vibe as a smart list"
                    }
                    style={[
                      styles.saveVibeButton,
                      {
                        backgroundColor: accent.rgba(400, 0.12),
                        borderColor: accent.rgba(400, 0.35),
                      },
                      saving ? styles.askButtonDisabled : null,
                    ]}
                    className="web:transition-opacity hover:opacity-90 active:opacity-80"
                    testID="ask-save-vibe"
                  >
                    {saving ? (
                      <ActivityIndicator color={accent.ramp[400]} size="small" />
                    ) : (
                      <Ionicons
                        name={savedList ? "checkmark-circle" : "bookmark-outline"}
                        size={13}
                        color={accent.ramp[400]}
                        accessible={false}
                        accessibilityElementsHidden
                        aria-hidden={true}
                        importantForAccessibility="no"
                      />
                    )}
                    <Text className="text-[12px] font-bold" style={{ color: accent.ramp[400] }}>
                      {savedList ? "View list" : "Save this vibe"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <View className="mt-3">
                {result.picks.length === 0 ? (
                  <EmptyState
                    title="Nothing matched"
                    description="Try loosening a filter or describing the vibe differently."
                  />
                ) : (
                  <>
                    <TopPickCard pick={result.picks[0]} accent={accent} />
                    {result.picks.slice(1).map((pick, index) => (
                      <PickRow key={pick.showId} pick={pick} rank={index + 2} accent={accent} />
                    ))}
                  </>
                )}
              </View>

              {result.picks.length > 0 ? (
                <View className="mt-5">
                  <GroupLabel>Nudge it</GroupLabel>
                  <View className="flex-row flex-wrap" style={styles.chipRow}>
                    {REFINEMENT_CHIP_ORDER.map((chipId) => {
                      const active = refiningChip === chipId;
                      return (
                        <Chip
                          key={chipId}
                          label={active ? "…" : REFINEMENT_CHIPS[chipId].label}
                          icon={REFINEMENT_ICONS[chipId] ?? "options-outline"}
                          tint={modeColor}
                          selected={active}
                          accessibilityLabel={REFINEMENT_CHIPS[chipId].label}
                          onPress={() => handleRefine(chipId)}
                        />
                      );
                    })}
                  </View>
                  <Text className="mt-2 text-[11px] text-text-tertiary">
                    Refinements don't use up your asks.
                  </Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  askButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 20,
    paddingVertical: 15,
  },
  askButtonDisabled: {
    opacity: 0.5,
  },
  askButtonLabel: {
    color: "#0D0F14",
  },
  backChip: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  badge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeProvider: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  badgeRow: {
    gap: 6,
  },
  badgeWatchlist: {
    backgroundColor: "rgba(52,211,153,0.1)",
    borderColor: "rgba(52,211,153,0.4)",
  },
  chip: {
    alignItems: "center",
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipRow: {
    gap: 8,
  },
  composer: {
    // Top-aligned, not stretched: a stretched textarea fills the row's cross
    // size, so resetting its height to `auto` to re-measure would report the
    // row's current height instead of the text's and the field could only
    // ever grow.
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.055)",
    // Between the app's input radius (8) and card radius (16): it shares this
    // radius with the mode switch it stacks under.
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  composerClear: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    height: 26,
    justifyContent: "center",
    marginTop: 11,
    width: 26,
  },
  composerIcon: {
    // Aligns with the first line of text rather than centering against a
    // growing box.
    marginTop: 15,
  },
  composerInput: {
    marginLeft: 9,
    // One line tall at rest, growing with the text up to a cap — never an
    // empty multi-line well.
    maxHeight: COMPOSER_MAX_HEIGHT,
    minHeight: COMPOSER_MIN_HEIGHT,
    paddingBottom: 13,
    paddingTop: 13,
    textAlignVertical: "top",
  },
  headerGlow: {
    // Rendered via Screen's backgroundOverlay: full-bleed from the physical
    // top of the screen (behind the status bar / notch), fading out before
    // mid-page. Low alpha keeps it ambient on desktop web too.
    height: 300,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  headerRow: {
    gap: 10,
  },
  memoryMetaItem: {
    gap: 5,
    marginRight: 12,
  },
  memoryMetaRow: {
    flexWrap: "wrap",
  },
  modeSegment: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 9,
  },
  modeThumb: {
    borderRadius: 9,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    position: "absolute",
    top: 4,
  },
  modeTrack: {
    backgroundColor: "rgba(17,19,24,0.92)",
    borderColor: "#2A2E38",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4,
  },
  pickPoster: {
    borderRadius: 8,
    height: 66,
    width: 44,
  },
  pickPosterFallback: {
    alignItems: "center",
    backgroundColor: "#1B2029",
    justifyContent: "center",
  },
  pickRow: {
    alignItems: "center",
    backgroundColor: "#161A22",
    borderColor: "#2A2E38",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quotaPill: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rankBubble: {
    alignItems: "center",
    borderRadius: 999,
    height: 22,
    justifyContent: "center",
    marginRight: 10,
    width: 22,
  },
  saveVibeButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  skeletonCard: {
    alignItems: "flex-start",
    borderColor: "#2A2E38",
  },
  statusDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  topPickCard: {
    backgroundColor: "#161A22",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    overflow: "hidden",
    padding: 14,
  },
  topPickPoster: {
    borderRadius: 10,
    height: 99,
    width: 66,
  },
  topPickRibbon: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  windowCapsule: {
    alignItems: "center",
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.4)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
