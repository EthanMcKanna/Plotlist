import { createElement, useCallback, useEffect, useState } from "react";
import { InteractionManager, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";

// NativeTabs renders every tab's screen on the tab bar's first frame — there
// is no lazy option — so on cold start the home tab used to compete with
// search/log/profile mounting their whole trees and firing their queries.
// Heavy sibling tabs gate on this hook instead: they mount shortly after
// launch interactions settle (preserving the deliberate pre-warm of their
// caches) or instantly on first focus, whichever comes first.
export function useDeferredTabMount() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => setReady(true), 350);
    });
    return () => {
      task.cancel();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      setReady(true);
    }, []),
  );

  return ready;
}

// Matches the stack/backdrop color so the pre-mount frame is invisible.
export function TabMountPlaceholder() {
  return createElement(View, { style: styles.placeholder });
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
});
