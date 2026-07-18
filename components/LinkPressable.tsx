import { Platform, Pressable, StyleSheet, type PressableProps } from "react-native";
import { Link, router, type Href } from "expo-router";
import type { GestureResponderEvent } from "react-native";

import { guardedPush } from "../lib/navigation";
import { acquireNavigationLock } from "../lib/navigationLock";

type LinkPressableProps = Omit<PressableProps, "onPress"> & {
  href: Href;
  // Runs before navigation on both platforms (analytics, closing UI, …).
  onPress?: PressableProps["onPress"];
  // "push" stacks a new screen (default, matches guardedPush); "navigate"
  // is for tab-like destinations that shouldn't stack duplicates.
  action?: "push" | "navigate";
};

// True only for plain left clicks: cmd/ctrl/shift/alt-clicks and middle
// clicks must stay with the browser (new tab / new window).
function isPlainLeftClick(event: unknown): boolean {
  if (!event || typeof event !== "object" || !("button" in event)) {
    return true;
  }
  const e = event as {
    button?: number | null;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  };
  return (
    (e.button == null || e.button === 0) &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.shiftKey
  );
}

// Navigation pressable that is a real <a href> on web — cmd/middle-click,
// right-click → "Open in new tab", link previews, and SEO all work — while
// native keeps the exact guardedPush behavior it has today.
export function LinkPressable({
  href,
  onPress,
  action = "push",
  style,
  ...rest
}: LinkPressableProps) {
  if (Platform.OS !== "web") {
    return (
      <Pressable
        {...rest}
        style={style}
        onPress={(event) => {
          onPress?.(event);
          if (action === "navigate") {
            if (acquireNavigationLock()) {
              router.navigate(href);
            }
            return;
          }
          guardedPush(href);
        }}
      />
    );
  }

  return (
    <Link href={href} push={action === "push"} asChild>
      <Pressable
        {...rest}
        // Link's asChild slot merges its own props with the child's:
        // 1. A style ARRAY (or state function) coming out of that merge
        //    reaches the DOM <a> unprocessed — React DOM throws on indexed
        //    style keys and object-spreads a function into {} — so resolve
        //    to a plain object here (function styles use the rest state).
        style={
          typeof style === "function"
            ? StyleSheet.flatten(style({ pressed: false, hovered: false }))
            : StyleSheet.flatten(style)
        }
        // 2. onPress must live on the CHILD: the slot composes the child's
        //    handler with Link's internal navigation handler, whereas an
        //    onPress prop on <Link> itself REPLACES the navigation handler
        //    entirely and plain clicks fall through to a full page load.
        onPress={(event) => {
          onPress?.(event as GestureResponderEvent);
          // Keep the double-activation guard for plain clicks only; modified
          // clicks may legitimately open several tabs in a row.
          if (isPlainLeftClick(event) && !acquireNavigationLock()) {
            (event as { preventDefault?: () => void })?.preventDefault?.();
          }
        }}
      />
    </Link>
  );
}
