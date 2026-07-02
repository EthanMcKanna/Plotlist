import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Poster } from "./Poster";

export function getSearchResultRowAccessibilityLabel({
  title,
  year,
  sourceLabel,
  actionLabel,
}: {
  title: string;
  year?: number | null;
  sourceLabel?: string;
  actionLabel?: string;
}) {
  return [
    `Open ${title}`,
    year ? String(year) : null,
    sourceLabel,
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
  sourceLabel,
}: {
  title: string;
  year?: number | null;
  overview?: string | null;
  posterUrl?: string | null;
  onPress: () => void;
  actionLabel?: string;
  sourceLabel?: string;
}) {
  const trailingIcon = actionLabel ? "add" : "chevron-forward";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={getSearchResultRowAccessibilityLabel({
        title,
        year,
        sourceLabel,
        actionLabel,
      })}
      style={styles.container}
      className="flex-row items-center gap-3 active:bg-dark-hover"
    >
      <Poster uri={posterUrl ?? undefined} width={52} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-start gap-2">
          <View className="min-w-0 flex-1">
            <Text
              className="text-[15px] font-semibold leading-5 text-text-primary"
              numberOfLines={2}
            >
              {title}
            </Text>
            <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
              {year ? (
                <Text className="text-[12px] font-medium text-text-tertiary">
                  {year}
                </Text>
              ) : null}
              {sourceLabel ? (
                <>
                  {year ? <View style={styles.metaDot} /> : null}
                  <Text className="text-[12px] font-semibold uppercase text-text-tertiary">
                    {sourceLabel}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
        {overview ? (
          <Text
            className="mt-1.5 text-[13px] leading-[18px] text-text-secondary"
            numberOfLines={2}
          >
            {overview}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailingButton}>
        <Ionicons
          name={trailingIcon}
          size={17}
          color="#B4BAC8"
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
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
  metaDot: {
    backgroundColor: "#5A6070",
    borderRadius: 999,
    height: 3,
    marginTop: 1,
    width: 3,
  },
  trailingButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: "center",
    marginRight: 2,
    width: 34,
  },
});
