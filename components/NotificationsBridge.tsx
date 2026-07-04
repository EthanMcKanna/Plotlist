import { usePushNotifications } from "../lib/pushNotifications";

// Renders nothing; exists so the push-notification lifecycle hook lives
// inside the session provider tree exactly once.
export function NotificationsBridge() {
  usePushNotifications();
  return null;
}
