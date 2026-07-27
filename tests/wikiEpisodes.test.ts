import { describe, expect, it } from "@jest/globals";

import {
  cleanWikitext,
  extractEpisodeListTemplates,
  extractTransclusions,
  groupEntriesBySeason,
  parseWikiEpisodePage,
  seasonFromHeading,
  seasonFromPageTitle,
  validateSeasonAgainstTmdb,
} from "../lib/wikiEpisodes";

// Fixtures mirror the layouts verified against live Wikipedia (2026-07):
// per-season pages ("Breaking Bad season 1"-style, {{Episode table}} wrapper
// + {{Episode list/sublist}}), multi-season main articles (Severance-style
// season headings), and "List of X episodes" pages that transclude season
// pages while carrying unrelated {{Episode list}} entries (minisodes) under
// an "Other media" section.

const SEASON_PAGE = `
== Cast ==
* [[Some Actor]] as Rex Vane

== Episodes ==
{{See also|List of Harbor Point episodes}}
<onlyinclude>{{Episode table |background=#2FAAC3 |overall=5 |season=5 |title=20 |episodes={{Episode list/sublist|Harbor Point season 1
 |EpisodeNumber = 1
 |EpisodeNumber2 = 1
 |Title = [[First Light (Harbor Point)|First Light]]
 |DirectedBy = [[Jane Doe]]
 |OriginalAirDate = {{Start date|2008|01|20}}
 |ShortSummary = Rex Vane, a retired harbor pilot, discovers a smuggling ring operating out of the marina he manages. His estranged daughter Ada, now a customs investigator, arrives to investigate the same ring, and neither realizes the other is involved.<ref>{{cite web|url=http://example.com|title=Recap}}</ref> Rex hides the ledger he found inside the {{nbsp}}lighthouse.
 |LineColor = 2FAAC3
}}
{{Episode list/sublist|Harbor Point season 1
 |EpisodeNumber = 2
 |EpisodeNumber2 = 2
 |Title = Undertow
 |OriginalAirDate = {{Start date|2008|01|27}}
 |ShortSummary = Ada traces a shipment to Rex's marina and questions him without revealing she suspects the ring. Rex's partner '''Milo''' burns the warehouse to destroy evidence, not knowing Rex's ledger — with every drop-off date — survived in the [[lighthouse]].
 |LineColor = 2FAAC3
}}
}}</onlyinclude>

== Reception ==
Critics liked it.
`;

const MAIN_ARTICLE = `
== Cast and characters ==
* Someone as Someone Else

== Episodes ==

=== Season 1 (2022) ===
{{Episode table |background=#7D9F7E |episodes={{Episode list
| EpisodeNumber   = 1
| EpisodeNumber2  = 1
| Title           = [[Cold Open (Meridian)|Cold Open]]
| OriginalAirDate = {{Start date|2022|2|18}}
| ShortSummary    = Dr. Lena Meridian wakes on a research station with no memory of the previous night, and finds the station's only radio smashed. Her colleague Theo claims a storm knocked out communications, but Lena finds his notebook documenting her movements for weeks.
| LineColor       = 7D9F7E
}}
{{Episode list
| EpisodeNumber   = 2
| EpisodeNumber2  = 2
| Title           = Static
| OriginalAirDate = {{Start date|2022|2|18}}
| ShortSummary    = Lena confronts Theo with the notebook. He admits the station's sponsor ordered the surveillance and reveals a sealed lab level below the ice that Lena has no clearance to enter. Lena steals his keycard while he sleeps.
| LineColor       = 7D9F7E
}}
}}

=== Season 2 (2025) ===
{{Episode table |background=#71A9C2 |episodes={{Episode list
| EpisodeNumber   = 10
| EpisodeNumber2  = 1
| Title           = Below
| OriginalAirDate = {{Start date|2025|1|16}}
| ShortSummary    = Months after the evacuation, Lena is recalled to the rebuilt station under a new name. The sealed lab is now officially a "storage level", and the new director is Theo's sister Vera, who says Theo died in the storm — a story Lena knows is false.
| LineColor       = 71A9C2
}}
}}

== Production ==
Filmed on location.
`;

const LIST_PAGE = `
== Series overview ==
{{Series overview}}

== Episodes ==
=== Season 1 (2008) ===
{{:Harbor Point season 1}}

=== Season 2 (2009) ===
{{:Harbor Point season 2}}

== Other media ==
=== Webisodes: Harbor Point Shorts (2009) ===
==== Season 1 (2009) ====
{{Episode list
 |EpisodeNumber = 1
 |Title = Dock Talk
 |ShortSummary = A two-minute comedic short in which Milo argues with a seagull over a sandwich, unrelated to the main story of the series entirely.
 |LineColor = 2FAAC3
}}
`;

describe("cleanWikitext", () => {
  it("strips refs, templates, links, and markup down to prose", () => {
    const cleaned = cleanWikitext(
      `Rex finds [[Ada Vane|Ada]] at the '''lighthouse'''.<ref name="x">{{cite web|url=http://e.com}}</ref> They argue about the {{nbsp}}ledger &amp; the fire.<!-- hidden -->`,
    );
    expect(cleaned).toBe("Rex finds Ada at the lighthouse. They argue about the ledger & the fire.");
  });

  it("drops file links and unknown templates including nested ones", () => {
    const cleaned = cleanWikitext(
      `[[File:Boat.jpg|thumb|A boat]]The crew {{small|(both of them)}} sails on.{{efn|A note with {{nbsp}} inside}}`,
    );
    expect(cleaned).toBe("The crew sails on.");
  });
});

describe("extractEpisodeListTemplates", () => {
  it("finds balanced templates nested inside an Episode table", () => {
    const templates = extractEpisodeListTemplates(SEASON_PAGE);
    expect(templates).toHaveLength(2);
    expect(templates[0].body).toContain("First Light");
    expect(templates[1].body).toContain("Undertow");
  });
});

describe("parseWikiEpisodePage", () => {
  it("parses a season page using the default season", () => {
    const entries = parseWikiEpisodePage(SEASON_PAGE, { defaultSeason: 1 });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ seasonNumber: 1, episodeNumber: 1, title: "First Light" });
    // Links, refs, bold markup, and inline templates are cleaned out.
    expect(entries[0].summary).toContain("Rex Vane, a retired harbor pilot");
    expect(entries[0].summary).not.toContain("<ref");
    expect(entries[0].summary).not.toContain("{{");
    expect(entries[1].summary).toContain("Milo burns the warehouse");
    expect(entries[1].summary).not.toContain("'''");
  });

  it("attributes seasons from headings on a multi-season article", () => {
    const entries = parseWikiEpisodePage(MAIN_ARTICLE, { defaultSeason: 1 });
    const grouped = groupEntriesBySeason(entries);
    expect([...grouped.keys()].sort()).toEqual([1, 2]);
    // Season 2's entry uses EpisodeNumber2 (in-season), not the overall number.
    expect(grouped.get(2)!.get(1)!.title).toBe("Below");
    expect(grouped.get(2)!.has(10)).toBe(false);
  });

  it("drops entries nested under reset sections (webisodes, other media)", () => {
    // The webisode block sits under "Other media" → its "Season 1 (2009)"
    // heading must not put "Dock Talk" into the real season 1.
    const entries = parseWikiEpisodePage(LIST_PAGE, { defaultSeason: null });
    expect(entries).toHaveLength(0);
  });

  it("skips entries with teaser-length summaries", () => {
    const entries = parseWikiEpisodePage(
      `== Episodes ==\n{{Episode list\n |EpisodeNumber = 1\n |Title = Stub\n |ShortSummary = Too short to help.\n}}`,
      { defaultSeason: 1 },
    );
    expect(entries).toHaveLength(0);
  });
});

describe("headings and page titles", () => {
  it("parses season, series, and word-number headings", () => {
    expect(seasonFromHeading("Season 3 (2010)")).toBe(3);
    expect(seasonFromHeading("Series 2")).toBe(2);
    expect(seasonFromHeading("Book One: Water (2005)")).toBe(1);
    expect(seasonFromHeading("Episodes")).toBeNull();
    expect(seasonFromHeading("Special (2026)")).toBe("reset");
    expect(seasonFromHeading("Other media")).toBe("reset");
  });

  it("reads season numbers from transcluded page titles", () => {
    expect(seasonFromPageTitle("Harbor Point season 2")).toBe(2);
    expect(seasonFromPageTitle("The Office (American season 3)")).toBe(3);
    expect(seasonFromPageTitle("List of Harbor Point episodes")).toBeNull();
  });

  it("collects transclusions from a list page", () => {
    expect(extractTransclusions(LIST_PAGE)).toEqual([
      "Harbor Point season 1",
      "Harbor Point season 2",
    ]);
  });
});

describe("groupEntriesBySeason", () => {
  it("drops a season with conflicting duplicate episode numbers", () => {
    const summary =
      "A long enough summary describing concrete events so it clears the minimum length filter easily.";
    const grouped = groupEntriesBySeason([
      { seasonNumber: 1, episodeNumber: 1, title: "Real", summary },
      { seasonNumber: 1, episodeNumber: 1, title: "Impostor", summary },
      { seasonNumber: 2, episodeNumber: 1, title: "Fine", summary },
    ]);
    expect(grouped.has(1)).toBe(false);
    expect(grouped.get(2)!.size).toBe(1);
  });
});

describe("validateSeasonAgainstTmdb", () => {
  const summary = "A sufficiently long plot summary with names and events to pass the filter.";

  it("accepts a season whose titles line up with TMDB", () => {
    const wiki = new Map([
      [1, { title: "First Light", summary }],
      [2, { title: "Undertow", summary }],
    ]);
    const tmdb = new Map<number, string | null>([
      [1, "First Light"],
      [2, "Undertow"],
      [3, "Slack Tide"],
    ]);
    expect(validateSeasonAgainstTmdb(wiki, tmdb)).toBe(true);
  });

  it("rejects mismatched titles (wrong page or webisodes)", () => {
    const wiki = new Map([
      [1, { title: "Dock Talk", summary }],
      [2, { title: "Gull Trouble", summary }],
    ]);
    const tmdb = new Map<number, string | null>([
      [1, "First Light"],
      [2, "Undertow"],
    ]);
    expect(validateSeasonAgainstTmdb(wiki, tmdb)).toBe(false);
  });

  it("rejects when nothing is comparable", () => {
    const wiki = new Map([[1, { title: null, summary }]]);
    const tmdb = new Map<number, string | null>([[1, "First Light"]]);
    expect(validateSeasonAgainstTmdb(wiki, tmdb)).toBe(false);
  });

  it("tolerates punctuation and casing differences", () => {
    const wiki = new Map([
      [1, { title: "Kill the Boy!", summary }],
      [2, { title: "Mother's Mercy", summary }],
    ]);
    const tmdb = new Map<number, string | null>([
      [1, "Kill the Boy"],
      [2, "Mothers Mercy"],
    ]);
    expect(validateSeasonAgainstTmdb(wiki, tmdb)).toBe(true);
  });
});
