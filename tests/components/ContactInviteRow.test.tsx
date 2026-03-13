import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { ContactInviteRow } from "../../components/ContactInviteRow";

describe("ContactInviteRow", () => {
  it("allows reinviting contacts that were already invited", () => {
    const onInvite = jest.fn();

    render(
      <ContactInviteRow
        displayName="Ada Lovelace"
        invitedAt={Date.now()}
        onInvite={onInvite}
      />,
    );

    fireEvent.press(screen.getByText("Invite again"));

    expect(onInvite).toHaveBeenCalledTimes(1);
  });

  it("still blocks presses when explicitly disabled", () => {
    const onInvite = jest.fn();

    render(
      <ContactInviteRow
        displayName="Grace Hopper"
        invitedAt={Date.now()}
        onInvite={onInvite}
        disabled
      />,
    );

    fireEvent.press(screen.getByText("Invite again"));

    expect(onInvite).not.toHaveBeenCalled();
  });
});
