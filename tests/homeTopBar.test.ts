import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { createElement } from "react";
import { StyleSheet } from "react-native";

jest.mock("expo-blur", () => ({
  BlurView: ({ children }: any) => {
    const { createElement: mockCreateElement } = require("react");
    const { View } = require("react-native");
    return mockCreateElement(View, null, children);
  },
}));

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
  },
  Link: ({ children }: { children?: unknown }) => children ?? null,
  useFocusEffect: () => undefined,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import {
  HOME_TOP_BAR_HEIGHT,
  HOME_TOP_BAR_SCROLL_GUARD_HEIGHT,
  HOME_TOP_BAR_TITLE_FADE_END,
  HOME_TOP_BAR_TITLE_FADE_START,
  getHomeTopBarFirstName,
  getHomeTopBarGreetingLine,
  getHomeTopBarNotificationsAccessibilityLabel,
  getHomeTopBarNotificationsBadgeLabel,
  getHomeTopBarTitleChromeState,
  HomeTopBar,
} from "../components/HomeTopBar";

import { router } from "expo-router";

import { resetNavigationLock } from "../lib/navigationLock";

describe("home top bar copy", () => {
  it("uses a real display name when one exists", () => {
    expect(
      getHomeTopBarGreetingLine(
        new Date("2026-05-28T16:00:00.000Z"),
        "Ethan McKanna",
      ),
    ).toBe("Good afternoon, Ethan");
  });

  it("does not pretend the app name is the viewer name", () => {
    expect(getHomeTopBarFirstName(null)).toBeNull();
    expect(getHomeTopBarFirstName("Plotlist")).toBeNull();
    expect(getHomeTopBarFirstName("Plotlist Test")).toBeNull();
    expect(getHomeTopBarGreetingLine(new Date("2026-05-28T16:00:00.000Z"), null)).toBe(
      "Good afternoon",
    );
    expect(
      getHomeTopBarGreetingLine(new Date("2026-05-28T16:00:00.000Z"), "Plotlist"),
    ).toBe("Good afternoon");
    expect(
      getHomeTopBarGreetingLine(new Date("2026-05-28T16:00:00.000Z"), "Plotlist Test"),
    ).toBe("Good afternoon");
  });

  it("labels the notifications button with the unread count", () => {
    expect(getHomeTopBarNotificationsAccessibilityLabel(0)).toBe("Notifications");
    expect(getHomeTopBarNotificationsAccessibilityLabel(1)).toBe(
      "Notifications, 1 unread",
    );
    expect(getHomeTopBarNotificationsAccessibilityLabel(3)).toBe(
      "Notifications, 3 unread",
    );
  });

  it("caps the unread badge and hides it when nothing is unread", () => {
    expect(getHomeTopBarNotificationsBadgeLabel(0)).toBeNull();
    expect(getHomeTopBarNotificationsBadgeLabel(7)).toBe("7");
    expect(getHomeTopBarNotificationsBadgeLabel(99)).toBe("99");
    expect(getHomeTopBarNotificationsBadgeLabel(120)).toBe("99+");
  });

  it("exposes stable handles for homepage Browser QA and top-chrome routing", () => {
    render(createElement(HomeTopBar, {
      scrollY: { value: 0 } as any,
      displayName: "Ethan McKanna",
      notificationCount: 2,
    }));

    expect(screen.UNSAFE_getByProps({ testID: "home-topbar" })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ testID: "home-topbar-profile" })).toBeTruthy();
    // Search moved to the tab bar; the header carries one quiet action.
    expect(screen.UNSAFE_queryByProps({ testID: "home-topbar-search" })).toBeNull();
    expect(screen.UNSAFE_getByProps({ testID: "home-topbar-notifications" })).toBeTruthy();
    const title = screen.UNSAFE_getByProps({ testID: "home-topbar-title" });
    expect(title.props.accessibilityElementsHidden).toBe(true);
    expect(title.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(screen.queryByText("Plotlist")).toBeNull();
    expect(screen.queryByText(/Ethan/)).toBeNull();
    expect(
      screen.getByLabelText("Notifications, 2 unread"),
    ).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();

    // Presses route through guardedPush now, so release the shared
    // navigation lock around each one (see TonightStrip.test.tsx). Target
    // the host element — the LinkPressable composite's own onPress prop is
    // only the haptic side effect.
    resetNavigationLock();
    fireEvent.press(screen.getByTestId("home-topbar-notifications"));
    resetNavigationLock();
    fireEvent.press(screen.getByTestId("home-topbar-profile"));

    expect(router.push).toHaveBeenCalledWith("/notifications");
    expect(router.push).toHaveBeenCalledWith("/profile");
  });

  it("keeps top chrome actions large enough for touch QA", () => {
    render(createElement(HomeTopBar, {
      scrollY: { value: 0 } as any,
      displayName: "Ethan McKanna",
      notificationCount: 2,
    }));

    [
      "home-topbar-profile",
      "home-topbar-notifications",
    ].forEach((testID) => {
      const action = screen.UNSAFE_getByProps({ testID });
      const style = StyleSheet.flatten(action.props.style);

      expect(style.height).toBeGreaterThanOrEqual(44);
      expect(style.width).toBeGreaterThanOrEqual(44);
    });
  });

  it("extends the scrolled scrim below the action row", () => {
    render(createElement(HomeTopBar, {
      scrollY: { value: 96 } as any,
      displayName: "Ethan McKanna",
      notificationCount: 2,
    }));

    const topBar = screen.UNSAFE_getByProps({ testID: "home-topbar" });
    const topBarStyle = StyleSheet.flatten(topBar.props.style);

    expect(topBarStyle.height).toBe(
      HOME_TOP_BAR_HEIGHT + HOME_TOP_BAR_SCROLL_GUARD_HEIGHT,
    );
    expect(
      screen.UNSAFE_getByProps({ testID: "home-topbar-scroll-scrim" }),
    ).toBeTruthy();
  });

  it("keeps the wordmark quiet until the hero starts scrolling away", () => {
    expect(getHomeTopBarTitleChromeState(0)).toEqual({
      opacity: 0,
      translateY: 3,
    });
    expect(getHomeTopBarTitleChromeState(HOME_TOP_BAR_TITLE_FADE_START)).toEqual({
      opacity: 0,
      translateY: 3,
    });
    expect(getHomeTopBarTitleChromeState(HOME_TOP_BAR_TITLE_FADE_END)).toEqual({
      opacity: 1,
      translateY: 0,
    });
  });
});
