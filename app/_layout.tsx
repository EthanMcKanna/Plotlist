import "../global.css";

import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

import { convex } from "../lib/convex";
import { authStorage } from "../lib/authStorage";
import { AuthErrorBoundary } from "../components/AuthErrorBoundary";
import { AuthGate } from "../components/AuthGate";

export default function RootLayout() {
  return (
    <ConvexAuthProvider
      client={convex}
      storage={authStorage}
      storageNamespace="plotlist"
    >
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
    </ConvexAuthProvider>
  );
}
