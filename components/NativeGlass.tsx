import { ReactNode, useMemo } from "react";
import {
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

export function isNativeGlassAvailable() {
  return false;
}

export function GlassSurface({
  children,
  style,
  contentStyle,
  radius = 8,
  variant = "surface",
  glassEffectStyle: _glassEffectStyle = "regular",
  tintColor: _tintColor,
  fallbackColor,
  borderColor,
  interactive: _interactive = false,
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
  const surfaceStyle = useMemo(
    () => [
      styles.surface,
      {
        borderColor: resolvedBorderColor,
        borderRadius: radius,
        backgroundColor: resolvedFallbackColor,
      },
      style,
    ],
    [
      radius,
      resolvedBorderColor,
      resolvedFallbackColor,
      style,
    ],
  );

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
