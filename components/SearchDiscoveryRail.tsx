import type { ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInRight } from "react-native-reanimated";

import { Poster } from "./Poster";
import type {
  SearchDiscoverItem,
  SearchDiscoverSection,
} from "../lib/searchDiscover";

type IconName = ComponentProps<typeof Ionicons>["name"];

type SearchDiscoveryRailProps<Item extends SearchDiscoverItem> = {
  index?: number;
  section: SearchDiscoverSection<Item>;
  accent: string;
  onPressItem: (item: Item) => void;
  actionLabel?: string;
  onAction?: () => void;
};

export function getSearchDiscoveryRailAccessibilityLabel({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  const showWord = count === 1 ? "show" : "shows";
  return `${label}. ${count} ${showWord}`;
}

export function getSearchDiscoveryItemAccessibilityLabel(
  item: SearchDiscoverItem,
  sectionLabel: string,
) {
  const title = item.title?.trim() || "Untitled show";
  return [`Open ${title}`, item.year, sectionLabel].filter(Boolean).join(". ");
}

function getSearchDiscoveryItemKey(item: SearchDiscoverItem, index: number) {
  if (item.externalSource && item.externalId !== undefined && item.externalId !== null) {
    return `${item.externalSource}:${item.externalId}`;
  }
  if (item.externalId !== undefined && item.externalId !== null) {
    return String(item.externalId);
  }
  return `${item.title ?? "show"}:${item.year ?? "unknown"}:${index}`;
}

export function SearchDiscoveryRail<Item extends SearchDiscoverItem>({
  index: _index,
  section,
  accent,
  onPressItem,
  actionLabel,
  onAction,
}: SearchDiscoveryRailProps<Item>) {
  if (section.items.length === 0) return null;

  return (
    <View
      style={styles.section}
      accessibilityLabel={getSearchDiscoveryRailAccessibilityLabel({
        label: section.label,
        count: section.items.length,
      })}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleCluster}>
          {section.logoUrl ? (
            <Image
              source={{ uri: section.logoUrl }}
              style={[styles.logo, { borderColor: `${accent}55` }]}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.iconDot, { backgroundColor: accent }]}>
              <Ionicons
                name={section.icon as IconName}
                size={13}
                color="#0D0F14"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
            </View>
          )}
          <Text
            accessibilityRole="header"
            className="text-[19px] font-black leading-6 text-text-primary"
            numberOfLines={1}
            style={{ letterSpacing: 0 }}
          >
            {section.label}
          </Text>
        </View>

        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={`Open ${actionLabel} from ${section.label}`}
            hitSlop={8}
            style={styles.actionButton}
            className="active:opacity-70"
          >
            <Text className="text-[13px] font-bold text-text-secondary">
              {actionLabel}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={14}
              color="#8E96A8"
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 14}
        snapToAlignment="start"
      >
        {section.items.map((item, itemIndex) => (
          <Animated.View
            key={getSearchDiscoveryItemKey(item, itemIndex)}
            entering={FadeInRight.delay(itemIndex * 34).duration(260)}
            style={styles.card}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPressItem(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={getSearchDiscoveryItemAccessibilityLabel(
                item,
                section.label,
              )}
              style={styles.pressable}
              className="active:opacity-80"
            >
              <Poster uri={item.posterUrl ?? undefined} width={POSTER_WIDTH} />
              <Text
                className="mt-2 text-[13px] font-bold leading-[17px] text-text-primary"
                numberOfLines={2}
              >
                {item.title ?? "Unknown"}
              </Text>
              {item.year ? (
                <View className="mt-1 flex-row items-center gap-1.5">
                  <View style={[styles.dot, { backgroundColor: accent }]} />
                  <Text className="text-[12px] font-semibold text-text-tertiary">
                    {item.year}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = 112;
const POSTER_WIDTH = 104;

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    minHeight: 44,
    paddingLeft: 8,
  },
  card: {
    width: CARD_WIDTH,
  },
  dot: {
    borderRadius: 999,
    height: 5,
    width: 5,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 20,
  },
  iconDot: {
    alignItems: "center",
    borderRadius: 8,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  logo: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    height: 24,
    width: 24,
  },
  pressable: {
    minHeight: 44,
  },
  rail: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  section: {
    marginTop: 28,
  },
  titleCluster: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 9,
  },
});
