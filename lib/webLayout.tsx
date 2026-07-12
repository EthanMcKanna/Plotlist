import { createContext, useContext } from "react";
import { Platform, useWindowDimensions } from "react-native";

// Breakpoints for the web shell. Native never enters these branches — every
// hook below collapses to the mobile value when Platform.OS !== "web".
export const WEB_SIDEBAR_BREAKPOINT = 1024;
export const WEB_RAIL_BREAKPOINT = 768;

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

// Centered column style for page content on desktop web; null elsewhere so
// callers can spread it into contentContainerStyle / style arrays safely.
export function useWebPageStyle(maxWidth: number = WEB_PAGE_MAX_WIDTH) {
  const isDesktop = useIsDesktopWeb();
  if (!isDesktop) return null;
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
// panels on desktop web.
export function useWebSheetStyle(maxWidth = 520) {
  const isDesktop = useIsDesktopWeb();
  if (!isDesktop) return null;
  return {
    alignSelf: "center" as const,
    maxWidth,
    width: "100%" as const,
  };
}
