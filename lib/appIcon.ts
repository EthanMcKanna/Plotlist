import { Platform } from "react-native";

// Alternate app icons ship through this single guarded choke point, same
// convention as NativeGlass: the native module only exists in binaries built
// after the expo-alternate-app-icons plugin landed, so
// 1. only touch the module on iOS,
// 2. lazy-require inside try/catch,
// 3. expose a capability boolean the UI gates on (older binaries and web
//    simply hide the icon picker).

export type AppIconKey = "Ember" | "Violet" | "Emerald" | "Gold" | "Mono";

export const APP_ICON_VARIANTS: readonly {
  key: AppIconKey;
  label: string;
  // Static require so Metro bundles the previews; the OS icon itself comes
  // from the native asset catalog written by the config plugin.
  preview: number;
}[] = [
  { key: "Ember", label: "Ember", preview: require("../assets/app-icons/ember.png") },
  { key: "Violet", label: "Violet", preview: require("../assets/app-icons/violet.png") },
  { key: "Emerald", label: "Emerald", preview: require("../assets/app-icons/emerald.png") },
  { key: "Gold", label: "Gold", preview: require("../assets/app-icons/gold.png") },
  { key: "Mono", label: "Mono", preview: require("../assets/app-icons/mono.png") },
];

export const DEFAULT_APP_ICON_PREVIEW: number = require("../assets/icon.png");

type AppIconModule = {
  supportsAlternateIcons: boolean;
  setAlternateAppIcon: (name: string | null) => Promise<string | null>;
  getAppIconName: () => string | null;
};

let appIconModule: AppIconModule | null = null;

if (Platform.OS === "ios") {
  try {
    const candidate = require("expo-alternate-app-icons");
    if (
      candidate?.supportsAlternateIcons === true &&
      typeof candidate.setAlternateAppIcon === "function" &&
      typeof candidate.getAppIconName === "function"
    ) {
      appIconModule = candidate as AppIconModule;
    }
  } catch {
    appIconModule = null;
  }
}

export const APP_ICONS_SUPPORTED = appIconModule !== null;

// null = the default (Midnight) icon.
export function getCurrentAppIcon(): string | null {
  if (!appIconModule) return null;
  try {
    return appIconModule.getAppIconName();
  } catch {
    return null;
  }
}

// Returns true when the switch was applied. iOS shows a system alert on
// change — expected OS behavior, don't try to suppress it.
export async function setAppIcon(name: string | null): Promise<boolean> {
  if (!appIconModule) return false;
  try {
    await appIconModule.setAlternateAppIcon(name);
    return true;
  } catch {
    return false;
  }
}
