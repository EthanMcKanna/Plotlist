// Generates alternate app-icon variants from assets/icon.png by remapping
// the hue of the icon's blue glow (rim, cards, halo) while leaving the gold
// star, white glyphs, and near-black background untouched. Output: 1024×1024
// RGB (no alpha — Apple rejects alpha in app icons) PNGs in assets/app-icons/.
//
//   node scripts/generate-app-icons.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = "assets/icon.png";
const OUT_DIR = "assets/app-icons";

// Blue-band selector: pixels whose hue sits in the sky/blue range with real
// saturation get remapped; everything else passes through.
const BLUE_HUE_MIN = 175;
const BLUE_HUE_MAX = 265;
const MIN_SATURATION = 0.12;

// hue: target hue in degrees (null = desaturate instead), satScale trims
// oversaturation for hues that read hotter than blue.
const VARIANTS = [
  { name: "ember", hue: 24, satScale: 0.95 },
  { name: "violet", hue: 268, satScale: 0.95 },
  { name: "emerald", hue: 158, satScale: 0.85 },
  { name: "gold", hue: 42, satScale: 0.9 },
  { name: "mono", hue: null, satScale: 0 },
];

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const { data, info } = await sharp(SRC)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (const variant of VARIANTS) {
    const out = Buffer.from(data);
    for (let i = 0; i < out.length; i += info.channels) {
      const [h, s, l] = rgbToHsl(out[i], out[i + 1], out[i + 2]);
      if (h < BLUE_HUE_MIN || h > BLUE_HUE_MAX || s < MIN_SATURATION) continue;
      const [r, g, b] =
        variant.hue === null
          ? hslToRgb(0, 0, l)
          : hslToRgb(variant.hue, Math.min(1, s * variant.satScale), l);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
    const dest = path.join(OUT_DIR, `${variant.name}.png`);
    await sharp(out, { raw: info }).png().toFile(dest);
    console.log(`wrote ${dest}`);
  }
}

await main();
