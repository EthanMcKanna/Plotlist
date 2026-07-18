import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { FanPreviewCard } from "./FanPreviewCard";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { HorizontalRail } from "./HorizontalRail";
import { LinkPressable } from "./LinkPressable";
import { api } from "../lib/plotlist/api";
import { useAction } from "../lib/plotlist/react";
import {
  GENRE_EXPLORER_GROUPS,
  getFacetsForGroup,
  getGenreExplorerGroup,
  withAlpha,
} from "../lib/genreExplorer";
import {
  getCachedFacetPosters,
  missingFacetPreviewKeys,
  storeFacetPreviews,
} from "../lib/facetPreviewStore";
import { useIsDesktopWeb } from "../lib/webLayout";
import { FACET_DEFS, type FacetDef, type FacetGroupKey } from "../lib/plotlist/facets";

const CARD_WIDTH = 148;
const CARD_HEIGHT = 198;

// Horizontal row of facet-group pills (icon + title, tinted by the group
// accent when active). Shared between the search page explorer and /explore
// so group navigation looks identical everywhere.
export function FacetGroupPills({
  selected,
  onSelect,
  style,
}: {
  selected: FacetGroupKey;
  onSelect: (key: FacetGroupKey) => void;
  style?: object;
}) {
  const isDesktopWeb = useIsDesktopWeb();
  const pills = GENRE_EXPLORER_GROUPS.map((candidate) => {
    const isActive = candidate.key === selected;
    return (
      <Pressable
        key={candidate.key}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSelect(candidate.key);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`Show ${candidate.title} categories`}
        style={[
          styles.pill,
          {
            backgroundColor: isActive
              ? withAlpha(candidate.accent, 0.16)
              : "rgba(255,255,255,0.06)",
            borderColor: isActive
              ? withAlpha(candidate.accent, 0.55)
              : "rgba(255,255,255,0.09)",
          },
        ]}
        className="active:opacity-75"
      >
        <Ionicons
          name={candidate.icon}
          size={13}
          color={isActive ? candidate.accent : "#9BA1B0"}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
        <Text
          className="text-[13px] font-semibold"
          style={{ color: isActive ? candidate.accent : "#9BA1B0" }}
        >
          {candidate.title}
        </Text>
      </Pressable>
    );
  });

  if (isDesktopWeb) {
    // Desktop web gets hover paging arrows when the pill row overflows. The
    // rail's wrapper View sizes to content, so the pillScroller height
    // constraint below isn't needed there.
    return (
      <HorizontalRail
        accessibilityLabel="Category groups"
        contentContainerStyle={[styles.pillRow, style]}
      >
        {pills}
      </HorizontalRail>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Never compete for height with a sibling vertical ScrollView (both
      // default to flexGrow: 1 inside a flex column).
      style={styles.pillScroller}
      contentContainerStyle={[styles.pillRow, style]}
      accessibilityLabel="Category groups"
    >
      {pills}
    </ScrollView>
  );
}

function FacetCard({
  facet,
  accent,
  posters,
}: {
  facet: FacetDef;
  accent: string;
  posters: string[];
}) {
  return (
    <FanPreviewCard
      title={facet.title}
      accent={accent}
      posters={posters}
      action="Browse"
      accessibilityLabel={`Browse ${facet.title}`}
      style={styles.cardSpacing}
      href={`/facet/${facet.key}`}
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
    />
  );
}

function AllCategoriesCard() {
  return (
    <LinkPressable
      href="/explore"
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      accessibilityRole="button"
      accessibilityLabel={`Browse all ${FACET_DEFS.length} categories`}
      style={[styles.card, styles.allCard]}
      className="active:opacity-85 hover:opacity-90 web:transition-opacity"
    >
      <View style={styles.allCardIcon}>
        <Ionicons
          name="grid"
          size={20}
          color="#F1F3F7"
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      </View>
      <Text className="mt-3 text-center text-[14px] font-extrabold text-text-primary">
        All categories
      </Text>
      <Text className="mt-1 text-center text-[12px] font-semibold text-text-tertiary">
        {FACET_DEFS.length} ways in
      </Text>
    </LinkPressable>
  );
}

// Genre explorer for the search page's idle surface: pick a group, skim its
// categories as poster-fan cards, tap through to the /facet/[key] page.
export function GenreExplorer() {
  const getFacetPreviews = useAction(api.embeddings.getFacetPreviews);
  const [selectedGroup, setSelectedGroup] = useState<FacetGroupKey>("mood");
  // Bumped whenever the shared preview cache gains entries so cards holding
  // empty frames re-render with artwork.
  const [, setPreviewEpoch] = useState(0);

  const group = getGenreExplorerGroup(selectedGroup);
  const facets = useMemo(() => getFacetsForGroup(selectedGroup), [selectedGroup]);

  useEffect(() => {
    const missing = missingFacetPreviewKeys(facets);
    if (missing.length === 0) return;
    let cancelled = false;

    getFacetPreviews({ facetKeys: missing })
      .then((rows) => {
        if (cancelled) return;
        if (storeFacetPreviews(rows, missing)) {
          setPreviewEpoch((epoch) => epoch + 1);
        }
      })
      .catch(() => {
        // Cards degrade gracefully to gradient + title; retry on next mount.
      });

    return () => {
      cancelled = true;
    };
  }, [facets, getFacetPreviews]);

  const renderCard = useCallback(
    ({ item }: { item: FacetDef | "all" }) => {
      if (item === "all") {
        return <AllCategoriesCard />;
      }
      return (
        <FacetCard
          facet={item}
          accent={group.accent}
          posters={getCachedFacetPosters(item.key)}
        />
      );
    },
    [group.accent],
  );

  const cards = useMemo<Array<FacetDef | "all">>(
    () => [...facets, "all"],
    [facets],
  );

  return (
    <View className="mt-7">
      <HomeSectionHeader
        kicker="Explore"
        title="Explore by category"
        subtitle="Moods, genres, and rabbit holes from across the catalog"
        accent={group.accent}
        actionLabel="All"
        actionHref="/explore"
      />

      <FacetGroupPills selected={selectedGroup} onSelect={setSelectedGroup} />

      {Platform.OS === "web" ? (
        // Desktop web gets hover scroll-arrows; card counts are small enough
        // to render eagerly there.
        <HorizontalRail
          accessibilityLabel={`${group.title} categories`}
          contentContainerStyle={styles.cardRow}
        >
          {cards.map((item) => (
            <View key={item === "all" ? "all" : item.key}>
              {renderCard({ item })}
            </View>
          ))}
        </HorizontalRail>
      ) : (
        <FlatList
          horizontal
          data={cards}
          renderItem={renderCard}
          keyExtractor={(item) => (item === "all" ? "all" : item.key)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          accessibilityLabel={`${group.title} categories`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  allCard: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.14)",
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  allCardIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  card: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: CARD_HEIGHT,
    marginRight: 12,
    overflow: "hidden",
    width: CARD_WIDTH,
  },
  cardRow: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  cardSpacing: {
    marginRight: 12,
  },
  pill: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    marginRight: 8,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillRow: {
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  pillScroller: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
