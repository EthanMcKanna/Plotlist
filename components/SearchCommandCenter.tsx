import type { ComponentProps, RefObject } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { withAlpha } from "../lib/genreExplorer";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type SearchMode = "shows" | "vibe" | "people";

// Show search is the default; vibe and people are scoped actions the user
// opts into. While scoped, a dismissible token sits inside the field instead
// of a persistent segmented control.
const SCOPE_META: Record<
  Exclude<SearchMode, "shows">,
  { label: string; icon: IconName; accent: string }
> = {
  vibe: { label: "Vibe", icon: "sparkles", accent: "#38BDF8" },
  people: { label: "People", icon: "people", accent: "#34D399" },
};

export function getSearchCommandCenterCopy(mode: SearchMode) {
  if (mode === "people") {
    return {
      accessibilityLabel: "Search people",
      placeholder: "People or @username",
    };
  }

  if (mode === "vibe") {
    return {
      accessibilityLabel: "Search shows by vibe",
      placeholder: "Describe a mood, plot, or feeling…",
    };
  }

  return {
    accessibilityLabel: "Search shows",
    placeholder: "Shows, genres, creators",
  };
}

function ScopeToken({
  mode,
  onDismiss,
}: {
  mode: Exclude<SearchMode, "shows">;
  onDismiss: () => void;
}) {
  const meta = SCOPE_META[mode];
  return (
    <Pressable
      onPress={onDismiss}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Exit ${meta.label.toLowerCase()} search`}
      {...(Platform.OS === "web"
        ? { title: `Exit ${meta.label.toLowerCase()} search` }
        : null)}
      style={(state) => [
        styles.scopeToken,
        {
          backgroundColor: withAlpha(
            meta.accent,
            Platform.OS === "web" && (state as any).hovered ? 0.22 : 0.14,
          ),
          borderColor: withAlpha(meta.accent, 0.42),
        },
      ]}
      className="active:opacity-70"
    >
      <Ionicons
        name={meta.icon}
        size={12}
        color={meta.accent}
        accessible={false}
        accessibilityElementsHidden
        aria-hidden={true}
        importantForAccessibility="no"
      />
      <Text className="text-[12px] font-bold" style={{ color: meta.accent }}>
        {meta.label}
      </Text>
      <Ionicons
        name="close"
        size={12}
        color={meta.accent}
        accessible={false}
        accessibilityElementsHidden
        aria-hidden={true}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

function ScopeAction({
  icon,
  accent,
  title,
  subtitle,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  accent: string;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => [
        styles.scopeAction,
        Platform.OS === "web" && (state as any).hovered
          ? styles.scopeActionHovered
          : null,
      ]}
      className="active:opacity-75"
    >
      <View
        style={[styles.scopeActionIcon, { backgroundColor: withAlpha(accent, 0.14) }]}
      >
        <Ionicons
          name={icon}
          size={14}
          color={accent}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[13px] font-bold text-text-primary" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-[11px] text-text-tertiary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export function SearchCommandCenter({
  mode,
  query,
  inputRef,
  isFocused,
  onModeChange,
  onQueryChange,
  onFocus,
  onBlur,
  onClear,
  isBusy = false,
}: {
  mode: SearchMode;
  query: string;
  inputRef?: RefObject<TextInput | null>;
  isFocused: boolean;
  isBusy?: boolean;
  onModeChange: (mode: SearchMode) => void;
  onQueryChange: (query: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onClear: () => void;
}) {
  const copy = getSearchCommandCenterCopy(mode);
  const scopeAccent = mode === "shows" ? "#38BDF8" : SCOPE_META[mode].accent;
  const showScopeActions = mode === "shows" && query.length === 0;

  return (
    <View style={styles.container}>
      <Text
        accessibilityRole="header"
        className="text-[28px] font-black leading-[32px] text-text-primary"
        style={{ letterSpacing: 0 }}
      >
        Search
      </Text>

      <View
        testID="search-command-input-frame"
        className="flex-row items-center px-3"
        style={[
          styles.searchField,
          {
            borderColor: isFocused
              ? withAlpha(scopeAccent, 0.78)
              : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        {mode === "shows" ? (
          <Ionicons
            name="search-outline"
            size={20}
            color={isFocused ? "#38BDF8" : "#9BA1B0"}
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
        ) : (
          <ScopeToken mode={mode} onDismiss={() => onModeChange("shows")} />
        )}
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={onQueryChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={copy.placeholder}
          placeholderTextColor="#6D7484"
          accessibilityLabel={copy.accessibilityLabel}
          className="ml-2.5 flex-1 py-3 text-[16px] text-text-primary"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          // Web: Escape clears the query; a second Escape (empty field)
          // dismisses the scope token back to show search.
          {...(Platform.OS === "web"
            ? {
                onKeyPress: (event: { nativeEvent: { key: string } }) => {
                  if (event.nativeEvent.key !== "Escape") return;
                  if (query.length > 0) {
                    onClear();
                  } else if (mode !== "shows") {
                    onModeChange("shows");
                  }
                },
              }
            : null)}
        />
        {query.length > 0 ? (
          <View style={styles.trailingControls}>
            <View
              style={styles.busySlot}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {isBusy ? (
                <ActivityIndicator
                  testID="search-command-busy-indicator"
                  size="small"
                  color="#38BDF8"
                />
              ) : null}
            </View>
            <Pressable
              onPress={onClear}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              {...(Platform.OS === "web" ? { title: "Clear search" } : null)}
              style={(state) => [
                styles.clearButton,
                Platform.OS === "web" && (state as any).hovered
                  ? styles.clearButtonHovered
                  : null,
              ]}
              className="active:opacity-70"
            >
              <Ionicons
                name="close"
                size={18}
                color="#F1F3F7"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
            </Pressable>
          </View>
        ) : null}
      </View>

      {showScopeActions ? (
        <View style={styles.scopeRow}>
          <ScopeAction
            icon="sparkles"
            accent={SCOPE_META.vibe.accent}
            title="Vibe search"
            subtitle="Describe a mood"
            accessibilityLabel="Switch to vibe search"
            onPress={() => onModeChange("vibe")}
          />
          <ScopeAction
            icon="people"
            accent={SCOPE_META.people.accent}
            title="Find people"
            subtitle="Who to follow"
            accessibilityLabel="Switch to people search"
            onPress={() => onModeChange("people")}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  busySlot: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 18,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  clearButtonHovered: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  container: {
    gap: 10,
  },
  scopeAction: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 52,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  scopeActionHovered: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  scopeActionIcon: {
    alignItems: "center",
    borderRadius: 10,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  scopeRow: {
    flexDirection: "row",
    gap: 8,
  },
  scopeToken: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  searchField: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  trailingControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginLeft: 6,
  },
});
