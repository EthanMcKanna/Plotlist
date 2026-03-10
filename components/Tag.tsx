import { Text, View } from "react-native";

export function Tag({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-dark-elevated px-3 py-1">
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </Text>
    </View>
  );
}
