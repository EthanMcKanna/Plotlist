# iOS Native Surface Audit

Visual thesis: Plotlist should feel like a native iOS media notebook made of smoky glass, crisp posters, and a few sharp aqua and amber signals.

## Global Shell

- Native iOS bottom navigation uses `expo-router/unstable-native-tabs` on iOS, with the existing JavaScript tabs retained for web and Android.
- The native tab bar owns the bottom material and iOS 26 minimize behavior; page content keeps explicit bottom padding where existing screens already account for the tab bar.
- App background is a restrained dark vertical wash from `Screen`, so simple pages no longer sit on a flat painted canvas.

## Liquid Glass Rules

- Use Liquid Glass on system-adjacent surfaces: bottom tabs, compact controls, search command surface, profile/stat panels, settings groups, modal sheets, and floating detail controls.
- Keep dense feed rows, poster rails, and image cards mostly opaque because those surfaces need fast scanning and stable text contrast.
- Avoid animating opacity on native glass or its parents. Scroll-fading chrome such as `HomeTopBar` keeps the existing blur path for correctness.
- All Liquid Glass has a non-iOS fallback through `GlassSurface` / `GlassPressable`.

## Surface Decisions

- Home: keep the poster-led editorial hierarchy; glass only on the top actions and footer CTA so the hero art stays dominant.
- Log: keep activity rows opaque for reading notes and ratings; filter chips and sort sheet get glass because they are controls.
- Search: the command center becomes a glass console, while result rows stay opaque for legibility.
- Profile tab: stats, activity shortcuts, watch stats, and menu groups use glass to feel more native without losing the personal library structure.
- Public profile: the profile header remains image/color-led; stats and watch activity panels inherit the glass system.
- Show detail: keep the cinematic backdrop and poster; use a glass back control and glass status selector instead of layering more custom blur.
- Calendar: keep release cards image-led; filter chips use glass because they are mode controls.
- Settings: forms use glass text fields, privacy cards, and account groups; the save action uses the shared prominent glass button.
- Auth/onboarding/me/list/review/admin: inherit the background, primary buttons, text fields, empty states, sheets, and glass controls through shared components.

## Shared Components

- `PrimaryButton`, `SecondaryButton`, `TextField`, `SegmentedControl`, `EmptyState`, `ActionSheet`, `FilterDropdown`, `FilterChips`, `StatusSelector`, `ContactsSyncCard`, and `ReportModal` use the shared glass primitives so native styling stays consistent.
- `HomeTopBar` keeps `BlurView` for its scroll-faded container and uses glass only on the fixed action buttons.
- `SearchResultRow`, `ShowRow`, feed rows, poster cards, hero art, release cards, and review/comment rows stay opaque or image-led for contrast and scan speed.

## QA Hooks

- `/dev/home-preview`, `/dev/search-preview`, and `/dev/calendar-preview` are available on all dev platforms for locked-state visual QA.
- `/home?preview=1` is a dev-only Home-tab preview path used to verify the native iOS tab bar around real preview content.
