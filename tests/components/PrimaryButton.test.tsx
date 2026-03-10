import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { PrimaryButton } from "../../components/PrimaryButton";

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
});
