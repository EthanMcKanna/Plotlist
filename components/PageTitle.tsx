import { useEffect } from "react";
import { Platform } from "react-native";

// Browser tab title for a screen. Route-level defaults live in WebShell;
// screens with dynamic names (show, list, profile) render this with the
// loaded title. No-op on native.
export function PageTitle({ title }: { title?: string | null }) {
  const trimmed = title?.trim();
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.title = trimmed ? `${trimmed} — Plotlist` : "Plotlist";
  }, [trimmed]);
  return null;
}
