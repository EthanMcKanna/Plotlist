import { ReactNode, useEffect, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { vars } from "nativewind";

import { accentVars } from "../lib/appearance";
import { hydrateAccentFromStorage, useAccent } from "../lib/appearanceStore";

// Start hydrating at module scope so the stored accent races the launch
// overlay instead of the user — a non-Sky user sees at most one frame of the
// default accent behind the overlay.
void hydrateAccentFromStorage();

// Supplies the --brand-* CSS variables that tailwind.config.js's brand ramp
// resolves against. Must wrap the whole Stack so every screen inherits them;
// renders Sky until hydration lands.
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const accent = useAccent();
  const style = useMemo(() => [styles.fill, vars(accentVars(accent))], [accent]);

  // react-native-web portals (Modal) render outside this View's DOM subtree,
  // so mirror the variables onto the root element — inline root styles beat
  // the sky defaults in global.css and inherit into portals.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    for (const [name, value] of Object.entries(accentVars(accent))) {
      document.documentElement.style.setProperty(name, value);
    }
  }, [accent]);

  return <View style={style}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    width: "100%",
  },
});
