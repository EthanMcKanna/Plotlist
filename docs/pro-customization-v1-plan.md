# Pro customization v1 — accent themes + alternate app icons

Self-contained implementation plan. Goal: make the Plotlist Pro paywall bullet
**"Themes, app icons and custom backdrops"** fully true. Custom profile
backdrops already shipped; this plan adds the other two:

1. **Accent themes** — 5 curated accent palettes that recolor the app's brand
   color everywhere (buttons, links, tab tint, glows, heroes). Pro-gated;
   default "Sky" stays free.
2. **Alternate app icons** (iOS) — 3–4 icon variants selectable from settings.
   Pro-gated; default icon free.

Read this whole file before writing code. File paths and counts below were
verified against the repo at planning time.

---

## 1. Context you need

- **Stack**: Expo SDK 54 prebuild (`ios/` is gitignored and regenerable),
  NativeWind v4 + Tailwind (config: [tailwind.config.js](../tailwind.config.js)),
  Cloudflare Worker backend, RPC registries in api/_lib/rpc.ts. App is
  dark-only (`"userInterfaceStyle": "dark"` in app.json) — do NOT build light
  mode here.
- **Pro gating pattern**: client cosmetic gates use
  `const isPro = useProStatus().isPro || me?.isPro === true` (see
  [app/settings/index.tsx](../app/settings/index.tsx)) and
  `presentProPaywall()` from `lib/purchases` on locked taps, continuing the
  action if the outcome is `"purchased"` or `"restored"`. Cosmetics are
  client-gated only — no server enforcement needed (unlike backdrops, which go
  through `requirePro`).
- **Crash-guard convention**: any native module that older installed binaries
  don't contain must be lazy-required inside try/catch behind a single guard
  module — copy the shape of [components/NativeGlass.tsx](../components/NativeGlass.tsx)
  (top-of-file `Platform.OS` check + `require()` in try/catch + capability
  boolean) or `lib/purchases.ts`. This applies to the app-icon module.
- **Preference storage pattern**: [lib/preferences.ts](../lib/preferences.ts) —
  SecureStore (native) / localStorage (web) behind async get/set helpers, with
  an in-memory sync cache for values that must be readable synchronously
  (see `welcomeTourSeenCache`). The theme choice follows this pattern exactly.
- **Verified sizing**: 130 occurrences of hardcoded accent hexes
  (`#38BDF8`/`#0EA5E9`/`#7DD3FC`, case-insensitive) across **48 files** in
  app/ + components/ + lib/, plus 34 files using `*-brand-*` Tailwind classes.
  The Tailwind classes come along free via CSS variables (§2.2); the 130
  hardcoded hexes are the sweep in §2.4.
- **Checks/verification**: `npm run check` (typecheck app+api, eslint, jest —
  pure-logic tests only), `npm run build` (web export must stay green). Local
  browser verification uses the `worker-api` + `expo-web-preview` launch
  configs and test login phone `555 123 4567` / OTP `123456` (local D1 test
  user `user_mr5ofi0qhk41mm4rq2` is Pro). UI conventions: `guardedPush` for
  show navigation, `text-[16px]` on inputs, `GlassSurface`/`GlassPressable`
  for surfaces, `notify`/`notifyError` from lib/dialogs.

---

## 2. Accent themes

### 2.1 Theme registry — new file `lib/appearance.ts` (pure, unit-testable)

```ts
export type AccentThemeKey = "sky" | "ember" | "violet" | "emerald" | "gold";

export type AccentTheme = {
  key: AccentThemeKey;
  label: string;
  pro: boolean;              // sky: false, everything else: true
  // Full 50–900 ramp mirroring the current brand ramp's lightness curve.
  ramp: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;
  glowRgb: string;           // e.g. "14, 165, 233" for shadows/overlays
};
```

- `sky` ramp = the existing brand ramp in tailwind.config.js verbatim
  (50 `#f0f9ff` … 400 `#38bdf8`, 500 `#0ea5e9` … 900 `#0c4a6e`).
- Build the other four from Tailwind's own published palettes so the lightness
  curve matches: **ember** = tailwind `orange`, **violet** = tailwind `violet`,
  **emerald** = tailwind `emerald`, **gold** = tailwind `amber`. Hardcode the
  hex values into this file (no tailwind import at runtime).
- Export helpers: `getAccentTheme(key)`, `DEFAULT_ACCENT: "sky"`,
  `ACCENT_THEMES` array (ordered, sky first), and
  `accentVars(theme)` → `{ "--brand-50": "...", … , "--brand-glow": theme.glowRgb }`
  (raw `R G B` channel triplets, space-separated — required for Tailwind
  `<alpha-value>` interop, see §2.2).

### 2.2 Tailwind → CSS variables

In [tailwind.config.js](../tailwind.config.js), replace the `brand` hex ramp
with variable references:

```js
brand: {
  50: "rgb(var(--brand-50) / <alpha-value>)",
  // … through …
  900: "rgb(var(--brand-900) / <alpha-value>)",
},
```

and change `boxShadow.glow` to use `rgba(var(--brand-glow), 0.15)`.
NativeWind v4 supports CSS variables on native via its `vars()` API — the
variables are supplied by the provider in §2.3. **Verify early** with a
one-screen smoke test that `text-brand-400` renders on BOTH native-style web
output and a real component before doing the sweep; if `<alpha-value>` interop
misbehaves under the installed NativeWind version, fall back to plain
`rgb(var(--brand-400))` per step (losing opacity modifiers like
`text-brand-400/50` — grep first to confirm none are used; if some are,
convert those call sites to explicit rgba via the hook from §2.4).

### 2.3 Theme provider + persistence

- `lib/appearanceStore.ts`: module-level store following the
  `useProStatus`/`subscribeProStatus` shape — `getAccentKey()`,
  `setAccentKey(key)` (persists via a new `KEY_ACCENT_THEME` in
  lib/preferences.ts, updates the in-memory value, notifies listeners),
  `subscribeAccent(listener)`, plus `hydrateAccentFromStorage()` called once at
  startup. Include a sync in-memory cache exactly like `welcomeTourSeenCache`
  so reads never block rendering.
- `components/AppearanceProvider.tsx`: wraps children in a `View` with
  `style={vars(accentVars(theme))}` (import `vars` from `nativewind`), driven
  by `useSyncExternalStore` over the store. Mount it in
  [app/_layout.tsx](../app/_layout.tsx) INSIDE the existing provider stack,
  wrapping the `GestureHandlerRootView` contents (it must contain the whole
  Stack so every screen inherits the variables). It renders the default Sky
  vars until hydration completes.
- **Cold-start flash**: hydration is async (SecureStore). A non-Sky user gets
  at most one frame of Sky accent behind the launch overlay — acceptable for
  v1. Do NOT touch the splash/LoadingScreen pipeline (see repo memory: the
  native splash → LaunchOverlay continuity is deliberately fragile). Kick off
  `hydrateAccentFromStorage()` at module scope of the provider file so it races
  the overlay, not the user.

### 2.4 The hardcoded-hex sweep

Add to `lib/appearance.ts`:

```ts
// Hook + imperative accessor for places that need raw color values
// (Ionicons color props, gradients, ActivityIndicator, shadows).
export function useAccent(): AccentTheme;          // subscribes to the store
export function getAccent(): AccentTheme;          // sync snapshot (non-React)
```

Then sweep the 130 hardcoded occurrences (48 files) of
`#38BDF8` / `#0ea5e9` / `#7DD3FC` (any casing):
- `color="#38BDF8"` icon props / `ActivityIndicator color` →
  `color={useAccent().ramp[400]}` (add the hook at the top of the component;
  for non-component modules use `getAccent()`).
- `#7DD3FC` → `ramp[300]`; `#0EA5E9` → `ramp[500]`.
- rgba literals like `rgba(14,165,233,0.14)` and `rgba(125,211,252,0.28)`
  (grep separately for `14, ?165, ?233` and `125, ?211, ?252`) → template from
  `glowRgb`/ramp values. NativeGlass's `prominent` variant tokens
  ([components/NativeGlass.tsx](../components/NativeGlass.tsx) VARIANT_TOKENS)
  are the most visible instance — convert that object to a function of the
  current accent.
- **Leave alone**: semantic colors (`#22C55E` success, `#EF4444` danger,
  `#F59E0B` warning/accent-amber, `#FACC15` Pro gold), text/dark neutrals, and
  anything inside `lib/homePreviewData*` fixtures or tests.
- Static, non-React config objects that capture colors at module load (e.g.
  settings row `iconColor` defaults, chart color arrays) must either become
  functions or read `getAccent()` lazily — flag any file where the value is
  captured once at import time and won't update on theme change; fixing those
  to re-render is part of the job (the provider re-render covers components;
  module-level constants are the trap).
- Work file-by-file; after each batch run `npm run typecheck:app` and eyeball
  the app in the web preview with a non-default accent to catch stragglers
  (search the rendered page for remaining sky-blue).

### 2.5 Theme picker UI (settings)

In [app/settings/index.tsx](../app/settings/index.tsx), add an **Appearance**
section between "Plotlist Pro" and "Notifications":
- A `GlassSurface` row of accent swatches (tappable circles filled with
  `ramp[400]`, selected ring in `text-primary`, tiny lock glyph on Pro accents
  for free users; label under each).
- Tap on a Pro accent while free → `presentProPaywall()`; on
  `"purchased"`/`"restored"`, apply the accent. Tap on Sky always works.
- Selection applies instantly (provider re-renders) and persists via the store.
- Include the existing `ensurePro` helper already defined in that file.

### 2.6 If Pro lapses
Do nothing active: the accent stays (grandfathered cosmetics are goodwill; no
server round-trip exists to police it). The picker still locks non-Sky options
for non-Pro users, so lapsed users can't *switch* to another Pro accent.

---

## 3. Alternate app icons (iOS)

### 3.1 Assets — `scripts/generate-app-icons.mjs`

Generate variants from the existing [assets/icon.png](../assets/icon.png) with
`sharp` (already in the dependency tree — verify with
`node -e "require('sharp')"`; if absent, `npm i -D sharp`):
- Variants: **Midnight** (default = current icon, untouched), **Sky**,
  **Ember**, **Gold**, **Mono**. Produce each by compositing the source icon's
  glyph over a recolored background. Inspect the source icon first: if the
  glyph and background aren't separable layers, use a duotone approach —
  greyscale the icon, then `tint()` with the accent color over a dark
  background. 1024×1024, no alpha (Apple rejects alpha in app icons), PNG,
  output to `assets/app-icons/<key>.png`.
- **Stop and eyeball each generated icon** (open the PNGs) before wiring —
  auto-recolored icons can look bad; if a variant looks muddy, drop it rather
  than ship it. Report which variants survived in your final summary.

### 3.2 Plugin + guarded module

- `npx expo install expo-alternate-app-icons` (or the current
  `react-native`-compatible equivalent if that package doesn't support SDK 54
  — check its README/peer deps BEFORE installing; whatever module is chosen
  must support Expo prebuild via config plugin). Add its config-plugin entry to
  [app.json](../app.json) `expo.plugins` listing each variant name → asset
  path. Keep icon names stable (`Sky`, `Ember`, `Gold`, `Mono`; `null` resets
  to primary).
- New `lib/appIcon.ts` following the NativeGlass guard convention:
  `Platform.OS === "ios"` + lazy `require` in try/catch; export
  `APP_ICONS_SUPPORTED` (false on web/Android AND on binaries without the
  module), `getCurrentAppIcon(): string | null`,
  `setAppIcon(name: string | null): Promise<boolean>`.
  iOS shows a system alert when the icon changes — that's expected OS behavior,
  don't try to suppress it.

### 3.3 Picker UI

Same **Appearance** settings section, second row: "App icon · Pro" horizontal
row of icon thumbnails (render the PNGs via `expo-image` with 12px radius,
~56×56, selected ring). Render only when `APP_ICONS_SUPPORTED`. Free users:
default selectable, variants locked behind `presentProPaywall()` like accents.
The choice lives in iOS itself — read `getCurrentAppIcon()` for selection
state; no preference storage needed.

### 3.4 Build reality
The native module means the feature only works in a NEW TestFlight build; on
older binaries `APP_ICONS_SUPPORTED` stays false and the row hides (that's the
crash-guard working — verify by running the web preview, where it must simply
not render). Regenerate `ios/` carefully if needed: NEVER plain `rm -rf ios` —
`tests/iosNativeCrashGuards.test.ts` documents manual invariants
(`ios.buildReactNativeFromSource`, fmt c++17 guards) that a fresh prebuild
loses; keep those tests green.

---

## 4. Tests (`tests/appearance.test.ts`)
Pure-logic only (no DB/native in jest):
- Every theme has a complete 50–900 ramp of valid hex colors; `sky` ramp
  matches the tailwind defaults exactly (guards against drift).
- `accentVars()` emits `R G B` channel triplets for every ramp step +
  `--brand-glow` (regex `^\d{1,3} \d{1,3} \d{1,3}$`).
- Only `sky` has `pro: false`.
- Sweep guard: a test that reads the repo? No — keep jest pure; instead add an
  eslint-greppable note. (Optional nicety, skip if noisy.)

`npm run check` and `npm run build` must both pass.

---

## 5. Verification checklist (web preview + local worker)
1. Sign in as the Pro test user → Appearance section shows swatches + (on web)
   NO app-icon row.
2. Pick Ember → buttons, links, tab accents, glass `prominent` surfaces, stats
   hero, paywall-adjacent UI all shift immediately; reload → persists.
3. Sweep audit: with Ember active, visually scan Home, Search, Show detail,
   Episode sheet, Settings, Stats, Ask Plotlist, Calendar for leftover sky
   blue (the 48-file sweep WILL miss spots — budget a second pass).
4. De-Pro the test user
   (`sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite "UPDATE users SET pro_until=NULL WHERE id='user_mr5ofi0qhk41mm4rq2';"`)
   → non-Sky swatches show locks; tapping one opens the paywall chooser;
   Sky still applies. Restore `pro_until` afterwards (previous value pattern:
   a far-future ms timestamp).
5. iOS (only if a build is made): icon picker appears, switching shows the OS
   alert and the springboard icon changes; on the PREVIOUS TestFlight build the
   section correctly hides.

## 6. Deploy
1. `npm run check` + `npm run build`, commit (repo style: imperative summary +
   `Co-Authored-By: Claude …` trailer), push, `npm run deploy` (web gets
   accents immediately; icons are iOS-build-only).
2. iOS build only if asked: the exact recipe lives in project memory
   (`eas-headless-credentials`) — `LANG`/`LC_ALL` UTF-8 exports,
   `GYM_XCARGS="CODE_SIGN_IDENTITY=827B04517B859CC49E4C8CE75376BFDD167C9860"`,
   `SENTRY_AUTH_TOKEN` from .env.local, `eas build --local` + `eas submit
   --path`. Cloud EAS builds fail on quota until 2026-08-01.
3. Note for the human: once this ships in a build, the paywall bullet
   "Themes, app icons and custom backdrops" is fully honest — no dashboard
   copy change needed.

## 7. Out of scope (do not build)
Light mode / `userInterfaceStyle` changes; per-list custom covers; animated
avatars; Android alternate icons (module may support it — still skip until
there's a Play build); server-side sync of the accent choice across devices;
re-theming the static web boot shell in `scripts/postexport-web.mjs` (it's
neutral dark and fine).

## 8. Effort honesty
The provider/registry/picker/icons are each small (half a day together). The
130-occurrence hex sweep across 48 files is the bulk — mechanical but
judgment-laden (semantic vs. brand color calls). Do it in batches with visual
checks; expect the full job to be ~1.5–2 focused days.
