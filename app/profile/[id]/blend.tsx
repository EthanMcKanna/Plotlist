import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "../../../components/NativeGlass";
import { PageTitle } from "../../../components/PageTitle";
import { Poster } from "../../../components/Poster";
import { TasteMatchMeter } from "../../../components/TasteMatchSummary";
import { useAccent } from "../../../lib/appearanceStore";
import { guardedPush } from "../../../lib/navigation";
import { api } from "../../../lib/plotlist/api";
import { useAction, useAuth, useQuery } from "../../../lib/plotlist/react";
import { presentProPaywall } from "../../../lib/purchases";
import { queryClient } from "../../../lib/queryClient";
import { STREAMING_PROVIDER_OPTIONS } from "../../../lib/streamingProviders";
import {
  SHOW_BACK_BUTTON,
  useWebPageStyle,
  WEB_PAGE_MAX_WIDTH,
} from "../../../lib/webLayout";

// Blend ("For us"): shared picks for you + one friend — where your taste
// vectors overlap, minus everything either of you has watched, leaning into
// the services you both pay for. Server pipeline: blends:getBlend.

type BlendPick = {
  showId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  reason: string;
  providerKeys: string[];
  onSharedService: boolean;
  onViewerWatchlist: boolean;
  onPartnerWatchlist: boolean;
};

type BlendResult = {
  sessionId: string;
  remaining: number | null;
  partner: { id: string; name: string; username: string | null; avatarUrl: string | null };
  percent: number;
  duoLine: string | null;
  sharedFacets: Array<{ key: string; title: string; score: number }>;
  sharedProviders: string[];
  picks: BlendPick[];
};

const providerLabelByKey = new Map(
  STREAMING_PROVIDER_OPTIONS.map((option) => [option.key, option.label]),
);

function pressShow(pick: BlendPick) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const showQueryKey = ["plotlist-rpc", "query", "shows:get", { showId: pick.showId }];
  if (!queryClient.getQueryData(showQueryKey)) {
    queryClient.setQueryData(showQueryKey, {
      _id: pick.showId,
      id: pick.showId,
      title: pick.title,
      year: pick.year,
      posterUrl: pick.posterUrl,
      extendedDetails: null,
    });
    void queryClient.invalidateQueries({ queryKey: showQueryKey });
  }
  guardedPush(`/show/${pick.showId}`);
}

function errorCodeOf(error: unknown) {
  return (error as { code?: string })?.code ?? "";
}

export default function BlendScreen() {
  const accent = useAccent();
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const userIdValue = typeof params.id === "string" ? params.id : "";
  const pageStyle = useWebPageStyle(WEB_PAGE_MAX_WIDTH);

  const profile = useQuery(
    api.users.profile,
    isAuthenticated && userIdValue ? { userId: userIdValue } : "skip",
  );
  const getBlend = useAction(api.blends.getBlend);

  const [result, setResult] = useState<BlendResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "locked" | "error">(
    "loading",
  );
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const sessionRef = useRef<string | undefined>(undefined);

  const run = useCallback(async () => {
    if (!isAuthenticated || !userIdValue) return;
    setPhase("loading");
    setErrorCode(null);
    try {
      const fetched = (await getBlend({
        userId: userIdValue,
        sessionId: sessionRef.current,
      })) as BlendResult;
      sessionRef.current = fetched.sessionId;
      setResult(fetched);
      setPhase("ready");
    } catch (error) {
      const code = errorCodeOf(error);
      const message = String((error as Error)?.message ?? error);
      if (code === "blend_quota_exceeded" || message.includes("blend_quota_exceeded")) {
        setPhase("locked");
        return;
      }
      setErrorCode(code || message);
      setPhase("error");
    }
  }, [getBlend, isAuthenticated, userIdValue]);

  useEffect(() => {
    void run();
  }, [run]);

  const handleUpgrade = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const outcome = await presentProPaywall();
    if (outcome === "purchased" || outcome === "restored") {
      await run();
    }
  }, [run]);

  const profileUser = (profile as any)?.user;
  const displayName: string =
    result?.partner.name ??
    profileUser?.displayName ??
    profileUser?.name ??
    (profileUser?.username ? `@${profileUser.username}` : "your friend");

  const sharedProviderLabels = (result?.sharedProviders ?? [])
    .map((key) => providerLabelByKey.get(key))
    .filter((label): label is string => Boolean(label));

  const errorBody = (() => {
    if (errorCode?.includes("blend_partner_no_history")) {
      return {
        icon: "hourglass-outline" as const,
        title: `${displayName} isn't blendable yet`,
        detail: `A blend needs both of your watch histories. Tell ${displayName} to log a few shows they love — then come straight back.`,
      };
    }
    if (errorCode?.includes("blend_viewer_no_history")) {
      return {
        icon: "hourglass-outline" as const,
        title: "Your taste profile is still warming up",
        detail: "Log or rate a few shows you love first, so the blend has your side of the story.",
      };
    }
    return {
      icon: "cloud-offline-outline" as const,
      title: "Couldn't build your blend",
      detail: "Something went wrong. Try again in a moment.",
    };
  })();

  return (
    <View className="flex-1 bg-dark-bg">
      <PageTitle title="Blend" />
      {/* Header (band is full-bleed; inner content tracks the page column) */}
      <View
        className="pb-4 border-b border-dark-border"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="px-6" style={pageStyle}>
          <View className="flex-row items-center gap-3">
            {SHOW_BACK_BUTTON ? (
              <GlassPressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.back();
                }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                radius={20}
                variant="control"
                contentStyle={{
                  alignItems: "center",
                  height: 40,
                  justifyContent: "center",
                  width: 40,
                }}
              >
                <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
              </GlassPressable>
            ) : null}
            <View className="flex-1">
              <Text className="text-xl font-black text-text-primary">Blend</Text>
              <Text className="text-xs font-semibold text-text-tertiary" numberOfLines={1}>
                {`You + ${displayName}`}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {phase === "loading" ? (
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator size="large" color={accent.ramp[500]} />
          <Text className="mt-4 text-center text-[15px] font-semibold text-text-primary">
            Blending your tastes…
          </Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-text-tertiary">
            Finding shows neither of you has seen that fit you both.
          </Text>
        </View>
      ) : phase === "locked" ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="lock-closed" size={28} color="#6B7280" />
          <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
            You've used this month's free blends
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
            Plotlist Pro includes unlimited blends — one for every friend, roommate, and
            long-distance watch partner.
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
          <Ionicons name={errorBody.icon} size={28} color="#6B7280" />
          <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
            {errorBody.title}
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
            {errorBody.detail}
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
      ) : result ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 48, ...pageStyle }}
        >
          {/* Hero */}
          <View className="px-6 pt-6">
            <View className="flex-row items-baseline gap-3">
              <Text className="text-[52px] font-black leading-[56px] text-text-primary">
                {result.percent}%
              </Text>
              <Text className="text-lg font-bold text-brand-300">taste overlap</Text>
            </View>
            {result.duoLine ? (
              <Text className="mt-1 text-sm leading-5 text-text-secondary">
                {result.duoLine}
              </Text>
            ) : null}
            <View className="mt-4">
              <TasteMatchMeter percent={result.percent} height={8} />
            </View>
            {result.remaining != null ? (
              <Text className="mt-2 text-[11px] leading-4 text-text-tertiary">
                {result.remaining} free {result.remaining === 1 ? "blend" : "blends"} left
                this month
              </Text>
            ) : null}
          </View>

          {/* Shared lanes + services */}
          {result.sharedFacets.length > 0 ? (
            <View className="mt-6 px-6">
              <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Where you two meet
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {result.sharedFacets.map((facet) => (
                  <Pressable
                    key={facet.key}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      guardedPush(`/facet/${facet.key}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${facet.title}`}
                    style={[
                      styles.facetChip,
                      {
                        backgroundColor: accent.rgba(400, 0.12),
                        borderColor: accent.rgba(400, 0.4),
                      },
                    ]}
                    className="active:opacity-75"
                  >
                    <Text className="text-[13px] font-semibold text-brand-300">
                      {facet.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {sharedProviderLabels.length > 0 ? (
            <View className="mt-4 px-6 flex-row items-center gap-1.5">
              <Ionicons name="tv-outline" size={13} color="#8A93A6" />
              <Text className="text-[12px] text-text-tertiary">
                You both have {sharedProviderLabels.join(" · ")}
              </Text>
            </View>
          ) : null}

          {/* Picks */}
          <View className="mt-7 px-6">
            <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
              For the two of you
            </Text>
            <Text className="mt-1 text-[13px] leading-5 text-text-secondary">
              Neither of you has watched these.
            </Text>
            {result.picks.length === 0 ? (
              <Text className="mt-4 text-[14px] leading-6 text-text-secondary">
                Nothing surfaced this time — try again once you've both logged a few more
                shows.
              </Text>
            ) : (
              <View className="mt-4 gap-3">
                {result.picks.map((pick) => (
                  <Pressable
                    key={pick.showId}
                    onPress={() => pressShow(pick)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${pick.title}`}
                    className="flex-row gap-3 rounded-2xl border border-dark-border bg-dark-card p-3 active:opacity-80"
                  >
                    <Poster uri={pick.posterUrl ?? undefined} width={72} alt={pick.title} />
                    <View className="flex-1">
                      <Text
                        className="text-[15px] font-bold text-text-primary"
                        numberOfLines={2}
                      >
                        {pick.title}
                        {pick.year ? (
                          <Text className="text-[13px] font-medium text-text-tertiary">
                            {"  "}
                            {pick.year}
                          </Text>
                        ) : null}
                      </Text>
                      <Text
                        className="mt-1 text-[13px] leading-5 text-text-secondary"
                        numberOfLines={3}
                      >
                        {pick.reason}
                      </Text>
                      <View className="mt-2 flex-row flex-wrap gap-1.5">
                        {pick.onViewerWatchlist ? (
                          <BadgeChip icon="bookmark" label="On your watchlist" />
                        ) : null}
                        {pick.onPartnerWatchlist ? (
                          <BadgeChip icon="bookmark-outline" label={`On ${displayName}'s`} />
                        ) : null}
                        {pick.onSharedService
                          ? pick.providerKeys
                              .filter((key) => result.sharedProviders.includes(key))
                              .slice(0, 1)
                              .map((key) => (
                                <BadgeChip
                                  key={key}
                                  icon="play-circle-outline"
                                  label={providerLabelByKey.get(key) ?? key}
                                />
                              ))
                          : null}
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function BadgeChip({ icon, label }: { icon: any; label: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-dark-border bg-dark-bg px-2 py-1">
      <Ionicons name={icon} size={11} color="#8A93A6" />
      <Text className="text-[11px] font-semibold text-text-tertiary">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  facetChip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
