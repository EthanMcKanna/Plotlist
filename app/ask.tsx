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
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../components/EmptyState";
import { GlassPressable } from "../components/NativeGlass";
import { Screen } from "../components/Screen";
import {
  ASK_MOOD_CHIPS,
  ASK_TIME_CHIPS,
  REFINEMENT_CHIP_ORDER,
  REFINEMENT_CHIPS,
  type AskMoodChipId,
  type AskTimeChipId,
} from "../lib/askPlotlist";
import { useAccent } from "../lib/appearanceStore";
import { api } from "../lib/plotlist/api";
import { useAuth, useAction, useQuery } from "../lib/plotlist/react";
import { notifyError } from "../lib/dialogs";
import { guardedPush } from "../lib/navigation";
import { presentProPaywall } from "../lib/purchases";
import { STREAMING_PROVIDER_OPTIONS } from "../lib/streamingProviders";
import { SHOW_BACK_BUTTON, WEB_READING_MAX_WIDTH } from "../lib/webLayout";

const POSTER_WIDTH = 44;
const POSTER_HEIGHT = 66;

const PROVIDER_LABEL_BY_KEY = new Map(
  STREAMING_PROVIDER_OPTIONS.map((option) => [option.key, option.label] as const),
);

const EXAMPLE_PROMPTS = [
  "or describe a vibe… “a cozy mystery in a small town”",
  "or describe a vibe… “funny but smart, nothing depressing”",
  "or describe a vibe… “short sci-fi I can finish this week”",
];

type AskPick = {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  reason: string;
  onWatchlist: boolean;
  providerKeys: string[];
};

type AskResult = {
  sessionId: string;
  picks: AskPick[];
  remaining: number | null;
};

function lightHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function Chip({
  label,
  selected,
  onPress,
  icon,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  accessibilityLabel?: string;
}) {
  const accent = useAccent();
  return (
    <GlassPressable
      onPress={onPress}
      radius={999}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      borderColor={selected ? accent.rgba(400, 0.65) : undefined}
      fallbackColor={selected ? accent.rgba(400, 0.16) : undefined}
      tintColor={selected ? accent.rgba(400, 0.22) : undefined}
      contentStyle={styles.chipContent}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={selected ? accent.ramp[400] : "#9BA1B0"}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        className="text-[13px] font-bold"
        style={{ color: selected ? accent.ramp[400] : "#C7CCD6" }}
      >
        {label}
      </Text>
    </GlassPressable>
  );
}

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

function PickRow({ pick, rank }: { pick: AskPick; rank: number }) {
  const providerLabels = pick.providerKeys
    .map((key) => PROVIDER_LABEL_BY_KEY.get(key))
    .filter((label): label is string => Boolean(label))
    .slice(0, 2);
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
          {rank}. {pick.title}
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

export default function AskPlotlistScreen() {
  const accent = useAccent();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const askPlotlist = useAction(api.embeddings.askPlotlist);
  const askStatus = useQuery(
    api.embeddings.getAskStatus,
    isAuthenticated ? {} : "skip",
  ) as { isPro: boolean; remaining: number | null } | undefined;

  const [time, setTime] = useState<AskTimeChipId | null>(null);
  const [mood, setMood] = useState<AskMoodChipId | null>(null);
  const [onMyServices, setOnMyServices] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [refiningChip, setRefiningChip] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
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

  return (
    <Screen scroll webMaxWidth={WEB_READING_MAX_WIDTH}>
      <View style={{ paddingBottom: insets.bottom + 48 }} className="px-6">
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
            {!isPro && typeof remaining === "number" ? (
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
            Tell me what you're in the mood for — I'll pick tonight's show.
          </Text>
        </View>

        <Text className="mt-6 text-[12px] font-bold uppercase tracking-wider text-text-tertiary">
          Time
        </Text>
        <View className="mt-2 flex-row flex-wrap" style={styles.chipRow}>
          {ASK_TIME_CHIPS.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              selected={time === chip.id}
              onPress={() => {
                lightHaptic();
                setTime((current) => (current === chip.id ? null : chip.id));
              }}
            />
          ))}
        </View>

        <Text className="mt-4 text-[12px] font-bold uppercase tracking-wider text-text-tertiary">
          Mood
        </Text>
        <View className="mt-2 flex-row flex-wrap" style={styles.chipRow}>
          {ASK_MOOD_CHIPS.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              selected={mood === chip.id}
              onPress={() => {
                lightHaptic();
                setMood((current) => (current === chip.id ? null : chip.id));
              }}
            />
          ))}
        </View>

        <View className="mt-4 flex-row" style={styles.chipRow}>
          <Chip
            label="Only my services"
            icon="tv-outline"
            selected={onMyServices}
            accessibilityLabel="Only shows on my streaming services"
            onPress={() => {
              lightHaptic();
              setOnMyServices((current) => !current);
            }}
          />
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={EXAMPLE_PROMPTS[placeholderIndex]}
          placeholderTextColor="#6D7484"
          accessibilityLabel="Describe what you want to watch"
          multiline
          className="mt-5 rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-[16px] text-text-primary"
          style={[
            styles.textInput,
            Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null,
          ]}
          returnKeyType="search"
          blurOnSubmit
          onSubmitEditing={() => void runAsk()}
        />

        <Pressable
          onPress={() => {
            lightHaptic();
            void runAsk();
          }}
          disabled={anyBusy}
          accessibilityRole="button"
          accessibilityLabel="Find me something to watch"
          style={[
            styles.askButton,
            { backgroundColor: accent.ramp[400] },
            anyBusy ? styles.askButtonBusy : null,
          ]}
          className="web:transition-opacity hover:opacity-90 active:opacity-80"
          testID="ask-submit"
        >
          {loading ? (
            <ActivityIndicator color="#0D0F14" size="small" />
          ) : (
            <Ionicons name="sparkles" size={16} color="#0D0F14" />
          )}
          <Text className="text-[15px] font-bold" style={styles.askButtonLabel}>
            {loading ? "Picking…" : "Find me something"}
          </Text>
        </Pressable>

        {result ? (
          <View className="mt-8" testID="ask-results">
            <Text className="text-[12px] font-bold uppercase tracking-wider text-text-tertiary">
              Tonight's picks
            </Text>
            <View className="mt-3">
              {result.picks.length === 0 ? (
                <EmptyState
                  title="Nothing matched"
                  description="Try loosening a filter or describing the vibe differently."
                />
              ) : (
                result.picks.map((pick, index) => (
                  <PickRow key={pick.showId} pick={pick} rank={index + 1} />
                ))
              )}
            </View>

            {result.picks.length > 0 ? (
              <>
                <Text className="mt-5 text-[12px] font-bold uppercase tracking-wider text-text-tertiary">
                  Refine
                </Text>
                <View className="mt-2 flex-row flex-wrap" style={styles.chipRow}>
                  {REFINEMENT_CHIP_ORDER.map((chipId) => (
                    <Chip
                      key={chipId}
                      label={
                        refiningChip === chipId
                          ? "…"
                          : REFINEMENT_CHIPS[chipId].label
                      }
                      selected={refiningChip === chipId}
                      onPress={() => handleRefine(chipId)}
                    />
                  ))}
                </View>
                <Text className="mt-2 text-[11px] text-text-tertiary">
                  Refinements don't use up your asks.
                </Text>
              </>
            ) : null}
          </View>
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
    paddingVertical: 14,
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
  chipContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipRow: {
    gap: 8,
  },
  pickPoster: {
    borderRadius: 8,
    height: POSTER_HEIGHT,
    width: POSTER_WIDTH,
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
  textInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },
});
