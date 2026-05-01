import "../global.css";

import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AuthErrorBoundary } from "../components/AuthErrorBoundary";
import { AuthGate } from "../components/AuthGate";
import { QueryProvider } from "../components/QueryProvider";
import { PlotlistSessionProvider } from "../lib/plotlist/auth";

export default function RootLayout() {
  return (
    <QueryProvider>
      <PlotlistSessionProvider>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0D0F14" }}>
            <StatusBar style="light" />
            <AuthErrorBoundary>
              <AuthGate>
                <Stack screenOptions={{ headerShown: false }} />
              </AuthGate>
            </AuthErrorBoundary>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </PlotlistSessionProvider>
    </QueryProvider>
  );
}
