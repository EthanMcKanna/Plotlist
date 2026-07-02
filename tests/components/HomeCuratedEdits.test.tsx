import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

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
  auditHomeCuratedEdits,
  buildHomeCuratedEdits,
  getHomeCuratedEditCardMetrics,
  getHomeCuratedEditComposition,
  getHomeCuratedEditLeadPreviewKeys,
  getHomeCuratedEditPreviewKeys,
} from "../../lib/homeCuratedEdits";
import {
  HomeCuratedEdits,
  getHomeCuratedEditAccessibilityLabel,
} from "../../components/HomeCuratedEdits";
import type { SignatureRailItem } from "../../components/SignatureRail";

function item(key: string, overrides: Partial<SignatureRailItem> = {}): SignatureRailItem {
  return {
    key,
    title: key,
    posterUrl: "poster.jpg",
    genreLabel: "Drama",
    year: 2026,
    ...overrides,
  };
}

const CURATED_TEST_NOW = "2026-05-30T12:00:00.000Z";

describe("buildHomeCuratedEdits", () => {
  it("builds distinct editorial shelves from live homepage rails", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("Deli Boys", { signal: "S2 May 28" }),
        item("Deli Boys duplicate", { title: "Deli Boys", signal: "S2 May 28" }),
        item("A Good Girl's Guide to Murder", { signal: "S2 May 27" }),
        item("Dutton Ranch", { signal: "Paramount+ May 15" }),
        item("Nemesis", { signal: "Chart mover" }),
      ],
      fresh: [
        item("Fresh One", { signal: "S2 May 28" }),
        item("Fresh Two", { signal: "Netflix May 4" }),
        item("Fresh Three", { signal: "Apple TV+ May 29" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: CURATED_TEST_NOW,
    });

    expect(edits.map((edit) => edit.key)).toEqual([
      "conversation",
      "fresh-week",
      "prestige",
      "short",
    ]);
    expect(edits[0].items.map((entry) => entry.title)).toEqual([
      "Deli Boys",
      "A Good Girl's Guide to Murder",
      "Nemesis",
      "Dutton Ranch",
    ]);
    expect(getHomeCuratedEditComposition(edits)).toMatchObject({
      editCount: 4,
      leadTitleCount: 4,
      repeatedTitleCount: 0,
      underfilledEditKeys: [],
    });
  });

  it("protects the fresh-week edit before filling the conversation shelf", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("Dutton Ranch", { signal: "Paramount+ May 15" }),
        item("A Good Girl's Guide to Murder", { signal: "S2 May 27" }),
        item("Nemesis", { signal: "Chart mover" }),
        item("The Four Seasons", { signal: "S2 May 28" }),
        item("Deli Boys", { signal: "S2 May 28" }),
        item("Star City", { signal: "Apple TV+ May 29" }),
        item("Legends", { signal: "Netflix May 7" }),
      ],
      fresh: [
        item("Dutton Ranch", { signal: "Paramount+ May 15" }),
        item("A Good Girl's Guide to Murder", { signal: "S2 May 27" }),
        item("Nemesis", { signal: "Chart mover" }),
        item("Lord of the Flies", { signal: "Netflix May 4" }),
        item("Legends", { signal: "Netflix May 7" }),
        item("Star City", { signal: "Apple TV+ May 29" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: CURATED_TEST_NOW,
    });

    expect(edits.find((edit) => edit.key === "conversation")?.items[0].title).toBe(
      "The Four Seasons",
    );
    expect(edits.find((edit) => edit.key === "fresh-week")?.items[0].title).toBe(
      "Star City",
    );
    const conversationAndFreshTitles = edits
      .filter((edit) => edit.key === "conversation" || edit.key === "fresh-week")
      .flatMap((edit) => edit.items.map((entry) => entry.title));
    expect(conversationAndFreshTitles.filter((title) => title === "Dutton Ranch")).toHaveLength(1);
    expect(getHomeCuratedEditComposition(edits).repeatedTitleCount).toBe(0);
  });

  it("leads the conversation shelf with explicit current context before year-only heat", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("Generic 2026 One", { year: 2026, signal: null }),
        item("Generic 2026 Two", { year: 2026, signal: null }),
        item("Airing Now", { year: 2021, signal: "S4 airing now" }),
        item("Returns Tomorrow", { year: 2022, signal: "Returns May 29" }),
        item("Chart Mover", { year: 2025, signal: "Chart mover" }),
      ],
      fresh: [],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: CURATED_TEST_NOW,
    });

    expect(edits.find((edit) => edit.key === "conversation")?.items[0].title).toBe(
      "Airing Now",
    );
    expect(edits.find((edit) => edit.key === "conversation")?.items.map((entry) => entry.title))
      .toEqual(["Airing Now", "Returns Tomorrow", "Chart Mover", "Generic 2026 One"]);
  });

  it("keeps chart-only demand out of the fresh-week lead when release windows are available", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("Chart Mover", { year: 2026, signal: "Chart mover" }),
        item("Airing Now", { year: 2021, signal: "S4 airing now" }),
        item("Returns Tomorrow", { year: 2022, signal: "Returns May 29" }),
      ],
      fresh: [
        item("Chart Mover", { year: 2026, signal: "Chart mover" }),
        item("Netflix Return", { year: 2026, signal: "Netflix May 4" }),
        item("Season Return", { year: 2025, signal: "S2 May 28" }),
        item("Apple Launch", { year: 2026, signal: "Apple TV+ May 29" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: CURATED_TEST_NOW,
    });

    const freshWeek = edits.find((edit) => edit.key === "fresh-week");
    expect(freshWeek?.items[0].title).toBe("Apple Launch");
    expect(freshWeek?.items.map((entry) => entry.title)).not.toContain("Chart Mover");
  });

  it("promotes a recent quality title so the prestige edit stays current", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("The Boys", { year: 2019, signal: "S5 airing now" }),
        item("Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("The Four Seasons", { year: 2025, signal: "S2 May 28" }),
      ],
      fresh: [
        item("The Boys", { year: 2019, signal: "S5 airing now" }),
        item("Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("The Four Seasons", { year: 2025, signal: "S2 May 28" }),
      ],
      critics: [
        item("Severance", { year: 2022 }),
        item("Andor", { year: 2022 }),
        item("Slow Horses", { year: 2022 }),
        item("The Bear", { year: 2022 }),
        item("Adolescence", { year: 2025 }),
      ],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: "2026-05-30T12:00:00.000Z",
    });

    const prestige = edits.find((edit) => edit.key === "prestige");
    expect(prestige?.items[0].title).toBe("Adolescence");
    expect(prestige?.items.map((entry) => entry.title)).toContain("Severance");
  });

  it("leads the half-hour edit with a current compact pick before evergreen quick starts", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("The Boys", { year: 2019, signal: "S5 airing now" }),
        item("Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("The Four Seasons", { year: 2025, signal: "S2 May 28" }),
      ],
      fresh: [
        item("The Boys", { year: 2019, signal: "S5 airing now" }),
        item("Star City", { year: 2026, signal: "Apple TV+ May 29" }),
        item("The Four Seasons", { year: 2025, signal: "S2 May 28" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [
        item("Overcompensating", { year: 2025 }),
        item("The Rehearsal", { year: 2022 }),
        item("The Studio", { year: 2025 }),
        item("Hacks", { year: 2021, signal: "Finale May 28" }),
        item("Abbott Elementary", { year: 2021 }),
      ],
      now: "2026-05-30T12:00:00.000Z",
    });

    const short = edits.find((edit) => edit.key === "short");
    expect(short?.items).toHaveLength(3);
    expect(short?.items[0].title).toBe("Hacks");
    expect(short?.items[0].signal).toBe("Finale May 28");
    expect(short?.items.map((entry) => entry.title)).toContain("The Studio");
  });

  it("uses actual current-week release distance before stale dated launches", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("The Four Seasons", { signal: "S2 May 28" }),
        item("Deli Boys", { signal: "S2 May 28" }),
        item("Chart Mover", { signal: "Chart mover" }),
      ],
      fresh: [
        item("Legends", { signal: "Netflix May 7" }),
        item("Lord of the Flies", { signal: "Netflix May 4" }),
        item("Off Campus", { signal: "Prime May 13" }),
        item("A Good Girl's Guide to Murder", { signal: "S2 May 27" }),
        item("The Four Seasons", { signal: "S2 May 28" }),
        item("Star City", { signal: "Apple TV+ May 29" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: "2026-05-28T19:00:00.000Z",
    });

    const freshWeek = edits.find((edit) => edit.key === "fresh-week");

    expect(freshWeek?.items.map((entry) => entry.title)).toEqual([
      "The Four Seasons",
      "Star City",
      "A Good Girl's Guide to Murder",
    ]);
    expect(freshWeek?.items.map((entry) => entry.title)).not.toEqual(
      expect.arrayContaining(["Legends", "Lord of the Flies", "Off Campus"]),
    );
  });

  it("does not let old dated launches lead the conversation edit over live demand", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("Lord of the Flies", { signal: "Netflix May 4" }),
        item("Legends", { signal: "Netflix May 7" }),
        item("Airing Now", { signal: "S3 airing now" }),
        item("Chart Mover", { signal: "Chart mover" }),
        item("Evergreen Heat", { signal: null }),
      ],
      fresh: [
        item("A Good Girl's Guide to Murder", { signal: "S2 May 27" }),
        item("The Four Seasons", { signal: "S2 May 28" }),
        item("Star City", { signal: "Apple TV+ May 29" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: "2026-05-28T19:00:00.000Z",
    });

    expect(edits.find((edit) => edit.key === "conversation")?.items.map((entry) => entry.title))
      .toEqual(["Airing Now", "Chart Mover", "Evergreen Heat", "Lord of the Flies"]);
  });

  it("can reserve already-previewed shortlist titles before composing edits", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("rick", { title: "Rick and Morty", year: 2013, signal: "S9 airing now" }),
        item("deli", { title: "Deli Boys", year: 2025, signal: "S2 May 28" }),
        item("star", { title: "Star City", year: 2026, signal: "Apple TV+ May 29" }),
        item("legends", { title: "Legends", year: 2026, signal: "Netflix May 7" }),
      ],
      fresh: [
        item("lord", { title: "Lord of the Flies", year: 2026, signal: "Netflix May 4" }),
        item("four", { title: "The Four Seasons", year: 2025, signal: "S2 May 28" }),
        item("deli", { title: "Deli Boys", year: 2025, signal: "S2 May 28" }),
        item("star", { title: "Star City", year: 2026, signal: "Apple TV+ May 29" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      blockedKeys: ["title:rick and morty"],
      now: CURATED_TEST_NOW,
    });

    expect(edits.find((edit) => edit.key === "conversation")?.items[0].title).not.toBe(
      "Rick and Morty",
    );
  });

  it("keeps the hero title out of the curated edit leads when alternatives are strong enough", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("four", { title: "The Four Seasons", signal: "S2 May 28" }),
        item("deli", { title: "Deli Boys", signal: "S2 May 28" }),
        item("good", { title: "A Good Girl's Guide to Murder", signal: "S2 May 27" }),
        item("star", { title: "Star City", signal: "Apple TV+ May 29" }),
      ],
      fresh: [
        item("star", { title: "Star City", signal: "Apple TV+ May 29" }),
        item("four", { title: "The Four Seasons", signal: "S2 May 28" }),
        item("good", { title: "A Good Girl's Guide to Murder", signal: "S2 May 27" }),
        item("deli", { title: "Deli Boys", signal: "S2 May 28" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      blockedKeys: ["title:star city"],
      now: "2026-05-28T19:00:00.000Z",
    });

    const curatedTitles = edits.flatMap((edit) => edit.items.map((entry) => entry.title));
    const leadTitles = edits.map((edit) => edit.items[0]?.title);
    expect(curatedTitles).not.toContain("Star City");
    expect(leadTitles).not.toContain("Star City");
    expect(edits.find((edit) => edit.key === "fresh-week")?.items[0].title).toBe(
      "The Four Seasons",
    );
  });

  it("exposes every visible curated title for downstream rail de-duping", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("deli", { title: "Deli Boys", signal: "S2 May 28" }),
        item("star", { title: "Star City", signal: "Apple TV+ May 29" }),
        item("legends", { title: "Legends", signal: "Netflix May 7" }),
      ],
      fresh: [
        item("lord", { title: "Lord of the Flies", signal: "Netflix May 4" }),
        item("four", { title: "The Four Seasons", signal: "S2 May 28" }),
        item("apple", { title: "Apple Launch", signal: "Apple TV+ May 29" }),
      ],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: CURATED_TEST_NOW,
    });

    const keys = getHomeCuratedEditPreviewKeys(edits);

    expect(keys.has("deli")).toBe(true);
    expect(keys.has("title:deli boys")).toBe(true);
    expect(keys.has("lord")).toBe(true);
    expect(keys.has("title:lord of the flies")).toBe(true);
    expect(keys.has("star")).toBe(true);
    expect(keys.has("title:star city")).toBe(true);
    expect(keys.has("apple")).toBe(true);
    expect(keys.has("title:apple launch")).toBe(true);

    const leadKeys = getHomeCuratedEditLeadPreviewKeys(edits);
    expect(leadKeys.has("star")).toBe(true);
    expect(leadKeys.has("title:star city")).toBe(true);
    expect(leadKeys.has("deli")).toBe(false);
    expect(leadKeys.has("title:deli boys")).toBe(false);
  });

  it("audits curated shelves as a production-quality homepage composition", () => {
    const edits = buildHomeCuratedEdits({
      heat: [item("Heat One"), item("Heat Two"), item("Heat Three")],
      fresh: [item("Fresh One", { signal: "New" }), item("Fresh Two"), item("Fresh Three")],
      critics: [item("The Pitt"), item("Andor"), item("Slow Horses")],
      quick: [item("Hacks"), item("The Studio"), item("Abbott Elementary")],
      now: CURATED_TEST_NOW,
    });

    expect(auditHomeCuratedEdits(edits, 123)).toMatchObject({
      healthy: true,
      checkedAt: 123,
      composition: {
        editCount: 4,
        leadTitleCount: 4,
        repeatedTitleCount: 0,
        underfilledEditKeys: [],
      },
      findings: [],
    });
  });

  it("fails the curated edit audit for thin or repetitive compositions", () => {
    const report = auditHomeCuratedEdits(
      [
        {
          key: "thin",
          kicker: "Thin",
          title: "Thin edit",
          subtitle: "Not enough to trust.",
          accent: "#F59E0B",
          icon: "flame",
          items: [item("The Same Show"), item("The Same Show 2", { title: "The Same Show" })],
        },
        {
          key: "repeat-lead",
          kicker: "Repeat",
          title: "Repeat lead",
          subtitle: "Repeats the lead.",
          accent: "#38BDF8",
          icon: "radio",
          items: [item("The Same Show"), item("Fresh Two"), item("Fresh Three")],
        },
      ],
      456,
    );

    expect(report.healthy).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "too_few_edits" }),
        expect.objectContaining({ issue: "repeated_titles" }),
        expect.objectContaining({ issue: "duplicate_leads" }),
        expect.objectContaining({ issue: "underfilled_edit", editKey: "thin" }),
      ]),
    );
  });
});

describe("HomeCuratedEdits", () => {
  it("uses compact card metrics on phone-sized screens", () => {
    expect(getHomeCuratedEditCardMetrics(390)).toEqual({
      cardWidth: 326,
      compact: true,
    });
    expect(getHomeCuratedEditCardMetrics(760)).toEqual({
      cardWidth: 342,
      compact: false,
    });
  });

  it("opens the lead item for the tapped editorial shelf", () => {
    const onPressItem = jest.fn();
    const edits = buildHomeCuratedEdits({
      heat: [
        item("Deli Boys", {
          signal: "S2 May 28",
          overview: "Two brothers inherit a dangerous family business.",
        }),
        item("A Good Girl's Guide to Murder", { signal: "S2 May 27" }),
        item("Dutton Ranch", { signal: "Paramount+ May 15" }),
      ],
      fresh: [],
      critics: [],
      quick: [],
    });

    render(
      <HomeCuratedEdits
        edits={edits}
        index={2}
        onPressItem={onPressItem}
      />,
    );

    expect(screen.queryByText("Trending")).toBeNull();
    expect(screen.queryByText("In conversation")).toBeNull();
    expect(screen.queryByText("arrow-forward")).toBeNull();
    expect(screen.getByTestId("curated-caption-Deli Boys")).toBeTruthy();
    expect(screen.getAllByText("Deli Boys")).toHaveLength(1);
    expect(screen.getAllByText("S2 · May 28")).toHaveLength(1);
    expect(screen.queryByText("Drama · S2 · May 28")).toBeNull();
    expect(getHomeCuratedEditAccessibilityLabel(edits[0])).toBe(
      "Open Deli Boys from Trending. Drama · S2 · May 28",
    );
    fireEvent.press(
      screen.getByLabelText(
        "Open Deli Boys from Trending. Drama · S2 · May 28",
      ),
    );
    expect(onPressItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Deli Boys" }),
    );
  });

  it("does not add generic filler when a curated card has no useful metadata", () => {
    render(
      <HomeCuratedEdits
        edits={[
          {
            key: "plain",
            title: "Plain",
            kicker: "Plain",
            subtitle: "Sparse test card.",
            accent: "#FDE68A",
            icon: "star",
            items: [
              {
                key: "Plain Show",
                title: "Plain Show",
                posterUrl: "poster.jpg",
              },
            ],
          },
        ]}
        index={2}
        onPressItem={jest.fn()}
      />,
    );

    expect(screen.getByTestId("curated-caption-Plain Show")).toBeTruthy();
    expect(screen.getByText("Plain Show")).toBeTruthy();
    expect(screen.queryByText("Recommended")).toBeNull();
  });

  it("keeps a designed poster fallback when curated artwork fails", () => {
    const edits = buildHomeCuratedEdits({
      heat: [
        item("Deli Boys", { signal: "S2 May 28" }),
        item("A Good Girl's Guide to Murder", { signal: "S2 May 27" }),
        item("Dutton Ranch", { signal: "Paramount+ May 15" }),
      ],
      fresh: [],
      critics: [],
      quick: [],
    });

    render(
      <HomeCuratedEdits
        edits={edits}
        index={2}
        onPressItem={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId("curated-poster-fallback-Deli Boys", {
        includeHiddenElements: true,
      }),
    ).toBeNull();

    fireEvent(screen.getByTestId("curated-poster-image-Deli Boys"), "error", {
      nativeEvent: { error: "failed" },
    });

    const fallback = screen.getByTestId("curated-poster-fallback-Deli Boys", {
      includeHiddenElements: true,
    });
    expect(fallback).toBeTruthy();
    expect(fallback.props.accessibilityElementsHidden).toBe(true);
    expect(fallback.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(screen.queryByTestId("curated-poster-image-Deli Boys")).toBeNull();
    expect(screen.queryByText("tv-outline", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("curated-caption-Deli Boys")).toBeTruthy();
    expect(screen.getAllByText("Deli Boys")).toHaveLength(1);
  });
});
