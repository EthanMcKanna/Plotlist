import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ContactInviteRow } from "../../components/ContactInviteRow";
import { INVITE_RESEND_COOLDOWN_MS } from "../../lib/invite";

describe("ContactInviteRow", () => {
  it("allows reinviting contacts that were already invited", () => {
    const onInvite = jest.fn();
    const oldInviteAt = Date.now() - INVITE_RESEND_COOLDOWN_MS - 1_000;

    render(
      <ContactInviteRow
        displayName="Ada Lovelace"
        invitedAt={oldInviteAt}
        onInvite={onInvite}
      />,
    );

    fireEvent.press(screen.getByText("Invite again"));

    expect(onInvite).toHaveBeenCalledTimes(1);
  });

  it("cools down recent invite attempts", () => {
    const onInvite = jest.fn();

    render(
      <ContactInviteRow
        displayName="Katherine Johnson"
        invitedAt={Date.now()}
        onInvite={onInvite}
      />,
    );

    fireEvent.press(screen.getByText("Invited"));

    expect(screen.getByText("Recently invited")).toBeTruthy();
    expect(onInvite).not.toHaveBeenCalled();
  });

  it("still blocks presses when explicitly disabled", () => {
    const onInvite = jest.fn();
    const oldInviteAt = Date.now() - INVITE_RESEND_COOLDOWN_MS - 1_000;

    render(
      <ContactInviteRow
        displayName="Grace Hopper"
        invitedAt={oldInviteAt}
        onInvite={onInvite}
        disabled
      />,
    );

    fireEvent.press(screen.getByText("Invite again"));

    expect(onInvite).not.toHaveBeenCalled();
  });
});
