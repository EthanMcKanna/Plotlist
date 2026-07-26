import { describe, expect, it } from "@jest/globals";

import {
  ACCENT_THEMES,
  DEFAULT_ACCENT,
  RAMP_STEPS,
  accentRgba,
  accentVars,
  getAccentTheme,
  hexToRgbTriplet,
  isAccentThemeKey,
} from "../lib/appearance";

const HEX_COLOR = /^#[0-9a-f]{6}$/;
const RGB_TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/;

// The original brand ramp from tailwind.config.js — sky must match verbatim
// so switching themes away and back is lossless and the default render (before
// hydration) is pixel-identical to the pre-themes app.
const ORIGINAL_BRAND_RAMP: Record<number, string> = {
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
};

describe("accent theme registry", () => {
  it("every theme has a complete 50–900 ramp of valid hex colors", () => {
    for (const theme of ACCENT_THEMES) {
      for (const step of RAMP_STEPS) {
        expect(theme.ramp[step]).toMatch(HEX_COLOR);
      }
      expect(Object.keys(theme.ramp)).toHaveLength(RAMP_STEPS.length);
    }
  });

  it("sky matches the original tailwind brand ramp exactly", () => {
    const sky = getAccentTheme("sky");
    for (const step of RAMP_STEPS) {
      expect(sky.ramp[step]).toBe(ORIGINAL_BRAND_RAMP[step]);
    }
  });

  it("only sky is free; sky is first and the default", () => {
    expect(ACCENT_THEMES[0].key).toBe("sky");
    expect(DEFAULT_ACCENT).toBe("sky");
    for (const theme of ACCENT_THEMES) {
      expect(theme.pro).toBe(theme.key !== "sky");
    }
  });

  it("theme keys are unique", () => {
    const keys = ACCENT_THEMES.map((theme) => theme.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("accentVars emits R G B channel triplets for every ramp step + glow", () => {
    for (const theme of ACCENT_THEMES) {
      const vars = accentVars(theme);
      for (const step of RAMP_STEPS) {
        expect(vars[`--brand-${step}`]).toMatch(RGB_TRIPLET);
      }
      expect(vars["--brand-glow"]).toMatch(RGB_TRIPLET);
      expect(vars["--brand-glow"]).toBe(hexToRgbTriplet(theme.ramp[500]));
      expect(Object.keys(vars)).toHaveLength(RAMP_STEPS.length + 1);
    }
  });

  it("hexToRgbTriplet converts correctly", () => {
    expect(hexToRgbTriplet("#0ea5e9")).toBe("14 165 233");
    expect(hexToRgbTriplet("#38bdf8")).toBe("56 189 248");
    expect(hexToRgbTriplet("#7dd3fc")).toBe("125 211 252");
    expect(hexToRgbTriplet("#000000")).toBe("0 0 0");
    expect(hexToRgbTriplet("#ffffff")).toBe("255 255 255");
  });

  it("accentRgba renders css rgba strings from the ramp", () => {
    const sky = getAccentTheme("sky");
    expect(accentRgba(sky, 500, 0.14)).toBe("rgba(14, 165, 233, 0.14)");
    expect(accentRgba(sky, 300, 0.28)).toBe("rgba(125, 211, 252, 0.28)");
  });

  it("getAccentTheme falls back to sky for unknown keys", () => {
    expect(getAccentTheme("nope").key).toBe("sky");
    expect(getAccentTheme(null).key).toBe("sky");
    expect(isAccentThemeKey("ember")).toBe(true);
    expect(isAccentThemeKey("nope")).toBe(false);
  });
});
