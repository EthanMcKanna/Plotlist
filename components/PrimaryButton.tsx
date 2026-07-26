import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

import type { AccentTheme } from "../lib/appearance";
import { getAccent, useAccent } from "../lib/appearanceStore";
import { GlassPressable } from "./NativeGlass";

export function getPrimaryButtonSurfaceShadowStyle(
  platform: typeof Platform.OS = Platform.OS,
  // Default is a non-subscribing snapshot — render paths must pass the
  // accent from useAccent() so the button recolors on theme changes.
  accent: AccentTheme = getAccent(),
): ViewStyle {
  if (platform === "web") {
    return {
      boxShadow: `0 0 14px ${accent.rgba(400, 0.2)}`,
    } as ViewStyle;
  }

  return {
    shadowColor: accent.ramp[400],
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  };
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  className,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  accessibilityLabel?: string;
}) {
  const accent = useAccent();
  const handlePress = () => {
    if (!disabled && !loading) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  return (
    <GlassPressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={className}
      radius={999}
      variant="prominent"
      fallbackColor={
        disabled || loading ? accent.rgba(500, 0.12) : accent.rgba(500, 0.88)
      }
      surfaceStyle={getPrimaryButtonSurfaceShadowStyle(Platform.OS, accent)}
      contentStyle={styles.content}
    >
      <View className="flex-row items-center gap-2">
        {loading ? <ActivityIndicator color="#fff" /> : null}
        <Text
          className="text-base font-semibold text-white"
          style={disabled || loading ? styles.disabledText : null}
        >
          {label}
        </Text>
      </View>
    </GlassPressable>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  disabledText: {
    color: "rgba(255,255,255,0.62)",
  },
});
