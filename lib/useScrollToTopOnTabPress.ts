import { useCallback, useEffect, useRef, type RefObject } from "react";
import { Platform, type ScrollView } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";

type ScrollableRef = {
  scrollToOffset?: (params: { offset: number; animated: boolean }) => void;
  scrollTo?: ScrollView["scrollTo"];
};

// The web sidebar isn't a tab bar, so it dispatches this DOM event when the
// already-active item is clicked; screens with this hook scroll to top just
// like a native re-tapped tab.
export const WEB_ACTIVE_NAV_EVENT = "plotlist:active-nav-press";

/**
 * When the user taps the currently-active bottom tab, scroll the rail to top.
 * Mirrors iOS native behaviour. Works with FlatList and ScrollView refs.
 */
export function useScrollToTopOnTabPress<T extends ScrollableRef>(
  ref: RefObject<T | null>,
) {
  const navigation = useNavigation();
  const lastTapAtRef = useRef<number>(0);
  const isFocusedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
    }, []),
  );

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof window === "undefined" ||
      // Test environments stub a window without an event target API.
      typeof window.addEventListener !== "function"
    )
      return;
    const onActiveNavPress = () => {
      if (!isFocusedRef.current) return;
      const node = ref.current;
      if (!node) return;
      if (typeof node.scrollToOffset === "function") {
        node.scrollToOffset({ offset: 0, animated: true });
      } else if (typeof node.scrollTo === "function") {
        node.scrollTo({ y: 0, animated: true });
      }
    };
    window.addEventListener(WEB_ACTIVE_NAV_EVENT, onActiveNavPress);
    return () =>
      window.removeEventListener(WEB_ACTIVE_NAV_EVENT, onActiveNavPress);
  }, [ref]);

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
