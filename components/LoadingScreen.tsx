import { useEffect, useRef } from "react";
import { Image } from "expo-image";
import {
  Animated,
  Easing,
  Platform,
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

// Web boot curtain: browsers have no native splash to hand off from, so the
// mobile app-icon tile reads as a phone app flashing on every page load.
// Instead: a plain dark surface whose wordmark only fades in when boot takes
// long enough to notice — fast loads show nothing but the page background.
// Mirrors the static pre-JS shell injected into dist/index.html by
// scripts/postprocess-web-export.mjs.
function WebLoadingScreen() {
  // If the static shell's wordmark already faded in (slow load), start
  // visible so the shell → React handoff doesn't blink.
  const bootWordmarkVisible = useRef(
    typeof document !== "undefined" &&
      (() => {
        const el = document.getElementById("plotlist-boot-wordmark");
        if (!el) return false;
        return parseFloat(getComputedStyle(el).opacity || "0") > 0.05;
      })(),
  ).current;
  const wordmark = useRef(
    new Animated.Value(bootWordmarkVisible ? 1 : 0),
  ).current;

  useEffect(() => {
    if (bootWordmarkVisible) return;
    const animation = Animated.timing(wordmark, {
      toValue: 1,
      duration: 300,
      delay: 250,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [bootWordmarkVisible, wordmark]);

  return (
    <View style={styles.root}>
      <Animated.Text style={[styles.name, styles.webName, { opacity: wordmark }]}>
        Plotlist
      </Animated.Text>
    </View>
  );
}

export function LoadingScreen() {
  if (Platform.OS === "web") {
    return <WebLoadingScreen />;
  }
  return <NativeLoadingScreen />;
}

function NativeLoadingScreen() {
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
  webName: {
    position: "relative",
  },
  root: {
    alignItems: "center",
    backgroundColor: "#0D0F14",
    flex: 1,
    justifyContent: "center",
  },
});
