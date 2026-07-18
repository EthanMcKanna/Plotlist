import type { ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import * as Haptics from "expo-haptics";

import { LinkPressable } from "./LinkPressable";

type IconName = ComponentProps<typeof Ionicons>["name"];
type TextProps = ComponentProps<typeof Text>;
type WebHeadingProps = Partial<TextProps> & {
  "aria-level": 2;
};

type HomeSectionHeaderProps = {
  /** Two-digit kicker number (e.g. "01"). Pads automatically. */
  index?: number;
  /** Context label kept for accessibility and analytics-style structure. */
  kicker: string;
  /** Editorial title rendered with restrained section emphasis. */
  title: string;
  /** Optional fuller title used only for assistive technology. */
  accessibilityTitle?: string;
  /** Optional one-line subtitle below the title. */
  subtitle?: string;
  /** Section accent color reserved for callers that need themed context. */
  accent: string;
  /** Optional icon reserved for callers that need themed context. */
  icon?: IconName;
  /** Optional action label rendered top-right (e.g. "All releases"). */
  actionLabel?: string;
  /** Optional action icon, useful when the visible label would add noise. */
  actionIcon?: IconName;
  /** Whether to render the action label visibly. Accessibility always keeps it. */
  actionLabelVisible?: boolean;
  /** Static destination for the action; renders a real link on web. */
  actionHref?: Href;
  /** Tap handler for the action affordance. */
  onAction?: () => void;
  /** Fires haptics + onAction when the kicker is tapped. */
  hapticOnAction?: boolean;
};

export function getHomeSectionHeaderActionAccessibilityLabel(
  actionLabel: string,
  title: string,
) {
  const normalizedAction = actionLabel.trim();
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return normalizedAction;

  const command = /^open\b/i.test(normalizedAction)
    ? normalizedAction
    : `Open ${normalizedAction}`;
  return `${command} from ${normalizedTitle}`;
}

export function getHomeSectionHeaderAccessibilityLabel({
  index,
  kicker,
  subtitle,
  title,
  accessibilityTitle,
}: {
  index?: number;
  kicker: string;
  subtitle?: string;
  title: string;
  accessibilityTitle?: string;
}) {
  const sectionNumber =
    typeof index === "number" && Number.isFinite(index)
      ? `Section ${String(index).padStart(2, "0")}`
      : null;
  const labelTitle = accessibilityTitle?.trim() || title.trim();
  return [sectionNumber, kicker.trim(), labelTitle, subtitle?.trim()]
    .filter(Boolean)
    .join(". ");
}

function getSectionHeadingWebProps(): Partial<TextProps> | undefined {
  if (Platform.OS !== "web") return undefined;

  return {
    "aria-level": 2,
  } as unknown as WebHeadingProps;
}

export function HomeSectionHeader({
  index,
  kicker,
  title,
  accessibilityTitle,
  subtitle,
  actionLabel,
  actionIcon,
  actionLabelVisible = true,
  actionHref,
  onAction,
  hapticOnAction = true,
}: HomeSectionHeaderProps) {
  const handleAction = () => {
    if (!onAction && !actionHref) return;
    if (hapticOnAction) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // With actionHref set, navigation belongs to the LinkPressable — onAction
    // stays a pre-navigation side effect.
    onAction?.();
  };

  const actionStyle = [
    styles.actionButton,
    !actionLabelVisible ? styles.iconOnlyActionButton : null,
  ];
  const actionContent = actionLabel ? (
    <>
      {actionLabelVisible ? (
        <Text className="text-[13px] font-semibold text-text-secondary">
          {actionLabel}
        </Text>
      ) : null}
      <Ionicons
        name={actionIcon ?? "arrow-forward"}
        size={actionLabelVisible ? 14 : 17}
        color="#9BA1B0"
        accessible={false}
        accessibilityElementsHidden
        aria-hidden={true}
        importantForAccessibility="no"
      />
    </>
  ) : null;

  return (
    <View className="px-6">
      <View className="flex-row items-end justify-between gap-4">
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            {...getSectionHeadingWebProps()}
            accessibilityLabel={getHomeSectionHeaderAccessibilityLabel({
              index,
              kicker,
              subtitle,
              title,
              accessibilityTitle,
            })}
            className="text-[17px] font-bold leading-[22px] text-text-primary"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="mt-1 text-[12px] leading-[17px] text-text-tertiary"
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {actionLabel && actionHref ? (
          <LinkPressable
            href={actionHref}
            onPress={handleAction}
            style={actionStyle}
            className="active:opacity-70 hover:opacity-80 web:transition-opacity"
            accessibilityRole="button"
            accessibilityLabel={getHomeSectionHeaderActionAccessibilityLabel(
              actionLabel,
              title,
            )}
          >
            {actionContent}
          </LinkPressable>
        ) : actionLabel && onAction ? (
          <Pressable
            onPress={handleAction}
            style={actionStyle}
            className="active:opacity-70 hover:opacity-80 web:transition-opacity"
            accessibilityRole="button"
            accessibilityLabel={getHomeSectionHeaderActionAccessibilityLabel(
              actionLabel,
              title,
            )}
          >
            {actionContent}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 6,
  },
  iconOnlyActionButton: {
    paddingHorizontal: 0,
    width: 44,
  },
});
