/**
 * "Up Next" widget extension (home screen + lock screen). Generated into the
 * Xcode project by @bacons/apple-targets during prebuild; the Swift sources
 * live alongside this file. Data arrives via the shared App Group written by
 * lib/widget/upNextWidget.ts — the widget never talks to the network except
 * to fetch poster art.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: "widget",
  name: "PlotlistWidgets",
  displayName: "Plotlist",
  deploymentTarget: "17.0",
  colors: {
    // Special names: $accent -> AccentColor, $widgetBackground -> WidgetBackground.
    $accent: "#0EA5E9",
    $widgetBackground: "#0D0F14",
    // App palette (mirrors app/continue.tsx accents), usable as Color("...").
    tonight: "#0EA5E9",
    fresh: "#34D399",
    returning: "#A78BFA",
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
