import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { LoadingScreen } from "./LoadingScreen";

// Web ships a static boot shell in dist/index.html (dark page + wordmark)
// so the pre-JS paint matches this overlay; drop it once React owns the
// screen. Safe no-op in dev where the shell isn't injected.
function removeWebBootShell() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.getElementById("plotlist-boot")?.remove();
}

// Full-screen launch curtain. It is a pixel-match of the native splash, so
// the native-splash → JS handoff is invisible, and it stays up while auth
// bootstrap + the initial redirect happen underneath. When `visible` flips
// off it dissolves (fade + slight zoom) to reveal the settled screen —
// navigation never happens in view, which kills the white slide-in.
export function LaunchOverlay({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [rendered, setRendered] = useState(visible);
  const hasShownOnce = useRef(false);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      if (!hasShownOnce.current) {
        // Cold start: the native splash is still covering us, so appear
        // instantly and let the splash cross-fade into this overlay.
        hasShownOnce.current = true;
        opacity.setValue(1);
        scale.setValue(1);
        return;
      }
      // Re-appearing mid-session (e.g. right after signing in): ease in
      // instead of popping.
      scale.setValue(1);
      const animation = Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.06,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setRendered(false);
    });
    return () => animation.stop();
  }, [visible, opacity, scale]);

  if (!rendered) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, { opacity, transform: [{ scale }] }]}
      onLayout={() => {
        // First real frame is committed — drop the web boot shell and
        // dissolve the native splash into this identical overlay (fade
        // configured in the root layout).
        removeWebBootShell();
        void SplashScreen.hideAsync();
      }}
    >
      <LoadingScreen />
    </Animated.View>
  );
}
