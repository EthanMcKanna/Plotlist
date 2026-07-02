import { Text, View } from "react-native";

import { GlassSurface } from "./NativeGlass";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <GlassSurface radius={8} variant="surface" fallbackColor="rgba(22,26,34,0.72)">
      <View className="items-center justify-center px-6 py-10">
        <Text className="text-base font-semibold text-text-primary">{title}</Text>
        {description ? (
          <Text className="mt-2 text-center text-sm text-text-tertiary">
            {description}
          </Text>
        ) : null}
      </View>
    </GlassSurface>
  );
}
