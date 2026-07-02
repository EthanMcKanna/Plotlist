import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  ContactsSyncCard,
  getContactsSyncCardEffectiveWidth,
  shouldInlineContactsSyncActions,
} from "../../components/ContactsSyncCard";

describe("ContactsSyncCard", () => {
  it("keeps the compact home prompt actionable and dismissible", () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();

    render(
      <ContactsSyncCard
        title="Find friends from your contacts"
        description="See who you already know here."
        buttonLabel="Sync contacts"
        meta="Private by design"
        variant="compact"
        onPress={onPress}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("Private by design")).toBeTruthy();
    expect(
      screen.getByText("Find friends from your contacts").props.numberOfLines,
    ).toBe(2);

    fireEvent.press(screen.getByText("Sync contacts"));
    fireEvent.press(screen.getByLabelText("Dismiss contacts prompt"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stacks compact actions on phone-width home cards", () => {
    expect(shouldInlineContactsSyncActions("compact", 390)).toBe(false);
    expect(shouldInlineContactsSyncActions("compact", 719)).toBe(false);
    expect(shouldInlineContactsSyncActions("compact", 720)).toBe(true);
    expect(shouldInlineContactsSyncActions("default", 900)).toBe(false);
  });

  it("uses the rendered card width before switching compact actions inline", () => {
    const centeredWebShellWidth = getContactsSyncCardEffectiveWidth(380, 1280);
    const unmeasuredWidth = getContactsSyncCardEffectiveWidth(null, 1280);

    expect(centeredWebShellWidth).toBe(380);
    expect(shouldInlineContactsSyncActions("compact", centeredWebShellWidth)).toBe(false);
    expect(unmeasuredWidth).toBe(1280);
    expect(shouldInlineContactsSyncActions("compact", unmeasuredWidth)).toBe(true);
  });
});
