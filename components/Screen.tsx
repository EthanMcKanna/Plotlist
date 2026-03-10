import { ReactNode } from "react";
import { ScrollView, ScrollViewProps, View } from "react-native";
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
      <SafeAreaView edges={safeAreaEdges} className="flex-1 bg-dark-bg">
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          className={className}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={safeAreaEdges}
      className={`flex-1 bg-dark-bg ${className ?? ""}`}
    >
      <View className="flex-1">{children}</View>
    </SafeAreaView>
  );
}
