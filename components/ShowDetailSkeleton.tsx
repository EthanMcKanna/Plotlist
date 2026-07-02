import { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
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

const SCREEN_WIDTH = Dimensions.get("window").width;
const BACKDROP_HEIGHT = Math.round(SCREEN_WIDTH * 0.62);

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
// back to the app-icon boot screen while queries resolve.
export function ShowDetailSkeleton({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ShimmerBlock width="100%" height={BACKDROP_HEIGHT} radius={0} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <ShimmerBlock width={104} height={156} radius={14} />
          <View style={styles.titleColumn}>
            <ShimmerBlock width="92%" height={26} radius={8} />
            <ShimmerBlock width="55%" height={14} radius={7} style={{ marginTop: 10 }} />
            <ShimmerBlock width="70%" height={14} radius={7} style={{ marginTop: 8 }} />
          </View>
        </View>
        <View style={styles.chipRow}>
          <ShimmerBlock width={96} height={34} radius={999} />
          <ShimmerBlock width={96} height={34} radius={999} />
          <ShimmerBlock width={96} height={34} radius={999} />
        </View>
        <ShimmerBlock width="100%" height={14} radius={7} style={{ marginTop: 26 }} />
        <ShimmerBlock width="96%" height={14} radius={7} style={{ marginTop: 8 }} />
        <ShimmerBlock width="84%" height={14} radius={7} style={{ marginTop: 8 }} />
        <ShimmerBlock width="40%" height={18} radius={8} style={{ marginTop: 32 }} />
        <View style={styles.railRow}>
          <ShimmerBlock width={120} height={170} radius={14} />
          <ShimmerBlock width={120} height={170} radius={14} />
          <ShimmerBlock width={120} height={170} radius={14} />
        </View>
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
    backgroundColor: "#0b0d12",
    flex: 1,
  },
  block: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  body: {
    marginTop: -44,
    paddingHorizontal: 24,
  },
  headerRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 16,
  },
  titleColumn: {
    flex: 1,
    paddingBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },
  railRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
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
