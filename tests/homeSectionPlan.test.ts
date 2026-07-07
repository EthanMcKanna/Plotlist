import { describe, expect, it } from "@jest/globals";

import {
  getHomeDiscoverySectionSignal,
  getHomeSectionDisplayIndexes,
  getHomeSectionPlan,
  getHomeSectionTestID,
  getRankedHomeDiscoverySections,
  type HomeSectionKind,
} from "../lib/homeSectionPlan";

function kinds(
  options: Parameters<typeof getHomeSectionPlan>[0],
) {
  return getHomeSectionPlan(options).map((section) => section.kind);
}

describe("home section plan", () => {
  it("counts discovery currentness against the supplied homepage timestamp", () => {
    const signal = getHomeDiscoverySectionSignal(
      [
        { year: 2026, signal: null },
        { year: 2026, signal: "S2 May 29" },
        { year: 2024, signal: null },
      ],
      "2026-05-30T12:00:00.000Z",
    );
    const staleSignal = getHomeDiscoverySectionSignal(
      [
        { year: 2026, signal: null },
        { year: 2026, signal: "S2 May 29" },
        { year: 2024, signal: null },
      ],
      "2028-05-30T12:00:00.000Z",
    );

    expect(signal).toEqual({
      itemCount: 3,
      currentCount: 2,
      explicitCurrentCount: 1,
    });
    expect(staleSignal).toEqual({
      itemCount: 3,
      currentCount: 1,
      explicitCurrentCount: 1,
    });
  });

  it("opens with resume and utility modules for signed-in viewers", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
      }).slice(0, 3),
    ).toEqual([
      "continue-watching",
      "tonight",
      "heat",
    ]);
  });

  it("brings the strongest live discovery modules before the personal shelf", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        now: "2026-05-29T20:00:00.000Z",
        sectionSignals: {
          heat: { itemCount: 3, currentCount: 1, explicitCurrentCount: 1 },
          fresh: { itemCount: 8, currentCount: 6, explicitCurrentCount: 5 },
          critics: { itemCount: 8, currentCount: 1, explicitCurrentCount: 0 },
          quick: { itemCount: 4, currentCount: 1, explicitCurrentCount: 0 },
        },
      }).slice(2, 6),
    ).toEqual(["fresh", "for-you", "heat", "critics"]);
  });

  it("keeps discovery rails available for cold-start or signed-out viewers", () => {
    expect(
      kinds({
        hasProfile: false,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
      }),
    ).toEqual([
      "heat",
      "fresh",
      "critics",
      "quick",
    ]);
  });

  it("shows the contact-sync nudge only when it has not been dismissed", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: true,
        contactNudgeDismissed: false,
      }),
    ).toContain("contact-sync");
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: true,
        contactNudgeDismissed: true,
      }),
    ).not.toContain("contact-sync");
  });

  it("hides the schedule module once the release preview is known empty", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        scheduleSignal: {
          known: true,
          tonightCount: 0,
          upcomingCount: 0,
        },
      }),
    ).not.toContain("tonight");
  });

  it("keeps tonight releases ahead of editorial browsing", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        scheduleSignal: {
          known: true,
          tonightCount: 2,
          upcomingCount: 4,
        },
      }).slice(0, 3),
    ).toEqual([
      "continue-watching",
      "tonight",
      "heat",
    ]);
  });

  it("places upcoming-only schedules after the shortlist instead of interrupting resume", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        scheduleSignal: {
          known: true,
          tonightCount: 0,
          upcomingCount: 3,
        },
      }).slice(0, 3),
    ).toEqual([
      "continue-watching",
      "tonight",
      "heat",
    ]);
  });

  it("numbers visible homepage headers from the rendered section order", () => {
    const plan = getHomeSectionPlan({
      hasProfile: true,
      showContactSyncNudge: false,
      contactNudgeDismissed: null,
      scheduleSignal: {
        known: true,
        tonightCount: 0,
        upcomingCount: 3,
      },
      sectionSignals: {
        fresh: { itemCount: 8, currentCount: 6, explicitCurrentCount: 5 },
        heat: { itemCount: 8, currentCount: 4, explicitCurrentCount: 3 },
      },
    });
    const visibleKinds = new Set<HomeSectionKind>([
      "continue-watching",
      "tonight",
      "fresh",
      "for-you",
      "heat",
    ]);

    const indexes = getHomeSectionDisplayIndexes(plan, visibleKinds);

    expect(indexes.get("continue-watching")).toBe(1);
    expect(indexes.get("tonight")).toBe(2);
    expect(indexes.get("fresh")).toBe(3);
    expect(indexes.get("for-you")).toBe(4);
    expect(indexes.get("heat")).toBe(5);
    expect(new Set(indexes.values()).size).toBe(indexes.size);
  });

  it("keeps section numbers contiguous when optional modules are hidden", () => {
    const plan = getHomeSectionPlan({
      hasProfile: true,
      showContactSyncNudge: false,
      contactNudgeDismissed: null,
      scheduleSignal: {
        known: true,
        tonightCount: 2,
        upcomingCount: 4,
      },
    });
    const visibleKinds = new Set<HomeSectionKind>([
      "continue-watching",
      "tonight",
      "heat",
      "fresh",
    ]);

    expect([...getHomeSectionDisplayIndexes(plan, visibleKinds).values()]).toEqual([
      1,
      2,
      3,
      4,
    ]);
  });

  it("exports stable Browser QA handles for every planned homepage section", () => {
    const plan = getHomeSectionPlan({
      hasProfile: true,
      showContactSyncNudge: true,
      contactNudgeDismissed: false,
      scheduleSignal: {
        known: true,
        tonightCount: 1,
        upcomingCount: 2,
      },
      socialSignal: {
        contactStatusKnown: true,
        feedItemCount: 2,
        peopleSuggestionCount: 1,
      },
      sectionSignals: {
        heat: { itemCount: 8, currentCount: 4, explicitCurrentCount: 3 },
        fresh: { itemCount: 8, currentCount: 6, explicitCurrentCount: 5 },
        critics: { itemCount: 8, currentCount: 1, explicitCurrentCount: 0 },
        quick: { itemCount: 5, currentCount: 1, explicitCurrentCount: 0 },
      },
    });
    const handles = plan.map((section) => getHomeSectionTestID(section.kind));

    expect(handles).toEqual(
      expect.arrayContaining([
        "home-section-continue-watching",
        "home-section-tonight",
        "home-section-for-you",
        "home-section-fresh",
        "home-section-heat",
        "home-section-contact-sync",
        "home-section-friends",
      ]),
    );
    expect(handles.every((handle) => /^home-section-[a-z-]+$/.test(handle))).toBe(
      true,
    );
  });

  it("keeps contact sync after the main content stack without duplicating empty friends", () => {
    const plan = kinds({
        hasProfile: true,
        showContactSyncNudge: true,
        contactNudgeDismissed: false,
        sectionSignals: {
          fresh: { itemCount: 8, currentCount: 6, explicitCurrentCount: 5 },
        },
      });

    expect(plan.slice(0, 6)).toEqual([
      "continue-watching",
      "tonight",
      "fresh",
      "for-you",
      "heat",
      "critics",
    ]);
    // Signed-in surfaces carry all four discovery rails.
    expect(plan).toContain("quick");
    expect(plan.indexOf("contact-sync")).toBeGreaterThan(plan.indexOf("heat"));
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: true,
        contactNudgeDismissed: false,
      }),
    ).not.toContain("friends");
  });

  it("promotes friends when there is real social activity or people to follow", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        now: "2026-05-29T20:00:00.000Z",
        socialSignal: { feedItemCount: 2, peopleSuggestionCount: 0 },
        sectionSignals: {
          heat: { itemCount: 3, currentCount: 1, explicitCurrentCount: 1 },
          fresh: { itemCount: 8, currentCount: 6, explicitCurrentCount: 5 },
        },
      }).slice(2, 7),
    ).toEqual(["fresh", "friends", "for-you", "heat", "critics"]);

    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        socialSignal: {
          feedItemCount: 0,
          peopleSuggestionCount: 3,
          hasSyncedContacts: true,
          contactStatusKnown: true,
        },
      }).indexOf("friends"),
    ).toBeGreaterThan(-1);
  });

  it("keeps empty social prompts off home after contacts are synced", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        socialSignal: {
          feedItemCount: 0,
          peopleSuggestionCount: 0,
          hasSyncedContacts: true,
          contactStatusKnown: true,
        },
      }),
    ).not.toContain("friends");
  });

  it("falls back to the friends invite only after the contact sync nudge is unavailable", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: true,
        contactNudgeDismissed: null,
        socialSignal: {
          feedItemCount: 0,
          peopleSuggestionCount: 0,
          hasSyncedContacts: false,
          contactStatusKnown: true,
        },
      }),
    ).not.toContain("friends");

    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: true,
        contactNudgeDismissed: true,
        socialSignal: {
          feedItemCount: 0,
          peopleSuggestionCount: 0,
          hasSyncedContacts: false,
          contactStatusKnown: true,
        },
      }),
    ).toContain("friends");
  });

  it("promotes the strongest live discovery modules instead of freezing the rail order", () => {
    expect(
      kinds({
        hasProfile: false,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        now: "2026-05-29T20:00:00.000Z",
        sectionSignals: {
          heat: { itemCount: 3, currentCount: 1, explicitCurrentCount: 1 },
          fresh: { itemCount: 8, currentCount: 6, explicitCurrentCount: 5 },
          critics: { itemCount: 8, currentCount: 1, explicitCurrentCount: 0 },
          quick: { itemCount: 4, currentCount: 1, explicitCurrentCount: 0 },
        },
      }).slice(0, 3),
    ).toEqual(["fresh", "heat", "critics"]);
  });

  it("moves quick starts up late at night when their rail is substantial", () => {
    expect(
      getRankedHomeDiscoverySections({
        now: "2026-05-29T23:30:00.000Z",
        sectionSignals: {
          heat: { itemCount: 4, currentCount: 1, explicitCurrentCount: 1 },
          fresh: { itemCount: 4, currentCount: 1, explicitCurrentCount: 1 },
          critics: { itemCount: 6, currentCount: 0, explicitCurrentCount: 0 },
          quick: { itemCount: 8, currentCount: 3, explicitCurrentCount: 2 },
        },
      }).slice(0, 2),
    ).toEqual(["quick", "heat"]);
  });

  it("lets a rotation seed reorder near-tied rails without overriding strong signals", () => {
    const tiedSignals = {
      heat: { itemCount: 4, currentCount: 0, explicitCurrentCount: 0 },
      fresh: { itemCount: 4, currentCount: 0, explicitCurrentCount: 0 },
      critics: { itemCount: 4, currentCount: 0, explicitCurrentCount: 0 },
      quick: { itemCount: 4, currentCount: 0, explicitCurrentCount: 0 },
    };

    const orders = new Set(
      Array.from({ length: 24 }, (_, seed) =>
        getRankedHomeDiscoverySections({
          sectionSignals: tiedSignals,
          rotationSeed: seed,
        }).join(","),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);

    // Deterministic for a fixed seed.
    expect(
      getRankedHomeDiscoverySections({ sectionSignals: tiedSignals, rotationSeed: 7 }),
    ).toEqual(
      getRankedHomeDiscoverySections({ sectionSignals: tiedSignals, rotationSeed: 7 }),
    );

    // A rail with a real live signal cannot be jittered out of the lead.
    const strongFresh = {
      ...tiedSignals,
      fresh: { itemCount: 8, currentCount: 6, explicitCurrentCount: 5 },
    };
    for (let seed = 0; seed < 24; seed += 1) {
      expect(
        getRankedHomeDiscoverySections({
          sectionSignals: strongFresh,
          rotationSeed: seed,
        })[0],
      ).toBe("fresh");
    }
  });

  it("keeps the personal shelf ahead of the remaining discovery rails for signed-in viewers", () => {
    expect(
      kinds({
        hasProfile: true,
        showContactSyncNudge: false,
        contactNudgeDismissed: null,
        sectionSignals: {
          fresh: { itemCount: 5, currentCount: 5, explicitCurrentCount: 5 },
        },
      }).slice(2, 6),
    ).toEqual(["fresh", "for-you", "heat", "critics"]);
  });
});
