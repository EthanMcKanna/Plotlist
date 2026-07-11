import { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "../components/NativeGlass";
import { FacetGroupPills } from "../components/GenreExplorer";
import { guardedPush } from "../lib/navigation";
import { api } from "../lib/plotlist/api";
import { useAction } from "../lib/plotlist/react";
import {
  FACET_DEFS,
  type FacetDef,
  type FacetGroupKey,
} from "../lib/plotlist/facets";
import {
  filterFacets,
  formatShowCount,
  getFacetsForGroup,
  getGenreExplorerGroup,
  withAlpha,
} from "../lib/genreExplorer";
import {
  getCachedFacetPosters,
  missingFacetPreviewKeys,
  storeFacetPreviews,
} from "../lib/facetPreviewStore";

// Clamp to the web app frame (see WEB_APP_MAX_WIDTH in app/_layout.tsx) so
// the tile math holds in wide browser windows, not just on phones.
const FRAME_WIDTH = Math.min(Dimensions.get("window").width, 430);
const H_PADDING = 24;
const TILE_GAP = 12;
const TILE_WIDTH = (FRAME_WIDTH - H_PADDING * 2 - TILE_GAP) / 2;
const TILE_HEIGHT = 96;

// Show counts change slowly (nightly-ish ingest), so one fetch per app
// session is plenty.
let showCountCache: Map<string, number> | null = null;

function FacetTile({
  facet,
  accent,
  count,
  onPress,
}: {
  facet: FacetDef;
  accent: string;
  count: number;
  onPress: (facet: FacetDef) => void;
}) {
  const poster = getCachedFacetPosters(facet.key)[0] ?? null;
  const countLabel = formatShowCount(count);
  return (
    <Pressable
      onPress={() => onPress(facet)}
      accessibilityRole="button"
      accessibilityLabel={
        countLabel
          ? `Browse ${facet.title}, ${countLabel} shows`
          : `Browse ${facet.title}`
      }
      style={styles.tile}
      className="active:opacity-85"
    >
      <LinearGradient
        colors={[withAlpha(accent, 0.3), withAlpha(accent, 0.06)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {poster ? (
        <View style={styles.tilePoster}>
          <Image
            source={{ uri: poster }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="low"
            transition={220}
          />
        </View>
      ) : null}
      <View style={styles.tileContent}>
        <Text
          className="text-[14px] font-extrabold leading-[18px] text-text-primary"
          numberOfLines={2}
        >
          {facet.title}
        </Text>
        {countLabel ? (
          <Text
            className="text-[11px] font-bold"
            style={{ color: accent, paddingRight: 40 }}
            numberOfLines={1}
          >
            {countLabel} shows
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// The full facet catalog, Spotify-browse style: pick a group, scan its
// categories as accent-washed tiles with poster art peeking from the corner.
// The filter cuts across every group. Reached from the search page explorer.
export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const getFacetBrowse = useAction(api.embeddings.getFacetBrowse);
  const getFacetPreviews = useAction(api.embeddings.getFacetPreviews);

  const [filter, setFilter] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<FacetGroupKey>("mood");
  const [showCounts, setShowCounts] = useState<Map<string, number> | null>(
    showCountCache,
  );
  const [, setPreviewEpoch] = useState(0);

  const isFiltering = filter.trim().length > 0;
  const group = getGenreExplorerGroup(selectedGroup);
  const groupFacets = useMemo(
    () => getFacetsForGroup(selectedGroup),
    [selectedGroup],
  );
  const filteredFacets = useMemo(
    () => (isFiltering ? filterFacets(FACET_DEFS, filter) : []),
    [isFiltering, filter],
  );

  useEffect(() => {
    if (showCountCache) return;
    let cancelled = false;
    getFacetBrowse({})
      .then((groups: any) => {
        if (cancelled || !Array.isArray(groups)) return;
        const counts = new Map<string, number>();
        for (const browseGroup of groups) {
          for (const facet of browseGroup?.facets ?? []) {
            if (facet?.key) counts.set(facet.key, Number(facet.showCount) || 0);
          }
        }
        showCountCache = counts;
        setShowCounts(counts);
      })
      .catch(() => {
        // Tiles render without counts; nothing else depends on this call.
      });
    return () => {
      cancelled = true;
    };
  }, [getFacetBrowse]);

  // Artwork for whichever tiles are on screen: the selected group, or the
  // cross-group filter matches while filtering.
  const visibleFacets = isFiltering ? filteredFacets : groupFacets;
  useEffect(() => {
    const missing = missingFacetPreviewKeys(visibleFacets);
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
        // Tiles degrade gracefully to gradient + title.
      });
    return () => {
      cancelled = true;
    };
  }, [visibleFacets, getFacetPreviews]);

  const handleOpenFacet = (facet: FacetDef) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedPush(`/facet/${facet.key}`);
  };

  const renderTiles = (facets: FacetDef[], accentFor: (facet: FacetDef) => string) => (
    <View style={styles.tileGrid}>
      {facets.map((facet) => (
        <FacetTile
          key={facet.key}
          facet={facet}
          accent={accentFor(facet)}
          count={showCounts?.get(facet.key) ?? 0}
          onPress={handleOpenFacet}
        />
      ))}
    </View>
  );

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

      {/* Group navigation (hidden while a filter cuts across groups) */}
      {!isFiltering ? (
        <FacetGroupPills
          selected={selectedGroup}
          onSelect={setSelectedGroup}
          style={styles.groupPills}
        />
      ) : null}

      {/* Tiles */}
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: H_PADDING,
          paddingTop: isFiltering ? 16 : 14,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {isFiltering ? (
          filteredFacets.length === 0 ? (
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
            <View>
              <Text className="mb-3 text-[11px] font-bold uppercase text-text-tertiary">
                {filteredFacets.length}{" "}
                {filteredFacets.length === 1 ? "match" : "matches"}
              </Text>
              {renderTiles(filteredFacets, (facet) =>
                getGenreExplorerGroup(facet.group).accent,
              )}
            </View>
          )
        ) : (
          <View>
            <Text className="mb-3 text-[12px] leading-[17px] text-text-tertiary">
              {group.title} · {groupFacets.length} categories
            </Text>
            {renderTiles(groupFacets, () => group.accent)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  filterField: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 42,
  },
  groupPills: {
    paddingTop: 12,
  },
  tile: {
    backgroundColor: "#161A22",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: TILE_HEIGHT,
    overflow: "hidden",
    width: TILE_WIDTH,
  },
  // The corner poster only intrudes on the lower-right, so the title keeps
  // the full width; only the count row needs to clear the artwork.
  tileContent: {
    flex: 1,
    justifyContent: "space-between",
    padding: 11,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: TILE_GAP,
  },
  tilePoster: {
    backgroundColor: "#1C2028",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -12,
    height: 72,
    overflow: "hidden",
    position: "absolute",
    right: -10,
    transform: [{ rotate: "14deg" }],
    width: 48,
  },
});
