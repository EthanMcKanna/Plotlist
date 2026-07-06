import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";

// DSNs are safe to ship in the client bundle; only the auth token is secret.
const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ??
  "https://e02efa30db15838693b8a71dc781f2fe@o4511680500334592.ingest.us.sentry.io/4511680704544768";

// Shared with app/_layout.tsx so navigation containers can register for
// screen-load and route-change tracing.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

export function initSentry() {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Dev sessions stay local unless explicitly opted in, so crashes during
    // development don't burn the free-plan error quota.
    enabled: !__DEV__ || process.env.EXPO_PUBLIC_SENTRY_IN_DEV === "1",
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: __DEV__ ? 1.0 : 0.25,
    // Session Replay: every error/feedback session is recorded; 10% of
    // healthy sessions in production for context.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: __DEV__ ? 1.0 : 0.1,
    integrations: [
      navigationIntegration,
      Sentry.httpClientIntegration(),
      Sentry.mobileReplayIntegration({
        maskAllText: true,
        maskAllImages: true,
        maskAllVectors: true,
      }),
      Sentry.feedbackIntegration({
        colorScheme: "dark",
        formTitle: "Share feedback",
        messagePlaceholder: "What's working? What's missing? What's broken?",
        submitButtonLabel: "Send feedback",
        // Accounts are phone-based, so both contact fields are optional.
        isNameRequired: false,
        isEmailRequired: false,
        themeDark: {
          background: "#151823",
          foreground: "#F1F3F7",
          accentBackground: "#0EA5E9",
          border: "#2A2F3A",
        },
      }),
    ],
    enableCaptureFailedRequests: true,
    enableAutoSessionTracking: true,
    sendDefaultPii: false,
  });
}

export function setSentryUser(user: { id: string; username?: string } | null) {
  Sentry.setUser(user);
}

export function showFeedbackForm() {
  Sentry.showFeedbackWidget();
}

export { Sentry };
