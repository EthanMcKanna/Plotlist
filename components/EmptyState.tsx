import { Text, View } from "react-native";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View className="items-center justify-center rounded-3xl border border-dashed border-dark-border bg-dark-card px-6 py-10">
      <Text className="text-base font-semibold text-text-primary">{title}</Text>
      {description ? (
        <Text className="mt-2 text-center text-sm text-text-tertiary">
          {description}
        </Text>
      ) : null}
    </View>
  );
}
