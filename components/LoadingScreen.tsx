import { useEffect, useRef } from "react";
import { Image } from "expo-image";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

// Same asset the app icon uses; the native splash (assets/splash-icon.png)
// is generated from it by scripts/generate-splash.py: a #0D0F14 canvas with
// this icon rounded-masked at 38% of the canvas, centered.
const APP_ICON = require("../assets/icon.png");

// Must mirror the generated splash geometry so the native-splash → JS
// handoff is seamless: the icon keeps its exact size and center position,
// and only the wordmark eases in beneath it.
const TILE_RATIO = 0.38;
const RADIUS_RATIO = 0.2237;

export function LoadingScreen() {
  const { width, height } = useWindowDimensions();
  const iconSize = Math.round(Math.min(width, height) * TILE_RATIO);
  const wordmark = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(wordmark, {
      toValue: 1,
      duration: 480,
      delay: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [wordmark]);

  return (
    <View style={styles.root}>
      <Image
        accessibilityIgnoresInvertColors
        source={APP_ICON}
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: Math.round(iconSize * RADIUS_RATIO),
        }}
        contentFit="cover"
      />
      <Animated.Text
        style={[
          styles.name,
          {
            top: height / 2 + iconSize / 2 + 24,
            opacity: wordmark,
            transform: [
              {
                translateY: wordmark.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
        accessibilityRole="header"
      >
        Plotlist
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  name: {
    color: "#F1F3F7",
    fontSize: 28,
    fontWeight: "900",
    left: 0,
    letterSpacing: -0.8,
    position: "absolute",
    right: 0,
    textAlign: "center",
  },
  root: {
    alignItems: "center",
    backgroundColor: "#0D0F14",
    flex: 1,
    justifyContent: "center",
  },
});
