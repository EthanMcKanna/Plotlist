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
