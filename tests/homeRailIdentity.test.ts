import { describe, expect, it } from "@jest/globals";

import {
  filterHomeRoomsWithUnpreviewedFeaturedItems,
  getHomeDiscoveryPreviewKeys,
  getHomeRailIdentitySet,
  getHomeRailTitleKey,
  limitHomeRoomItemsByTitleAppearances,
  limitHomeRailItemsByTitleAppearances,
  prioritizeHomeRoomsAgainstPreviewKeys,
  prioritizeUnpreviewedHomeRailItems,
  removeOrDemotePreviewedHomeRailItems,
  removePreviewedHomeRailItems,
  topUpHomeRailItems,
  topUpHomeRailItemsPreservingSources,
} from "../lib/homeRailIdentity";

const item = (key: string, title = key) => ({ key, title });
const roomItem = (
  title: string,
  homeSignal: string | null = null,
) => ({ title, homeSignal });

function pickProviderFeature(
  items: ReturnType<typeof roomItem>[],
  mutedTitleKeys: Set<string>,
) {
  const firstUnmuted = items.find((show) => {
    const titleKey = getHomeRailTitleKey(show.title);
    return !titleKey || !mutedTitleKeys.has(titleKey);
  });
  if (!firstUnmuted) return items[0];
  if (firstUnmuted.homeSignal?.trim()) return firstUnmuted;

  return items.find((show) => show.homeSignal?.trim()) ?? firstUnmuted;
}

describe("home rail identity", () => {
  it("removes previewed titles even when their source keys differ", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("internal-spider-noir", "Spider-Noir"),
    ]);

    const remaining = removePreviewedHomeRailItems(
      [
        item("tmdb-spider-noir", "Spider-Noir"),
        item("personal-1", "Severance"),
        item("personal-2", "FROM"),
        item("personal-3", "The Bear"),
      ],
      previewKeys,
      3,
    );

    expect(remaining.map((next) => next.title)).toEqual([
      "Severance",
      "FROM",
      "The Bear",
    ]);
  });

  it("keeps compact feature rails alive with three distinct items", () => {
    const previewKeys = getHomeRailIdentitySet([item("preview", "Spider-Noir")]);

    expect(
      removePreviewedHomeRailItems(
        [
          item("preview-duplicate", "Spider-Noir"),
          item("one", "Severance"),
          item("two", "FROM"),
          item("three", "The Bear"),
        ],
        previewKeys,
        3,
      ),
    ).toHaveLength(3);
  });

  it("hides a rail instead of padding it with visible repeats", () => {
    const previewKeys = getHomeRailIdentitySet([item("preview", "Spider-Noir")]);

    expect(
      removePreviewedHomeRailItems(
        [
          item("preview-duplicate", "Spider-Noir"),
          item("one", "Severance"),
          item("two", "FROM"),
        ],
        previewKeys,
        3,
      ),
    ).toEqual([]);
  });

  it("lets poster discovery rails stay smaller when that avoids repeating opening editorial cards", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("hero", "Star City"),
      item("brief", "The Four Seasons"),
      item("curated", "Rick and Morty"),
    ]);

    expect(
      removePreviewedHomeRailItems(
        [
          item("fresh-rick", "Rick and Morty"),
          item("fresh-widow", "Widow's Bay"),
          item("fresh-four", "The Four Seasons"),
          item("fresh-lord", "Lord of the Flies"),
          item("fresh-legends", "Legends"),
        ],
        previewKeys,
        3,
      ).map((next) => next.title),
    ).toEqual(["Widow's Bay", "Lord of the Flies", "Legends"]);
  });

  it("hides a poster discovery rail when the only substantial version would be recycled opening picks", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("hero", "Star City"),
      item("brief", "The Four Seasons"),
      item("curated-rick", "Rick and Morty"),
      item("curated-lord", "Lord of the Flies"),
      item("curated-legends", "Legends"),
    ]);

    expect(
      removePreviewedHomeRailItems(
        [
          item("fresh-rick", "Rick and Morty"),
          item("fresh-widow", "Widow's Bay"),
          item("fresh-four", "The Four Seasons"),
          item("fresh-lord", "Lord of the Flies"),
          item("fresh-legends", "Legends"),
        ],
        previewKeys,
        3,
      ),
    ).toEqual([]);
  });

  it("hides a feature discovery rail when live picks are already carrying the opening editorial story", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("curated-rick", "Rick and Morty"),
      item("brief-deli", "Deli Boys"),
    ]);

    expect(
      removePreviewedHomeRailItems(
        [
          item("heat-rick", "Rick and Morty"),
          item("heat-deli", "Deli Boys"),
          item("heat-nemesis", "Nemesis"),
          item("heat-four", "The Four Seasons"),
        ],
        previewKeys,
        3,
      ),
    ).toEqual([]);
  });

  it("can demote previewed titles to keep a critical rail substantial", () => {
    const previewKeys = getHomeRailIdentitySet([item("preview", "Spider-Noir")]);

    expect(
      removeOrDemotePreviewedHomeRailItems(
        [
          item("preview-duplicate", "Spider-Noir"),
          item("one", "Severance"),
          item("two", "FROM"),
        ],
        previewKeys,
        3,
      ).map((next) => next.title),
    ).toEqual(["Severance", "FROM", "Spider-Noir"]);
  });

  it("can keep a current discovery rail alive with demoted repeats after title budgeting", () => {
    const openingItems = [
      item("hero-star", "Star City"),
      item("brief-four-seasons", "The Four Seasons"),
      item("curated-rick", "Rick and Morty"),
      item("curated-lord", "Lord of the Flies"),
    ];
    const previewKeys = getHomeRailIdentitySet(openingItems);

    const candidates = removeOrDemotePreviewedHomeRailItems(
      [
        item("fresh-rick", "Rick and Morty"),
        item("fresh-widow", "Widow's Bay"),
        item("fresh-four", "The Four Seasons"),
        item("fresh-lord", "Lord of the Flies"),
        item("fresh-legends", "Legends"),
      ],
      previewKeys,
      3,
    );
    const visible = limitHomeRailItemsByTitleAppearances(
      candidates,
      openingItems,
      1,
      3,
    );

    expect(visible.map((next) => next.title)).toEqual([
      "Widow's Bay",
      "Legends",
      "Rick and Morty",
      "The Four Seasons",
      "Lord of the Flies",
    ]);
  });

  it("keeps the full source pool for curated edits but moves previewed titles behind fresher options", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("best-bet", "Rick and Morty"),
      item("fresh-start", "Nemesis"),
    ]);

    const prioritized = prioritizeUnpreviewedHomeRailItems(
      [
        item("rick-source", "Rick and Morty"),
        item("nemesis-source", "Nemesis"),
        item("house-source", "House of the Dragon"),
        item("deli-source", "Deli Boys"),
      ],
      previewKeys,
    );

    expect(prioritized.map((next) => next.title)).toEqual([
      "House of the Dragon",
      "Deli Boys",
      "Rick and Morty",
      "Nemesis",
    ]);
  });

  it("tops up a premium rail without bringing back previewed or duplicate shows", () => {
    const previewKeys = getHomeRailIdentitySet([item("resume", "The Boys")]);

    const toppedUp = topUpHomeRailItems(
      [
        item("personal-boys", "The Boys"),
        item("personal-euphoria", "Euphoria"),
        item("personal-foundation", "Foundation"),
      ],
      [
        item("fresh-boys", "The Boys"),
        item("fresh-pluribus", "Pluribus"),
        item("quality-foundation", "Foundation"),
        item("quality-slow-horses", "Slow Horses"),
      ],
      previewKeys,
      3,
      5,
    );

    expect(toppedUp.map((next) => next.title)).toEqual([
      "Euphoria",
      "Foundation",
      "Pluribus",
      "Slow Horses",
    ]);
  });

  it("still hides a topped-up rail when the fallback cannot make it substantial", () => {
    const previewKeys = getHomeRailIdentitySet([item("resume", "The Boys")]);

    expect(
      topUpHomeRailItems(
        [item("personal-boys", "The Boys"), item("personal-euphoria", "Euphoria")],
        [item("quality-euphoria", "Euphoria")],
        previewKeys,
        3,
        5,
      ),
    ).toEqual([]);
  });

  it("lets a topped-up rail reserve its titles before downstream rails render", () => {
    const previewKeys = getHomeRailIdentitySet([item("brief", "FROM")]);
    const forYouItems = topUpHomeRailItems(
      [item("personal-from", "FROM"), item("personal-euphoria", "Euphoria")],
      [item("heat-pluribus", "Pluribus"), item("quality-foundation", "Foundation")],
      previewKeys,
      3,
      4,
    );
    const downstreamPreviewKeys = new Set([
      ...previewKeys,
      ...getHomeRailIdentitySet(forYouItems),
    ]);

    const heatItems = removePreviewedHomeRailItems(
      [
        item("heat-pluribus-2", "Pluribus"),
        item("heat-rick", "Rick and Morty"),
        item("heat-legends", "Legends"),
        item("heat-dutton", "Dutton Ranch"),
      ],
      downstreamPreviewKeys,
      3,
    );

    expect(forYouItems.map((next) => next.title)).toEqual([
      "Euphoria",
      "Pluribus",
      "Foundation",
    ]);
    expect(heatItems.map((next) => next.title)).toEqual([
      "Rick and Morty",
      "Legends",
      "Dutton Ranch",
    ]);
  });

  it("does not let small editorial preview thumbnails starve live discovery rails", () => {
    const leadPreviewKeys = getHomeRailIdentitySet([
      item("fresh-lead", "Star City"),
      item("conversation-lead", "Nemesis"),
    ]);
    const curatedThumbnailKeys = getHomeRailIdentitySet([
      item("thumbnail", "A Good Girl's Guide to Murder"),
    ]);
    const shelfItems = [item("shelf", "FROM")];

    const discoveryKeys = getHomeDiscoveryPreviewKeys(leadPreviewKeys, shelfItems);

    expect(discoveryKeys.has("title:star city")).toBe(true);
    expect(discoveryKeys.has("title:nemesis")).toBe(true);
    expect(discoveryKeys.has("title:from")).toBe(true);
    expect(discoveryKeys.has("title:a good girl's guide to murder")).toBe(false);
    expect(
      removeOrDemotePreviewedHomeRailItems(
        [
          item("heat-good-girl", "A Good Girl's Guide to Murder"),
          item("heat-nemesis", "Nemesis"),
          item("heat-rick", "Rick and Morty"),
        ],
        new Set([...discoveryKeys, ...curatedThumbnailKeys]),
        3,
      ).map((next) => next.title),
    ).toEqual(["Rick and Morty", "A Good Girl's Guide to Murder", "Nemesis"]);
    expect(
      removeOrDemotePreviewedHomeRailItems(
        [
          item("heat-good-girl", "A Good Girl's Guide to Murder"),
          item("heat-nemesis", "Nemesis"),
          item("heat-rick", "Rick and Morty"),
        ],
        discoveryKeys,
        3,
      ).map((next) => next.title),
    ).toEqual(["A Good Girl's Guide to Murder", "Rick and Morty", "Nemesis"]);
  });

  it("tops up from source overflow without draining a later rail below its minimum", () => {
    const previewKeys = getHomeRailIdentitySet([item("brief", "FROM")]);

    const toppedUp = topUpHomeRailItemsPreservingSources(
      [
        item("personal-from", "FROM"),
        item("personal-euphoria", "Euphoria"),
        item("personal-foundation", "Foundation"),
      ],
      [
        {
          items: [
            item("quality-euphoria", "Euphoria"),
            item("quality-foundation", "Foundation"),
            item("quality-bear", "The Bear"),
            item("quality-andor", "Andor"),
          ],
          minimumRemaining: 4,
        },
        {
          items: [
            item("heat-one", "A Good Girl's Guide to Murder"),
            item("heat-two", "Nemesis"),
            item("heat-three", "Star City"),
            item("heat-four", "Deli Boys"),
            item("heat-five", "The Apothecary Diaries"),
          ],
          candidates: [
            item("heat-four", "Deli Boys"),
            item("heat-five", "The Apothecary Diaries"),
          ],
          minimumRemaining: 3,
        },
      ],
      previewKeys,
      3,
      5,
    );

    expect(toppedUp.map((next) => next.title)).toEqual([
      "Euphoria",
      "Foundation",
      "Deli Boys",
      "The Apothecary Diaries",
    ]);
  });

  it("keeps hero titles out of the first discovery rail when enough alternatives exist", () => {
    const heroPreviewKeys = getHomeRailIdentitySet([
      item("hero-star", "Star City"),
      item("curated-four", "The Four Seasons"),
    ]);

    const toppedUp = topUpHomeRailItemsPreservingSources(
      [
        item("shelf-star", "Star City"),
        item("shelf-rick", "Rick and Morty"),
        item("shelf-lord", "Lord of the Flies"),
      ],
      [
        {
          items: [
            item("fresh-star", "Star City"),
            item("fresh-spider", "Spider-Noir"),
            item("fresh-house", "House of the Dragon"),
            item("fresh-campus", "Off Campus"),
          ],
          candidates: [
            item("fresh-spider", "Spider-Noir"),
            item("fresh-house", "House of the Dragon"),
            item("fresh-campus", "Off Campus"),
          ],
          minimumRemaining: 1,
        },
      ],
      heroPreviewKeys,
      3,
      5,
    );

    expect(toppedUp.map((next) => next.title)).toEqual([
      "Rick and Morty",
      "Lord of the Flies",
      "Spider-Noir",
      "House of the Dragon",
    ]);
  });

  it("does not top up the starter shelf with visible curated thumbnail titles", () => {
    const visibleEditorialKeys = getHomeRailIdentitySet([
      item("curated-legends", "Legends"),
      item("curated-lord", "Lord of the Flies"),
    ]);

    const toppedUp = topUpHomeRailItemsPreservingSources(
      [item("starter-widow", "Widow's Bay")],
      [
        {
          items: [
            item("fresh-legends", "Legends"),
            item("fresh-lord", "Lord of the Flies"),
            item("fresh-bear", "The Bear"),
            item("fresh-severance", "Severance"),
            item("fresh-andor", "Andor"),
          ],
          candidates: [
            item("fresh-legends", "Legends"),
            item("fresh-lord", "Lord of the Flies"),
            item("fresh-bear", "The Bear"),
            item("fresh-severance", "Severance"),
            item("fresh-andor", "Andor"),
          ],
          minimumRemaining: 1,
        },
      ],
      visibleEditorialKeys,
      3,
      5,
    );

    expect(toppedUp.map((next) => next.title)).toEqual([
      "Widow's Bay",
      "The Bear",
      "Severance",
    ]);
  });

  it("moves already-previewed provider room titles behind fresher room choices", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("hero-star", "Star City"),
      item("brief-four", "The Four Seasons"),
    ]);

    const rooms = prioritizeHomeRoomsAgainstPreviewKeys(
      [
        {
          key: "netflix",
          items: [
            { externalId: "1", externalSource: "tmdb", title: "The Four Seasons" },
            { externalId: "2", externalSource: "tmdb", title: "A Good Girl's Guide to Murder" },
            { externalId: "3", externalSource: "tmdb", title: "Lord of the Flies" },
            { externalId: "4", externalSource: "tmdb", title: "Legends" },
          ],
        },
      ],
      previewKeys,
      3,
    );

    expect(rooms[0]?.items.map((next) => next.title)).toEqual([
      "A Good Girl's Guide to Murder",
      "Lord of the Flies",
      "Legends",
    ]);
  });

  it("uses soft room reservations without putting a visible repeat back in front", () => {
    const hardPreviewKeys = getHomeRailIdentitySet([
      item("brief-four", "The Four Seasons"),
    ]);
    const softPreviewKeys = getHomeRailIdentitySet([
      item("candidate-good-girl", "A Good Girl's Guide to Murder"),
      item("candidate-lord", "Lord of the Flies"),
      item("candidate-legends", "Legends"),
    ]);

    const rooms = prioritizeHomeRoomsAgainstPreviewKeys(
      [
        {
          key: "netflix",
          items: [
            { externalId: "1", externalSource: "tmdb", title: "The Four Seasons" },
            { externalId: "2", externalSource: "tmdb", title: "A Good Girl's Guide to Murder" },
            { externalId: "3", externalSource: "tmdb", title: "Lord of the Flies" },
            { externalId: "4", externalSource: "tmdb", title: "Legends" },
          ],
        },
      ],
      hardPreviewKeys,
      3,
      softPreviewKeys,
    );

    expect(rooms[0]?.items.map((next) => next.title)).toEqual([
      "A Good Girl's Guide to Murder",
      "Lord of the Flies",
      "Legends",
    ]);
  });

  it("keeps a provider room alive with repeats only when there are not enough fresh choices", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("hero-star", "Star City"),
      item("brief-four", "The Four Seasons"),
    ]);

    const rooms = prioritizeHomeRoomsAgainstPreviewKeys(
      [
        {
          key: "apple-tv",
          items: [
            { externalId: "1", externalSource: "tmdb", title: "Star City" },
            { externalId: "2", externalSource: "tmdb", title: "The Four Seasons" },
            { externalId: "3", externalSource: "tmdb", title: "Slow Horses" },
          ],
        },
      ],
      previewKeys,
      3,
    );

    expect(rooms[0]?.items.map((next) => next.title)).toEqual([
      "Slow Horses",
      "Star City",
      "The Four Seasons",
    ]);
  });

  it("keeps cross-service rooms from recycling the same title when alternatives exist", () => {
    const rooms = prioritizeHomeRoomsAgainstPreviewKeys(
      [
        {
          key: "max",
          items: [
            { externalId: "1", externalSource: "tmdb", title: "The Bear" },
            { externalId: "2", externalSource: "tmdb", title: "The Pitt" },
            { externalId: "3", externalSource: "tmdb", title: "Hacks" },
          ],
        },
        {
          key: "hulu",
          items: [
            { externalId: "1", externalSource: "tmdb", title: "The Bear" },
            { externalId: "4", externalSource: "tmdb", title: "Deli Boys" },
            { externalId: "5", externalSource: "tmdb", title: "Abbott Elementary" },
            { externalId: "6", externalSource: "tmdb", title: "Overcompensating" },
          ],
        },
        {
          key: "prime",
          items: [
            { externalId: "1", externalSource: "tmdb", title: "The Bear" },
            { externalId: "7", externalSource: "tmdb", title: "Off Campus" },
            { externalId: "8", externalSource: "tmdb", title: "Spider-Noir" },
            { externalId: "9", externalSource: "tmdb", title: "Invincible" },
          ],
        },
      ],
      new Set(),
      3,
    );

    expect(rooms.map((room) => room.key)).toEqual(["max", "hulu", "prime"]);
    expect(rooms.flatMap((room) => room.items.map((next) => next.title))).toEqual([
      "The Bear",
      "The Pitt",
      "Hacks",
      "Deli Boys",
      "Abbott Elementary",
      "Overcompensating",
      "Off Campus",
      "Spider-Noir",
      "Invincible",
    ]);
  });

  it("counts primary shelf overlap against a source before borrowing from it", () => {
    const toppedUp = topUpHomeRailItemsPreservingSources(
      [item("personal-euphoria", "Euphoria"), item("personal-foundation", "Foundation")],
      [
        {
          items: [
            item("quality-euphoria", "Euphoria"),
            item("quality-foundation", "Foundation"),
            item("quality-bear", "The Bear"),
            item("quality-andor", "Andor"),
            item("quality-adolescence", "Adolescence"),
            item("quality-severance", "Severance"),
          ],
          candidates: [
            item("quality-bear", "The Bear"),
            item("quality-andor", "Andor"),
            item("quality-adolescence", "Adolescence"),
            item("quality-severance", "Severance"),
          ],
          minimumRemaining: 3,
        },
      ],
      new Set(),
      3,
      5,
    );

    expect(toppedUp.map((next) => next.title)).toEqual([
      "Euphoria",
      "Foundation",
      "The Bear",
    ]);
  });

  it("does not feature a provider room title already used by the taste brief", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("brief-four", "The Four Seasons"),
      item("brief-deli", "Deli Boys"),
    ]);

    const rooms = prioritizeHomeRoomsAgainstPreviewKeys(
      [
        {
          key: "netflix",
          items: [
            { externalId: "1", externalSource: "tmdb", title: "The Four Seasons" },
            { externalId: "2", externalSource: "tmdb", title: "A Good Girl's Guide to Murder" },
            { externalId: "3", externalSource: "tmdb", title: "Nemesis" },
            { externalId: "4", externalSource: "tmdb", title: "The Boroughs" },
            { externalId: "5", externalSource: "tmdb", title: "Severance" },
            { externalId: "6", externalSource: "tmdb", title: "Legends" },
            { externalId: "7", externalSource: "tmdb", title: "Lord of the Flies" },
            { externalId: "8", externalSource: "tmdb", title: "Adolescence" },
          ],
        },
      ],
      previewKeys,
      3,
    );

    expect(rooms[0]?.items[0]?.title).toBe("A Good Girl's Guide to Murder");
    expect(rooms[0]?.items.map((next) => next.title)).not.toContain(
      "The Four Seasons",
    );
  });

  it("front-loads titles that have not already appeared on the visible surface", () => {
    const items = limitHomeRailItemsByTitleAppearances(
      [
        item("fresh-four", "The Four Seasons"),
        item("fresh-bear", "The Bear"),
        item("fresh-severance", "Severance"),
        item("fresh-andor", "Andor"),
      ],
      [
        item("hero-four", "The Four Seasons"),
        item("brief-bear", "The Bear"),
      ],
      1,
      3,
    );

    expect(items.map((next) => next.title)).toEqual([
      "Severance",
      "Andor",
      "The Four Seasons",
      "The Bear",
    ]);
  });

  it("keeps a capped rail alive with repeated titles only after fresher choices", () => {
    const items = limitHomeRailItemsByTitleAppearances(
      [
        item("quick-four", "The Four Seasons"),
        item("quick-bear", "The Bear"),
        item("quick-deli", "Deli Boys"),
      ],
      [
        item("hero-four", "The Four Seasons"),
        item("brief-bear", "The Bear"),
      ],
      1,
      3,
    );

    expect(items.map((next) => next.title)).toEqual([
      "Deli Boys",
      "The Four Seasons",
      "The Bear",
    ]);
  });

  it("dedupes titles inside a capped rail before counting fallback repeats", () => {
    const items = limitHomeRailItemsByTitleAppearances(
      [
        item("heat-bear-a", "The Bear"),
        item("heat-bear-b", "The Bear"),
        item("heat-hacks", "Hacks"),
        item("heat-pitt", "The Pitt"),
      ],
      [item("brief-bear", "The Bear")],
      2,
      3,
    );

    expect(items.map((next) => next.key)).toEqual([
      "heat-bear-a",
      "heat-hacks",
      "heat-pitt",
    ]);
  });

  it("front-loads provider room titles that have not already filled the surface", () => {
    const items = limitHomeRoomItemsByTitleAppearances(
      [
        { externalId: "1", externalSource: "tmdb", title: "Lord of the Flies" },
        { externalId: "2", externalSource: "tmdb", title: "Legends" },
        { externalId: "3", externalSource: "tmdb", title: "A Good Girl's Guide to Murder" },
        { externalId: "4", externalSource: "tmdb", title: "Nemesis" },
        { externalId: "5", externalSource: "tmdb", title: "The Boroughs" },
        { externalId: "6", externalSource: "tmdb", title: "Adolescence" },
      ],
      [
        item("curated-lord", "Lord of the Flies"),
        item("fresh-lord", "Lord of the Flies"),
        item("curated-legends", "Legends"),
        item("fresh-legends", "Legends"),
        item("for-you-good-girl", "A Good Girl's Guide to Murder"),
      ],
      2,
      3,
      6,
    );

    expect(items.map((next) => next.title)).toEqual([
      "A Good Girl's Guide to Murder",
      "Nemesis",
      "The Boroughs",
      "Adolescence",
    ]);
  });

  it("keeps a provider room alive with capped repeats when every room choice has appeared", () => {
    const items = limitHomeRoomItemsByTitleAppearances(
      [
        { externalId: "1", externalSource: "tmdb", title: "The Bear" },
        { externalId: "2", externalSource: "tmdb", title: "The Pitt" },
        { externalId: "3", externalSource: "tmdb", title: "Hacks" },
      ],
      [
        item("hero-bear", "The Bear"),
        item("fresh-bear", "The Bear"),
        item("hero-pitt", "The Pitt"),
        item("fresh-pitt", "The Pitt"),
        item("hero-hacks", "Hacks"),
        item("fresh-hacks", "Hacks"),
      ],
      2,
      3,
      6,
    );

    expect(items.map((next) => next.title)).toEqual([
      "The Bear",
      "The Pitt",
      "Hacks",
    ]);
  });

  it("orders capped provider room repeats by the least saturated surface titles", () => {
    const items = limitHomeRoomItemsByTitleAppearances(
      [
        { externalId: "1", externalSource: "tmdb", title: "A Good Girl's Guide to Murder" },
        { externalId: "2", externalSource: "tmdb", title: "Nemesis" },
        { externalId: "3", externalSource: "tmdb", title: "The Boroughs" },
        { externalId: "4", externalSource: "tmdb", title: "Lord of the Flies" },
      ],
      [
        item("quality-good-girl", "A Good Girl's Guide to Murder"),
        item("heat-good-girl", "A Good Girl's Guide to Murder"),
        item("fresh-good-girl", "A Good Girl's Guide to Murder"),
        item("quality-nemesis", "Nemesis"),
        item("quality-boroughs", "The Boroughs"),
        item("fresh-boroughs", "The Boroughs"),
        item("quality-lord", "Lord of the Flies"),
      ],
      1,
      3,
      4,
    );

    expect(items.map((next) => next.title)).toEqual([
      "Nemesis",
      "Lord of the Flies",
      "The Boroughs",
      "A Good Girl's Guide to Murder",
    ]);
  });

  it("drops provider rooms whose rendered feature would only repeat the visible surface", () => {
    const previewKeys = getHomeRailIdentitySet([
      item("fresh-deli", "Deli Boys"),
      item("fresh-testaments", "The Testaments"),
    ]);
    const rooms = filterHomeRoomsWithUnpreviewedFeaturedItems(
      [
        {
          key: "hulu",
          items: [
            roomItem("Deli Boys", "S2 May 28"),
            roomItem("The Testaments", "Finale May 27"),
            roomItem("Abbott Elementary"),
          ],
        },
        {
          key: "prime",
          items: [
            roomItem("The Boys", "S5 airing now"),
            roomItem("Invincible"),
            roomItem("Off Campus"),
          ],
        },
        {
          key: "netflix",
          items: [
            roomItem("Sweet Magnolias", "Netflix Jun 11"),
            roomItem("The Boroughs"),
            roomItem("Man on Fire"),
          ],
        },
      ],
      previewKeys,
      pickProviderFeature,
      2,
    );

    expect(rooms.map((room) => room.key)).toEqual(["prime", "netflix"]);
  });

  it("keeps repeated-lead provider rooms when dropping them would collapse the section", () => {
    const previewKeys = getHomeRailIdentitySet([item("fresh-deli", "Deli Boys")]);
    const rooms = filterHomeRoomsWithUnpreviewedFeaturedItems(
      [
        {
          key: "hulu",
          items: [
            roomItem("Deli Boys", "S2 May 28"),
            roomItem("Abbott Elementary"),
            roomItem("Tracker"),
          ],
        },
        {
          key: "prime",
          items: [
            roomItem("The Boys", "S5 airing now"),
            roomItem("Invincible"),
            roomItem("Off Campus"),
          ],
        },
      ],
      previewKeys,
      pickProviderFeature,
      2,
    );

    expect(rooms.map((room) => room.key)).toEqual(["hulu", "prime"]);
  });

  it("dedupes duplicate titles inside a provider room before applying capped fallbacks", () => {
    const items = limitHomeRoomItemsByTitleAppearances(
      [
        { externalId: "1", externalSource: "tmdb", title: "The Bear" },
        { externalId: "2", externalSource: "tmdb", title: "The Bear" },
        { externalId: "3", externalSource: "tmdb", title: "The Pitt" },
        { externalId: "4", externalSource: "tmdb", title: "Hacks" },
      ],
      [item("brief-bear", "The Bear")],
      2,
      3,
      6,
    );

    expect(items.map((next) => next.externalId)).toEqual(["1", "3", "4"]);
  });
});
