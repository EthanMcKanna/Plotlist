import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// 5→1 star distribution bars for community rating stats. `histogram` is the
// server shape from buildRatingStats: index 0 = 1 star … index 4 = 5 stars.
export function RatingHistogram({
  histogram,
  compact = false,
}: {
  histogram: number[];
  compact?: boolean;
}) {
  const counts = Array.from({ length: 5 }, (_, i) => histogram[i] ?? 0);
  const max = Math.max(1, ...counts);
  const rowGap = compact ? 4 : 6;

  return (
    <View style={{ gap: rowGap }}>
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = counts[stars - 1];
        const ratio = count / max;
        return (
          <View key={stars} className="flex-row items-center gap-2">
            <View className="w-6 flex-row items-center justify-end gap-0.5">
              <Text className="text-[11px] font-semibold tabular-nums text-text-tertiary">
                {stars}
              </Text>
              <Ionicons
                name="star"
                size={9}
                color="#6B7280"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
            </View>
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: count > 0 ? "#FBBF24" : "transparent",
                  width: `${Math.max(ratio * 100, count > 0 ? 3 : 0)}%`,
                }}
              />
            </View>
            <Text className="w-7 text-right text-[11px] tabular-nums text-text-tertiary">
              {count}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
