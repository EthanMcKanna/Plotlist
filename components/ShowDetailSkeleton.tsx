import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "./NativeGlass";

// Shared with app/show/[id].tsx so the skeleton and the real hero can never
// drift apart: same backdrop height, same floating poster geometry.
export const SHOW_BACKDROP_HEIGHT = 340;
export const SHOW_POSTER_WIDTH = 160;
export const SHOW_POSTER_HEIGHT = 240;
const HERO_HEIGHT = SHOW_BACKDROP_HEIGHT + SHOW_POSTER_HEIGHT * 0.45;

function useShimmer() {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = 0;
    value.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
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
  style?: object;
}) {
  const shimmer = useShimmer();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + shimmer.value * 0.3,
  }));
  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius: radius }, animatedStyle, style]}
    />
  );
}

// Instant placeholder for the show detail surface so navigation never falls
// back to the app-icon boot screen while queries resolve. Mirrors the real
// layout: full-width backdrop, poster floating centered over its bottom
// edge, centered title/meta, rating pill, then the status + action row.
export function ShowDetailSkeleton({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {/* Hero: backdrop + floating centered poster */}
      <View style={{ height: HERO_HEIGHT }}>
        <ShimmerBlock width="100%" height={SHOW_BACKDROP_HEIGHT} radius={0} />
        <View style={styles.posterWrap}>
          <ShimmerBlock
            width={SHOW_POSTER_WIDTH}
            height={SHOW_POSTER_HEIGHT}
            radius={14}
            style={styles.poster}
          />
        </View>
      </View>

      {/* Title & metadata — centered like the real header */}
      <View style={styles.titleBlock}>
        <ShimmerBlock width="62%" height={26} radius={8} />
        <ShimmerBlock width="48%" height={14} radius={7} style={{ marginTop: 10 }} />
        <ShimmerBlock width={120} height={36} radius={999} style={{ marginTop: 16 }} />
      </View>

      {/* Status selector + action buttons row */}
      <View style={styles.actionRow}>
        <View style={styles.actionSelector}>
          <ShimmerBlock width="100%" height={52} radius={16} />
        </View>
        <ShimmerBlock width={52} height={52} radius={16} />
        <ShimmerBlock width={52} height={52} radius={16} />
      </View>

      {/* Description lines */}
      <View style={styles.body}>
        <ShimmerBlock width="100%" height={14} radius={7} style={{ marginTop: 24 }} />
        <ShimmerBlock width="96%" height={14} radius={7} style={{ marginTop: 8 }} />
        <ShimmerBlock width="84%" height={14} radius={7} style={{ marginTop: 8 }} />
      </View>

      {onBack ? (
        <GlassPressable
          onPress={onBack}
          radius={999}
          variant="control"
          accessibilityLabel="Go back"
          style={[styles.back, { top: insets.top + 8 }]}
          contentStyle={styles.backContent}
        >
          <Ionicons name="chevron-back" size={22} color="#f4f6fb" />
        </GlassPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
  block: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  posterWrap: {
    alignItems: "center",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  poster: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  titleBlock: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
    paddingHorizontal: 24,
  },
  actionSelector: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 24,
  },
  back: {
    left: 20,
    position: "absolute",
  },
  backContent: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
});
