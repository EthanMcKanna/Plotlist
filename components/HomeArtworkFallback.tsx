import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

type HomeArtworkFallbackProps = {
  title?: string | null;
  subtitle?: string | null;
  accent: string;
  testID?: string;
  compact?: boolean;
  copyVisible?: boolean;
  markVisible?: boolean;
  haloVisible?: boolean;
  ornamentsVisible?: boolean;
};

export function getArtworkFallbackInitials(title?: string | null) {
  const words = title
    ?.trim()
    .split(/\s+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word));
  if (!words?.length) return "TV";

  return words
    .slice(0, words.length === 1 ? 1 : 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function HomeArtworkFallback({
  title,
  subtitle,
  accent,
  testID,
  compact = false,
  copyVisible = true,
  markVisible = true,
  haloVisible = true,
  ornamentsVisible = true,
}: HomeArtworkFallbackProps) {
  const initials = getArtworkFallbackInitials(title);
  const cleanTitle = title?.trim();
  const cleanSubtitle = subtitle?.trim();

  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      style={styles.root}
    >
      <LinearGradient
        colors={[`${accent}4A`, "rgba(22,26,34,0.92)", "#10141C"]}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
      {ornamentsVisible && haloVisible ? (
        <View
          style={[
            styles.halo,
            {
              backgroundColor: `${accent}1F`,
              borderColor: `${accent}33`,
            },
          ]}
        />
      ) : null}
      {ornamentsVisible ? (
        <>
          <View style={[styles.diagonal, { backgroundColor: `${accent}26` }]} />
          <View style={[styles.diagonalSmall, { backgroundColor: `${accent}18` }]} />
        </>
      ) : null}
      {markVisible ? (
        <View
          style={[
            styles.mark,
            compact ? styles.markCompact : null,
            !copyVisible ? styles.markLifted : null,
            {
              backgroundColor: `${accent}18`,
              borderColor: `${accent}66`,
            },
          ]}
        >
          <Text
            className={
              compact
                ? "text-[16px] font-black text-white"
                : "text-[22px] font-black text-white"
            }
          >
            {initials}
          </Text>
        </View>
      ) : null}
      {copyVisible && cleanTitle ? (
        <View style={styles.copy}>
          <Text
            className={
              compact
                ? "text-[13px] font-black leading-[16px] text-white"
                : "text-[16px] font-black leading-[20px] text-white"
            }
            numberOfLines={compact ? 1 : 2}
          >
            {cleanTitle}
          </Text>
          {cleanSubtitle ? (
            <Text
              className="mt-1 text-[10px] font-bold text-white/60"
              numberOfLines={1}
            >
              {cleanSubtitle}
            </Text>
          ) : null}
        </View>
      ) : !cleanTitle ? (
        <Ionicons name="tv-outline" size={28} color={accent} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  halo: {
    borderRadius: 999,
    borderWidth: 1,
    height: 154,
    position: "absolute",
    right: -48,
    top: -58,
    width: 154,
  },
  diagonal: {
    height: 34,
    left: -24,
    opacity: 0.7,
    position: "absolute",
    top: 28,
    transform: [{ rotate: "-18deg" }],
    width: "68%",
  },
  diagonalSmall: {
    bottom: 24,
    height: 18,
    opacity: 0.65,
    position: "absolute",
    right: -16,
    transform: [{ rotate: "-18deg" }],
    width: "54%",
  },
  mark: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  markCompact: {
    height: 44,
    width: 44,
  },
  markLifted: {
    position: "absolute",
    right: 18,
    top: 26,
  },
  copy: {
    bottom: 14,
    left: 14,
    position: "absolute",
    right: 14,
  },
});
