import { ReactNode, Ref } from "react";
import { ScrollView, ScrollViewProps, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWebPageStyle, WEB_READING_MAX_WIDTH } from "../lib/webLayout";

export function Screen({
  children,
  scroll = false,
  className,
  hasTabBar = false,
  keyboardShouldPersistTaps = "handled",
  // Desktop web renders page content as a centered column of this width;
  // pass null for full-bleed screens. Native and narrow web are untouched.
  webMaxWidth = WEB_READING_MAX_WIDTH,
  // Decorative layer painted over the base gradient but behind the safe
  // area, so it reaches the physical top of the screen (status bar / notch)
  // and stays fixed while content scrolls. Always non-interactive.
  backgroundOverlay,
  // Access to the ScrollView (scroll mode only) for imperative scrolling,
  // e.g. revealing a focused input above the keyboard.
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  hasTabBar?: boolean;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  webMaxWidth?: number | null;
  backgroundOverlay?: ReactNode;
  scrollRef?: Ref<ScrollView>;
}) {
  const safeAreaEdges = hasTabBar ? ["top", "left", "right"] as const : ["top", "left", "right", "bottom"] as const;
  const webColumnStyle = useWebPageStyle(webMaxWidth ?? undefined);
  const columnStyle = webMaxWidth == null ? null : webColumnStyle;

  if (scroll) {
    return (
      <View style={styles.root}>
        <LinearGradient
          pointerEvents="none"
          colors={["#10141B", "#0D0F14", "#090B10"]}
          locations={[0, 0.46, 1]}
          style={StyleSheet.absoluteFill}
        />
        {backgroundOverlay ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {backgroundOverlay}
          </View>
        ) : null}
        <SafeAreaView edges={safeAreaEdges} className="flex-1">
          <ScrollView
            ref={scrollRef}
            contentInsetAdjustmentBehavior="automatic"
            // iOS: grow the bottom inset and auto-scroll the focused input
            // above the keyboard (Android resizes the window natively).
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            // No top rubber-band: overscroll exposes the hard cutoff above
            // page headers.
            bounces={false}
            overScrollMode="never"
            className={className}
            contentContainerStyle={columnStyle}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        pointerEvents="none"
        colors={["#10141B", "#0D0F14", "#090B10"]}
        locations={[0, 0.46, 1]}
        style={StyleSheet.absoluteFill}
      />
      {backgroundOverlay ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {backgroundOverlay}
        </View>
      ) : null}
      <SafeAreaView
        edges={safeAreaEdges}
        className={`flex-1 ${className ?? ""}`}
      >
        <View className="flex-1" style={columnStyle}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
});
