import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

export function Poster({
  uri,
  size = "md",
  width,
  className,
  alt,
}: {
  uri?: string | null;
  size?: "sm" | "md" | "lg";
  width?: number;
  className?: string;
  // Show title; becomes the <img> alt attribute on web (expo-image maps
  // accessibilityLabel to alt), read by assistive tech everywhere.
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dimension =
    width ?? (size === "sm" ? 60 : size === "lg" ? 140 : 90);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <View
      testID="poster-frame"
      style={[
        styles.frame,
        { width: dimension, height: dimension * 1.5, borderRadius: 12 },
      ]}
      className={className}
    >
      <View
        testID="poster-fallback"
        style={StyleSheet.absoluteFill}
        className="items-center justify-center"
      >
        <Ionicons name="film-outline" size={Math.max(18, dimension * 0.24)} color="#5E6575" />
      </View>
      {uri && !failed ? (
        <Image
          testID="poster-image"
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="low"
          transition={200}
          onError={() => setFailed(true)}
          className={className}
          accessibilityLabel={alt}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: "#1A1F29",
    borderColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    overflow: "hidden",
  },
});
