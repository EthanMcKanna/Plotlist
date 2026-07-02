import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import {
  getFeatureCardVisibleMetaLine,
  type SignatureRailItem,
} from "./SignatureRail";
import {
  getHomeSignalReleaseDistanceDays,
  hasChartOnlyHomeSignal,
  hasCurrentHomeSignal,
  hasExplicitCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
  isGenericHomeSignal,
} from "../lib/homeCurrentSignal";
import { getHomeDisplayMetaLine } from "../lib/homeDisplayMeta";
import { getHomeRailIdentityKeys } from "../lib/homeRailIdentity";

type BriefSlot = {
  key: string;
  label: string;
  item: SignatureRailItem | null;
  accent: string;
};
type HomeTasteBriefProps = {
  forYou: SignatureRailItem[];
  heat: SignatureRailItem[];
  fresh: SignatureRailItem[];
  personalized: boolean;
  selection?: HomeTasteBriefSelection;
  demotedKeys?: ReadonlySet<string>;
  onPressItem: (item: SignatureRailItem) => void;
};

export type HomeTasteBriefSelection = {
  tasteItem: SignatureRailItem | null;
  heatItem: SignatureRailItem | null;
  freshItem: SignatureRailItem | null;
};

type HomeTasteBriefSelectionOptions = {
  personalized?: boolean;
  now?: Date | number | string;
  demotedKeys?: ReadonlySet<string>;
};

export function getHomeTasteBriefCopy(personalized: boolean) {
  return personalized
    ? {
        tasteLabel: "For you",
      }
    : {
        tasteLabel: "Pick",
      };
}

export function shouldUseWideTasteBrief(width: number) {
  return width >= 760;
}

export function getHomeTasteBriefEffectiveWidth(
  windowWidth: number,
  contentWidth: number | null | undefined,
) {
  return typeof contentWidth === "number" && contentWidth > 0
    ? contentWidth
    : windowWidth;
}

function metaFor(item: SignatureRailItem) {
  return getHomeDisplayMetaLine(item, { compactSignal: true });
}

export function getHomeTasteBriefVisibleMetaLine(item: SignatureRailItem) {
  return getFeatureCardVisibleMetaLine(item);
}

function getBriefCardAccessibilityLabel(slot: BriefSlot) {
  const item = slot.item!;
  return [
    `Open ${item.title}`,
    slot.label,
    metaFor(item),
  ]
    .filter(Boolean)
    .join(". ");
}

export function getHomeTasteBriefArtworkUrl(item: SignatureRailItem) {
  return item.backdropUrl?.trim() || item.posterUrl?.trim() || null;
}

function firstDistinct(
  items: SignatureRailItem[],
  seen: Set<string>,
) {
  return (
    items.find((item) =>
      getHomeRailIdentityKeys(item).every((key) => !seen.has(key)),
    ) ?? null
  );
}

function hasPresentableCurrentContext(item: SignatureRailItem) {
  return Boolean(
    item.signal?.trim() ||
      item.genreLabel?.trim() ||
      item.overview?.trim(),
  );
}

export function isHomeTasteBriefCurrentCandidate(
  item: SignatureRailItem,
  now: HomeTasteBriefSelectionOptions["now"] = Date.now(),
) {
  if (hasExplicitCurrentHomeSignal(item, { now })) return true;
  return (
    hasCurrentHomeSignal(item, { now, recentYearWindow: 0 }) &&
    hasPresentableCurrentContext(item)
  );
}

function getTasteBriefPresentationScore(
  item: SignatureRailItem,
  now?: HomeTasteBriefSelectionOptions["now"],
  demotedKeys?: ReadonlySet<string>,
) {
  const currentYear =
    now instanceof Date
      ? now.getUTCFullYear()
      : new Date(typeof now === "number" ? now : now ? Date.parse(now) : Date.now())
          .getUTCFullYear();
  const signal = item.signal?.trim();
  const nonGenericSignal = Boolean(signal && !isGenericHomeSignal(signal));
  const releaseSignal = hasReleaseWindowHomeSignal(item);
  const chartOnlySignal = hasChartOnlyHomeSignal(item);
  const releaseDistance = getHomeSignalReleaseDistanceDays(item, now);
  let score = 0;

  if (releaseSignal) {
    score += 116;
    if (releaseDistance !== null) {
      score += Math.max(0, 24 - Math.abs(releaseDistance) * 3);
    }
  } else if (hasExplicitCurrentHomeSignal(item, { now }) && !chartOnlySignal) score += 84;
  else if (chartOnlySignal) score += 28;
  else if (isHomeTasteBriefCurrentCandidate(item, now)) score += 42;

  if (nonGenericSignal && !chartOnlySignal) score += 18;
  else if (chartOnlySignal) score += 3;
  else if (signal) score += 4;
  if (item.genreLabel?.trim()) score += 8;
  if ((item.overview?.trim().length ?? 0) >= 80) score += 7;
  else if (item.overview?.trim()) score += 4;
  if (item.backdropUrl?.trim()) score += 5;
  else if (item.posterUrl?.trim()) score += 2;
  if (item.year === currentYear) score += 3;
  else if (typeof item.year === "number" && item.year === currentYear - 1) score += 1;
  if (
    demotedKeys &&
    getHomeRailIdentityKeys(item).some((key) => demotedKeys.has(key))
  ) {
    score -= 160;
  }

  return score;
}

function presentableFirst(
  items: SignatureRailItem[],
  now?: HomeTasteBriefSelectionOptions["now"],
  demotedKeys?: ReadonlySet<string>,
) {
  return items
    .map((item, index) => ({
      item,
      index,
      score: getTasteBriefPresentationScore(item, now, demotedKeys),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      return scoreDelta !== 0 ? scoreDelta : left.index - right.index;
    })
    .map(({ item }) => item);
}

function currentFirst(
  items: SignatureRailItem[],
  now?: HomeTasteBriefSelectionOptions["now"],
  demotedKeys?: ReadonlySet<string>,
) {
  const release: SignatureRailItem[] = [];
  const explicit: SignatureRailItem[] = [];
  const chart: SignatureRailItem[] = [];
  const current: SignatureRailItem[] = [];
  const fallback: SignatureRailItem[] = [];
  items.forEach((item) => {
    if (hasReleaseWindowHomeSignal(item)) {
      release.push(item);
    } else if (hasChartOnlyHomeSignal(item)) {
      chart.push(item);
    } else if (hasExplicitCurrentHomeSignal(item, { now })) {
      explicit.push(item);
    } else if (isHomeTasteBriefCurrentCandidate(item, now)) {
      current.push(item);
    } else {
      fallback.push(item);
    }
  });
  return [
    ...presentableFirst(release, now, demotedKeys),
    ...presentableFirst(explicit, now, demotedKeys),
    ...presentableFirst(current, now, demotedKeys),
    ...presentableFirst(chart, now, demotedKeys),
    ...presentableFirst(fallback, now, demotedKeys),
  ];
}

export function getHomeTasteBriefSelection({
  forYou,
  heat,
  fresh,
  personalized = true,
  now,
  demotedKeys,
}: {
  forYou: SignatureRailItem[];
  heat: SignatureRailItem[];
  fresh: SignatureRailItem[];
} & HomeTasteBriefSelectionOptions): HomeTasteBriefSelection {
  const seen = new Set<string>();
  const leadSource = personalized
    ? currentFirst(forYou, now, demotedKeys)
    : currentFirst([...fresh, ...heat, ...forYou], now, demotedKeys);
  const tasteItem = firstDistinct(leadSource, seen);
  if (tasteItem) getHomeRailIdentityKeys(tasteItem).forEach((key) => seen.add(key));
  const heatItem = firstDistinct(currentFirst(heat, now, demotedKeys), seen);
  if (heatItem) getHomeRailIdentityKeys(heatItem).forEach((key) => seen.add(key));
  const freshItem = firstDistinct(currentFirst(fresh, now, demotedKeys), seen);
  return { tasteItem, heatItem, freshItem };
}

export function getHomeTasteBriefPreviewKeys(
  selection: HomeTasteBriefSelection,
) {
  return new Set(
    [selection.tasteItem]
      .filter((item): item is SignatureRailItem => Boolean(item))
      .flatMap(getHomeRailIdentityKeys),
  );
}

export function HomeTasteBrief({
  forYou,
  heat,
  fresh,
  personalized,
  selection,
  demotedKeys,
  onPressItem,
}: HomeTasteBriefProps) {
  const { width } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const isWide = shouldUseWideTasteBrief(
    getHomeTasteBriefEffectiveWidth(width, contentWidth),
  );
  const copy = getHomeTasteBriefCopy(personalized);
  const { tasteItem, heatItem, freshItem } =
    selection ??
    getHomeTasteBriefSelection({
      forYou,
      heat,
      fresh,
      personalized,
      demotedKeys,
    });

  const candidateSlots: BriefSlot[] = [
    {
      key: "taste",
      label: copy.tasteLabel,
      item: tasteItem,
      accent: "#22C55E",
    },
    {
      key: "pulse",
      label: "Now",
      item: heatItem,
      accent: "#F59E0B",
    },
    {
      key: "fresh",
      label: "Fresh",
      item: freshItem,
      accent: "#38BDF8",
    },
  ];
  const slots = candidateSlots.filter((slot) => Boolean(slot.item));

  if (slots.length === 0) return null;
  const leadSlot = slots[0];

  return (
    <View
      style={styles.shell}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setContentWidth((currentWidth) =>
          currentWidth === nextWidth ? currentWidth : nextWidth,
        );
      }}
    >
      <View style={[styles.board, isWide && styles.boardWide]}>
        <BriefCard
          slot={leadSlot}
          onPressItem={onPressItem}
          wide={isWide}
          variant="lead"
        />
      </View>
    </View>
  );
}

function BriefCard({
  slot,
  onPressItem,
  wide,
  variant,
}: {
  slot: BriefSlot;
  onPressItem: (item: SignatureRailItem) => void;
  wide: boolean;
  variant: "lead" | "support";
}) {
  const item = slot.item!;
  const imageUrl = getHomeTasteBriefArtworkUrl(item);
  const isLead = variant === "lead";
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const shouldShowImage = Boolean(imageUrl && !imageFailed);
  const shouldShowFallback = !imageUrl || imageFailed || !imageLoaded;
  const metaLine = getHomeTasteBriefVisibleMetaLine(item);

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPressItem(item);
      }}
      accessibilityRole="button"
      accessibilityLabel={getBriefCardAccessibilityLabel(slot)}
      style={[
        styles.card,
        isLead ? styles.leadCard : styles.supportCard,
        isLead && wide ? styles.leadCardWide : null,
      ]}
      testID={`taste-brief-card-${item.key}`}
      className="active:opacity-90"
    >
      {shouldShowImage ? (
        <Image
          testID={`taste-brief-image-${item.key}`}
          key={imageUrl}
          source={{ uri: imageUrl ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority={isLead ? "high" : "normal"}
          transition={180}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {shouldShowFallback ? <BriefArtworkFallback slot={slot} /> : null}

      <LinearGradient
        colors={[
          "rgba(13,15,20,0.04)",
          "rgba(13,15,20,0.34)",
          "rgba(13,15,20,0.94)",
        ]}
        locations={[0, 0.46, 1]}
        style={[StyleSheet.absoluteFill, styles.pointerNone]}
      />

      <View style={[styles.cardBody, isLead ? styles.leadBody : styles.supportBody]}>
        <Text
          className={
            isLead
              ? "text-[20px] font-black leading-[24px] text-white"
              : "text-[15px] font-black leading-[19px] text-white"
          }
          numberOfLines={isLead ? 2 : 2}
        >
          {item.title}
        </Text>
        {metaLine ? (
          <View style={styles.metaRow}>
            <Text
              className={isLead ? "text-[12px] font-semibold text-white/75" : "text-[11px] text-white/70"}
              numberOfLines={1}
            >
              {metaLine}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function BriefArtworkFallback({ slot }: { slot: BriefSlot }) {
  const item = slot.item!;

  return (
    <View
      testID={`taste-brief-fallback-${item.key}`}
      accessible={false}
      accessibilityElementsHidden
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.imageFallback]}
    >
      <LinearGradient
        colors={[`${slot.accent}30`, "rgba(20,24,32,0.98)", "#0D0F14"]}
        locations={[0, 0.54, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginTop: 6,
    paddingHorizontal: 24,
  },
  board: {
    gap: 10,
  },
  boardWide: {
    minHeight: 260,
  },
  card: {
    backgroundColor: "#141820",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  leadCard: {
    minHeight: 136,
  },
  leadCardWide: {
    flex: 1,
    minHeight: 260,
  },
  supportCard: {
    flex: 1,
    minHeight: 132,
  },
  imageFallback: {
    alignItems: "center",
    backgroundColor: "#1C2028",
    justifyContent: "center",
  },
  cardBody: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  leadBody: {
    padding: 12,
    paddingRight: 12,
  },
  supportBody: {
    padding: 12,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 4,
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
