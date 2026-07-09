import { ReactNode } from "react";
import { ScrollView, ScrollViewProps, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({
  children,
  scroll = false,
  className,
  hasTabBar = false,
  keyboardShouldPersistTaps = "handled",
}: {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  hasTabBar?: boolean;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
}) {
  const safeAreaEdges = hasTabBar ? ["top", "left", "right"] as const : ["top", "left", "right", "bottom"] as const;

  if (scroll) {
    return (
      <View style={styles.root}>
        <LinearGradient
          pointerEvents="none"
          colors={["#10141B", "#0D0F14", "#090B10"]}
          locations={[0, 0.46, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={safeAreaEdges} className="flex-1">
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            // No top rubber-band: overscroll exposes the hard cutoff above
            // page headers.
            bounces={false}
            overScrollMode="never"
            className={className}
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
      <SafeAreaView
        edges={safeAreaEdges}
        className={`flex-1 ${className ?? ""}`}
      >
        <View className="flex-1">{children}</View>
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
