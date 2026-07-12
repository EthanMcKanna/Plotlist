import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useIsDesktopWeb } from "../lib/webLayout";

type HorizontalRailProps = {
  children: ReactNode;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
  snapToInterval?: number;
  decelerationRate?: ScrollViewProps["decelerationRate"];
  accessibilityLabel?: string;
  testID?: string;
};

// Horizontal ScrollView that shows hover scroll-arrows on desktop web, where
// drag-to-scroll isn't a mouse gesture. Native renders the plain ScrollView.
// Arrow visibility reads the DOM at hover/scroll time instead of caching
// layout events, which go stale when a hidden tab screen is re-shown.
export function HorizontalRail({
  children,
  contentContainerStyle,
  snapToInterval,
  decelerationRate,
  accessibilityLabel,
  testID,
}: HorizontalRailProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const scrollRef = useRef<ScrollView>(null);
  const [hovered, setHovered] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const getScrollNode = useCallback((): HTMLElement | null => {
    const ref = scrollRef.current as unknown as {
      getScrollableNode?: () => HTMLElement;
    } | null;
    return ref?.getScrollableNode?.() ?? null;
  }, []);

  const recomputeArrows = useCallback(() => {
    const node = getScrollNode();
    if (!node) return;
    setCanScrollLeft(node.scrollLeft > 4);
    setCanScrollRight(
      node.scrollLeft + node.clientWidth < node.scrollWidth - 4,
    );
  }, [getScrollNode]);

  const scrollByPage = useCallback(
    (direction: 1 | -1) => {
      const node = getScrollNode();
      if (!node) return;
      const page = Math.max(node.clientWidth * 0.9, 240);
      const from = node.scrollLeft;
      const target = Math.max(from + direction * page, 0);
      scrollRef.current?.scrollTo({ x: target, animated: true });
      // Environments without smooth scrolling (or reduced motion) ignore the
      // animated scroll — jump directly if nothing moved.
      setTimeout(() => {
        if (Math.abs(node.scrollLeft - from) < 2) {
          node.scrollLeft = target;
        }
      }, 320);
    },
    [getScrollNode],
  );

  const rail = (
    <ScrollView
      ref={scrollRef}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
      decelerationRate={decelerationRate}
      snapToInterval={isDesktopWeb ? undefined : snapToInterval}
      snapToAlignment={snapToInterval ? "start" : undefined}
      onScroll={isDesktopWeb ? recomputeArrows : undefined}
      scrollEventThrottle={64}
    >
      {children}
    </ScrollView>
  );

  if (!isDesktopWeb) {
    return rail;
  }

  const hoverProps = {
    onMouseEnter: () => {
      setHovered(true);
      recomputeArrows();
    },
    onMouseLeave: () => setHovered(false),
  } as Record<string, unknown>;

  return (
    <View style={styles.wrap} {...hoverProps}>
      {rail}
      {hovered && canScrollLeft ? (
        <RailArrow direction={-1} onPress={scrollByPage} />
      ) : null}
      {hovered && canScrollRight ? (
        <RailArrow direction={1} onPress={scrollByPage} />
      ) : null}
    </View>
  );
}

// Web-only arrows for rails we can't render through HorizontalRail (e.g.
// horizontal FlashLists). Wraps the rail and drives whichever descendant
// actually overflows horizontally. Native returns children untouched.
export function RailArrowsBox({ children }: { children: ReactNode }) {
  const isDesktopWeb = useIsDesktopWeb();
  const wrapRef = useRef<View>(null);
  const [hovered, setHovered] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const getScrollNode = useCallback((): HTMLElement | null => {
    const host = wrapRef.current as unknown as HTMLElement | null;
    if (!host || typeof host.querySelectorAll !== "function") return null;
    if (host.scrollWidth > host.clientWidth + 8) return host;
    for (const el of Array.from(host.querySelectorAll("div"))) {
      if (el.scrollWidth > el.clientWidth + 8) return el as HTMLElement;
    }
    return null;
  }, []);

  const recomputeArrows = useCallback(() => {
    const node = getScrollNode();
    if (!node) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(node.scrollLeft > 4);
    setCanScrollRight(
      node.scrollLeft + node.clientWidth < node.scrollWidth - 4,
    );
  }, [getScrollNode]);

  const scrollByPage = useCallback(
    (direction: 1 | -1) => {
      const node = getScrollNode();
      if (!node) return;
      const page = Math.max(node.clientWidth * 0.9, 240);
      const from = node.scrollLeft;
      const target = Math.max(from + direction * page, 0);
      node.scrollTo?.({ left: target, behavior: "smooth" });
      setTimeout(() => {
        if (Math.abs(node.scrollLeft - from) < 2) {
          node.scrollLeft = target;
        }
        recomputeArrows();
      }, 320);
    },
    [getScrollNode, recomputeArrows],
  );

  // Track scrolls while hovered so wheel/trackpad scrolling updates arrows.
  useEffect(() => {
    if (!hovered) return;
    const node = getScrollNode();
    if (!node) return;
    node.addEventListener("scroll", recomputeArrows, { passive: true });
    return () => node.removeEventListener("scroll", recomputeArrows);
  }, [hovered, getScrollNode, recomputeArrows]);

  if (!isDesktopWeb) {
    return <>{children}</>;
  }

  const hoverProps = {
    onMouseEnter: () => {
      setHovered(true);
      recomputeArrows();
    },
    onMouseLeave: () => setHovered(false),
  } as Record<string, unknown>;

  return (
    <View ref={wrapRef} style={styles.wrap} {...hoverProps}>
      {children}
      {hovered && canScrollLeft ? (
        <RailArrow direction={-1} onPress={scrollByPage} />
      ) : null}
      {hovered && canScrollRight ? (
        <RailArrow direction={1} onPress={scrollByPage} />
      ) : null}
    </View>
  );
}

function RailArrow({
  direction,
  onPress,
}: {
  direction: 1 | -1;
  onPress: (direction: 1 | -1) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(direction)}
      accessibilityRole="button"
      accessibilityLabel={direction === 1 ? "Scroll right" : "Scroll left"}
      style={[styles.arrow, direction === 1 ? styles.arrowRight : styles.arrowLeft]}
      className="opacity-85 hover:opacity-100 active:opacity-100"
    >
      <Ionicons
        name={direction === 1 ? "chevron-forward" : "chevron-back"}
        size={20}
        color="#F1F3F7"
        accessible={false}
        aria-hidden={true}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
  arrow: {
    alignItems: "center",
    backgroundColor: "rgba(13,15,20,0.85)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -20 }],
    width: 40,
    zIndex: 5,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }
      : null),
  },
  arrowLeft: {
    left: 10,
  },
  arrowRight: {
    right: 10,
  },
});
