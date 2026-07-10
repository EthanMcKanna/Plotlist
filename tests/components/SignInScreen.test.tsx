import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

const mockStartVerification = jest.fn();
const mockSignIn = jest.fn();
const mockSignInWithApple = jest.fn();

jest.mock("../../lib/appleAuth", () => ({
  isAppleSignInAvailable: () => Promise.resolve(true),
  signInWithApple: () => mockSignInWithApple(),
  getAppleButtonComponent: () => {
    const { Pressable } = require("react-native");
    return Pressable;
  },
  getAppleButtonProps: () => ({ buttonType: 0, buttonStyle: 0 }),
}));

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
  it("offers Apple as the primary sign-in with a phone fallback link", async () => {
    render(<SignInScreen />);

    expect(
      await screen.findByLabelText("Sign in with phone number instead"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Phone number")).toBeNull();
  });

  it("labels the phone field reached from the fallback link", async () => {
    render(<SignInScreen />);

    fireEvent.press(
      await screen.findByLabelText("Sign in with phone number instead"),
    );

    expect(screen.getByLabelText("Phone number")).toBeTruthy();
    expect(screen.getByLabelText("Continue with phone number")).toBeTruthy();
    expect(screen.getByLabelText("Sign in with Apple instead")).toBeTruthy();
  });

  it("offers retry and phone fallback when Apple does not complete the request", async () => {
    mockSignInWithApple.mockResolvedValueOnce(null as never);
    render(<SignInScreen />);

    fireEvent.press(await screen.findByLabelText("Sign in with Apple"));

    expect(
      await screen.findByText(
        "Apple sign-in didn’t complete. You can try again or use your phone number instead.",
      ),
    ).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Sign in with phone number instead")).toBeTruthy();
  });
});
