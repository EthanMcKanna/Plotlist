import { View } from "react-native";

import { ShimmerBlock } from "./ShowDetailSkeleton";

// Mirrors UserRow's geometry (44pt avatar, two text lines, follow pill) so
// the list settles in place when real rows arrive instead of reflowing.
function UserRowSkeleton() {
  return (
    <View className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
      <View className="flex-row items-center gap-3">
        <ShimmerBlock width={44} height={44} radius={22} />
        <View className="flex-1 gap-2">
          <ShimmerBlock width="55%" height={14} radius={7} />
          <ShimmerBlock width="35%" height={11} radius={6} />
        </View>
        <ShimmerBlock width={82} height={32} radius={999} />
      </View>
    </View>
  );
}

export function UserListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    // Matches the 10pt ItemSeparatorComponent gap the real lists render with.
    <View className="py-4" style={{ gap: 10 }}>
      {Array.from({ length: rows }, (_, index) => (
        <UserRowSkeleton key={index} />
      ))}
    </View>
  );
}
