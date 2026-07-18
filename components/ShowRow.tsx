import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LinkPressable } from "./LinkPressable";
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
  const className =
    "flex-row items-center gap-4 rounded-2xl border border-dark-border bg-dark-card p-3 hover:bg-dark-hover active:bg-dark-hover web:transition-colors";

  const body = (
    <>
      <Poster uri={posterUrl ?? undefined} size="sm" alt={title} />
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
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        className={className}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <LinkPressable
      href={`/show/${id}`}
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      className={className}
    >
      {body}
    </LinkPressable>
  );
}
