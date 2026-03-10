import { Text, View } from "react-native";

export function SectionHeader({
  title,
  action,
  uppercase = false,
}: {
  title: string;
  action?: string;
  uppercase?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        className={`text-lg font-semibold ${uppercase ? "uppercase tracking-wide text-xs text-text-tertiary" : "text-text-primary"}`}
      >
        {title}
      </Text>
      {action ? (
        <Text className="text-sm font-semibold text-text-tertiary">{action}</Text>
      ) : null}
    </View>
  );
}
