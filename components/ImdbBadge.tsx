import { Text, View } from "react-native";

export const IMDB_YELLOW = "#F5C518";

// The lozenge-only wordmark; callers place the rating text next to it so the
// number can match the surrounding typography.
export function ImdbLogo({ height = 15 }: { height?: number }) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: IMDB_YELLOW,
        borderRadius: height * 0.27,
        height,
        justifyContent: "center",
        paddingHorizontal: height * 0.3,
      }}
    >
      <Text
        style={{
          color: "#161616",
          fontSize: height * 0.6,
          fontWeight: "800",
          letterSpacing: 0.3,
          lineHeight: height * 0.75,
        }}
      >
        IMDb
      </Text>
    </View>
  );
}
