import type { RefObject } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { SegmentedControl } from "./SegmentedControl";

export type SearchMode = "shows" | "vibe" | "people";

const modeOptions = [
  { value: "shows", label: "Shows" },
  { value: "vibe", label: "Vibe" },
  { value: "people", label: "People" },
];

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
              ? "rgba(56, 189, 248, 0.78)"
              : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={20}
          color={isFocused ? "#38BDF8" : "#9BA1B0"}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
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
              style={styles.clearButton}
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

      <View style={styles.segmentWrap}>
        <SegmentedControl
          options={modeOptions}
          value={mode}
          onChange={(value) => onModeChange(value as SearchMode)}
        />
      </View>
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
  container: {
    gap: 10,
  },
  searchField: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  segmentWrap: {
    marginTop: 2,
  },
  trailingControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginLeft: 6,
  },
});
