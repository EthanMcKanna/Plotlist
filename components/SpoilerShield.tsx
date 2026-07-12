import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

// Blurs spoiler review text until the user explicitly taps to reveal. The
// reveal tap is captured by the overlay, so it never propagates to the row's
// own press (which usually navigates to the review).
export function SpoilerShield({ active, children }: { active: boolean; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  if (!active || revealed) {
    return <>{children}</>;
  }

  return (
    <View className="overflow-hidden rounded-xl" style={{ minHeight: 40 }}>
      {children}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setRevealed(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Spoiler hidden. Tap to reveal."
        style={StyleSheet.absoluteFill}
      >
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View className="flex-1 items-center justify-center">
          <View className="flex-row items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1">
            <Ionicons name="eye-off-outline" size={11} color="#F1F3F7" />
            <Text className="text-[10px] font-semibold text-text-primary">
              Spoiler · tap to reveal
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
