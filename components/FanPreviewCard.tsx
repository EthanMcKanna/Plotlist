import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";

import { LinkPressable } from "./LinkPressable";
import { withAlpha } from "../lib/genreExplorer";

type IconName = ComponentProps<typeof Ionicons>["name"];

const DEFAULT_WIDTH = 148;
const DEFAULT_HEIGHT = 198;
const FAN_POSTER_WIDTH = 58;
const FAN_POSTER_HEIGHT = 87;
// Horizontal distance of the side posters from center, tuned on the default
// width and kept proportional as the card widens.
const FAN_SPREAD_RATIO = 34 / DEFAULT_WIDTH;

function FanPoster({ uri, style }: { uri: string | null; style: object }) {
  return (
    <View style={[styles.fanPoster, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="low"
          transition={220}
        />
      ) : null}
    </View>
  );
}

// The signature "gradient wash + fanned posters" card introduced by the genre
// explorer, shared by every surface that previews a collection of shows
// (facet categories, lists). Purely presentational — callers own navigation
// (via onPress, or href for link destinations), haptics, and long-press
// behavior.
export function FanPreviewCard({
  title,
  accent,
  posters,
  meta,
  action,
  cornerIcon,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  style,
  accessibilityLabel,
  href,
  onPress,
  onLongPress,
}: {
  title: string;
  accent: string;
  posters: string[];
  /** Small tertiary line under the title (e.g. "12 shows · Private"). */
  meta?: string | null;
  /** Accent-colored uppercase call to action with a trailing arrow. */
  action?: string;
  /** Small badge in the top-right corner (e.g. a lock for private lists). */
  cornerIcon?: IconName;
  width?: number;
  height?: number;
  style?: object;
  accessibilityLabel: string;
  /** When set, the card is a real link on web (LinkPressable); onPress still
   * runs first as the side effect (haptics, analytics). */
  href?: Href;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const [front, left, right] = [posters[0] ?? null, posters[1] ?? null, posters[2] ?? null];
  const spread = Math.round(width * FAN_SPREAD_RATIO);
  const sideOffset = width / 2 - FAN_POSTER_WIDTH / 2 - spread;
  // With no artwork at all, keep the full three-frame fan as a deliberate
  // placeholder; with partial artwork, drop the unfilled side frames so a
  // two-show list doesn't carry a permanently empty slot.
  const showEmptyFrames = posters.length === 0;

  const sharedProps = {
    onLongPress,
    accessibilityRole: "button" as const,
    accessibilityLabel,
    style: [styles.card, { height, width }, style],
    className: "active:opacity-85 hover:opacity-90 web:transition-opacity",
  };

  const body = (
    <>
      <LinearGradient
        colors={[withAlpha(accent, 0.2), withAlpha(accent, 0.04), "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.fanArea}>
        {left || showEmptyFrames ? (
          <FanPoster
            uri={left}
            style={{ left: sideOffset, top: 14, transform: [{ rotate: "-9deg" }] }}
          />
        ) : null}
        {right || showEmptyFrames ? (
          <FanPoster
            uri={right}
            style={{ right: sideOffset, top: 14, transform: [{ rotate: "9deg" }] }}
          />
        ) : null}
        <FanPoster uri={front} style={styles.fanFront} />
      </View>
      <View style={styles.cardFooter}>
        <Text
          className="text-[14px] font-extrabold leading-[18px] text-text-primary"
          numberOfLines={2}
        >
          {title}
        </Text>
        {action ? (
          <View className="mt-1.5 flex-row items-center gap-1">
            <Text
              className="text-[11px] font-bold uppercase"
              style={{ color: accent, letterSpacing: 0.4 }}
            >
              {action}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={11}
              color={accent}
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          </View>
        ) : meta ? (
          <Text className="mt-1.5 text-[11px] font-semibold text-text-tertiary" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {cornerIcon ? (
        <View style={styles.cornerBadge}>
          <Ionicons
            name={cornerIcon}
            size={11}
            color="#9BA1B0"
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
        </View>
      ) : null}
    </>
  );

  if (href) {
    return (
      <LinkPressable href={href} onPress={onPress} {...sharedProps}>
        {body}
      </LinkPressable>
    );
  }

  return (
    <Pressable onPress={onPress} {...sharedProps}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardFooter: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  cornerBadge: {
    alignItems: "center",
    backgroundColor: "rgba(13,15,20,0.72)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 10,
    top: 10,
    width: 24,
  },
  fanArea: {
    alignItems: "center",
    height: 112,
    justifyContent: "flex-start",
    marginTop: 14,
  },
  fanFront: {
    top: 6,
  },
  fanPoster: {
    backgroundColor: "#1C2028",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: FAN_POSTER_HEIGHT,
    overflow: "hidden",
    position: "absolute",
    width: FAN_POSTER_WIDTH,
  },
});
