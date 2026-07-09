import { useMemo } from "react";

import { SignatureRail, type SignatureRailItem } from "./SignatureRail";
import type {
  SearchDiscoverItem,
  SearchDiscoverSection,
} from "../lib/searchDiscover";

type SearchDiscoveryRailProps<Item extends SearchDiscoverItem> = {
  index?: number;
  section: SearchDiscoverSection<Item>;
  accent: string;
  onPressItem: (item: Item) => void;
  actionLabel?: string;
  onAction?: () => void;
};

function getSearchDiscoveryItemKey(item: SearchDiscoverItem, index: number) {
  if (item.externalSource && item.externalId !== undefined && item.externalId !== null) {
    return `${item.externalSource}:${item.externalId}`;
  }
  if (item.externalId !== undefined && item.externalId !== null) {
    return String(item.externalId);
  }
  return `${item.title ?? "show"}:${item.year ?? "unknown"}:${index}`;
}

// Thin adapter over the home SignatureRail so search discovery sections share
// the exact rail treatment as home: clean title header (no icon chip) and
// pure poster cards (no title/dot/year caption under the artwork).
export function SearchDiscoveryRail<Item extends SearchDiscoverItem>({
  index,
  section,
  accent,
  onPressItem,
  actionLabel,
  onAction,
}: SearchDiscoveryRailProps<Item>) {
  const { railItems, itemByKey } = useMemo(() => {
    const byKey = new Map<string, Item>();
    const items: SignatureRailItem[] = section.items.map((item, itemIndex) => {
      const key = getSearchDiscoveryItemKey(item, itemIndex);
      byKey.set(key, item);
      return {
        key,
        title: item.title?.trim() || "Unknown",
        posterUrl: item.posterUrl ?? null,
        year: item.year ?? null,
      };
    });
    return { railItems: items, itemByKey: byKey };
  }, [section.items]);

  if (railItems.length === 0) return null;

  return (
    <SignatureRail
      index={index}
      kicker="Discover"
      title={section.label}
      accent={accent}
      layout="poster"
      items={railItems}
      featureCardWidth={280}
      limit={railItems.length}
      actionLabel={actionLabel}
      onAction={onAction}
      onPressItem={(railItem) => {
        const original = itemByKey.get(railItem.key);
        if (original) {
          onPressItem(original);
        }
      }}
    />
  );
}
