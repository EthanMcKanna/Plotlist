import { View } from "react-native";

import { ShimmerBlock } from "./ShowDetailSkeleton";

// First-page placeholder for poster grids (My Shows, public watchlists).
// Mirrors the real grid's column math so the loaded posters land exactly
// where the shimmer blocks were — no layout jump, and never an empty-state
// flash while the first page (or a new filter's first page) is in flight.
export function PosterGridSkeleton({
  numColumns,
  itemWidth,
  gap = 12,
  rows = 2,
}: {
  numColumns: number;
  itemWidth: number;
  gap?: number;
  rows?: number;
}) {
  const count = Math.max(1, numColumns) * Math.max(1, rows);
  return (
    <View
      testID="poster-grid-skeleton"
      accessibilityLabel="Loading shows"
      className="flex-row flex-wrap"
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            width: itemWidth,
            marginRight: index % numColumns === numColumns - 1 ? 0 : gap,
            marginBottom: gap,
          }}
        >
          <ShimmerBlock width={itemWidth} height={itemWidth * 1.5} radius={12} />
          <ShimmerBlock width="80%" height={12} radius={6} style={{ marginTop: 8 }} />
          <ShimmerBlock width="50%" height={10} radius={5} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}
