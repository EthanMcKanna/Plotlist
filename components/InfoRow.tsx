import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type InfoRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
};

export function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <View className="flex-row items-center border-b border-dark-border py-3">
      <View className="w-24 flex-row items-center gap-2">
        <Ionicons name={icon} size={16} color="#9BA1B0" />
        <Text className="text-sm text-text-secondary">{label}</Text>
      </View>
      <Text className="flex-1 text-sm font-medium text-text-primary">{value}</Text>
    </View>
  );
}
