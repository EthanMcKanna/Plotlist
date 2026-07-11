import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { tasteMatchTier } from "../lib/plotlist/recsRanking";

type SharedFavoriteShow = {
  _id?: string;
  showId?: string;
  title: string;
  posterUrl?: string | null;
};

type SharedFacet = {
  key: string;
  title: string;
  score: number;
};

// The percent is calibrated against random watcher pairs (50 = an average
// pair — see TASTE_MATCH_CALIBRATION), so the meter anchors it with an "avg"
// tick instead of pretending 0–100 is a linear scale.
function tierAccent(percent: number) {
  if (percent >= 70) return "#22C55E";
  if (percent >= 40) return "#38BDF8";
  return "#F59E0B";
}

export function TasteMatchMeter({
  percent,
  height = 6,
  showAverageTick = true,
}: {
  percent: number;
  height?: number;
  showAverageTick?: boolean;
}) {
  const accent = tierAccent(percent);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.meterTrack, { height, borderRadius: height / 2 }]}
    >
      <View
        style={[
          styles.meterFill,
          {
            width: `${Math.max(3, Math.min(100, percent))}%`,
            backgroundColor: accent,
            borderRadius: height / 2,
          },
        ]}
      />
      {showAverageTick ? <View style={[styles.meterTick, { height: height + 6 }]} /> : null}
    </View>
  );
}

// Small pill for list rows (people discovery).
export function TasteMatchChip({ percent }: { percent: number }) {
  const accent = tierAccent(percent);
  return (
    <View
      style={[styles.chip, { borderColor: `${accent}55`, backgroundColor: `${accent}1F` }]}
      accessibilityLabel={`${percent} percent taste match`}
    >
      <Ionicons name="sparkles" size={10} color={accent} />
      <Text style={{ color: accent }} className="text-[11px] font-bold">
        {percent}%
      </Text>
    </View>
  );
}

export function TasteMatchSummarySkeleton() {
  return (
    <View className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3.5">
      <View className="h-3 w-24 rounded bg-dark-elevated" />
      <View className="mt-2.5 flex-row items-center gap-3">
        <View className="h-7 w-16 rounded bg-dark-elevated" />
        <View className="h-1.5 flex-1 rounded-full bg-dark-elevated" />
      </View>
      <View className="mt-2.5 flex-row gap-1.5">
        <View className="h-6 w-24 rounded-full bg-dark-elevated" />
        <View className="h-6 w-20 rounded-full bg-dark-elevated" />
      </View>
    </View>
  );
}

export function TasteMatchSummary({
  percent,
  sharedFavoriteShows,
  sharedFacets = [],
  hasPicks = false,
  onPress,
  variant = "card",
}: {
  percent: number;
  sharedFavoriteShows: SharedFavoriteShow[];
  sharedFacets?: SharedFacet[];
  hasPicks?: boolean;
  onPress?: () => void;
  variant?: "compact" | "card";
}) {
  const tier = tasteMatchTier(percent);
  const accent = tierAccent(percent);

  if (variant === "compact") {
    return <TasteMatchChip percent={percent} />;
  }

  // Deliberately dense: three lines plus a footer. The full teaching copy
  // (calibration, section labels, every shared show) lives on the breakdown
  // screen — the card only needs the number, the anchor, and one "why".
  //
  // Facet chips show whole titles or not at all: fit as many as a ~36-char
  // line budget allows (max 3) and fold the rest into "+N". Ellipsized chips
  // read as clipped layout, not content.
  const visibleFacets: SharedFacet[] = [];
  let facetCharBudget = 36;
  for (const facet of sharedFacets) {
    if (visibleFacets.length >= 3) break;
    if (visibleFacets.length > 0 && facet.title.length > facetCharBudget) break;
    visibleFacets.push(facet);
    facetCharBudget -= facet.title.length;
  }
  const extraFacets = sharedFacets.length - visibleFacets.length;
  const sharedCount = sharedFavoriteShows.length;

  const body = (
    <View className="rounded-2xl border border-brand-500/20 bg-brand-500/8 px-4 py-3.5">
      {/* Header */}
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-brand-300">
          Taste Match
        </Text>
        <View
          style={[styles.tierChip, { borderColor: `${accent}55`, backgroundColor: `${accent}1A` }]}
        >
          <Text style={{ color: accent }} className="text-[11px] font-bold">
            {tier.label}
          </Text>
        </View>
      </View>

      {/* Percent + inline meter */}
      <View className="mt-2 flex-row items-center gap-3">
        <Text className="text-[26px] font-black leading-[30px] text-text-primary">
          {percent}%
        </Text>
        <View className="flex-1">
          <TasteMatchMeter percent={percent} />
        </View>
      </View>

      {/* Why: mutual facets, one line. Chips shrink and ellipsize rather
          than clipping at the card edge. */}
      {visibleFacets.length > 0 ? (
        <View className="mt-2.5 flex-row items-center gap-1.5">
          {visibleFacets.map((facet) => (
            <View key={facet.key} style={[styles.facetChip, { flexShrink: 1 }]}>
              <Text
                className="text-[12px] font-semibold text-brand-300"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {facet.title}
              </Text>
            </View>
          ))}
          {extraFacets > 0 ? (
            <Text className="text-[12px] font-semibold text-text-tertiary">+{extraFacets}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Footer: shared shows + action, one line */}
      {onPress || sharedCount > 0 ? (
        <View className="mt-3 flex-row items-center justify-between gap-3 border-t border-white/5 pt-2.5">
          <View className="flex-row items-center" style={{ flexShrink: 1 }}>
            {sharedFavoriteShows.slice(0, 3).map((show, index) => (
              <View
                key={show._id ?? show.showId ?? `${show.title}-${index}`}
                className="overflow-hidden rounded-md border border-dark-border bg-dark-card"
                style={{ marginLeft: index === 0 ? 0 : -8, zIndex: 3 - index }}
              >
                <Image
                  source={show.posterUrl ? { uri: show.posterUrl } : undefined}
                  style={{ width: 22, height: 33 }}
                  contentFit="cover"
                />
              </View>
            ))}
            {sharedCount > 0 ? (
              <Text className="ml-2 text-[12px] text-text-tertiary" numberOfLines={1}>
                {sharedCount} show{sharedCount === 1 ? "" : "s"} in common
              </Text>
            ) : null}
          </View>
          {onPress ? (
            <View className="flex-row items-center gap-0.5">
              <Text className="text-[13px] font-semibold" style={{ color: accent }}>
                {hasPicks ? "Picks for you" : "Breakdown"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={accent} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Taste match ${percent} percent — see full breakdown`}
      className="active:opacity-85"
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  facetChip: {
    backgroundColor: "rgba(56,189,248,0.12)",
    borderColor: "rgba(56,189,248,0.35)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  meterFill: {
    height: "100%",
  },
  meterTick: {
    backgroundColor: "rgba(241,243,247,0.45)",
    left: "50%",
    position: "absolute",
    top: -3,
    width: 2,
  },
  meterTrack: {
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "visible",
    position: "relative",
    width: "100%",
  },
  tierChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
});
