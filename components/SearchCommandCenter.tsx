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
import { useIsDesktopWeb } from "../lib/webLayout";

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
      // NativeWind drops style-FUNCTION results on web when className is
      // present, so hover/active live in classes and dynamic accent colors in
      // a static style object (same rule for every Pressable in this file).
      style={[
        styles.scopeToken,
        {
          backgroundColor: withAlpha(meta.accent, 0.14),
          borderColor: withAlpha(meta.accent, 0.42),
        },
      ]}
      className="hover:opacity-80 active:opacity-70 web:transition-opacity"
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
  isDesktopWeb,
  onPress,
}: {
  icon: IconName;
  accent: string;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  isDesktopWeb: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={
        isDesktopWeb
          ? "flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card px-3.5 py-3 hover:bg-dark-hover active:bg-dark-hover web:transition-colors"
          : "flex-row items-center gap-2.5 rounded-2xl border border-dark-border bg-dark-card px-3 py-2.5 hover:bg-dark-hover active:bg-dark-hover web:transition-colors"
      }
      // Phones split the row 50/50; the desktop column is wide enough that
      // stretched cards look empty, so they hug their content instead.
      style={isDesktopWeb ? styles.scopeActionDesktop : styles.scopeActionFill}
    >
      <View
        style={{ backgroundColor: withAlpha(accent, 0.16) }}
        className={
          isDesktopWeb
            ? "h-9 w-9 items-center justify-center rounded-xl"
            : "h-8 w-8 items-center justify-center rounded-lg"
        }
      >
        <Ionicons
          name={icon}
          size={isDesktopWeb ? 17 : 15}
          color={accent}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text
          className={
            isDesktopWeb
              ? "text-[14px] font-bold text-text-primary"
              : "text-[13px] font-bold text-text-primary"
          }
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          className={
            isDesktopWeb
              ? "mt-0.5 text-[12px] text-text-tertiary"
              : "text-[11px] text-text-tertiary"
          }
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      {isDesktopWeb ? (
        <Ionicons
          name="chevron-forward"
          size={14}
          color="#5A6070"
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      ) : null}
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
  const isDesktopWeb = useIsDesktopWeb();
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
          // The frame's accent border is the focus treatment; without this the
          // browser draws its default ring on the inner <input> too, nesting a
          // second rectangle inside the rounded field.
          style={Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null}
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
              className="h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 active:opacity-70 web:transition-colors"
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
            isDesktopWeb={isDesktopWeb}
            onPress={() => onModeChange("vibe")}
          />
          <ScopeAction
            icon="people"
            accent={SCOPE_META.people.accent}
            title="Find people"
            subtitle="Who to follow"
            accessibilityLabel="Switch to people search"
            isDesktopWeb={isDesktopWeb}
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
  container: {
    gap: 10,
  },
  scopeActionDesktop: {
    flexBasis: "auto",
    flexGrow: 0,
    minWidth: 250,
  },
  scopeActionFill: {
    flex: 1,
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
