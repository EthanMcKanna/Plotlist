import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HOMEPAGE_SURFACE_FILES = [
  "app/(tabs)/home.tsx",
  "components/HeroCarousel.tsx",
  "components/ContinueWatchingRail.tsx",
  "components/FeedItem.tsx",
  "components/HomeCuratedEdits.tsx",
  "components/FriendsActivity.tsx",
  "components/SignatureRail.tsx",
  "components/TonightStrip.tsx",
  "lib/homeCuratedEdits.ts",
];

describe("home surface copy", () => {
  it("keeps generic recommendation pills and stale rail names off the visible homepage", () => {
    const surfaceCopy = HOMEPAGE_SURFACE_FILES.map((file) =>
      readFileSync(join(process.cwd(), file), "utf8"),
    ).join("\n");

    expect(surfaceCopy).not.toMatch(/Picked for you/);
    expect(surfaceCopy).not.toMatch(/Deep Cuts/i);
    expect(surfaceCopy).not.toMatch(/Matched from your taste profile/i);
    expect(surfaceCopy).not.toMatch(/\bTaste match\b/i);
    expect(surfaceCopy).not.toMatch(/fresh catalog signal/);
    expect(surfaceCopy).not.toMatch(/fresh premiere/i);
    expect(surfaceCopy).not.toMatch(/worth opening tonight/i);
    expect(surfaceCopy).not.toMatch(/Everyone's watching/);
    expect(surfaceCopy).not.toMatch(/Daily demand/);
    expect(surfaceCopy).not.toMatch(/strong audience rating/);
    expect(surfaceCopy).not.toMatch(/currently popular/);
    expect(surfaceCopy).not.toMatch(/recent standouts/i);
    expect(surfaceCopy).not.toMatch(/Streaming rooms/);
    expect(surfaceCopy).not.toMatch(/Also buzzing/);
    expect(surfaceCopy).not.toMatch(/Private contact matching/);
    expect(surfaceCopy).not.toMatch(/Hashed only/);
    expect(surfaceCopy).not.toMatch(/Bring your people in/);
    expect(surfaceCopy).not.toMatch(/On tonight's radar/);
    expect(surfaceCopy).not.toMatch(/Closest fit/);
    expect(surfaceCopy).not.toMatch(/Worth starting/);
    expect(surfaceCopy).not.toMatch(/Happening now/);
    expect(surfaceCopy).not.toMatch(/Friends activity/);
    expect(surfaceCopy).not.toMatch(/See their watches, reviews, and lists/);
    expect(surfaceCopy).not.toMatch(/See what they watch/);
    expect(surfaceCopy).not.toMatch(/No active shows yet/);
    expect(surfaceCopy).not.toMatch(/Tap to find something to start tonight/);
    expect(surfaceCopy).not.toMatch(/No next episode/);
    expect(surfaceCopy).not.toMatch(/On your schedule/);
    expect(surfaceCopy).not.toMatch(/Your shelf/);
    expect(surfaceCopy).not.toMatch(/Starter shelf/);
    expect(surfaceCopy).not.toMatch(/Start with these/);
    expect(surfaceCopy).not.toMatch(/Today's edit/);
    expect(surfaceCopy).not.toMatch(/Trending now/);
    expect(surfaceCopy).not.toMatch(/Fresh this week/);
    expect(surfaceCopy).not.toMatch(/Critics' picks/);
    expect(surfaceCopy).not.toMatch(/Quietly excellent/);
    expect(surfaceCopy).not.toMatch(/Quick watches/);
    expect(surfaceCopy).not.toMatch(/Quick hits/);
    expect(surfaceCopy).not.toMatch(/New or back/);
    expect(surfaceCopy).not.toMatch(/Just dropped/);
    expect(surfaceCopy).not.toMatch(/New today/);
    expect(surfaceCopy).not.toMatch(/New episode/);
    expect(surfaceCopy).not.toMatch(/Coming this week/);
    expect(surfaceCopy).not.toMatch(/Returning soon/);
    expect(surfaceCopy).not.toMatch(/Loading the lead pick of the night/);
    expect(surfaceCopy).not.toMatch(/Watch next/);
    expect(surfaceCopy).not.toMatch(/Best bet/);
    expect(surfaceCopy).not.toMatch(/Recommended/);
    expect(surfaceCopy).not.toMatch(/Worth following/);
    expect(surfaceCopy).not.toMatch(/started watching/);
    expect(surfaceCopy).not.toMatch(/>Follow</);
    expect(surfaceCopy).toMatch(/Trending/);
    expect(surfaceCopy).toMatch(/Picks/);
    expect(surfaceCopy).toMatch(/Streaming/);
    expect(surfaceCopy).toMatch(/Contacts stay private/);
  });

  it("keeps stable Browser QA handles on the homepage shell and sections", () => {
    const homeRoute = readFileSync(
      join(process.cwd(), "app/(tabs)/home.tsx"),
      "utf8",
    );

    expect(homeRoute).toContain('testID="home-surface"');
    expect(homeRoute).toContain('testID="home-surface-list"');
    expect(homeRoute).toContain("getHomeSectionTestID(item.kind)");
    expect(homeRoute).toContain("getHomeSectionWebDataSet");
    expect(homeRoute).toContain("homeSection: kind");
    expect(homeRoute).toContain("homeSectionId: sectionTestID");
    expect(homeRoute).toContain("getHomeInitialRenderSectionCount");
    expect(homeRoute).toContain("initialNumToRender={initialRenderSectionCount}");
    expect(homeRoute).toContain("maxToRenderPerBatch={initialRenderSectionCount}");
  });
});
