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

afterEach(() => {
  cleanup();
});
