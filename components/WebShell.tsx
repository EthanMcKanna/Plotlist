import { useEffect, type ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { usePathname } from "expo-router";

import { useAuth } from "../lib/plotlist/react";
import {
  ContentWidthProvider,
  getWebNavWidth,
  useWebNavMode,
} from "../lib/webLayout";
import { WebSidebar } from "./WebSidebar";

// Routes that own the whole viewport — no persistent navigation chrome.
function isChromelessRoute(pathname: string | null) {
  if (!pathname) return false;
  return pathname.startsWith("/sign-in") || pathname.startsWith("/onboarding");
}

// Routes whose tab title comes from loaded data via <PageTitle> — the
// static fallback below must never overwrite those (React runs the screen's
// effect before this shell's, so a static write here would win the race).
const DYNAMIC_TITLE_PREFIXES = ["/show/", "/list/"];

// Static browser-tab titles by route.
const STATIC_ROUTE_TITLES: Array<[prefix: string, title: string | null]> = [
  ["/home", null],
  ["/log", "Log"],
  ["/search", "Search"],
  ["/calendar", "Releases"],
  ["/notifications", "Notifications"],
  ["/friends", "Friends"],
  ["/followers", "Followers"],
  ["/following", "Following"],
  ["/explore", "Explore"],
  ["/facet", "Explore"],
  ["/provider", "Streaming"],
  ["/settings", "Settings"],
  ["/me/watchlist", "Watchlist"],
  ["/me/lists", "Lists"],
  ["/me/stats", "Stats"],
  ["/me/favorites", "Favorites"],
  ["/sign-in", "Sign in"],
  ["/onboarding", "Welcome"],
  ["/legal", "Legal"],
  ["/follow-requests", "Follow requests"],
  ["/comments", "Comments"],
  ["/review", "Review"],
];

function getStaticRouteTitle(pathname: string | null) {
  if (!pathname) return undefined;
  if (DYNAMIC_TITLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return undefined;
  }
  // "/profile" exactly is the Me tab; "/profile/<id>" titles come from the
  // loaded profile via <PageTitle>.
  if (pathname === "/profile") return "Me";
  if (pathname.startsWith("/profile/")) return undefined;
  const match = STATIC_ROUTE_TITLES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? match[1] : undefined;
}

function WebShellInner({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const mode = useWebNavMode();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const title = getStaticRouteTitle(pathname);
    if (title !== undefined) {
      document.title = title ? `${title} — Plotlist` : "Plotlist";
    }
  }, [pathname]);

  const showSidebar =
    (mode === "sidebar" || mode === "rail") &&
    isAuthenticated &&
    !isChromelessRoute(pathname);
  const navWidth = showSidebar ? getWebNavWidth(mode) : 0;

  return (
    <ContentWidthProvider value={Math.max(width - navWidth, 320)}>
      <View style={styles.row}>
        {showSidebar ? <WebSidebar mode={mode} /> : null}
        <View style={styles.content}>{children}</View>
      </View>
    </ContentWidthProvider>
  );
}

// Web-only layout shell: persistent side navigation on wide viewports.
// Native returns children untouched — zero impact on the mobile app.
export function WebShell({ children }: { children: ReactNode }) {
  if (Platform.OS !== "web") {
    return <>{children}</>;
  }
  return <WebShellInner>{children}</WebShellInner>;
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
});
