import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  PrimaryButton,
  getPrimaryButtonSurfaceShadowStyle,
} from "../../components/PrimaryButton";

const Haptics = jest.requireMock("expo-haptics") as {
  impactAsync: jest.Mock;
  ImpactFeedbackStyle: { Light: string };
};

describe("PrimaryButton", () => {
  it("fires haptics and the action when pressed", () => {
    const onPress = jest.fn();

    render(<PrimaryButton label="Save" onPress={onPress} />);

    fireEvent.press(screen.getByText("Save"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light
    );
  });

  it("blocks presses when disabled or loading", () => {
    const onPress = jest.fn();

    const { rerender } = render(
      <PrimaryButton label="Save" onPress={onPress} disabled />
    );

    fireEvent.press(screen.getByText("Save"));

    rerender(<PrimaryButton label="Save" onPress={onPress} loading />);
    fireEvent.press(screen.getByText("Save"));

    expect(onPress).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it("uses boxShadow on web so homepage QA stays free of shadow prop warnings", () => {
    const webStyle = getPrimaryButtonSurfaceShadowStyle("web");
    const nativeStyle = getPrimaryButtonSurfaceShadowStyle("ios");

    expect((webStyle as Record<string, unknown>).boxShadow).toBe(
      "0 0 14px rgba(56,189,248,0.20)",
    );
    expect((webStyle as Record<string, unknown>).shadowColor).toBeUndefined();
    expect((nativeStyle as Record<string, unknown>).shadowColor).toBe("#38BDF8");
  });
});
