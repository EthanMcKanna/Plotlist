import { StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";

import { GlassPressable } from "./NativeGlass";

export function SecondaryButton({
  label,
  onPress,
  className,
}: {
  label: string;
  onPress: () => void;
  className?: string;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <GlassPressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={className}
      radius={999}
      variant="control"
      surfaceStyle={styles.surface}
      contentStyle={styles.content}
    >
      <Text className="text-base font-semibold text-text-secondary">{label}</Text>
    </GlassPressable>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  surface: {
    minHeight: 46,
  },
});
