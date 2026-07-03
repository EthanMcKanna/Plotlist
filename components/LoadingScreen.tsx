import { Image } from "expo-image";
import { StyleSheet, useWindowDimensions, View } from "react-native";

// Same asset the native splash screen renders.
const SPLASH_ICON = require("../assets/splash-icon.png");

// Native splash config (app.json): splash-icon.png, resizeMode "contain",
// background #0D0F14. The OS splash aspect-fits the square icon to the
// screen, so the first JS frame reproduces that exactly — the handoff from
// native splash to this screen (and any later auth/profile wait) reads as a
// single uninterrupted loading screen instead of two different ones.
export function LoadingScreen() {
  const { width, height } = useWindowDimensions();
  const iconSize = Math.min(width, height);

  return (
    <View style={styles.root}>
      <Image
        accessibilityIgnoresInvertColors
        source={SPLASH_ICON}
        style={{ width: iconSize, height: iconSize }}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    backgroundColor: "#0D0F14",
    flex: 1,
    justifyContent: "center",
  },
});
