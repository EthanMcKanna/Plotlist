import { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { HomeSectionHeader } from "./HomeSectionHeader";
import {
  useContentWidth,
  useIsDesktopWeb,
  WEB_PAGE_MAX_WIDTH,
} from "../lib/webLayout";
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

type IconName = ComponentProps<typeof Ionicons>["name"];

type RailSkeletonProps = {
  index?: number;
  kicker: string;
  title: string;
  subtitle?: string;
  accent: string;
  icon?: IconName;
  variant: "feature" | "poster" | "ribbon" | "hero" | "banner";
  /** Banner variant only: match the live card's exact footprint. */
  cardWidth?: number;
  cardHeight?: number;
};

/** Hook that shares a single 0→1 oscillating shimmer value. */
function useShimmer() {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = 0;
    value.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [value]);
  return value;
}

function ShimmerBlock({
  width,
  height,
  radius = 12,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: any;
}) {
  const shimmer = useShimmer();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + shimmer.value * 0.35,
  }));
  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius: radius },
        animatedStyle,
        style,
      ]}
    />
  );
}

const SKELETON_CARD_WIDTHS = {
  banner: 320,
  poster: 124,
  ribbon: 244,
  feature: 300,
} as const;

export function RailSkeleton({
  index,
  kicker,
  title,
  subtitle,
  accent,
  icon,
  variant,
  cardWidth,
  cardHeight,
}: RailSkeletonProps) {
  const contentWidth = useContentWidth();
  const isDesktopWeb = useIsDesktopWeb();

  if (variant === "hero") {
    return (
      <View style={styles.heroShell}>
        <ShimmerBlock width="100%" height={420} radius={0} />
      </View>
    );
  }

  // Phones keep the legacy fixed counts; desktop web renders enough cards
  // to fill the (page-capped) rail width.
  const legacyCount = variant === "banner" ? 2 : 4;
  const footprint =
    (variant === "banner" ? cardWidth ?? 320 : SKELETON_CARD_WIDTHS[variant]) +
    12;
  const skeletonCount = isDesktopWeb
    ? Math.max(
        legacyCount,
        Math.ceil((Math.min(contentWidth, WEB_PAGE_MAX_WIDTH) - 48) / footprint),
      )
    : legacyCount;

  return (
    <View className="mt-8">
      <HomeSectionHeader
        index={index}
        kicker={kicker}
        title={title}
        subtitle={subtitle}
        accent={accent}
        icon={icon}
      />
      <ScrollView
        accessibilityLabel={`${title} loading rail`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        scrollEnabled={false}
      >
        {Array.from({ length: skeletonCount }).map((_, idx) => (
          <SkeletonCard
            key={idx}
            variant={variant}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SkeletonCard({
  variant,
  cardWidth,
  cardHeight,
}: {
  variant: "feature" | "poster" | "ribbon" | "banner";
  cardWidth?: number;
  cardHeight?: number;
}) {
  if (variant === "banner") {
    return (
      <ShimmerBlock
        width={cardWidth ?? 320}
        height={cardHeight ?? 192}
        radius={20}
      />
    );
  }
  if (variant === "poster") {
    return (
      <View style={styles.posterColumn}>
        <ShimmerBlock width={124} height={186} radius={14} />
        <ShimmerBlock width={104} height={12} radius={4} style={{ marginTop: 12 }} />
        <ShimmerBlock width={70} height={10} radius={3} style={{ marginTop: 6 }} />
      </View>
    );
  }
  if (variant === "ribbon") {
    return (
      <View style={styles.ribbonColumn}>
        <ShimmerBlock width={244} height={138} radius={16} />
        <ShimmerBlock width={140} height={12} radius={4} style={{ marginTop: 12 }} />
        <ShimmerBlock width={90} height={10} radius={3} style={{ marginTop: 6 }} />
      </View>
    );
  }
  return (
    <View style={styles.featureColumn}>
      <ShimmerBlock width={300} height={248} radius={22} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rail: {
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  posterColumn: {
    width: 124,
  },
  ribbonColumn: {
    width: 244,
  },
  featureColumn: {
    width: 300,
  },
  heroShell: {
    overflow: "hidden",
  },
});
