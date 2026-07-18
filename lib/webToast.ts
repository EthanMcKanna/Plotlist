import { Platform } from "react-native";

// Minimal DOM toast for web feedback (link copied, save failed, …) where
// native uses Alert.alert or haptics. Rendered outside the React tree so it
// works from plain event handlers and never affects native bundles at
// runtime (every call is a no-op off web).

const CONTAINER_ID = "plotlist-toast-root";

function getContainer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    Object.assign(container.style, {
      position: "fixed",
      bottom: "28px",
      left: "0",
      right: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      zIndex: "2147483000",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(container);
  }
  return container;
}

export type WebToastKind = "info" | "error";

export function showWebToast(message: string, kind: WebToastKind = "info") {
  if (Platform.OS !== "web") return;
  const container = getContainer();
  if (!container) return;

  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    maxWidth: "min(420px, calc(100vw - 48px))",
    padding: "10px 18px",
    borderRadius: "999px",
    backgroundColor: "#1A1F29",
    border: `1px solid ${kind === "error" ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.12)"}`,
    color: "#F1F3F7",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: "13px",
    fontWeight: "600",
    letterSpacing: "0.1px",
    boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity 180ms ease, transform 180ms ease",
    pointerEvents: "none",
    textAlign: "center",
  } satisfies Partial<CSSStyleDeclaration>);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  const lifetime = kind === "error" ? 4200 : 2400;
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(() => toast.remove(), 220);
  }, lifetime);
}
