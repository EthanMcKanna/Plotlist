import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Href } from "expo-router";
import { LinkPressable } from "./LinkPressable";
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
  href,
}: {
  title: string;
  year?: number | null;
  overview?: string | null;
  posterUrl?: string | null;
  onPress: () => void;
  actionLabel?: string;
  /** When the show already exists locally, render a real link on web;
   * ingest-first rows omit it and keep the plain Pressable path. */
  href?: Href;
}) {
  const sharedProps = {
    accessibilityRole: "button" as const,
    accessibilityLabel: getSearchResultRowAccessibilityLabel({
      title,
      year,
      actionLabel,
    }),
    style: styles.container,
    className:
      "flex-row items-center gap-3 hover:bg-dark-hover active:bg-dark-hover web:transition-colors",
  };

  const body = (
    <>
      <Poster uri={posterUrl ?? undefined} width={52} alt={title} />
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
    </>
  );

  if (href) {
    return (
      <LinkPressable href={href} onPress={onPress} {...sharedProps}>
        {body}
      </LinkPressable>
    );
  }

  return (
    <Pressable onPress={onPress} {...sharedProps}>
      {body}
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
