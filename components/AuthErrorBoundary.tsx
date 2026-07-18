import { Component, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { LoadingScreen } from "./LoadingScreen";
import { clearStoredSession } from "../lib/api/session";
import { Sentry } from "../lib/sentry";

function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes("not authenticated");
  }
  return false;
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isAuthError: boolean;
}

export class AuthErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isAuthError: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  async componentDidCatch(
    error: unknown,
    info?: { componentStack?: string | null },
  ) {
    if (__DEV__ && info?.componentStack) {
      // Dev-only: component stacks are otherwise lost on web crashes.
      console.log(
        "[boundary-stack]",
        info.componentStack.split("\n").slice(0, 12).join(" | "),
      );
    }
    if (isAuthError(error)) {
      this.setState({ isAuthError: true });
      await clearStoredSession();
      router.replace("/sign-in");
      return;
    }
    Sentry.captureException(error);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isAuthError) return <LoadingScreen />;
      // On web a null render leaves a blank document with no way out, so
      // offer a reload; native keeps its existing behavior.
      if (Platform.OS === "web") {
        return (
          <View className="flex-1 items-center justify-center bg-dark-bg px-8">
            <Text className="text-[17px] font-bold text-text-primary">
              Something went wrong
            </Text>
            <Pressable
              onPress={() => window.location.reload()}
              accessibilityRole="button"
              accessibilityLabel="Reload the page"
              className="mt-5 rounded-full bg-brand-400 px-6 py-2.5 web:transition-opacity hover:opacity-90 active:opacity-80"
            >
              <Text className="text-[15px] font-bold text-text-inverse">
                Reload
              </Text>
            </Pressable>
          </View>
        );
      }
      return null;
    }
    return this.props.children;
  }
}
