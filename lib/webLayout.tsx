import { createContext, useContext } from "react";
import { Platform, useWindowDimensions } from "react-native";

// Breakpoints for the web shell. Navigation chrome (sidebar/rail) is still
// web-only, but the *content* helpers below also activate on iPad windows
// wide enough for the regular size class — so tablets get the same page
// columns, grids, and centered sheets as desktop web while keeping native
// navigation. Narrow iPad windows (Split View / Slide Over) fall back to the
// phone layout, which is exactly the adaptive behavior Apple expects.
export const WEB_SIDEBAR_BREAKPOINT = 1024;
export const WEB_RAIL_BREAKPOINT = 768;

// iPadOS regular-width threshold: at/above this the window behaves like a
// "big screen" (full-screen iPad, 2/3 Split View, large Stage Manager
// windows); below it (~compact width) screens keep their phone layout.
export const TABLET_WIDE_BREAKPOINT = 700;

export const IS_TABLET = Platform.OS === "ios" && Platform.isPad === true;

export const WEB_SIDEBAR_WIDTH = 248;
export const WEB_RAIL_WIDTH = 76;

// Default content column widths. "page" fits rails and grids; "reading" is
// for forms and text-heavy screens (settings, legal, comments).
export const WEB_PAGE_MAX_WIDTH = 1128;
export const WEB_READING_MAX_WIDTH = 680;

export type WebNavMode = "sidebar" | "rail" | "tabs" | "native";

// In-app back arrows are a native-app affordance; web relies on the
// browser's own history controls.
export const SHOW_BACK_BUTTON = Platform.OS !== "web";

// Which navigation chrome the current viewport gets.
export function useWebNavMode(): WebNavMode {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web") return "native";
  if (width >= WEB_SIDEBAR_BREAKPOINT) return "sidebar";
  if (width >= WEB_RAIL_BREAKPOINT) return "rail";
  return "tabs";
}

export function getWebNavWidth(mode: WebNavMode): number {
  if (mode === "sidebar") return WEB_SIDEBAR_WIDTH;
  if (mode === "rail") return WEB_RAIL_WIDTH;
  return 0;
}

// True when the web shell renders side navigation instead of bottom tabs.
export function useIsDesktopWeb(): boolean {
  const mode = useWebNavMode();
  return mode === "sidebar" || mode === "rail";
}

// Wide-content mode: desktop web, or a regular-width iPad window. Gates the
// big-screen *content* treatments (centered columns, dialog-style sheets,
// fuller rails) — never navigation chrome, which stays native on iPad.
export function useIsWideLayout(): boolean {
  const { width } = useWindowDimensions();
  const isDesktopWeb = useIsDesktopWeb();
  if (isDesktopWeb) return true;
  return IS_TABLET && width >= TABLET_WIDE_BREAKPOINT;
}

// Width of the area screens actually render into (window minus side nav).
// The web shell provides it; native and narrow web fall through to the
// window width, so existing card-size math is unchanged off desktop.
const ContentWidthContext = createContext<number | null>(null);

export const ContentWidthProvider = ContentWidthContext.Provider;

export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  const contextual = useContext(ContentWidthContext);
  if (Platform.OS !== "web") return width;
  return contextual ?? width;
}

// Centered column style for page content on desktop web and wide iPad
// windows; null elsewhere so callers can spread it into
// contentContainerStyle / style arrays safely.
export function useWebPageStyle(maxWidth: number = WEB_PAGE_MAX_WIDTH) {
  const isWide = useIsWideLayout();
  if (!isWide) return null;
  return {
    alignSelf: "center" as const,
    maxWidth,
    width: "100%" as const,
  };
}

export type PosterGridLayout = {
  numColumns: number;
  itemWidth: number;
  // Width the grid actually occupies (content column, capped on desktop).
  gridWidth: number;
};

// Poster/tile grid geometry that adds columns as the content column widens.
// On phones the math reduces to the legacy fixed column count, so native
// layouts are pixel-identical to before.
export function getPosterGridLayout({
  contentWidth,
  maxWidth = WEB_PAGE_MAX_WIDTH,
  horizontalPadding = 48,
  gap = 12,
  minColumns = 3,
  targetItemWidth = 150,
}: {
  contentWidth: number;
  maxWidth?: number;
  horizontalPadding?: number;
  gap?: number;
  minColumns?: number;
  targetItemWidth?: number;
}): PosterGridLayout {
  const gridWidth = Math.min(contentWidth, maxWidth);
  const available = Math.max(gridWidth - horizontalPadding, 200);
  const numColumns = Math.max(
    minColumns,
    Math.floor((available + gap) / (targetItemWidth + gap)),
  );
  const itemWidth = (available - gap * (numColumns - 1)) / numColumns;
  return { numColumns, itemWidth, gridWidth };
}

export function usePosterGridLayout(
  options: Omit<
    Parameters<typeof getPosterGridLayout>[0],
    "contentWidth"
  > = {},
): PosterGridLayout {
  const contentWidth = useContentWidth();
  return getPosterGridLayout({ contentWidth, ...options });
}

// Bottom sheets and dialogs: full-width on phones, centered constrained
// panels on desktop web and wide iPad windows.
export function useWebSheetStyle(maxWidth = 520) {
  const isWide = useIsWideLayout();
  if (!isWide) return null;
  return {
    alignSelf: "center" as const,
    maxWidth,
    width: "100%" as const,
  };
}
