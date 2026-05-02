import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Text } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockEnsureProfile = jest.fn<() => Promise<void>>();
const mockClearStoredSession = jest.fn<() => Promise<void>>();
const mockUseAuth = jest.fn();
const mockUsePathname = jest.fn();
const mockUseQuery = jest.fn();
const mockUseSegments = jest.fn();
const mockUseMutation = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
  useSegments: () => mockUseSegments(),
}));

jest.mock("../../lib/plotlist/react", () => ({
  useAuth: () => mockUseAuth(),
  useMutation: () => mockUseMutation(),
  useQuery: (...args: [unknown, unknown?]) => mockUseQuery(...args),
}));

jest.mock("../../lib/api/session", () => ({
  clearStoredSession: () => mockClearStoredSession(),
}));

import { AuthGate } from "../../components/AuthGate";

describe("AuthGate", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    mockReplace.mockReset();
    mockEnsureProfile.mockReset().mockResolvedValue(undefined);
    mockClearStoredSession.mockReset().mockResolvedValue(undefined);
    warnSpy.mockClear();
    mockUseMutation.mockReturnValue(mockEnsureProfile);
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });
    mockUseSegments.mockReturnValue(["(tabs)", "home"]);
    mockUsePathname.mockReturnValue("/home");
    mockUseQuery.mockReturnValue(undefined);
  });

  it("redirects signed-out iOS users away from protected routes", async () => {
    render(
      <AuthGate>
        <Text>Protected content</Text>
      </AuthGate>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/sign-in");
    });
    expect(screen.queryByText("Protected content")).toBeTruthy();
  });

  it("sends authenticated users to their onboarding step", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockUseQuery.mockReturnValue({
      onboardingStep: "follow",
    });

    render(
      <AuthGate>
        <Text>Protected content</Text>
      </AuthGate>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/onboarding/follow");
    });
    expect(mockEnsureProfile).toHaveBeenCalledWith({});
  });

  it("does not fight the user while they advance inside onboarding", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockUseSegments.mockReturnValue(["onboarding", "follow"]);
    mockUsePathname.mockReturnValue("/onboarding/follow");
    mockUseQuery.mockReturnValue({
      onboardingStep: "profile",
    });

    render(
      <AuthGate>
        <Text>Protected content</Text>
      </AuthGate>
    );

    await waitFor(() => {
      expect(mockEnsureProfile).toHaveBeenCalledWith({});
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/onboarding/profile");
  });

  it("clears tokens and returns to sign-in when profile bootstrap reports auth failure", async () => {
    mockEnsureProfile.mockRejectedValue(new Error("Not authenticated"));
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockUseQuery.mockReturnValue({
      onboardingStep: "complete",
    });

    render(
      <AuthGate>
        <Text>Protected content</Text>
      </AuthGate>
    );

    await waitFor(() => {
      expect(mockClearStoredSession).toHaveBeenCalled();
    });
    expect(mockReplace).toHaveBeenCalledWith("/sign-in");
    expect(warnSpy).toHaveBeenCalledWith(
      "[AuthGate] Failed to ensure profile",
      expect.any(Error)
    );
  });

  it("preserves the session when profile bootstrap fails with a transient error", async () => {
    mockEnsureProfile.mockRejectedValue(new Error("Network request failed"));
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockUseQuery.mockReturnValue({
      onboardingStep: "complete",
    });

    render(
      <AuthGate>
        <Text>Protected content</Text>
      </AuthGate>
    );

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        "[AuthGate] Failed to ensure profile",
        expect.any(Error)
      );
    });
    expect(mockClearStoredSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/sign-in");
  });

  it("shows a loading state until auth resolution completes", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    render(
      <AuthGate>
        <Text>Protected content</Text>
      </AuthGate>
    );

    expect(screen.queryByText("Protected content")).toBeNull();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });
});
