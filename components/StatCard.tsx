import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

type StatCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  onPress?: () => void;
};

export function StatCard({ icon, label, count, onPress }: StatCardProps) {
  const content = (
    <View className="flex-1 rounded-2xl border border-dark-border bg-dark-card p-4">
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-dark-elevated">
          <Ionicons name={icon} size={16} color="#9BA1B0" />
        </View>
        <Text className="text-2xl font-bold text-text-primary">{count}</Text>
      </View>
      <Text className="mt-2 text-sm text-text-tertiary">{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        className="flex-1 active:opacity-80"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
