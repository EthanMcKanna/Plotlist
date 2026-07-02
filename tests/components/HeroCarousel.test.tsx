import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

import {
  HERO_CTA_TOUCH_TARGET,
  HeroCarousel,
  buildHeroVisibleMeta,
  getHeroEyebrowDisplay,
  getHeroOpenAccessibilityLabel,
  getHeroReasonLabel,
  getHeroTitleAccessibilityLabel,
  shouldAutoRotateHero,
  type HeroSlide,
} from "../../components/HeroCarousel";

const slide: HeroSlide = {
  key: "star-city",
  title: "Star City",
  overview: "A lunar spy drama.",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/star-city.jpg",
  posterUrl: "https://image.tmdb.org/t/p/w500/star-city.jpg",
  year: 2026,
  genreIds: [10765],
  signal: "Apple TV+ May 29",
  eyebrow: "fresh",
};

describe("HeroCarousel", () => {
  it("normalizes contextual hero reasons without repeating title or overview", () => {
    expect(
      getHeroReasonLabel({
        ...slide,
        reason: " Matched from\n your taste profile. ",
      }),
    ).toBeNull();
    expect(getHeroReasonLabel({ ...slide, reason: "Taste match" })).toBeNull();
    expect(
      getHeroReasonLabel({
        ...slide,
        reason: "Great if you want a new space-race drama tonight.",
      }),
    ).toBe("Great if you want a new space-race drama tonight.");
    expect(getHeroReasonLabel({ ...slide, reason: "Star City" })).toBeNull();
    expect(getHeroReasonLabel({ ...slide, reason: slide.overview })).toBeNull();
  });

  it("carries provider and context into the hero open action label", () => {
    expect(
      getHeroOpenAccessibilityLabel({
        ...slide,
        reason: "JustWatch #7 today",
      }),
    ).toBe(
      "Open Star City. JustWatch #7 today. Sci-fi · Apple TV+ · May 29",
    );
  });

  it("lets specific hero signals stand alone visually", () => {
    expect(buildHeroVisibleMeta(slide)).toEqual(["Apple TV+ · May 29"]);
    expect(
      getHeroOpenAccessibilityLabel({
        ...slide,
        reason: "JustWatch #7 today",
      }),
    ).toBe(
      "Open Star City. JustWatch #7 today. Sci-fi · Apple TV+ · May 29",
    );
  });

  it("announces the active hero title as the lead homepage heading", () => {
    expect(getHeroTitleAccessibilityLabel(slide, "2026-05-29T12:00:00.000Z")).toBe(
      "Lead pick. Star City. New. Sci-fi · Apple TV+ · May 29",
    );
    expect(
      getHeroTitleAccessibilityLabel(slide, "2026-05-29T12:00:00.000Z", {
        index: 0,
        total: 5,
      }),
    ).toBe("Lead pick. 1 of 5. Star City. New. Sci-fi · Apple TV+ · May 29");

    render(
      <HeroCarousel
        slides={[
          slide,
          {
            ...slide,
            key: "spider-noir",
            title: "Spider-Noir",
            signal: "Prime May 27",
          },
        ]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
        now="2026-05-29T12:00:00.000Z"
      />,
    );

    const heading = screen.getByLabelText(
      "Lead pick. 1 of 2. Star City. New. Sci-fi · Apple TV+ · May 29",
    );

    expect(heading.props.accessibilityRole).toBe("header");
    expect(screen.queryByText("New")).toBeNull();
    expect(screen.getByText("Apple TV+ · May 29")).toBeTruthy();
    expect(screen.queryByText("Sci-fi")).toBeNull();
  });

  it("derives release-window labels from the supplied homepage timestamp", () => {
    expect(
      getHeroEyebrowDisplay(slide, "2026-05-29T12:00:00.000Z")?.label,
    ).toBe("New");
    expect(
      getHeroEyebrowDisplay(slide, "2026-06-20T12:00:00.000Z")?.label,
    ).toBe("New");
    expect(
      getHeroEyebrowDisplay(
        { ...slide, signal: "Apple TV+ Jun 4" },
        "2026-05-29T12:00:00.000Z",
      )?.label,
    ).toBe("This week");
    expect(
      getHeroEyebrowDisplay(
        { ...slide, signal: "Returns Jun 4" },
        "2026-05-29T12:00:00.000Z",
      )?.label,
    ).toBe("Returning");
    expect(
      getHeroEyebrowDisplay(
        { ...slide, signal: "S2 Jun 4" },
        "2026-05-29T12:00:00.000Z",
      )?.label,
    ).toBe("New season");
  });

  it("uses neutral personalized hero eyebrows instead of generic reason pills", () => {
    expect(
      getHeroEyebrowDisplay({ ...slide, eyebrow: "current" })?.label,
    ).toBe("Now");
    expect(
      getHeroEyebrowDisplay({ ...slide, eyebrow: "for-you" })?.label,
    ).toBe("For you");
  });

  it("keeps hero fallback art atmospheric instead of duplicating title context", () => {
    render(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
      />,
    );

    expect(screen.UNSAFE_getByProps({ testID: "hero-backdrop-fallback-star-city" })).toBeTruthy();
    expect(
      screen.UNSAFE_queryByProps({
        testID: "hero-backdrop-fallback-initials-star-city",
      }),
    ).toBeNull();
    expect(
      screen.UNSAFE_queryByProps({
        testID: "hero-backdrop-fallback-signal-star-city",
      }),
    ).toBeNull();
    expect(screen.getByText("Star City")).toBeTruthy();
  });

  it("keeps the empty hero fallback terse while content loads", () => {
    render(
      <HeroCarousel
        slides={[]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
      />,
    );

    expect(screen.getByText("Loading picks.")).toBeTruthy();
    expect(screen.queryByText("Loading the lead pick of the night.")).toBeNull();
  });

  it("respects reduced-motion preferences instead of auto-rotating the lead hero", () => {
    expect(
      shouldAutoRotateHero({
        autoPaused: false,
        reduceMotionEnabled: false,
        slideCount: 2,
      }),
    ).toBe(true);
    expect(
      shouldAutoRotateHero({
        autoPaused: false,
        reduceMotionEnabled: true,
        slideCount: 2,
      }),
    ).toBe(false);

    jest.useFakeTimers();
    render(
      <HeroCarousel
        slides={[
          slide,
          {
            ...slide,
            key: "spider-noir",
            title: "Spider-Noir",
            signal: "Prime May 27",
          },
        ]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
        reduceMotionEnabled
      />,
    );

    expect(screen.getByText("Star City")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(screen.queryByText("Spider-Noir")).toBeNull();
    jest.useRealTimers();
  });

  it("keeps generic personalized reasons out of the hero card and open action", () => {
    const onPressSlide = jest.fn();
    const personalizedSlide = {
      ...slide,
      reason: "Matched from your taste profile.",
      eyebrow: "for-you" as const,
    };

    render(
      <HeroCarousel
        slides={[personalizedSlide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={onPressSlide}
      />,
    );

    expect(screen.queryByTestId("hero-reason-star-city")).toBeNull();
    expect(screen.queryByText("A lunar spy drama.")).toBeNull();
    fireEvent.press(
      screen.getByLabelText(
        "Open Star City. Sci-fi · Apple TV+ · May 29",
      ),
    );
    expect(onPressSlide).toHaveBeenCalledWith(personalizedSlide);
  });

  it("keeps decorative hero backdrop press targets out of the keyboard order", () => {
    render(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
      />,
    );

    const backdropPressable = screen.UNSAFE_getByProps({
      testID: "hero-backdrop-pressable-star-city",
    });

    expect(backdropPressable.props.accessible).toBe(false);
    expect(backdropPressable.props.focusable).toBe(false);
    expect(backdropPressable.props.tabIndex).toBe(-1);
    expect(backdropPressable.props.importantForAccessibility).toBe(
      "no-hide-descendants",
    );
  });

  it("keeps the fallback only until hero artwork loads", () => {
    render(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
      />,
    );

    expect(screen.UNSAFE_getByProps({ testID: "hero-backdrop-image-star-city" })).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ testID: "hero-backdrop-fallback-star-city" })).toBeTruthy();

    fireEvent(screen.UNSAFE_getByProps({ testID: "hero-backdrop-image-star-city" }), "load");

    expect(screen.UNSAFE_queryByProps({ testID: "hero-backdrop-fallback-star-city" })).toBeNull();
  });

  it("keeps an intentional hero fallback when backdrop artwork fails", () => {
    render(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
      />,
    );

    expect(screen.UNSAFE_getByProps({ testID: "hero-backdrop-image-star-city" })).toBeTruthy();

    fireEvent(screen.UNSAFE_getByProps({ testID: "hero-backdrop-image-star-city" }), "error", {
      nativeEvent: { error: "failed" },
    });

    expect(screen.UNSAFE_getByProps({ testID: "hero-backdrop-fallback-star-city" })).toBeTruthy();
    expect(
      screen.UNSAFE_queryByProps({
        testID: "hero-backdrop-fallback-initials-star-city",
      }),
    ).toBeNull();
    expect(screen.UNSAFE_queryByProps({ testID: "hero-backdrop-image-star-city" })).toBeNull();
  });

  it("shows save progress and a settled saved state in place", () => {
    const onSave = jest.fn();
    const { rerender } = render(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
        onSavePress={onSave}
      />,
    );

    fireEvent.press(screen.getByLabelText("Save Star City to watchlist"));
    expect(onSave).toHaveBeenCalledWith(slide);

    rerender(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
        onSavePress={onSave}
        saveStateByKey={{ "star-city": "saving" }}
      />,
    );
    expect(screen.getByLabelText("Saving Star City to watchlist")).toBeTruthy();
    expect(screen.queryByText("Saving")).toBeNull();

    rerender(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
        onSavePress={onSave}
        saveStateByKey={{ "star-city": "saved" }}
      />,
    );
    expect(screen.getByLabelText("Star City saved to watchlist")).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("keeps first-viewport hero actions icon-only and mobile-safe", () => {
    render(
      <HeroCarousel
        slides={[slide]}
        scrollY={{ value: 0 } as any}
        topInset={0}
        onPressSlide={jest.fn()}
        onSavePress={jest.fn()}
      />,
    );

    const open = screen.getByLabelText(
      "Open Star City. Sci-fi · Apple TV+ · May 29",
    );
    const save = screen.getByLabelText("Save Star City to watchlist");

    expect(screen.queryByText("Open")).toBeNull();
    expect(screen.queryByText("Details")).toBeNull();
    expect(screen.queryByText("Save")).toBeNull();

    [open, save].forEach((control) => {
      const style = StyleSheet.flatten(control.props.style);

      expect(style.minHeight).toBeGreaterThanOrEqual(HERO_CTA_TOUCH_TARGET);
      expect(style.minWidth).toBeGreaterThanOrEqual(HERO_CTA_TOUCH_TARGET);
    });

    expect(StyleSheet.flatten(save.props.style).width).toBe(HERO_CTA_TOUCH_TARGET);
    expect(StyleSheet.flatten(open.props.style).width).toBe(HERO_CTA_TOUCH_TARGET);
  });
});
