import { ComponentType, ReactNode, useMemo } from "react";
import {
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from "react-native";

type GlassVariant = "surface" | "control" | "prominent" | "sheet";

// Apple's Liquid Glass guidance: glass belongs on the control/navigation
// layer floating above content, never on the content itself. "surface" is
// our content-card variant (settings groups, stats panels, detail sections),
// so it always renders the solid tinted fallback; only true controls and
// overlays ("control", "prominent", "sheet") get native glass.
const NATIVE_GLASS_VARIANTS: ReadonlySet<GlassVariant> = new Set([
  "control",
  "prominent",
  "sheet",
]);
type GlassStyle = "clear" | "regular";

type VariantTokens = {
  borderColor: string;
  fallbackColor: string;
  tintColor: string;
};

const VARIANT_TOKENS: Record<GlassVariant, VariantTokens> = {
  surface: {
    borderColor: "rgba(255,255,255,0.11)",
    fallbackColor: "rgba(22,26,34,0.88)",
    tintColor: "rgba(13,15,20,0.42)",
  },
  control: {
    borderColor: "rgba(255,255,255,0.14)",
    fallbackColor: "rgba(255,255,255,0.07)",
    tintColor: "rgba(16,20,28,0.24)",
  },
  prominent: {
    borderColor: "rgba(125,211,252,0.28)",
    fallbackColor: "rgba(14,165,233,0.20)",
    tintColor: "rgba(14,165,233,0.16)",
  },
  sheet: {
    borderColor: "rgba(255,255,255,0.14)",
    fallbackColor: "rgba(17,20,27,0.96)",
    tintColor: "rgba(13,15,20,0.58)",
  },
};

type NativeGlassViewProps = ViewProps & {
  glassEffectStyle?: GlassStyle;
  tintColor?: string;
  isInteractive?: boolean;
  colorScheme?: "auto" | "light" | "dark";
};

// Liquid Glass ships through this single guarded choke point. The native
// module previously crashed release builds when the JS bundle and binary
// disagreed about its presence (`requireNativeModule` throws), so:
// 1. only touch the module on iOS,
// 2. lazy-require inside try/catch,
// 3. render natively only when isLiquidGlassAvailable() confirms iOS 26+
//    support in the installed binary,
// 4. never animate opacity on a glass view or its parents (see
//    docs/ios-native-surface-audit.md).
// Anything else falls back to the tinted JS surfaces below.
let NativeGlassView: ComponentType<NativeGlassViewProps> | null = null;

if (Platform.OS === "ios") {
  try {
    const glassModule = require("expo-glass-effect");
    if (
      typeof glassModule?.isLiquidGlassAvailable === "function" &&
      glassModule.isLiquidGlassAvailable() === true &&
      glassModule.GlassView
    ) {
      NativeGlassView = glassModule.GlassView as ComponentType<NativeGlassViewProps>;
    }
  } catch {
    NativeGlassView = null;
  }
}

export function isNativeGlassAvailable() {
  return NativeGlassView !== null;
}

export function GlassSurface({
  children,
  style,
  contentStyle,
  radius = 8,
  variant = "surface",
  glassEffectStyle = "regular",
  tintColor,
  fallbackColor,
  borderColor,
  interactive = false,
  ...viewProps
}: ViewProps & {
  children?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  variant?: GlassVariant;
  glassEffectStyle?: GlassStyle;
  tintColor?: string;
  fallbackColor?: string;
  borderColor?: string;
  interactive?: boolean;
}) {
  const tokens = VARIANT_TOKENS[variant];
  const resolvedBorderColor = borderColor ?? tokens.borderColor;
  const resolvedFallbackColor = fallbackColor ?? tokens.fallbackColor;
  const resolvedTintColor = tintColor ?? tokens.tintColor;
  const GlassView = NATIVE_GLASS_VARIANTS.has(variant) ? NativeGlassView : null;
  const surfaceStyle = useMemo(
    () => [
      styles.surface,
      {
        borderColor: resolvedBorderColor,
        borderRadius: radius,
        // Native glass supplies its own material; painting a background over
        // it would flatten the effect.
        backgroundColor: GlassView ? "transparent" : resolvedFallbackColor,
      },
      style,
    ],
    [radius, resolvedBorderColor, resolvedFallbackColor, style, GlassView],
  );

  if (GlassView) {
    return (
      <GlassView
        {...viewProps}
        glassEffectStyle={glassEffectStyle}
        tintColor={resolvedTintColor}
        isInteractive={interactive}
        colorScheme="dark"
        style={surfaceStyle}
      >
        <View style={contentStyle}>{children}</View>
      </GlassView>
    );
  }

  return (
    <View {...viewProps} style={surfaceStyle}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

export function GlassPressable({
  children,
  style,
  surfaceStyle,
  contentStyle,
  disabled,
  radius = 8,
  variant = "control",
  glassEffectStyle = "regular",
  tintColor,
  fallbackColor,
  borderColor,
  ...pressableProps
}: PressableProps & {
  children?: ReactNode;
  surfaceStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  variant?: GlassVariant;
  glassEffectStyle?: GlassStyle;
  tintColor?: string;
  fallbackColor?: string;
  borderColor?: string;
}) {
  const surface = (hovered: boolean, pressed: boolean) => (
    <GlassSurface
      radius={radius}
      variant={variant}
      glassEffectStyle={glassEffectStyle}
      tintColor={tintColor}
      fallbackColor={fallbackColor}
      borderColor={borderColor}
      interactive={!disabled}
      style={surfaceStyle}
      contentStyle={contentStyle}
    >
      {children}
      {Platform.OS === "web" && !disabled ? (
        // Pointer feedback for every glass control on web; never rendered
        // on native, where glass has its own press treatment.
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.webHoverOverlay,
            { opacity: pressed ? 0.09 : hovered ? 0.055 : 0 },
          ]}
        />
      ) : null}
    </GlassSurface>
  );

  if (Platform.OS !== "web") {
    return (
      <Pressable
        {...pressableProps}
        disabled={disabled}
        style={typeof style === "function" ? style : [styles.pressable, style]}
      >
        {surface(false, false)}
      </Pressable>
    );
  }

  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      style={typeof style === "function" ? style : [styles.pressable, style]}
    >
      {(state) =>
        surface(
          Boolean((state as { hovered?: boolean }).hovered),
          state.pressed,
        )
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    transform: [{ scale: 1 }],
  },
  webHoverOverlay: {
    backgroundColor: "#FFFFFF",
    // react-native-web maps these to CSS transitions; unknown on native,
    // but this branch never renders there.
    transitionDuration: "120ms",
    transitionProperty: "opacity",
  } as ViewStyle,
  surface: {
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
