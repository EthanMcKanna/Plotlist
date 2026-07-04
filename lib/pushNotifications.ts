import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import type { Href } from "expo-router";

import { guardedPush } from "./navigation";
import { useAuth } from "./plotlist/auth";
import {
  isPushSupported,
  registerPushTokenWithServer,
  syncAppBadgeCount,
} from "./pushToken";

if (isPushSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function routeForNotificationData(data: unknown): Href {
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url === "string" && url.startsWith("/")) {
    return url as Href;
  }
  return "/notifications" as Href;
}

let handledResponseId: string | null = null;

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const identifier = response.notification.request.identifier;
  if (identifier && identifier === handledResponseId) {
    return;
  }
  handledResponseId = identifier ?? null;
  guardedPush(routeForNotificationData(response.notification.request.content.data));
}

// Mounted once (via NotificationsBridge) for the lifetime of the app: keeps
// the server token fresh, routes notification taps, and syncs the app badge.
export function usePushNotifications() {
  const { isAuthenticated } = useAuth();
  const registeredForSession = useRef(false);

  useEffect(() => {
    if (!isPushSupported) {
      return;
    }
    if (!isAuthenticated) {
      registeredForSession.current = false;
      return;
    }
    if (registeredForSession.current) {
      return;
    }
    registeredForSession.current = true;
    void registerPushTokenWithServer();
    void syncAppBadgeCount();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isPushSupported || !isAuthenticated) {
      return;
    }

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );
    // A tap that cold-started the app fires before listeners exist.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncAppBadgeCount();
      }
    });

    return () => {
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [isAuthenticated]);
}
