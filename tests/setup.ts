import { afterEach, jest } from "@jest/globals";
import { cleanup } from "@testing-library/react-native";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Soft: "soft",
  },
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name?: string }) => name ?? "icon",
}));

// The splash-screen module talks to the native launch screen, which jest-expo
// does not provide; the launch overlay only needs inert stand-ins.
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  setOptions: jest.fn(),
  hide: jest.fn(),
  hideAsync: jest.fn(async () => undefined),
}));

// zeego renders native UIContextMenu/menu views jest-expo can't host; the
// mock passes the trigger's children through so rows stay renderable.
jest.mock("zeego/context-menu", () => {
  // No createElement here: the css-interop babel transform would inject an
  // out-of-scope import into the mock factory. Returning children directly
  // is a valid React node.
  const passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Root: passthrough,
    Trigger: passthrough,
    Content: () => null,
    Item: () => null,
    ItemTitle: () => null,
    ItemIcon: () => null,
  };
});

// The Sentry SDK touches native modules at init time, which jest-expo does
// not provide; component tests only need inert stand-ins.
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: <T,>(component: T) => component,
  setUser: jest.fn(),
  captureException: jest.fn(),
  reactNavigationIntegration: () => ({ registerNavigationContainer: jest.fn() }),
  httpClientIntegration: () => ({ name: "HttpClient" }),
  feedbackIntegration: () => ({ name: "MobileFeedback" }),
  mobileReplayIntegration: () => ({ name: "MobileReplay" }),
  showFeedbackWidget: jest.fn(),
}));

afterEach(() => {
  cleanup();
});
