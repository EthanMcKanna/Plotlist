import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { TextField } from "../../components/TextField";

describe("TextField", () => {
  it("renders label, prefix, hint, and forwards text changes", () => {
    const onChangeText = jest.fn();

    render(
      <TextField
        label="Username"
        value="ethan"
        onChangeText={onChangeText}
        prefix="@"
        hint="Visible on your profile"
      />
    );

    fireEvent.changeText(screen.getByDisplayValue("ethan"), "showboxd");

    expect(screen.getByText("Username")).toBeTruthy();
    expect(screen.getByText("@")).toBeTruthy();
    expect(screen.getByText("Visible on your profile")).toBeTruthy();
    expect(onChangeText).toHaveBeenCalledWith("showboxd");
  });

  it("shows the validation error instead of the hint when both are provided", () => {
    render(
      <TextField
        label="Phone"
        value=""
        onChangeText={jest.fn()}
        hint="We use this to verify your account"
        error="Phone number is required"
      />
    );

    expect(screen.getByText("Phone number is required")).toBeTruthy();
    expect(
      screen.queryByText("We use this to verify your account")
    ).toBeNull();
  });
});
