import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { api } from "./plotlist/api";
import { callMutation, callQuery } from "./plotlist/rpc";

// Token/badge plumbing lives apart from the lifecycle hook so the auth
// module can trigger unregistration without a require cycle.

export const isPushSupported = Platform.OS === "ios" || Platform.OS === "android";

let lastRegisteredToken: string | null = null;

export async function getExpoPushToken(): Promise<string | null> {
  if (!isPushSupported || !Device.isDevice) {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const response = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return response.data ?? null;
}

function getDeviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? undefined;
  } catch {
    return undefined;
  }
}

export async function registerPushTokenWithServer() {
  try {
    const token = await getExpoPushToken();
    if (!token) {
      return;
    }
    await callMutation(api.notifications.registerPushToken, {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      timezone: getDeviceTimezone(),
    });
    lastRegisteredToken = token;
  } catch (error) {
    console.warn("[push] token registration failed", error);
  }
}

// Called on sign-out while the session is still valid so the device stops
// receiving the previous account's pushes.
export async function unregisterPushTokenFromServer() {
  try {
    const token = lastRegisteredToken ?? (await getExpoPushToken());
    if (!token) {
      return;
    }
    await callMutation(api.notifications.unregisterPushToken, { token });
    lastRegisteredToken = null;
    if (isPushSupported) {
      await Notifications.setBadgeCountAsync(0).catch(() => undefined);
    }
  } catch (error) {
    console.warn("[push] token unregistration failed", error);
  }
}

export async function syncAppBadgeCount() {
  if (!isPushSupported) {
    return;
  }
  try {
    const unread = await callQuery<number>(api.notifications.getUnreadCount);
    await Notifications.setBadgeCountAsync(Number(unread) || 0);
  } catch {
    // Badge sync is cosmetic; never surface errors.
  }
}
