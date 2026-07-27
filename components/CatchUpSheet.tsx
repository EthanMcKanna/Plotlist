import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAccent } from "../lib/appearanceStore";
import { api } from "../lib/plotlist/api";
import { useAction } from "../lib/plotlist/react";
import { presentProPaywall } from "../lib/purchases";
import { useIsDesktopWeb, useWebSheetStyle } from "../lib/webLayout";

// "Where was I?" — a spoiler-safe "previously on" generated up to exactly
// the episode the viewer stopped at. The brief itself comes from
// catchup:getBrief; this sheet owns loading, the quota paywall, and a
// module-level result cache so a remount inside the 15-minute session never
// spends a second free brief.

type CatchupEpisodeRef = {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
};

type CatchupResult = {
  sessionId: string;
  remaining: number | null;
  showId: string;
  stop: CatchupEpisodeRef;
  nextEpisode: CatchupEpisodeRef | null;
  brief: {
    storySoFar: Array<{ title: string; body: string }>;
    lastTime: string;
    keyPlayers: Array<{ name: string; note: string }>;
    // Absent on cached v1 briefs.
    openThreads?: string[];
  };
};

type CatchUpSheetProps = {
  visible: boolean;
  onClose: () => void;
  showId: string;
  showTitle: string;
  // Optional: invoked with the episode to pick up from when the viewer taps
  // the resume CTA (after the sheet closes itself).
  onResume?: (episode: CatchupEpisodeRef | null) => void;
};

// Matches the server's 15-minute catch-up session window (kept slightly
// shorter so a cached sessionId is still valid when reused).
const RESULT_CACHE_TTL_MS = 14 * 60 * 1000;
const resultCache = new Map<string, { result: CatchupResult; at: number }>();

function episodeCode(episode: CatchupEpisodeRef) {
  return `S${episode.seasonNumber}E${episode.episodeNumber}`;
}

function errorCodeOf(error: unknown) {
  return (error as { code?: string })?.code ?? "";
}

function errorMessageOf(error: unknown) {
  return String((error as Error)?.message ?? error);
}

export function CatchUpSheet({
  visible,
  onClose,
  showId,
  showTitle,
  onResume,
}: CatchUpSheetProps) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const isDesktopWeb = useIsDesktopWeb();
  const webSheetStyle = useWebSheetStyle();
  const { height: windowHeight } = useWindowDimensions();
  const getBrief = useAction(api.catchup.getBrief);

  const [result, setResult] = useState<CatchupResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "locked" | "error">(
    "loading",
  );
  const [errorText, setErrorText] = useState<string | null>(null);

  const run = useCallback(async () => {
    const cached = resultCache.get(showId);
    if (cached && Date.now() - cached.at < RESULT_CACHE_TTL_MS) {
      setResult(cached.result);
      setPhase("ready");
      return;
    }
    setPhase("loading");
    setErrorText(null);
    try {
      const fetched = (await getBrief({
        showId,
        sessionId: cached?.result.sessionId,
      })) as CatchupResult;
      resultCache.set(showId, { result: fetched, at: Date.now() });
      setResult(fetched);
      setPhase("ready");
    } catch (error) {
      const code = errorCodeOf(error);
      const message = errorMessageOf(error);
      if (code === "catchup_quota_exceeded" || message.includes("catchup_quota_exceeded")) {
        setPhase("locked");
        return;
      }
      if (code === "catchup_no_progress" || message.includes("catchup_no_progress")) {
        setErrorText(
          "Mark where you're up to in the episode guide first — then we can catch you up.",
        );
      } else {
        setErrorText("Couldn't put your catch-up together. Try again in a moment.");
      }
      setPhase("error");
    }
  }, [getBrief, showId]);

  // The sheet is reused across shows (continue page) — never let one show's
  // brief flash while another's loads.
  useEffect(() => {
    setResult(null);
    setPhase("loading");
    setErrorText(null);
  }, [showId]);

  useEffect(() => {
    if (!visible) return;
    void run();
  }, [visible, run]);

  const handleUpgrade = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const outcome = await presentProPaywall();
    if (outcome === "purchased" || outcome === "restored") {
      await run();
    }
  }, [run]);

  const handleResume = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    onResume?.(result?.nextEpisode ?? null);
  }, [onClose, onResume, result]);

  const brief = result?.brief;
  const sheetBody = (
    <View className="flex-1" style={{ backgroundColor: "#0D0F14" }}>
      <View className="flex-row items-center justify-between border-b border-dark-border px-6 py-4">
        <Pressable
          accessibilityLabel="Close"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClose();
          }}
        >
          <Text className="text-[16px] text-text-tertiary">Close</Text>
        </Pressable>
        <Text className="text-[16px] font-semibold text-text-primary">Where was I?</Text>
        {/* Spacer keeps the title centered. */}
        <Text className="text-[16px] opacity-0">Close</Text>
      </View>

      {phase === "loading" ? (
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator size="large" color={accent.ramp[500]} />
          <Text className="mt-4 text-center text-[15px] font-semibold text-text-primary">
            Catching you up…
          </Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-text-tertiary">
            Rebuilding the story up to your last episode. Takes a few seconds.
          </Text>
        </View>
      ) : phase === "locked" ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="lock-closed" size={28} color="#6B7280" />
          <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
            You've used this month's free catch-ups
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
            Plotlist Pro includes unlimited "Where was I?" briefs — for every show you
            ever come back to.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Plotlist Pro"
            onPress={handleUpgrade}
            className="mt-5 rounded-full px-6 py-3 active:opacity-80"
            style={{ backgroundColor: accent.ramp[500] }}
          >
            <Text className="text-[15px] font-bold text-dark-bg">Upgrade to Pro</Text>
          </Pressable>
        </View>
      ) : phase === "error" ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={28} color="#6B7280" />
          <Text className="mt-4 text-center text-[15px] leading-6 text-text-secondary">
            {errorText}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void run()}
            className="mt-5 rounded-full border border-dark-border px-6 py-3 active:opacity-80"
          >
            <Text className="text-[14px] font-semibold text-text-primary">Try again</Text>
          </Pressable>
        </View>
      ) : brief && result ? (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <Text className="text-[20px] font-bold text-text-primary" numberOfLines={2}>
            {showTitle}
          </Text>
          <Text className="mt-1 text-[13px] font-semibold text-brand-300">
            You're caught up through {episodeCode(result.stop)}
            {result.stop.name ? ` · “${result.stop.name}”` : ""}
          </Text>

          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="shield-checkmark-outline" size={13} color="#8A93A6" />
            <Text className="text-[12px] text-text-tertiary">
              Spoiler-safe — only covers episodes you've watched
            </Text>
          </View>
          {result.remaining != null ? (
            <Text className="mt-1.5 text-[12px] text-text-tertiary">
              {result.remaining} free {result.remaining === 1 ? "catch-up" : "catch-ups"}{" "}
              left this month
            </Text>
          ) : null}

          {brief.storySoFar.map((section, index) => (
            <View key={`${section.title}-${index}`} className="mt-6">
              <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                {section.title}
              </Text>
              <Text className="mt-2 text-[15px] leading-6 text-text-secondary">
                {section.body}
              </Text>
            </View>
          ))}

          {brief.lastTime ? (
            <View
              className="mt-6 rounded-2xl border p-4"
              style={{
                backgroundColor: accent.rgba(400, 0.08),
                borderColor: accent.rgba(400, 0.35),
              }}
            >
              <Text className="text-xs font-bold uppercase tracking-widest text-brand-300">
                Right before you stopped
              </Text>
              <Text className="mt-2 text-[15px] leading-6 text-text-primary">
                {brief.lastTime}
              </Text>
            </View>
          ) : null}

          {brief.keyPlayers.length > 0 ? (
            <View className="mt-6">
              <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Where everyone stands
              </Text>
              <View className="mt-2 gap-2.5">
                {brief.keyPlayers.map((player) => (
                  <View key={player.name} className="flex-row gap-2">
                    <Text className="text-[14px] font-bold text-text-primary">
                      {player.name}
                    </Text>
                    <Text className="flex-1 text-[14px] leading-5 text-text-secondary">
                      {player.note}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {brief.openThreads && brief.openThreads.length > 0 ? (
            <View className="mt-6">
              <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Open questions
              </Text>
              <View className="mt-2 gap-2">
                {brief.openThreads.map((thread) => (
                  <View key={thread} className="flex-row gap-2">
                    <Ionicons
                      name="help-circle-outline"
                      size={16}
                      color={accent.ramp[400]}
                      style={{ marginTop: 2 }}
                    />
                    <Text className="flex-1 text-[14px] leading-5 text-text-secondary">
                      {thread}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jump back in"
            onPress={handleResume}
            className="mt-8 flex-row items-center justify-center gap-2 rounded-full py-3.5 active:opacity-80"
            style={{ backgroundColor: accent.ramp[500] }}
          >
            <Ionicons name="play" size={16} color="#0D0F14" />
            <Text className="text-[15px] font-bold text-dark-bg">
              {result.nextEpisode
                ? `Pick up with ${episodeCode(result.nextEpisode)}${
                    result.nextEpisode.name ? ` · “${result.nextEpisode.name}”` : ""
                  }`
                : "Jump back in"}
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={isDesktopWeb}
      animationType={isDesktopWeb ? "fade" : "slide"}
      presentationStyle={isDesktopWeb ? "overFullScreen" : "pageSheet"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {isDesktopWeb ? (
        <Pressable onPress={onClose} className="flex-1 justify-center bg-black/50 px-6">
          <Pressable onPress={(e) => e.stopPropagation()} style={webSheetStyle}>
            <View
              className="overflow-hidden rounded-3xl border border-dark-border"
              // Definite height so the sheet's flex-1 scroll area resolves
              // inside the centered dialog.
              style={{ height: Math.min(680, windowHeight - 96) }}
            >
              {sheetBody}
            </View>
          </Pressable>
        </Pressable>
      ) : (
        sheetBody
      )}
    </Modal>
  );
}
