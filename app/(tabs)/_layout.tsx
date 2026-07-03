import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { View, StyleSheet } from "react-native";

import { GlassSurface, isNativeGlassAvailable } from "../../components/NativeGlass";

const iconSize = 22;

// Native Liquid Glass when the installed binary supports it (iOS 26+),
// otherwise the previous blur treatment.
function TabBarBackground() {
  if (isNativeGlassAvailable()) {
    return (
      <GlassSurface
        radius={0}
        borderColor="transparent"
        tintColor="rgba(13, 15, 20, 0.32)"
        style={StyleSheet.absoluteFill}
        contentStyle={styles.glassEdge}
      />
    );
  }
  return (
    <BlurView intensity={80} style={StyleSheet.absoluteFill} tint="dark">
      <View style={styles.blurFill} />
    </BlurView>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0ea5e9",
        tabBarInactiveTintColor: "#5A6070",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () => <TabBarBackground />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="home"
              size={iconSize}
              color={color}
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          ),
        }}
        listeners={{
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: "Log",
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="journal-outline"
              size={iconSize}
              color={color}
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          ),
        }}
        listeners={{
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="search"
              size={iconSize}
              color={color}
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          ),
        }}
        listeners={{
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Me",
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="person"
              size={iconSize}
              color={color}
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          ),
        }}
        listeners={{
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  blurFill: {
    backgroundColor: "rgba(13, 15, 20, 0.85)",
    borderTopColor: "rgba(42, 46, 56, 0.5)",
    borderTopWidth: 0.5,
    flex: 1,
  },
  glassEdge: {
    borderTopColor: "rgba(255, 255, 255, 0.10)",
    borderTopWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
});
