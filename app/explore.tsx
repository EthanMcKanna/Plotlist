import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "../components/NativeGlass";
import { guardedPush } from "../lib/navigation";
import { api } from "../lib/plotlist/api";
import { useAction } from "../lib/plotlist/react";
import { FACET_DEFS, type FacetDef } from "../lib/plotlist/facets";
import {
  GENRE_EXPLORER_GROUPS,
  filterFacets,
  formatShowCount,
  getFacetsForGroup,
  withAlpha,
} from "../lib/genreExplorer";

// Show counts change slowly (nightly-ish ingest), so one fetch per app
// session is plenty.
let showCountCache: Map<string, number> | null = null;

// The full facet catalog: every category from the recs v2 taxonomy, grouped,
// with live show counts. Reached from the search page's genre explorer.
export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const getFacetBrowse = useAction(api.embeddings.getFacetBrowse);

  const [filter, setFilter] = useState("");
  const [showCounts, setShowCounts] = useState<Map<string, number> | null>(
    showCountCache,
  );

  useEffect(() => {
    if (showCountCache) return;
    let cancelled = false;
    getFacetBrowse({})
      .then((groups: any) => {
        if (cancelled || !Array.isArray(groups)) return;
        const counts = new Map<string, number>();
        for (const group of groups) {
          for (const facet of group?.facets ?? []) {
            if (facet?.key) counts.set(facet.key, Number(facet.showCount) || 0);
          }
        }
        showCountCache = counts;
        setShowCounts(counts);
      })
      .catch(() => {
        // Chips render without counts; nothing else depends on this call.
      });
    return () => {
      cancelled = true;
    };
  }, [getFacetBrowse]);

  const sections = useMemo(
    () =>
      GENRE_EXPLORER_GROUPS.map((group) => ({
        group,
        facets: filterFacets(getFacetsForGroup(group.key), filter),
      })).filter((section) => section.facets.length > 0),
    [filter],
  );

  const handleOpenFacet = (facet: FacetDef) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedPush(`/facet/${facet.key}`);
  };

  return (
    <View className="flex-1 bg-dark-bg">
      {/* Header */}
      <View
        className="px-6 pb-4 border-b border-dark-border"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center gap-3">
          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            radius={20}
            variant="control"
            contentStyle={{
              alignItems: "center",
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
          </GlassPressable>

          <View className="flex-1">
            <Text className="text-xl font-black text-text-primary">
              Explore
            </Text>
            <Text className="text-xs font-semibold text-text-tertiary">
              {FACET_DEFS.length} categories across the catalog
            </Text>
          </View>
        </View>

        <View style={styles.filterField} className="mt-4 flex-row items-center px-3">
          <Ionicons
            name="search-outline"
            size={17}
            color="#6D7484"
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter categories"
            placeholderTextColor="#6D7484"
            accessibilityLabel="Filter categories"
            className="ml-2 flex-1 py-2.5 text-[15px] text-text-primary"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {filter.length > 0 ? (
            <Pressable
              onPress={() => setFilter("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear filter"
              className="active:opacity-70"
            >
              <Ionicons name="close-circle" size={18} color="#6D7484" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Catalog */}
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
          paddingTop: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {sections.length === 0 ? (
          <View className="items-center px-4 py-20">
            <Ionicons name="search" size={28} color="#6B7280" />
            <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
              No categories match
            </Text>
            <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
              Try a different word — moods, genres, and formats all count.
            </Text>
          </View>
        ) : (
          sections.map((section, sectionIndex) => (
            <View
              key={section.group.key}
              className={sectionIndex === 0 ? "" : "mt-8"}
            >
              <View className="mb-3 flex-row items-center gap-2.5">
                <View
                  style={[
                    styles.groupIcon,
                    { backgroundColor: withAlpha(section.group.accent, 0.16) },
                  ]}
                >
                  <Ionicons
                    name={section.group.icon}
                    size={14}
                    color={section.group.accent}
                    accessible={false}
                    accessibilityElementsHidden
                    aria-hidden={true}
                    importantForAccessibility="no"
                  />
                </View>
                <Text
                  accessibilityRole="header"
                  className="text-[15px] font-extrabold text-text-primary"
                >
                  {section.group.title}
                </Text>
                <View className="flex-1 h-px bg-dark-border" />
              </View>

              <View className="flex-row flex-wrap gap-2">
                {section.facets.map((facet) => {
                  const count = showCounts?.get(facet.key) ?? 0;
                  const countLabel = formatShowCount(count);
                  return (
                    <Pressable
                      key={facet.key}
                      onPress={() => handleOpenFacet(facet)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        countLabel
                          ? `Browse ${facet.title}, ${countLabel} shows`
                          : `Browse ${facet.title}`
                      }
                      style={[
                        styles.chip,
                        {
                          backgroundColor: withAlpha(section.group.accent, 0.1),
                          borderColor: withAlpha(section.group.accent, 0.32),
                        },
                      ]}
                      className="active:opacity-75"
                    >
                      <Text className="text-[13px] font-semibold text-text-primary">
                        {facet.title}
                      </Text>
                      {countLabel ? (
                        <Text
                          className="text-[11px] font-bold"
                          style={{ color: section.group.accent }}
                        >
                          {countLabel}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  filterField: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 42,
  },
  groupIcon: {
    alignItems: "center",
    borderRadius: 9,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
});
