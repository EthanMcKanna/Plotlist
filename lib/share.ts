import { Platform, Share } from "react-native";

import { showWebToast } from "./webToast";

// Public web origin; universal links open these URLs in the app when it's
// installed and fall back to the web build otherwise.
export const SHARE_ORIGIN = "https://plotlist.app";

export function buildShareUrl(path: string) {
  return `${SHARE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

// Web: navigator.share where it exists (mobile browsers, Safari), otherwise
// copy the link — react-native-web's Share.share rejects on most desktop
// browsers and the failure used to be swallowed, so share buttons silently
// did nothing there.
async function shareOnWeb(url: string, message: string) {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title: message, url });
      return;
    } catch {
      // Dismissed or unsupported payload — fall through to copy.
    }
  }
  if (!nav?.clipboard?.writeText) {
    // No async clipboard (insecure origin / old browser) — don't claim
    // success we can't deliver.
    showWebToast("Couldn't copy the link", "error");
    return;
  }
  try {
    await nav.clipboard.writeText(url);
    showWebToast("Link copied");
  } catch {
    showWebToast("Couldn't copy the link", "error");
  }
}

// One share sheet entry point for profiles, lists, reviews, and shows.
// iOS surfaces `url`; Android only reads `message`, so the link rides along
// in the message text there.
export async function sharePlotlistLink(path: string, message: string) {
  const url = buildShareUrl(path);
  if (Platform.OS === "web") {
    await shareOnWeb(url, message);
    return;
  }
  try {
    await Share.share(
      Platform.OS === "ios" ? { message, url } : { message: `${message} ${url}` },
      { dialogTitle: message },
    );
  } catch {
    // User dismissed the sheet or the platform has no share target — never an error.
  }
}
