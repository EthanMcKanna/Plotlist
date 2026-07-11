import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { HomeSectionHeader } from "./HomeSectionHeader";
import { guardedPush } from "../lib/navigation";
import { api } from "../lib/plotlist/api";
import { useAction } from "../lib/plotlist/react";
import {
  GENRE_EXPLORER_GROUPS,
  getFacetsForGroup,
  getGenreExplorerGroup,
  withAlpha,
} from "../lib/genreExplorer";
import { FACET_DEFS, type FacetDef, type FacetGroupKey } from "../lib/plotlist/facets";

const CARD_WIDTH = 148;
const CARD_HEIGHT = 198;
const FAN_POSTER_WIDTH = 58;
const FAN_POSTER_HEIGHT = 87;

// Poster previews survive remounts (tab switches) for the whole session; the
// artwork behind a category barely changes day to day.
const facetPreviewCache = new Map<string, string[]>();

function FanPoster({
  uri,
  style,
}: {
  uri: string | null;
  style: object;
}) {
  return (
    <View style={[styles.fanPoster, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="low"
          transition={220}
        />
      ) : null}
    </View>
  );
}

function FacetCard({
  facet,
  accent,
  posters,
  onPress,
}: {
  facet: FacetDef;
  accent: string;
  posters: string[];
  onPress: (facet: FacetDef) => void;
}) {
  const [front, left, right] = [posters[0] ?? null, posters[1] ?? null, posters[2] ?? null];
  return (
    <Pressable
      onPress={() => onPress(facet)}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${facet.title}`}
      style={styles.card}
      className="active:opacity-85"
    >
      <LinearGradient
        colors={[withAlpha(accent, 0.2), withAlpha(accent, 0.04), "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.fanArea}>
        <FanPoster uri={left} style={styles.fanLeft} />
        <FanPoster uri={right} style={styles.fanRight} />
        <FanPoster uri={front} style={styles.fanFront} />
      </View>
      <View style={styles.cardFooter}>
        <Text
          className="text-[14px] font-extrabold leading-[18px] text-text-primary"
          numberOfLines={2}
        >
          {facet.title}
        </Text>
        <View className="mt-1.5 flex-row items-center gap-1">
          <Text
            className="text-[11px] font-bold uppercase"
            style={{ color: accent, letterSpacing: 0.4 }}
          >
            Browse
          </Text>
          <Ionicons
            name="arrow-forward"
            size={11}
            color={accent}
            accessible={false}
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no"
          />
        </View>
      </View>
    </Pressable>
  );
}

function AllCategoriesCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse all ${FACET_DEFS.length} categories`}
      style={[styles.card, styles.allCard]}
      className="active:opacity-85"
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
    </Pressable>
  );
}

// Genre explorer for the search page's idle surface: pick a group, skim its
// categories as poster-fan cards, tap through to the /facet/[key] page.
export function GenreExplorer() {
  const getFacetPreviews = useAction(api.embeddings.getFacetPreviews);
  const [selectedGroup, setSelectedGroup] = useState<FacetGroupKey>("mood");
  // Bumped whenever the module-level preview cache gains entries so cards
  // holding empty frames re-render with artwork.
  const [, setPreviewEpoch] = useState(0);

  const group = getGenreExplorerGroup(selectedGroup);
  const facets = useMemo(() => getFacetsForGroup(selectedGroup), [selectedGroup]);

  useEffect(() => {
    const missing = facets
      .filter((facet) => !facetPreviewCache.has(facet.key))
      .map((facet) => facet.key)
      .slice(0, 40);
    if (missing.length === 0) return;
    let cancelled = false;

    getFacetPreviews({ facetKeys: missing })
      .then((rows) => {
        if (cancelled) return;
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (row?.key) {
              facetPreviewCache.set(
                row.key,
                Array.isArray(row.posters) ? row.posters : [],
              );
            }
          }
        }
        // Keys the server skipped stay resolved so we don't refetch forever.
        for (const key of missing) {
          if (!facetPreviewCache.has(key)) facetPreviewCache.set(key, []);
        }
        setPreviewEpoch((epoch) => epoch + 1);
      })
      .catch(() => {
        // Cards degrade gracefully to gradient + title; retry on next mount.
      });

    return () => {
      cancelled = true;
    };
  }, [facets, getFacetPreviews]);

  const handleSelectGroup = useCallback((key: FacetGroupKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGroup(key);
  }, []);

  const handleOpenFacet = useCallback((facet: FacetDef) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedPush(`/facet/${facet.key}`);
  }, []);

  const handleOpenCatalog = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedPush("/explore");
  }, []);

  const renderCard = useCallback(
    ({ item }: { item: FacetDef | "all" }) => {
      if (item === "all") {
        return <AllCategoriesCard onPress={handleOpenCatalog} />;
      }
      return (
        <FacetCard
          facet={item}
          accent={group.accent}
          posters={facetPreviewCache.get(item.key) ?? []}
          onPress={handleOpenFacet}
        />
      );
    },
    [group.accent, handleOpenCatalog, handleOpenFacet],
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
        onAction={handleOpenCatalog}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        accessibilityLabel="Category groups"
      >
        {GENRE_EXPLORER_GROUPS.map((candidate) => {
          const isActive = candidate.key === selectedGroup;
          return (
            <Pressable
              key={candidate.key}
              onPress={() => handleSelectGroup(candidate.key)}
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
        })}
      </ScrollView>

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
  cardFooter: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  cardRow: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  fanArea: {
    alignItems: "center",
    height: 112,
    justifyContent: "flex-start",
    marginTop: 14,
  },
  fanFront: {
    top: 6,
  },
  fanLeft: {
    left: CARD_WIDTH / 2 - FAN_POSTER_WIDTH / 2 - 34,
    top: 14,
    transform: [{ rotate: "-9deg" }],
  },
  fanPoster: {
    backgroundColor: "#1C2028",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: FAN_POSTER_HEIGHT,
    overflow: "hidden",
    position: "absolute",
    width: FAN_POSTER_WIDTH,
  },
  fanRight: {
    right: CARD_WIDTH / 2 - FAN_POSTER_WIDTH / 2 - 34,
    top: 14,
    transform: [{ rotate: "9deg" }],
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
});
