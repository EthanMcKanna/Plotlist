// Accent theme registry — pure data + helpers, no React/native imports so
// jest can exercise it directly. The live store (persistence + hooks) is in
// lib/appearanceStore.ts.

export type AccentRampStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type AccentThemeKey = "sky" | "ember" | "violet" | "emerald" | "gold";

export type AccentTheme = {
  key: AccentThemeKey;
  label: string;
  pro: boolean;
  // Full 50–900 ramp mirroring the brand ramp's lightness curve. Non-sky
  // ramps are Tailwind's published palettes (orange/violet/emerald/amber)
  // hardcoded here so nothing imports tailwindcss at runtime.
  ramp: Record<AccentRampStep, string>;
  // Space-separated "R G B" of ramp[500], for CSS `rgb(var(--brand-glow) / a)`.
  glowRgb: string;
  // rgba() string for a ramp step — for gradients, shadows, and overlay
  // colors that can't use hex + Tailwind alpha suffixes.
  rgba: (step: AccentRampStep, alpha: number) => string;
};

export const RAMP_STEPS: readonly AccentRampStep[] = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900,
];

export function hexToRgbTriplet(hex: string): string {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized, 16);
  return `${(value >> 16) & 0xff} ${(value >> 8) & 0xff} ${value & 0xff}`;
}

function buildTheme(
  key: AccentThemeKey,
  label: string,
  pro: boolean,
  ramp: Record<AccentRampStep, string>,
): AccentTheme {
  return {
    key,
    label,
    pro,
    ramp,
    glowRgb: hexToRgbTriplet(ramp[500]),
    rgba: (step, alpha) => accentRgbaFromHex(ramp[step], alpha),
  };
}

function accentRgbaFromHex(hex: string, alpha: number): string {
  return `rgba(${hexToRgbTriplet(hex).split(" ").join(", ")}, ${alpha})`;
}

// sky = the original brand ramp from tailwind.config.js, verbatim.
export const ACCENT_THEMES: readonly AccentTheme[] = [
  buildTheme("sky", "Sky", false, {
    50: "#f0f9ff",
    100: "#e0f2fe",
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c4a6e",
  }),
  buildTheme("ember", "Ember", true, {
    50: "#fff7ed",
    100: "#ffedd5",
    200: "#fed7aa",
    300: "#fdba74",
    400: "#fb923c",
    500: "#f97316",
    600: "#ea580c",
    700: "#c2410c",
    800: "#9a3412",
    900: "#7c2d12",
  }),
  buildTheme("violet", "Violet", true, {
    50: "#f5f3ff",
    100: "#ede9fe",
    200: "#ddd6fe",
    300: "#c4b5fd",
    400: "#a78bfa",
    500: "#8b5cf6",
    600: "#7c3aed",
    700: "#6d28d9",
    800: "#5b21b6",
    900: "#4c1d95",
  }),
  buildTheme("emerald", "Emerald", true, {
    50: "#ecfdf5",
    100: "#d1fae5",
    200: "#a7f3d0",
    300: "#6ee7b7",
    400: "#34d399",
    500: "#10b981",
    600: "#059669",
    700: "#047857",
    800: "#065f46",
    900: "#064e3b",
  }),
  buildTheme("gold", "Gold", true, {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  }),
];

export const DEFAULT_ACCENT: AccentThemeKey = "sky";

export function getAccentTheme(key: string | null | undefined): AccentTheme {
  return ACCENT_THEMES.find((theme) => theme.key === key) ?? ACCENT_THEMES[0];
}

export function isAccentThemeKey(value: string | null | undefined): value is AccentThemeKey {
  return ACCENT_THEMES.some((theme) => theme.key === value);
}

// CSS variables consumed by tailwind.config.js (`rgb(var(--brand-N) / <alpha>)`)
// — values must be raw space-separated channel triplets for the Tailwind
// <alpha-value> interop to compose.
export function accentVars(theme: AccentTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const step of RAMP_STEPS) {
    vars[`--brand-${step}`] = hexToRgbTriplet(theme.ramp[step]);
  }
  vars["--brand-glow"] = theme.glowRgb;
  return vars;
}

// For call sites that need an rgba() string (gradients, shadows, overlays)
// where hex + alpha-suffix notation isn't an option.
export function accentRgba(theme: AccentTheme, step: AccentRampStep, alpha: number): string {
  return theme.rgba(step, alpha);
}
