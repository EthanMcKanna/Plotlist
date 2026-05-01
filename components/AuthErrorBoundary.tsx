import { Component, type ReactNode } from "react";
import { router } from "expo-router";
import { LoadingScreen } from "./LoadingScreen";
import { clearAuthTokens } from "../lib/authStorage";

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

  async componentDidCatch(error: unknown) {
    if (isAuthError(error)) {
      this.setState({ isAuthError: true });
      await clearAuthTokens();
      router.replace("/sign-in");
    }
  }

  render() {
    if (this.state.hasError) {
      return this.state.isAuthError ? <LoadingScreen /> : null;
    }
    return this.props.children;
  }
}
