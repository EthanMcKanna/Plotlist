import { useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";
import { GlassSurface } from "./NativeGlass";

type ContactsSyncCardProps = {
  title: string;
  description: string;
  buttonLabel: string;
  onPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  onDismiss?: () => void;
  loading?: boolean;
  meta?: string | null;
  variant?: "default" | "compact";
};

export function ContactsSyncCard({
  title,
  description,
  buttonLabel,
  onPress,
  secondaryLabel,
  onSecondaryPress,
  onDismiss,
  loading = false,
  meta,
  variant = "default",
}: ContactsSyncCardProps) {
  const { width } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  const compact = variant === "compact";
  const effectiveWidth = getContactsSyncCardEffectiveWidth(cardWidth, width);
  const inlineActions = shouldInlineContactsSyncActions(variant, effectiveWidth);

  return (
    <GlassSurface
      radius={compact ? 8 : 24}
      variant="surface"
      fallbackColor="rgba(22,26,34,0.78)"
      contentStyle={{
        paddingHorizontal: 20,
        paddingVertical: compact ? 16 : 20,
      }}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
        setCardWidth((currentWidth) =>
          currentWidth !== null && Math.abs(currentWidth - nextWidth) < 1
            ? currentWidth
            : nextWidth,
        );
      }}
    >
      <View style={inlineActions ? styles.inlineLayout : styles.stackedLayout}>
        <View style={inlineActions ? styles.inlineCopy : styles.stackedCopy}>
          <View style={styles.headerRow}>
            <Text
              style={styles.title}
              numberOfLines={compact ? 2 : undefined}
              className={`font-semibold text-text-primary ${
                compact ? "text-base" : "text-lg"
              }`}
            >
              {title}
            </Text>
            {onDismiss ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDismiss();
                }}
                hitSlop={12}
                className="rounded-full p-1 active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel="Dismiss contacts prompt"
              >
                <Ionicons
                  name="close"
                  size={compact ? 18 : 20}
                  color="#71717a"
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden={true}
                  importantForAccessibility="no"
                />
              </Pressable>
            ) : null}
          </View>
          <Text
            className={`mt-2 text-text-tertiary ${
              compact ? "text-[13px] leading-5" : "text-sm leading-6"
            }`}
          >
            {description}
          </Text>
          {meta ? (
            <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-400">
              {meta}
            </Text>
          ) : null}
        </View>
        <View
          testID="contacts-sync-actions"
          style={[
            styles.actionStack,
            inlineActions ? styles.inlineActions : styles.stackedActions,
          ]}
        >
          <PrimaryButton
            label={buttonLabel}
            onPress={onPress}
            loading={loading}
            className={compact ? "py-3" : undefined}
          />
          {secondaryLabel && onSecondaryPress ? (
            <SecondaryButton
              label={secondaryLabel}
              onPress={onSecondaryPress}
              className={compact ? "py-3" : undefined}
            />
          ) : null}
        </View>
      </View>
    </GlassSurface>
  );
}

export function shouldInlineContactsSyncActions(
  variant: ContactsSyncCardProps["variant"],
  width: number,
) {
  return variant === "compact" && width >= 720;
}

export function getContactsSyncCardEffectiveWidth(
  measuredCardWidth: number | null | undefined,
  windowWidth: number,
) {
  return measuredCardWidth && measuredCardWidth > 0
    ? measuredCardWidth
    : windowWidth;
}

const styles = StyleSheet.create({
  actionStack: {
    gap: 12,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  inlineActions: {
    flexShrink: 0,
    width: 210,
  },
  inlineCopy: {
    flex: 1,
    minWidth: 0,
  },
  inlineLayout: {
    alignItems: "center",
    flexDirection: "row",
    gap: 20,
  },
  stackedActions: {
    alignSelf: "stretch",
    marginTop: 16,
    width: "100%",
  },
  stackedCopy: {
    alignSelf: "stretch",
    width: "100%",
  },
  stackedLayout: {
    width: "100%",
  },
  title: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
});
