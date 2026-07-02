import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("iOS native startup guards", () => {
  it("keeps the tab navigator on the stable Expo Router Tabs implementation", () => {
    const tabLayout = readFileSync(
      join(process.cwd(), "app", "(tabs)", "_layout.tsx"),
      "utf8",
    );

    expect(tabLayout).not.toContain("expo-router/unstable-native-tabs");
    expect(tabLayout).not.toContain("<NativeTabs");
    expect(tabLayout).toContain('from "expo-router"');
  });

  it("keeps the native glass-effect module out of release builds", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const podfileLock = readFileSync(
      join(process.cwd(), "ios", "Podfile.lock"),
      "utf8",
    );

    expect(packageJson).not.toContain("expo-glass-effect");
    expect(podfileLock).not.toContain("ExpoGlassEffect");
  });

  it("builds React Native from source for iOS release stability", () => {
    const appConfig = JSON.parse(readFileSync(join(process.cwd(), "app.json"), "utf8"));
    const podfileProperties = JSON.parse(
      readFileSync(join(process.cwd(), "ios", "Podfile.properties.json"), "utf8"),
    );
    const podfile = readFileSync(join(process.cwd(), "ios", "Podfile"), "utf8");

    expect(appConfig.expo.newArchEnabled).toBe(true);
    expect(podfileProperties.newArchEnabled).toBe("true");
    expect(podfileProperties["ios.buildReactNativeFromSource"]).toBe("true");
    expect(podfile).toContain("CLANG_CXX_LANGUAGE_STANDARD");
    expect(podfile).toContain("c++17");
    expect(podfile).toContain("FMT_USE_CONSTEVAL=0");
  });

  it("disables Hermes startup profiling registration", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const patchScript = readFileSync(
      join(process.cwd(), "scripts", "patch-react-native-hermes-startup.mjs"),
      "utf8",
    );
    const hermesInstance = readFileSync(
      join(
        process.cwd(),
        "node_modules",
        "react-native",
        "ReactCommon",
        "react",
        "runtime",
        "hermes",
        "HermesInstance.cpp",
      ),
      "utf8",
    );

    expect(packageJson.scripts.postinstall).toContain(
      "patch-react-native-hermes-startup.mjs",
    );
    expect(patchScript).toContain("withEnableSampleProfiling(false)");
    expect(hermesInstance).toContain("withEnableSampleProfiling(false)");
    expect(hermesInstance).not.toContain("runtime_->registerForProfiling();");
  });
});
