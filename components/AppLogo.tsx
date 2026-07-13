import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";

// The real app icon (192px derivative of assets/icon.png), used wherever web
// chrome shows the brand — sidebar, landing nav, footer. The artwork bakes in
// its own dark squircle, so this just rounds and hairlines the frame.
export function AppLogo({ size = 30 }: { size?: number }) {
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size * 0.24 },
      ]}
    >
      <Image
        source={require("../assets/brand-logo.png")}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
