import { Pressable, Text, View } from "react-native";
import { Poster } from "./Poster";

export function SearchResultRow({
  title,
  year,
  overview,
  posterUrl,
  onPress,
  actionLabel,
}: {
  title: string;
  year?: number | null;
  overview?: string | null;
  posterUrl?: string | null;
  onPress: () => void;
  actionLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row gap-4 rounded-2xl border border-dark-border bg-dark-card p-3"
    >
      <Poster uri={posterUrl ?? undefined} size="sm" />
      <View className="flex-1">
        <Text className="text-base font-semibold text-text-primary">
          {title}
          {year ? ` (${year})` : ""}
        </Text>
        {overview ? (
          <Text className="mt-1 text-sm text-text-secondary" numberOfLines={3}>
            {overview}
          </Text>
        ) : null}
        {actionLabel ? (
          <Text className="mt-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {actionLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
