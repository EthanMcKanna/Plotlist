import { Platform, Share } from "react-native";

// Public web origin; universal links open these URLs in the app when it's
// installed and fall back to the web build otherwise.
export const SHARE_ORIGIN = "https://plotlist.app";

export function buildShareUrl(path: string) {
  return `${SHARE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

// One share sheet entry point for profiles, lists, reviews, and shows.
// iOS surfaces `url`; Android only reads `message`, so the link rides along
// in the message text there.
export async function sharePlotlistLink(path: string, message: string) {
  const url = buildShareUrl(path);
  try {
    await Share.share(
      Platform.OS === "ios" ? { message, url } : { message: `${message} ${url}` },
      { dialogTitle: message },
    );
  } catch {
    // User dismissed the sheet or the platform has no share target — never an error.
  }
}
