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
const mockClearAuthTokens = jest.fn<() => Promise<void>>();
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

jest.mock("../../lib/authStorage", () => ({
  clearAuthTokens: () => mockClearAuthTokens(),
}));

import { AuthGate } from "../../components/AuthGate";

describe("AuthGate", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    mockReplace.mockReset();
    mockEnsureProfile.mockReset().mockResolvedValue(undefined);
    mockClearAuthTokens.mockReset().mockResolvedValue(undefined);
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
      expect(mockReplace).toHaveBeenCalledWith("/follow");
    });
    expect(mockEnsureProfile).toHaveBeenCalledWith({});
  });

  it("clears tokens and returns to sign-in when profile bootstrap fails", async () => {
    mockEnsureProfile.mockRejectedValue(new Error("boom"));
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
      expect(mockClearAuthTokens).toHaveBeenCalled();
    });
    expect(mockReplace).toHaveBeenCalledWith("/sign-in");
    expect(warnSpy).toHaveBeenCalledWith(
      "[AuthGate] Failed to ensure profile",
      expect.any(Error)
    );
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
