import { Platform } from "react-native";

/**
 * Mirrors the `episodeProgress:getUpNext` payload into the shared App Group
 * so the iOS "Up Next" widget (targets/widgets) can render without its own
 * auth or network stack. Wired up in QueryProvider's cache subscription, so
 * every settle of the query — network refetches and optimistic mark-watched
 * updates alike — refreshes the widget.
 *
 * Everything here is best-effort: the native ExtensionStorage module only
 * exists in builds that ran prebuild with @bacons/apple-targets (not Expo Go,
 * not older dev clients), and web never touches it.
 */

const APP_GROUP = "group.com.emckanna.Plotlist";
const PAYLOAD_KEY = "upNextWidgetPayload";
const MAX_ITEMS = 8;

type WidgetItem = {
  showId: string;
  title: string;
  posterUrl: string | null;
  season: number;
  episode: number;
  episodeName: string | null;
  airDate: number | null;
  isUpcoming: boolean;
};

type ExtensionStorageModule = {
  ExtensionStorage: {
    new (appGroup: string): {
      set(key: string, value: unknown): void;
      remove(key: string): void;
    };
    reloadWidget(name?: string): void;
  };
};

let storageModule: ExtensionStorageModule | null | undefined;

function getStorageModule(): ExtensionStorageModule | null {
  if (Platform.OS !== "ios") return null;
  if (storageModule !== undefined) return storageModule;
  try {
    storageModule = require("@bacons/apple-targets") as ExtensionStorageModule;
  } catch {
    storageModule = null;
  }
  return storageModule;
}

function toWidgetItem(raw: unknown): WidgetItem | null {
  const item = raw as {
    showId?: unknown;
    show?: { title?: unknown; posterUrl?: unknown } | null;
    nextSeasonNumber?: unknown;
    nextEpisodeNumber?: unknown;
    nextEpisodeName?: unknown;
    nextAirDate?: unknown;
    isUpcoming?: unknown;
  } | null;
  if (!item || typeof item !== "object") return null;
  const title = item.show?.title;
  if (typeof item.showId !== "string" || typeof title !== "string") return null;
  return {
    showId: item.showId,
    title,
    posterUrl: typeof item.show?.posterUrl === "string" ? item.show.posterUrl : null,
    season: typeof item.nextSeasonNumber === "number" ? item.nextSeasonNumber : 1,
    episode: typeof item.nextEpisodeNumber === "number" ? item.nextEpisodeNumber : 1,
    episodeName:
      typeof item.nextEpisodeName === "string" && item.nextEpisodeName.length > 0
        ? item.nextEpisodeName
        : null,
    airDate:
      typeof item.nextAirDate === "number" && Number.isFinite(item.nextAirDate)
        ? item.nextAirDate
        : null,
    isUpcoming: item.isUpcoming === true,
  };
}

// Widget timeline reloads are budgeted by iOS, so skip writes when the
// visible content hasn't actually changed (generatedAt alone doesn't count).
let lastItemsJson: string | null = null;

export function recordUpNextForWidget(data: unknown) {
  const mod = getStorageModule();
  if (!mod) return;
  if (!Array.isArray(data)) return;
  try {
    const items = data.slice(0, MAX_ITEMS).map(toWidgetItem).filter(Boolean);
    const itemsJson = JSON.stringify(items);
    if (itemsJson === lastItemsJson) return;
    lastItemsJson = itemsJson;
    const storage = new mod.ExtensionStorage(APP_GROUP);
    storage.set(
      PAYLOAD_KEY,
      JSON.stringify({ version: 1, generatedAt: Date.now(), items }),
    );
    mod.ExtensionStorage.reloadWidget();
  } catch {
    // Never let widget mirroring break the query pipeline.
  }
}

/** Sign-out: drop the payload so the widget stops showing the old account. */
export function clearUpNextWidget() {
  const mod = getStorageModule();
  if (!mod) return;
  try {
    lastItemsJson = null;
    const storage = new mod.ExtensionStorage(APP_GROUP);
    storage.remove(PAYLOAD_KEY);
    mod.ExtensionStorage.reloadWidget();
  } catch {
    // Best-effort.
  }
}
