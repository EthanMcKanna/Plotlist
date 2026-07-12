import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { HomeSectionHeader } from "./HomeSectionHeader";
import { HorizontalRail } from "./HorizontalRail";
import {
  getFeatureCardVisibleMetaLine,
  type SignatureRailItem,
} from "./SignatureRail";
import { getHomeDisplayMetaLine } from "../lib/homeDisplayMeta";
import {
  getHomeCuratedEditCardMetrics,
  type HomeCuratedEdit,
} from "../lib/homeCuratedEdits";

type HomeCuratedEditsProps = {
  edits: Array<HomeCuratedEdit<SignatureRailItem>>;
  index?: number;
  onPressItem: (item: SignatureRailItem) => void;
};

function normalizeCuratedAccessibilityPart(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

export function getHomeCuratedEditAccessibilityLabel(
  edit: HomeCuratedEdit<SignatureRailItem>,
) {
  const lead = edit.items[0];
  const title = normalizeCuratedAccessibilityPart(lead?.title);
  const editTitle = normalizeCuratedAccessibilityPart(edit.title);
  const metaLine = lead ? getHomeDisplayMetaLine(lead, { compactSignal: true }) : null;

  return [
    `Open ${title ?? "show"}${editTitle ? ` from ${editTitle}` : ""}`,
    metaLine || null,
  ]
    .filter(Boolean)
    .join(". ");
}

export function HomeCuratedEdits({
  edits,
  index,
  onPressItem,
}: HomeCuratedEditsProps) {
  const { width } = useWindowDimensions();
  const metrics = getHomeCuratedEditCardMetrics(width);

  if (edits.length === 0) return null;

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker="Curated"
        title="Picks"
        accent="#FDE68A"
        icon="albums"
      />
      <HorizontalRail
        accessibilityLabel="Picks rail"
        decelerationRate="fast"
        contentContainerStyle={styles.rail}
        snapToInterval={metrics.cardWidth + 14}
      >
        {edits.map((edit) => (
          <CuratedEditCard
            key={edit.key}
            edit={edit}
            width={metrics.cardWidth}
            compact={metrics.compact}
            onPressItem={onPressItem}
          />
        ))}
      </HorizontalRail>
    </View>
  );
}

function CuratedEditCard({
  edit,
  width,
  compact,
  onPressItem,
}: {
  edit: HomeCuratedEdit<SignatureRailItem>;
  width: number;
  compact: boolean;
  onPressItem: (item: SignatureRailItem) => void;
}) {
  const lead = edit.items[0];
  const metaLine = getFeatureCardVisibleMetaLine(lead);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPressItem(lead);
      }}
      accessibilityRole="button"
      accessibilityLabel={getHomeCuratedEditAccessibilityLabel(edit)}
      className="active:opacity-90"
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        { width, borderColor: `${edit.accent}4D` },
      ]}
    >
      <LinearGradient
        colors={[`${edit.accent}24`, "rgba(20,24,32,0.98)"]}
        locations={[0, 0.54]}
        style={[StyleSheet.absoluteFill, styles.pointerNone]}
      />

      <CuratedLeadArtwork item={lead} accent={edit.accent} />

      <View
        testID={`curated-caption-${lead.key}`}
        style={[styles.caption, compact ? styles.captionCompact : null]}
      >
        <Text className="text-[15px] font-black leading-[19px] text-white" numberOfLines={3}>
          {lead.title}
        </Text>
        {metaLine ? (
          <Text className="mt-1 text-[11px] font-semibold leading-[14px] text-white/70" numberOfLines={2}>
            {metaLine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function CuratedLeadArtwork({
  item,
  accent,
}: {
  item: SignatureRailItem;
  accent: string;
}) {
  const [failed, setFailed] = useState(false);
  // Posters lead everywhere outside Continue Watching; backdrops are only a
  // last resort when no poster exists.
  const artworkUrl = item.posterUrl ?? item.backdropUrl ?? null;
  const shouldShowFallback = !artworkUrl || failed;

  useEffect(() => {
    setFailed(false);
  }, [artworkUrl]);

  return (
    <View style={styles.artworkFrame}>
      {shouldShowFallback ? (
        <View
          testID={`curated-poster-fallback-${item.key}`}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            styles.posterFallback,
            { backgroundColor: `${accent}14` },
          ]}
        />
      ) : null}
      {artworkUrl && !failed ? (
        <Image
          testID={`curated-poster-image-${item.key}`}
          source={{ uri: artworkUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={160}
          onError={() => setFailed(true)}
        />
      ) : null}
      <LinearGradient
        colors={[`${accent}16`, "rgba(12,14,20,0.2)"]}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFill, styles.pointerNone]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  card: {
    backgroundColor: "#141820",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    height: 156,
    overflow: "hidden",
  },
  cardCompact: {
    height: 148,
  },
  artworkFrame: {
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    height: "100%",
    overflow: "hidden",
  },
  posterFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 15,
  },
  captionCompact: {
    padding: 14,
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
