import { Pressable, StyleSheet, Text, View } from "react-native";
import { Poster } from "./Poster";

export function getSearchResultRowAccessibilityLabel({
  title,
  year,
  actionLabel,
}: {
  title: string;
  year?: number | null;
  actionLabel?: string;
}) {
  return [
    `Open ${title}`,
    year ? String(year) : null,
    actionLabel,
  ]
    .filter(Boolean)
    .join(". ");
}

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
      accessibilityRole="button"
      accessibilityLabel={getSearchResultRowAccessibilityLabel({
        title,
        year,
        actionLabel,
      })}
      style={styles.container}
      className="flex-row items-center gap-3 active:bg-dark-hover"
    >
      <Poster uri={posterUrl ?? undefined} width={52} />
      <View className="min-w-0 flex-1">
        <Text
          className="text-[15px] font-semibold leading-5 text-text-primary"
          numberOfLines={2}
        >
          {title}
        </Text>
        {year ? (
          <Text className="mt-1 text-[12px] font-medium text-text-tertiary">
            {year}
          </Text>
        ) : null}
        {overview ? (
          <Text
            className="mt-1.5 text-[13px] leading-[18px] text-text-secondary"
            numberOfLines={2}
          >
            {overview}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomColor: "rgba(255,255,255,0.07)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 94,
    overflow: "hidden",
    paddingRight: 20,
    paddingVertical: 10,
  },
});
