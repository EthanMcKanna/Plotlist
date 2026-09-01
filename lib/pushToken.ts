import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { api } from "./plotlist/api";
import { callMutation, callQuery } from "./plotlist/rpc";
import { queryClient } from "./queryClient";

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

// The home bell and the web sidebar read this exact key; the inbox reads the
// same query with no args (a second key). Both are updated below.
export const UNREAD_COUNT_QUERY_KEY = [
  "plotlist-rpc",
  "query",
  "notifications:getUnreadCount",
  {},
] as const;

// Fetch the unread count *through* react-query so every mounted bell badge
// repaints with the fresh value. A direct callQuery used to leave the cached
// count behind the springboard badge until the next mutation invalidated it.
export async function fetchUnreadCountIntoCache(): Promise<number> {
  const unread = await queryClient.fetchQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: ({ signal }) =>
      callQuery<number>(api.notifications.getUnreadCount, {}, { signal }),
    staleTime: 0,
    // Best-effort and re-run on every foreground; a retry only delays the
    // badge behind a flaky request.
    retry: false,
  });
  const count = Number(unread) || 0;
  for (const entry of queryClient
    .getQueryCache()
    .findAll({ queryKey: ["plotlist-rpc", "query", "notifications:getUnreadCount"] })) {
    if (entry.state.data !== count) {
      queryClient.setQueryData(entry.queryKey, count);
    }
  }
  return count;
}

export async function syncAppBadgeCount() {
  if (!isPushSupported) {
    return;
  }
  try {
    const unread = await fetchUnreadCountIntoCache();
    await Notifications.setBadgeCountAsync(unread);
  } catch {
    // Badge sync is cosmetic; never surface errors.
  }
}
