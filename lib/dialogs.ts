import { Alert, Platform } from "react-native";
import { router } from "expo-router";

import { showWebToast } from "./webToast";

// react-native-web's Alert is an empty stub — every Alert.alert on a
// web-reachable surface silently does nothing (confirm buttons never fire,
// errors vanish). These helpers keep the native Alert flows byte-identical
// while giving web real feedback: toasts for notices, window.confirm for
// destructive/confirm dialogs, and a sign-in redirect for auth gates.

// Transient notice (success confirmations, mutation errors after optimistic
// rollback). Native: Alert.alert as before. Web: toast.
export function notify(
  title: string,
  message?: string,
  kind: "info" | "error" = "info",
) {
  if (Platform.OS === "web") {
    showWebToast(message ? `${title} — ${message}` : title, kind);
    return;
  }
  Alert.alert(title, message);
}

export function notifyError(title: string, message?: string) {
  notify(title, message, "error");
}

// Two-button confirmation. Native: the exact Alert.alert shape used today.
// Web: the browser's own confirm dialog — synchronous, keyboard accessible.
export function confirmAction({
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  if (Platform.OS === "web") {
    const ok = window.confirm(message ? `${title}\n\n${message}` : title);
    if (ok) {
      onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel", onPress: onCancel },
    {
      text: confirmLabel,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}

// Signed-out gate on an authenticated action. Native: the Alert prompt with
// a Sign in button (unchanged). Web: go straight to the sign-in page — the
// standard web pattern for gated actions.
export function promptSignIn(message: string) {
  if (Platform.OS === "web") {
    router.push("/sign-in");
    return;
  }
  Alert.alert("Sign in required", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Sign in", onPress: () => router.push("/sign-in") },
  ]);
}
