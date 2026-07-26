import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
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
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
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
import { guardedPush } from "../lib/navigation";
import { presentProPaywall } from "../lib/purchases";
import { STREAMING_PROVIDER_OPTIONS } from "../lib/streamingProviders";
import { SHOW_BACK_BUTTON, WEB_READING_MAX_WIDTH } from "../lib/webLayout";

const PROVIDER_LABEL_BY_KEY = new Map(
  STREAMING_PROVIDER_OPTIONS.map((option) => [option.key, option.label] as const),
);

const EXAMPLE_PROMPTS = [
  "a cozy mystery in a small town…",
  "funny but smart, nothing depressing…",
  "short sci-fi I can finish this week…",
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
const memoryRgba = (alpha: number) => `rgba(245, 158, 11, ${alpha})`;

const MOOD_EMOJI: Record<AskMoodChipId, string> = {
  cozy: "🕯️",
  funny: "😄",
  tense: "😬",
  mind_bending: "🌀",
  background: "📺",
  surprise: "🎲",
};

const TIME_META: Record<
  AskTimeChipId,
  { icon: React.ComponentProps<typeof Ionicons>["name"]; sub: string }
> = {
  quick: { icon: "flash", sub: "~30 min" },
  full: { icon: "tv", sub: "~1 hour" },
  binge: { icon: "moon", sub: "All night" },
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

function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  useEffect(() => {
    position.value = withTiming(mode === "discover" ? 0 : 1, { duration: 220 });
  }, [mode, position]);

  const segmentWidth = trackWidth > 0 ? (trackWidth - 8) / 2 : 0;
  const thumbStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: position.value * segmentWidth }],
    }),
    [segmentWidth],
  );

  const thumbTint = mode === "discover" ? accent.rgba(400, 0.2) : memoryRgba(0.18);
  const thumbBorder = mode === "discover" ? accent.rgba(400, 0.55) : memoryRgba(0.5);

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
            {
              width: segmentWidth,
              backgroundColor: thumbTint,
              borderColor: thumbBorder,
            },
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
          style={{ color: mode === "memory" ? "#FBBF24" : "#9BA1B0" }}
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
      style={[
        styles.badge,
        tone === "watchlist" ? styles.badgeWatchlist : styles.badgeProvider,
      ]}
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
      {pick.posterUrl ? (
        <Image
          source={{ uri: pick.posterUrl }}
          style={styles.topPickPoster}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View style={[styles.topPickPoster, styles.pickPosterFallback]}>
          <Ionicons name="tv-outline" size={22} color="#5A6070" />
        </View>
      )}
      <View className="ml-3.5 flex-1">
        <View
          style={[styles.topPickRibbon, { backgroundColor: accent.rgba(400, 0.18) }]}
        >
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
        <Text className="mt-1.5 text-[17px] font-bold text-text-primary" numberOfLines={1}>
          {pick.title}
          {pick.year ? (
            <Text className="text-[14px] font-semibold text-text-tertiary">
              {"  "}
              {pick.year}
            </Text>
          ) : null}
        </Text>
        <Text
          className="mt-1 text-[13px] leading-[19px] text-text-secondary"
          numberOfLines={3}
        >
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

function PickRow({
  pick,
  rank,
  accent,
}: {
  pick: AskPick;
  rank: number;
  accent: AccentTheme;
}) {
  const providerLabels = providerLabelsFor(pick);
  return (
    <Pressable
      onPress={() => {
        lightHaptic();
        guardedPush(`/show/${pick.showId}`);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${pick.title}`}
      style={styles.pickRow}
      className="web:transition-colors hover:bg-dark-hover active:opacity-80"
    >
      <View style={[styles.rankBubble, { backgroundColor: accent.rgba(400, 0.14) }]}>
        <Text className="text-[11px] font-bold" style={{ color: accent.ramp[300] }}>
          {rank}
        </Text>
      </View>
      {pick.posterUrl ? (
        <Image
          source={{ uri: pick.posterUrl }}
          style={styles.pickPoster}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View style={[styles.pickPoster, styles.pickPosterFallback]}>
          <Ionicons name="tv-outline" size={18} color="#5A6070" />
        </View>
      )}
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>
          {pick.title}
          {pick.year ? (
            <Text className="text-[13px] font-semibold text-text-tertiary">
              {"  "}
              {pick.year}
            </Text>
          ) : null}
        </Text>
        <Text
          className="mt-1 text-[13px] leading-[18px] text-text-secondary"
          numberOfLines={2}
        >
          {pick.reason}
        </Text>
        {pick.onWatchlist || providerLabels.length > 0 ? (
          <View className="mt-1.5 flex-row flex-wrap" style={styles.badgeRow}>
            {pick.onWatchlist ? <Badge label="On your watchlist" tone="watchlist" /> : null}
            {providerLabels.map((label) => (
              <Badge key={label} label={`On ${label}`} tone="provider" />
            ))}
          </View>
        ) : null}
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

function MemoryRow({ match }: { match: MemoryMatch }) {
  const statusMeta = match.status ? MEMORY_STATUS_META[match.status] ?? null : null;
  return (
    <Pressable
      onPress={() => {
        lightHaptic();
        guardedPush(`/show/${match.showId}`);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${match.title}`}
      style={styles.pickRow}
      className="web:transition-colors hover:bg-dark-hover active:opacity-80"
    >
      {match.posterUrl ? (
        <Image
          source={{ uri: match.posterUrl }}
          style={styles.pickPoster}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View style={[styles.pickPoster, styles.pickPosterFallback]}>
          <Ionicons name="tv-outline" size={18} color="#5A6070" />
        </View>
      )}
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>
          {match.title}
          {match.year ? (
            <Text className="text-[13px] font-semibold text-text-tertiary">
              {"  "}
              {match.year}
            </Text>
          ) : null}
        </Text>
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

// ── Screen ──────────────────────────────────────────────────────────────────

export default function AskPlotlistScreen() {
  const accent = useAccent();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const askPlotlist = useAction(api.embeddings.askPlotlist);
  const searchMemory = useAction(api.embeddings.searchMemory);
  const createFromVibe = useMutation(api.lists.createFromVibe);
  const askStatus = useQuery(
    api.embeddings.getAskStatus,
    isAuthenticated ? {} : "skip",
  ) as { isPro: boolean; remaining: number | null } | undefined;

  const [mode, setMode] = useState<AskMode>("discover");
  const [time, setTime] = useState<AskTimeChipId | null>(null);
  const [mood, setMood] = useState<AskMoodChipId | null>(null);
  const [onMyServices, setOnMyServices] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [refiningChip, setRefiningChip] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [memoryResult, setMemoryResult] = useState<MemoryResult | null>(null);
  const [savedList, setSavedList] = useState<{ listId: string; title: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [remainingOverride, setRemainingOverride] = useState<number | null | undefined>(
    undefined,
  );
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(
      () => setPlaceholderIndex((index) => (index + 1) % EXAMPLE_PROMPTS.length),
      5000,
    );
    return () => clearInterval(interval);
  }, []);

  const isPro = askStatus?.isPro === true;
  const remaining =
    remainingOverride !== undefined ? remainingOverride : askStatus?.remaining ?? null;

  const runAsk = useCallback(
    async (args: {
      refinement?: string;
      sessionId?: string;
      excludeShowIds?: string[];
    } = {}) => {
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
      notify(
        "Vibe saved",
        `“${saved.title}” will keep updating as new matches are ingested.`,
      );
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

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen>
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

  return (
    <Screen scroll webMaxWidth={WEB_READING_MAX_WIDTH}>
      <View style={{ paddingBottom: insets.bottom + 48 }} className="px-6">
        <LinearGradient
          colors={[glowColor, "rgba(0,0,0,0)"]}
          style={styles.headerGlow}
          pointerEvents="none"
        />
        <View className="pt-1">
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
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-[34px] font-bold text-text-primary">Ask Plotlist</Text>
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
          <Text className="mt-1 text-[14px] leading-5 text-text-tertiary">
            {isDiscover
              ? "Tell me what you're in the mood for — I'll pick tonight's show."
              : "Describe a show you half-remember — I'll find it in your history."}
          </Text>
        </View>

        <View className="mt-5">
          <ModeSwitch mode={mode} accent={accent} onChange={setMode} />
        </View>

        {isDiscover ? (
          <>
            <Text className="mt-6 text-[15px] font-bold text-text-primary">
              What's the mood?
            </Text>
            <View className="mt-3 flex-row flex-wrap" style={styles.moodGrid}>
              {ASK_MOOD_CHIPS.map((chip) => {
                const selected = mood === chip.id;
                return (
                  <Pressable
                    key={chip.id}
                    onPress={() => {
                      lightHaptic();
                      setMood((current) => (current === chip.id ? null : chip.id));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={chip.label}
                    style={[
                      styles.moodCard,
                      selected
                        ? {
                            backgroundColor: accent.rgba(400, 0.14),
                            borderColor: accent.rgba(400, 0.55),
                          }
                        : null,
                    ]}
                    className="web:transition-colors active:opacity-80"
                  >
                    <Text style={styles.moodEmoji}>{MOOD_EMOJI[chip.id]}</Text>
                    <Text
                      className="mt-1.5 text-[12px] font-bold"
                      style={{ color: selected ? accent.ramp[300] : "#C7CCD6" }}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mt-5 text-[15px] font-bold text-text-primary">
              How much time?
            </Text>
            <View className="mt-3 flex-row" style={styles.timeRow}>
              {ASK_TIME_CHIPS.map((chip, index) => {
                const selected = time === chip.id;
                const meta = TIME_META[chip.id];
                return (
                  <Pressable
                    key={chip.id}
                    onPress={() => {
                      lightHaptic();
                      setTime((current) => (current === chip.id ? null : chip.id));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${chip.label}, ${meta.sub}`}
                    style={[
                      styles.timeSegment,
                      index < ASK_TIME_CHIPS.length - 1 ? styles.timeSegmentDivider : null,
                      selected ? { backgroundColor: accent.rgba(400, 0.14) } : null,
                    ]}
                    className="web:transition-colors active:opacity-80"
                  >
                    <Ionicons
                      name={meta.icon}
                      size={16}
                      color={selected ? accent.ramp[400] : "#5A6070"}
                      accessible={false}
                      accessibilityElementsHidden
                      aria-hidden={true}
                      importantForAccessibility="no"
                    />
                    <Text
                      className="mt-1 text-[13px] font-bold"
                      style={{ color: selected ? accent.ramp[300] : "#C7CCD6" }}
                    >
                      {chip.label}
                    </Text>
                    <Text className="mt-0.5 text-[11px] text-text-tertiary">{meta.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => {
                lightHaptic();
                setOnMyServices((current) => !current);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: onMyServices }}
              accessibilityLabel="Only shows on my streaming services"
              style={styles.serviceRow}
              className="web:transition-colors active:opacity-80"
            >
              <Ionicons
                name="tv-outline"
                size={16}
                color={onMyServices ? accent.ramp[400] : "#5A6070"}
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
              <Text
                className="ml-2.5 flex-1 text-[14px] font-semibold"
                style={{ color: onMyServices ? "#F1F3F7" : "#C7CCD6" }}
              >
                Only my services
              </Text>
              <View
                style={[
                  styles.serviceCheck,
                  onMyServices
                    ? {
                        backgroundColor: accent.rgba(400, 0.9),
                        borderColor: accent.rgba(400, 0.9),
                      }
                    : null,
                ]}
              >
                {onMyServices ? (
                  <Ionicons
                    name="checkmark"
                    size={13}
                    color="#0D0F14"
                    accessible={false}
                    accessibilityElementsHidden
                    aria-hidden={true}
                    importantForAccessibility="no"
                  />
                ) : null}
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <Text className="mt-6 text-[15px] font-bold text-text-primary">
              Jog your memory
            </Text>
            <View className="mt-3">
              {MEMORY_EXAMPLE_PROMPTS.map((example) => (
                <Pressable
                  key={example}
                  onPress={() => {
                    lightHaptic();
                    setText(example);
                    void runMemorySearch(example);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Search for ${example}`}
                  style={styles.exampleRow}
                  className="web:transition-colors hover:bg-dark-hover active:opacity-80"
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={14}
                    color={MEMORY_AMBER}
                    accessible={false}
                    accessibilityElementsHidden
                    aria-hidden={true}
                    importantForAccessibility="no"
                  />
                  <Text
                    className="ml-2.5 flex-1 text-[13px] italic text-text-secondary"
                    numberOfLines={1}
                  >
                    “{example}”
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={13}
                    color="#5A6070"
                    accessible={false}
                    accessibilityElementsHidden
                    aria-hidden={true}
                    importantForAccessibility="no"
                  />
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={styles.inputWrap} className="mt-5">
          <Ionicons
            name={isDiscover ? "sparkles-outline" : "play-back-outline"}
            size={15}
            color={modeColor}
            style={styles.inputIcon}
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              isDiscover
                ? EXAMPLE_PROMPTS[placeholderIndex]
                : MEMORY_EXAMPLE_PROMPTS[placeholderIndex % MEMORY_EXAMPLE_PROMPTS.length]
            }
            placeholderTextColor="#6D7484"
            accessibilityLabel={
              isDiscover ? "Describe what you want to watch" : "Describe a show you watched"
            }
            multiline
            className="text-[16px] text-text-primary"
            style={[
              styles.textInput,
              Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null,
            ]}
            returnKeyType="search"
            blurOnSubmit
            onSubmitEditing={() =>
              isDiscover ? void runAsk() : void runMemorySearch()
            }
          />
        </View>

        {!isDiscover ? (
          <View className="mt-2.5 flex-row flex-wrap items-center" style={styles.tokenRow}>
            <Text className="text-[11px] font-semibold text-text-tertiary">Add a time:</Text>
            {MEMORY_TIME_TOKENS.map((token) => (
              <Pressable
                key={token}
                onPress={() => appendTimeToken(token)}
                accessibilityRole="button"
                accessibilityLabel={`Add "${token}" to your search`}
                style={styles.timeToken}
                className="web:transition-colors active:opacity-70"
              >
                <Text className="text-[11px] font-semibold" style={{ color: "#FBBF24" }}>
                  {token}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            lightHaptic();
            if (isDiscover) {
              void runAsk();
            } else {
              void runMemorySearch();
            }
          }}
          disabled={anyBusy}
          accessibilityRole="button"
          accessibilityLabel={
            isDiscover ? "Find me something to watch" : "Search my watch history"
          }
          style={[
            styles.askButton,
            { backgroundColor: isDiscover ? accent.ramp[400] : MEMORY_AMBER },
            anyBusy ? styles.askButtonBusy : null,
          ]}
          className="web:transition-opacity hover:opacity-90 active:opacity-80"
          testID="ask-submit"
        >
          {loading ? (
            <ActivityIndicator color="#0D0F14" size="small" />
          ) : (
            <Ionicons
              name={isDiscover ? "sparkles" : "search"}
              size={16}
              color="#0D0F14"
            />
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

        {!isDiscover && memoryResult ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View className="mt-8" testID="memory-results">
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-bold text-text-primary">
                  From your history
                </Text>
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
                    <Text className="text-[11px] font-bold" style={{ color: "#FBBF24" }}>
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

        {isDiscover && result ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View className="mt-8" testID="ask-results">
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-bold text-text-primary">
                  Tonight's picks
                </Text>
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
                      saving ? styles.askButtonBusy : null,
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
                    <Text
                      className="text-[12px] font-bold"
                      style={{ color: accent.ramp[400] }}
                    >
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
                      <PickRow
                        key={pick.showId}
                        pick={pick}
                        rank={index + 2}
                        accent={accent}
                      />
                    ))}
                  </>
                )}
              </View>

              {result.picks.length > 0 ? (
                <>
                  <Text className="mt-5 text-[13px] font-bold text-text-primary">
                    Nudge it
                  </Text>
                  <View className="mt-2 flex-row flex-wrap" style={styles.tokenRow}>
                    {REFINEMENT_CHIP_ORDER.map((chipId) => {
                      const active = refiningChip === chipId;
                      return (
                        <Pressable
                          key={chipId}
                          onPress={() => handleRefine(chipId)}
                          accessibilityRole="button"
                          accessibilityLabel={REFINEMENT_CHIPS[chipId].label}
                          style={[
                            styles.refineToken,
                            active
                              ? {
                                  backgroundColor: accent.rgba(400, 0.14),
                                  borderColor: accent.rgba(400, 0.5),
                                }
                              : null,
                          ]}
                          className="web:transition-colors active:opacity-80"
                        >
                          <Ionicons
                            name={REFINEMENT_ICONS[chipId] ?? "options-outline"}
                            size={12}
                            color={active ? accent.ramp[400] : "#9BA1B0"}
                            accessible={false}
                            accessibilityElementsHidden
                            aria-hidden={true}
                            importantForAccessibility="no"
                          />
                          <Text
                            className="text-[12px] font-semibold"
                            style={{ color: active ? accent.ramp[300] : "#C7CCD6" }}
                          >
                            {active ? "…" : REFINEMENT_CHIPS[chipId].label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="mt-2 text-[11px] text-text-tertiary">
                    Refinements don't use up your asks.
                  </Text>
                </>
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
    marginTop: 14,
    paddingVertical: 15,
  },
  askButtonBusy: {
    opacity: 0.75,
  },
  askButtonLabel: {
    color: "#0D0F14",
  },
  backButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    marginLeft: -10,
    width: 44,
  },
  badge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeProvider: {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  badgeRow: {
    gap: 6,
  },
  badgeWatchlist: {
    borderColor: "rgba(52,211,153,0.4)",
    backgroundColor: "rgba(52,211,153,0.1)",
  },
  exampleRow: {
    alignItems: "center",
    backgroundColor: "#141821",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerGlow: {
    // Large radius + low alpha keep the wash soft on desktop web, where the
    // content column floats over the page background and hard gradient edges
    // would read as a seam.
    borderRadius: 48,
    height: 260,
    left: -24,
    position: "absolute",
    right: -24,
    top: -12,
  },
  inputIcon: {
    left: 16,
    position: "absolute",
    top: 16,
  },
  inputWrap: {
    backgroundColor: "#141821",
    borderColor: "#2A2E38",
    borderRadius: 18,
    borderWidth: 1,
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
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 11,
  },
  modeThumb: {
    borderRadius: 12,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    position: "absolute",
    top: 4,
  },
  modeTrack: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4,
  },
  moodCard: {
    alignItems: "center",
    backgroundColor: "#141821",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    paddingVertical: 14,
  },
  moodEmoji: {
    fontSize: 24,
  },
  moodGrid: {
    gap: 8,
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
    backgroundColor: "#141821",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
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
  refineToken: {
    alignItems: "center",
    backgroundColor: "#141821",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
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
  serviceCheck: {
    alignItems: "center",
    borderColor: "#3A3F4A",
    borderRadius: 7,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  serviceRow: {
    alignItems: "center",
    backgroundColor: "#141821",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  textInput: {
    minHeight: 76,
    paddingBottom: 14,
    paddingLeft: 40,
    paddingRight: 16,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  timeRow: {
    backgroundColor: "#141821",
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  timeSegment: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 12,
  },
  timeSegmentDivider: {
    borderRightColor: "rgba(255,255,255,0.06)",
    borderRightWidth: 1,
  },
  timeToken: {
    borderColor: "rgba(245,158,11,0.45)",
    borderRadius: 999,
    borderStyle: "dashed",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tokenRow: {
    gap: 8,
  },
  topPickCard: {
    backgroundColor: "#141821",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 10,
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
