import { useEffect, useRef, type RefObject } from "react";
import type { ScrollView } from "react-native";
import { useNavigation } from "expo-router";

type ScrollableRef = {
  scrollToOffset?: (params: { offset: number; animated: boolean }) => void;
  scrollTo?: ScrollView["scrollTo"];
};

/**
 * When the user taps the currently-active bottom tab, scroll the rail to top.
 * Mirrors iOS native behaviour. Works with FlatList and ScrollView refs.
 */
export function useScrollToTopOnTabPress<T extends ScrollableRef>(
  ref: RefObject<T | null>,
) {
  const navigation = useNavigation();
  const lastTapAtRef = useRef<number>(0);

  useEffect(() => {
    const parent = navigation.getParent?.();
    if (!parent) return;

    const unsubscribe = parent.addListener("tabPress" as any, () => {
      const now = Date.now();
      // Only react if this screen is currently focused.
      const state = parent.getState?.();
      if (!state) return;
      const focusedRoute = state.routes[state.index ?? 0];
      const navState = navigation.getState?.();
      const myKey = navState?.routes[navState.index ?? 0]?.key;
      if (focusedRoute && focusedRoute.key !== myKey) {
        // Different tab was selected — let RN handle it.
        return;
      }

      const elapsed = now - lastTapAtRef.current;
      lastTapAtRef.current = now;
      if (elapsed > 1500) {
        // Single tap: scroll to top regardless.
      }

      const node = ref.current;
      if (!node) return;
      if (typeof node.scrollToOffset === "function") {
        node.scrollToOffset({ offset: 0, animated: true });
      } else if (typeof node.scrollTo === "function") {
        node.scrollTo({ y: 0, animated: true });
      }
    });

    return unsubscribe;
  }, [navigation, ref]);
}
