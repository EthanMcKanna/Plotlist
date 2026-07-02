import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import {
  getHomeSectionHeaderAccessibilityLabel,
  getHomeSectionHeaderActionAccessibilityLabel,
  HomeSectionHeader,
} from "../../components/HomeSectionHeader";

describe("HomeSectionHeader", () => {
  it("keeps section context in accessibility while rendering title-only chrome", () => {
    render(
      <HomeSectionHeader
        index={2}
        kicker="Curated"
        title="Today's edit"
        subtitle="Premieres and quick starts in one tight pass."
        accent="#FDE68A"
        icon="albums"
      />,
    );

    expect(screen.queryByText("02")).toBeNull();
    expect(screen.queryByText("Curated")).toBeNull();
    expect(screen.getByText("Today's edit").props.className).toContain(
      "text-[17px] font-bold leading-[22px]",
    );
    expect(
      screen.getByLabelText(
        "Section 02. Curated. Today's edit. Premieres and quick starts in one tight pass.",
      ),
    ).toBeTruthy();
  });

  it("announces the visible title as a section heading with useful context", () => {
    const originalOS = Platform.OS;

    try {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: "web",
      });

      render(
        <HomeSectionHeader
          index={3}
          kicker="Curated"
          title="Tonight's edit"
          subtitle="The shows worth opening first."
          accent="#FDE68A"
        />,
      );

      const heading = screen.getByLabelText(
        "Section 03. Curated. Tonight's edit. The shows worth opening first.",
      );

      expect(heading.props.accessibilityRole).toBe("header");
      expect(heading.props["aria-level"]).toBe(2);
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalOS,
      });
    }
  });

  it("can render a short title while announcing the fuller section name", () => {
    render(
      <HomeSectionHeader
        index={1}
        kicker="Resume"
        title="Continue"
        accessibilityTitle="Continue watching"
        accent="#0EA5E9"
      />,
    );

    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.queryByText("Continue watching")).toBeNull();
    expect(
      screen.getByLabelText("Section 01. Resume. Continue watching"),
    ).toBeTruthy();
  });

  it("keeps the header action tappable in the compact header", () => {
    const onAction = jest.fn();

    render(
      <HomeSectionHeader
        index={8}
        kicker="Streaming"
        title="Streaming rooms"
        accent="#F97316"
        actionLabel="All rooms"
        onAction={onAction}
      />,
    );

    fireEvent.press(
      screen.getByLabelText("Open All rooms from Streaming rooms"),
    );

    expect(screen.queryByText("08")).toBeNull();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the header action at a mobile-safe hit target", () => {
    render(
      <HomeSectionHeader
        kicker="Schedule"
        title="On your schedule"
        accent="#38BDF8"
        actionLabel="Calendar"
        onAction={jest.fn()}
      />,
    );

    const action = screen.getByLabelText("Open Calendar from On your schedule");
    const style = StyleSheet.flatten(action.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  });

  it("can keep a section action icon-only without losing its label", () => {
    const onAction = jest.fn();

    render(
      <HomeSectionHeader
        kicker="Releases"
        title="Schedule"
        accent="#38BDF8"
        actionLabel="Calendar"
        actionIcon="calendar-outline"
        actionLabelVisible={false}
        onAction={onAction}
      />,
    );

    const action = screen.getByLabelText("Open Calendar from Schedule");
    const style = StyleSheet.flatten(action.props.style);

    expect(screen.queryByText("Calendar")).toBeNull();
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();

    fireEvent.press(action);

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("builds self-describing action labels for assistive technology", () => {
    expect(
      getHomeSectionHeaderAccessibilityLabel({
        index: 3,
        kicker: "Curated",
        title: "Tonight's edit",
        subtitle: "The shows worth opening first.",
      }),
    ).toBe("Section 03. Curated. Tonight's edit. The shows worth opening first.");

    expect(
      getHomeSectionHeaderAccessibilityLabel({
        kicker: "Streaming",
        title: "Streaming rooms",
      }),
    ).toBe("Streaming. Streaming rooms");

    expect(
      getHomeSectionHeaderActionAccessibilityLabel(
        "Calendar",
        "On your schedule",
      ),
    ).toBe("Open Calendar from On your schedule");

    expect(
      getHomeSectionHeaderActionAccessibilityLabel(
        "Open calendar",
        "On your schedule",
      ),
    ).toBe("Open calendar from On your schedule");
  });
});
