// Presentation metadata for the genre explorer built on the recs v2 facet
// taxonomy (lib/plotlist/facets.ts). The taxonomy stays presentation-free on
// purpose — it is shared with the worker and the embedding pipeline — so the
// explorer's grouping order, icons, and accent colors live here.

import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import {
  FACET_DEFS,
  FACET_GROUPS,
  type FacetDef,
  type FacetGroupKey,
} from "./plotlist/facets";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type GenreExplorerGroup = {
  key: FacetGroupKey;
  title: string;
  icon: IconName;
  accent: string;
};

// Order tuned for browsing: broad moods first, formats and metadata-ish
// groups last. Every FacetGroupKey must appear exactly once — tests enforce.
const GROUP_PRESENTATION: Array<{
  key: FacetGroupKey;
  icon: IconName;
  accent: string;
}> = [
  { key: "mood", icon: "sparkles", accent: "#F472B6" },
  { key: "drama", icon: "flame", accent: "#FB7185" },
  { key: "scifi_fantasy", icon: "planet", accent: "#22D3EE" },
  { key: "comedy", icon: "happy", accent: "#FACC15" },
  { key: "animation", icon: "color-wand", accent: "#C084FC" },
  { key: "unscripted", icon: "videocam", accent: "#34D399" },
  { key: "origin", icon: "earth", accent: "#F59E0B" },
  { key: "format", icon: "albums", accent: "#38BDF8" },
];

export const GENRE_EXPLORER_GROUPS: GenreExplorerGroup[] =
  GROUP_PRESENTATION.map((group) => ({
    ...group,
    title: FACET_GROUPS[group.key].title,
  }));

export function getGenreExplorerGroup(key: FacetGroupKey): GenreExplorerGroup {
  return (
    GENRE_EXPLORER_GROUPS.find((group) => group.key === key) ??
    GENRE_EXPLORER_GROUPS[0]
  );
}

export function getFacetsForGroup(groupKey: FacetGroupKey): FacetDef[] {
  return FACET_DEFS.filter((facet) => facet.group === groupKey);
}

// Case-insensitive title/description filter for the full-catalog screen.
export function filterFacets(facets: FacetDef[], query: string): FacetDef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return facets;
  return facets.filter(
    (facet) =>
      facet.title.toLowerCase().includes(needle) ||
      facet.description.toLowerCase().includes(needle),
  );
}

// Compact show counts for category chips: 812 → "812", 7,340 → "7.3k".
export function formatShowCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  const rounded =
    thousands >= 10 ? Math.round(thousands).toString() : thousands.toFixed(1);
  return `${rounded.replace(/\.0$/, "")}k`;
}

// "#F472B6" + alpha → "rgba(244,114,182,0.14)". Accents are always 6-digit hex.
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
