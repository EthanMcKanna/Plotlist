import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Poster } from "./Poster";

export function ShowRow({
  id,
  title,
  year,
  posterUrl,
  subtitle,
  onPress,
}: {
  id: string;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  subtitle?: string;
  onPress?: () => void;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.push(`/show/${id}`);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-4 rounded-2xl border border-dark-border bg-dark-card p-3 active:bg-dark-hover"
    >
      <Poster uri={posterUrl ?? undefined} size="sm" />
      <View className="flex-1">
        <Text className="text-base font-semibold text-text-primary">
          {title}
          {year ? ` (${year})` : ""}
        </Text>
        {subtitle ? (
          <Text className="mt-1 text-sm text-text-secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
