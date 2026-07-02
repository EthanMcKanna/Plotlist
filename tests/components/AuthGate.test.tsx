import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Platform, Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
const mockEnsureProfile = jest.fn<() => Promise<void>>();
const mockClearStoredSession = jest.fn<() => Promise<void>>();
const mockUseAuth = jest.fn();
const mockUsePathname = jest.fn();
const mockUseGlobalSearchParams = jest.fn();
const mockUseQuery = jest.fn();
const mockUseSegments = jest.fn();
const mockUseMutation = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockUsePathname(),
  useGlobalSearchParams: () => mockUseGlobalSearchParams(),
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

async function flushProfileBootstrap() {
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  });
}

function renderAuthGate() {
  render(
    <AuthGate>
      <Text>Protected content</Text>
    </AuthGate>
  );
}

function setPlatformOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: os,
  });
}

describe("AuthGate", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  beforeEach(() => {
    setPlatformOS("ios");
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
    mockUseGlobalSearchParams.mockReturnValue({});
    mockUseQuery.mockReturnValue(undefined);
  });

  it("redirects signed-out iOS users away from protected routes", async () => {
    renderAuthGate();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/sign-in");
    });
    expect(screen.queryByText("Protected content")).toBeTruthy();
  });

  it("allows the signed-out web dev homepage preview route", async () => {
    setPlatformOS("web");
    mockUseSegments.mockReturnValue(["dev", "home-preview"]);
    mockUsePathname.mockReturnValue("/dev/home-preview");

    renderAuthGate();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("Protected content")).toBeTruthy();
  });

  it("allows the signed-out web home preview query route", async () => {
    setPlatformOS("web");
    mockUseSegments.mockReturnValue(["(tabs)", "home"]);
    mockUsePathname.mockReturnValue("/home");
    mockUseGlobalSearchParams.mockReturnValue({ preview: "1" });

    renderAuthGate();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockReplace).not.toHaveBeenCalled();
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

    renderAuthGate();
    await flushProfileBootstrap();

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

    renderAuthGate();
    await flushProfileBootstrap();

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

    renderAuthGate();
    await flushProfileBootstrap();

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

    renderAuthGate();
    await flushProfileBootstrap();

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        "[AuthGate] Failed to ensure profile",
        expect.any(Error)
      );
    });
    expect(mockClearStoredSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith("/sign-in");
  });

  it("shows a loading state until auth resolution completes", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    renderAuthGate();

    expect(screen.queryByText("Protected content")).toBeNull();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });
});
