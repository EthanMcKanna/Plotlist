import type { ReactNode } from "react";
import { Text, View } from "react-native";

export function SectionHeader({
  title,
  action,
  uppercase = false,
}: {
  title: string;
  action?: ReactNode;
  uppercase?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        className={`text-lg font-semibold ${uppercase ? "uppercase tracking-wide text-xs text-text-tertiary" : "text-text-primary"}`}
      >
        {title}
      </Text>
      {action ? action : null}
    </View>
  );
}
