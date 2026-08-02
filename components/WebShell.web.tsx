import { useEffect, type ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, usePathname } from "expo-router";

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
const DYNAMIC_TITLE_PREFIXES = [
  "/show/",
  "/list/",
  "/person/",
  "/facet/",
  "/provider/",
  "/review/",
];

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
  ["/me/stats-share", "Share your stats"],
  ["/me/stats", "Stats"],
  ["/me/favorites", "Favorites"],
  ["/continue", "Continue"],
  ["/admin", "Admin"],
  ["/sign-in", "Sign in"],
  ["/onboarding", "Welcome"],
  ["/legal", "Legal"],
  ["/follow-requests", "Follow requests"],
  ["/comments", "Comments"],
  ["/review", "Review"],
];

function getStaticRouteTitle(pathname: string | null) {
  if (!pathname) return undefined;
  if (pathname === "/") return null;
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

  // "/" (outside inputs) or Cmd/Ctrl+K jumps to search with the field
  // focused — the search screen already focuses on a fresh `focus` param.
  useEffect(() => {
    if (typeof document === "undefined" || !isAuthenticated) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        typeof event.key !== "string" ||
        event.isComposing ||
        event.defaultPrevented
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const isSlash =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      const isCmdK =
        event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (isCmdK || (isSlash && !isEditable)) {
        event.preventDefault();
        router.navigate({
          pathname: "/search",
          params: { focus: String(Date.now()) },
        });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isAuthenticated]);

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
