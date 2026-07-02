const { getDefaultConfig } = require("expo/metro-config");
const exclusionList = require("metro-config/private/defaults/exclusionList").default;
const path = require("node:path");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
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
