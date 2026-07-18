import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Platform, View, StyleSheet } from "react-native";

import { useIsDesktopWeb } from "../../lib/webLayout";

const iconSize = 22;

function tabPressHaptic() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

// iOS gets the real UITabBar (system Liquid Glass on iOS 26, correct
// materials on older versions, native pop-to-top/scroll-to-top). Android and
// web keep the JS tab bar below.
function NativeTabsLayout() {
  return (
    <NativeTabs tintColor="#0ea5e9">
      <NativeTabs.Trigger name="home">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="log">
        <Icon sf={{ default: "book.closed", selected: "book.closed.fill" }} />
        <Label>Log</Label>
      </NativeTabs.Trigger>
      {/* The system search role opts into the dedicated iOS 26 search tab. */}
      <NativeTabs.Trigger name="search" role="search" />
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Me</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function JsTabsLayout() {
  // Desktop web navigates through the persistent sidebar (see WebShell);
  // the bottom tab bar only renders on narrow viewports.
  const isDesktopWeb = useIsDesktopWeb();
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
          ...(isDesktopWeb ? { display: "none" as const } : null),
        },
        tabBarBackground: () => (
          <BlurView intensity={80} style={StyleSheet.absoluteFill} tint="dark">
            <View style={styles.blurFill} />
          </BlurView>
        ),
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
          tabPress: tabPressHaptic,
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
          tabPress: tabPressHaptic,
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
          tabPress: tabPressHaptic,
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
          tabPress: tabPressHaptic,
        }}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  if (Platform.OS === "ios") {
    return <NativeTabsLayout />;
  }
  return <JsTabsLayout />;
}

const styles = StyleSheet.create({
  blurFill: {
    backgroundColor: "rgba(13, 15, 20, 0.85)",
    borderTopColor: "rgba(42, 46, 56, 0.5)",
    borderTopWidth: 0.5,
    flex: 1,
  },
});
