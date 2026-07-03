import { describe, expect, it } from "@jest/globals";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("iOS native startup guards", () => {
  it("gates the native UITabBar to iOS and keeps the JS tabs fallback", () => {
    // The native tab bar (expo-router NativeTabs on react-native-screens
    // BottomTabs) is deliberately adopted on iOS — verified on the iOS 26.5
    // simulator 2026-07-02 with the same pods the release build uses, so the
    // JS bundle and binary agree about the native components. Android and
    // web must stay on the stable JS Tabs implementation, and the platform
    // gate must not silently disappear.
    const tabLayout = readFileSync(
      join(process.cwd(), "app", "(tabs)", "_layout.tsx"),
      "utf8",
    );

    expect(tabLayout).toContain('Platform.OS === "ios"');
    expect(tabLayout).toContain("expo-router/unstable-native-tabs");
    expect(tabLayout).toContain("<NativeTabs");
    expect(tabLayout).toContain('from "expo-router"');
    expect(tabLayout).toContain("<Tabs");
  });

  it("ships the native glass-effect module with the JS bundle and binary in agreement", () => {
    // requireNativeModule("ExpoGlassEffect") throws when the JS bundle and the
    // binary disagree about the module's presence — the crash that originally
    // forced Liquid Glass out of release builds. Both sides must ship it.
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const podfileLock = readFileSync(
      join(process.cwd(), "ios", "Podfile.lock"),
      "utf8",
    );

    expect(packageJson).toContain("expo-glass-effect");
    expect(podfileLock).toContain("ExpoGlassEffect");
  });

  it("keeps Liquid Glass behind the guarded NativeGlass choke point", () => {
    const nativeGlass = readFileSync(
      join(process.cwd(), "components", "NativeGlass.tsx"),
      "utf8",
    );

    // The lazy require must be iOS-only, wrapped in try/catch, and gated on
    // runtime availability so a mismatched binary degrades to the JS fallback
    // instead of crashing at startup.
    expect(nativeGlass).toContain('Platform.OS === "ios"');
    expect(nativeGlass).toMatch(/try\s*\{[^}]*require\("expo-glass-effect"\)/s);
    expect(nativeGlass).toContain("isLiquidGlassAvailable");
    expect(nativeGlass).toMatch(/catch\s*\{\s*NativeGlassView = null;/);
  });

  it("never imports expo-glass-effect outside the NativeGlass choke point", () => {
    const offenders = execSync(
      'grep -rl "expo-glass-effect" app components lib --include="*.ts" --include="*.tsx" || true',
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((file) => file !== "components/NativeGlass.tsx");

    expect(offenders).toEqual([]);
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
