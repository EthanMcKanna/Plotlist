import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

import { GlassPressable } from "./NativeGlass";

export function getPrimaryButtonSurfaceShadowStyle(
  platform: typeof Platform.OS = Platform.OS,
): ViewStyle {
  if (platform === "web") {
    return {
      boxShadow: "0 0 14px rgba(56,189,248,0.20)",
    } as ViewStyle;
  }

  return {
    shadowColor: "#38BDF8",
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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
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
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={className}
      radius={999}
      variant="prominent"
      fallbackColor={
        disabled || loading ? "rgba(14,165,233,0.12)" : "rgba(14,165,233,0.88)"
      }
      surfaceStyle={styles.surface}
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
  surface: getPrimaryButtonSurfaceShadowStyle(),
});
