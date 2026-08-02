const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const exclusionList = require("metro-config/private/defaults/exclusionList").default;
const path = require("node:path");
const { withNativeWind } = require("nativewind/metro");

// Expo's default config plus Sentry debug-ID injection for source maps.
// Web replay is excluded to protect the home preview bundle budget.
const config = getSentryExpoConfig(__dirname, { includeWebReplay: false });
const blockListPatterns = [/\.env\..*\.local$/];
const isProductionLike = process.env.NODE_ENV !== "development";
const homePreviewDataStub = path.join(
  __dirname,
  "lib",
  "homePreviewData.production.ts",
);

if (isProductionLike) {
  blockListPatterns.push(/[\\/]app[\\/]dev[\\/].*\.[jt]sx?$/);
}

config.resolver.blockList = exclusionList(blockListPatterns);

// Defer module execution to first use instead of eagerly running the entire
// transitive import graph at startup (Expo's default leaves this off).
// Side-effect-only imports (gesture-handler, global.css, sentry init) still
// run eagerly — only bound imports become lazy. Native-only: on web the
// worklets runtime serializes module-scope worklets during load and breaks
// under inline requires (verified: JSWorklets.createSerializableObject throw
// at boot), and web startup is already covered by the static boot shell.
config.transformer.getTransformOptions = async (entryPoints, options) => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: options.platform !== "web",
    nonInlinedRequires: [
      "react-native-worklets",
      "react-native-reanimated",
      "react-native-gesture-handler",
    ],
  },
});

const defaultResolveRequest = config.resolver.resolveRequest;

if (isProductionLike) {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
      moduleName === "../../lib/homePreviewData" ||
      moduleName.endsWith("/lib/homePreviewData") ||
      moduleName.endsWith("\\lib\\homePreviewData")
    ) {
      return {
        type: "sourceFile",
        filePath: homePreviewDataStub,
      };
    }

    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }

    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = withNativeWind(config, { input: "./global.css" });
