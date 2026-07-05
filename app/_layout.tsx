import "../global.css";

import { useEffect } from "react";
import { Stack, useNavigationContainerRef } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";

import { AuthErrorBoundary } from "../components/AuthErrorBoundary";
import { AuthGate } from "../components/AuthGate";
import { NotificationsBridge } from "../components/NotificationsBridge";
import { QueryProvider } from "../components/QueryProvider";
import { PlotlistSessionProvider } from "../lib/plotlist/auth";
import { initSentry, navigationIntegration, Sentry } from "../lib/sentry";

initSentry();

const WEB_APP_MAX_WIDTH = 430;

function RootLayout() {
  const { width } = useWindowDimensions();
  const showWebFrameEdges = Platform.OS === "web" && width > WEB_APP_MAX_WIDTH;
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    if (navigationRef?.current) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  return (
    <QueryProvider>
      <PlotlistSessionProvider>
        <SafeAreaProvider>
          <View style={[styles.host, Platform.OS === "web" && styles.webHost]}>
            <GestureHandlerRootView
              style={[
                styles.appFrame,
                Platform.OS === "web" && styles.webAppFrame,
                showWebFrameEdges && styles.webAppFrameEdges,
              ]}
            >
              <StatusBar style="light" />
              <AuthErrorBoundary>
                <AuthGate>
                  <NotificationsBridge />
                  <Stack screenOptions={{ headerShown: false }} />
                </AuthGate>
              </AuthErrorBoundary>
            </GestureHandlerRootView>
          </View>
        </SafeAreaProvider>
      </PlotlistSessionProvider>
    </QueryProvider>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  host: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
  webHost: {
    alignItems: "center",
    backgroundColor: "#05070A",
  },
  appFrame: {
    backgroundColor: "#0D0F14",
    flex: 1,
    width: "100%",
  },
  webAppFrame: {
    maxWidth: WEB_APP_MAX_WIDTH,
    overflow: "hidden",
  },
  webAppFrameEdges: {
    borderColor: "rgba(255,255,255,0.08)",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
