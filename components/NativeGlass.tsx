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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
  const surfaceStyle = useMemo(
    () => [
      styles.surface,
      {
        borderColor: resolvedBorderColor,
        borderRadius: radius,
        // Native glass supplies its own material; painting a background over
        // it would flatten the effect.
        backgroundColor: NativeGlassView ? "transparent" : resolvedFallbackColor,
      },
      style,
    ],
    [radius, resolvedBorderColor, resolvedFallbackColor, style],
  );

  if (NativeGlassView) {
    return (
      <NativeGlassView
        {...viewProps}
        glassEffectStyle={glassEffectStyle}
        tintColor={resolvedTintColor}
        isInteractive={interactive}
        colorScheme="dark"
        style={surfaceStyle}
      >
        <View style={contentStyle}>{children}</View>
      </NativeGlassView>
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
  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      style={
        typeof style === "function"
          ? style
          : [styles.pressable, style]
      }
    >
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
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    transform: [{ scale: 1 }],
  },
  surface: {
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
