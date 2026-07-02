import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

const mockStartVerification = jest.fn();
const mockSignIn = jest.fn();

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

jest.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => ({
      minDistance() {
        return this;
      },
      onEnd() {
        return this;
      },
      onStart() {
        return this;
      },
      onUpdate() {
        return this;
      },
    }),
  },
  GestureDetector: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

const transitionChain = {
  delay: () => transitionChain,
  duration: () => transitionChain,
  springify: () => transitionChain,
};

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: (() => {
    const { Text, View } = require("react-native");
    return { Text, View };
  })(),
  Easing: {
    linear: "linear",
  },
  Extrapolation: {
    CLAMP: "clamp",
  },
  FadeIn: transitionChain,
  FadeInDown: transitionChain,
  FadeInUp: transitionChain,
  FadeOutLeft: transitionChain,
  SlideInRight: transitionChain,
  interpolate: () => 0,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }),
  withRepeat: (value: unknown) => value,
  withSequence: (...values: unknown[]) => values.at(-1),
  withSpring: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../../lib/plotlist/api", () => ({
  api: {
    phone: {
      startVerification: { __name: "phone:startVerification" },
    },
  },
}));

jest.mock("../../lib/plotlist/react", () => ({
  useAction: () => mockStartVerification,
  useAuth: () => ({
    isAuthenticated: false,
  }),
}));

jest.mock("../../lib/plotlist/auth", () => ({
  useAuthActions: () => ({
    signIn: mockSignIn,
  }),
}));

import SignInScreen from "../../app/(auth)/sign-in";

describe("SignInScreen", () => {
  it("labels the phone field reached from the protected home redirect", () => {
    render(<SignInScreen />);

    expect(screen.getByLabelText("Phone number")).toBeTruthy();
    expect(screen.getByLabelText("Continue with phone number")).toBeTruthy();
  });
});
