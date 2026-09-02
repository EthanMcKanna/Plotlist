import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WATCH_SERVICES,
  canonicalizeTmdbWatchProvider,
  decodeWatchProviderSnapshot,
  encodeWatchProviderSnapshot,
  getOriginalWatchServiceKey,
  getPrimaryWatchProvider,
  getWatchProviderKeys,
  getWatchServiceTmdbProviderIds,
  normalizeWatchProviderToken,
  resolveWatchProviders,
} from "../lib/watchProviders";

type Fixture = {
  id: number;
  name: string;
  networks: Array<{ id: number; name: string }>;
  us: {
    flatrate: unknown[];
    free: unknown[];
    ads: unknown[];
    rent: unknown[];
    buy: unknown[];
  } | null;
};

// Recorded from TMDB (/tv/{id} networks + /tv/{id}/watch/providers US) on
// 2026-09-01. Each entry documents what the rules do to a real payload.
const FIXTURES: Record<string, Fixture> = JSON.parse(
  readFileSync(join(__dirname, "fixtures/tmdbWatchProviders.json"), "utf8"),
);

function detailsFor(slug: string) {
  const fixture = FIXTURES[slug];
  if (!fixture) throw new Error(`Missing fixture ${slug}`);
  return {
    networks: fixture.networks,
    "watch/providers": { results: fixture.us ? { US: fixture.us } : {} },
  };
}

function summarize(slug: string) {
  return resolveWatchProviders(detailsFor(slug)).map((provider) =>
    provider.source === "subscription" ? provider.key : `${provider.key}:${provider.source}`,
  );
}

describe("resolveWatchProviders against recorded TMDB payloads", () => {
  const expectations: Array<[string, string[], string]> = [
    // Apple originals: TMDB lists "Amazon Prime Video" + "Apple TV Amazon
    // Channel" alongside Apple TV; the host is spurious, the channel variant
    // collapses into Apple TV+, and the network promotes it to original.
    ["ted_lasso", ["apple_tv:original"], "Prime Video dropped; Apple TV Amazon Channel collapsed"],
    ["severance", ["apple_tv:original"], "channel variant collapsed"],
    ["silo", ["apple_tv:original"], "Apple TV listed under `free` is not a free service"],
    ["pluribus", ["apple_tv:original"], "channel variant collapsed"],
    ["slow_horses", ["apple_tv:original"], "channel variant collapsed"],
    ["abbott_elementary", ["hulu", "max"], "ABC is broadcast; Hulu + HBO Max from flatrate, fubo/YouTube TV/Spectrum excluded"],
    // Prime originals keep the host (it is the original home) and merge the
    // ad tier and the free-with-ads library into one entry.
    ["the_boys", ["prime_video:original"], "with Ads + Free with Ads merged; Apple TV Store/Google Play buy ignored"],
    ["reacher", ["prime_video:original"], "tiers merged"],
    ["invincible", ["prime_video:original"], "tiers merged"],
    ["fallout", ["prime_video:original"], "tiers merged"],
    ["jury_duty", ["prime_video:original"], "Amazon Freevee network → Prime Video"],
    ["bosch_legacy", ["prime_video:original"], "Prime Video + Freevee networks → Prime Video"],
    // HBO: "HBO Max Amazon Channel" + "HBO Max" collapse; Spectrum On Demand excluded.
    ["house_of_the_dragon", ["max:original"], "HBO network → Max original"],
    ["the_last_of_us", ["max:original"], "HBO network → Max original"],
    ["the_white_lotus", ["max:original"], "HBO network → Max original"],
    ["the_pitt", ["max:original"], "Max/HBO Max networks → Max original"],
    ["friends", ["max"], "NBC is broadcast; TBS TV-Everywhere excluded"],
    ["schitts_creek", ["hulu", "max"], "CBC is broadcast; ordered by display priority"],
    // Netflix originals merge the Standard-with-Ads tier.
    ["stranger_things", ["netflix:original"], "ad tier merged"],
    ["squid_game", ["netflix:original"], "ad tier merged"],
    ["arcane", ["netflix:original"], "ad tier merged"],
    // Licensed catalog: Peacock Premium + Premium Plus dedupe; Paramount
    // Network is a cable channel, not Paramount+.
    ["yellowstone", ["peacock"], "fuboTV/Philo/YouTube TV excluded; Paramount Network ≠ Paramount+"],
    ["suits", ["netflix", "peacock"], "no ad-tier or Premium Plus duplicates"],
    ["the_office", ["peacock"], "Peacock tiers deduped"],
    ["chicago_fire", ["peacock"], "NBC/USA Network TV-Everywhere excluded"],
    ["law_and_order", ["netflix", "hulu", "peacock"], "NBC excluded; ordered by display priority"],
    ["law_and_order_svu", ["hulu", "peacock"], "USA Network excluded"],
    ["greys_anatomy", ["netflix", "hulu"], "ABC is broadcast"],
    ["ncis", ["netflix", "hulu", "paramount_plus"], "Paramount+ Premium/Essential/Apple/Amazon/Roku channels collapsed"],
    ["the_rookie", ["hulu"], "vMVPDs excluded"],
    ["bluey", ["disney_plus"], "DisneyNOW TV-Everywhere excluded"],
    ["bobs_burgers", ["hulu", "fox_one"], "FOX One Amazon Channel collapsed to FOX One; FXNow/Adult Swim excluded"],
    ["the_simpsons", ["disney_plus", "hulu", "fox_one"], "FOX One Amazon Channel collapsed"],
    // Hulu originals: Hulu network promoted ahead of Disney+ despite priority.
    ["the_bear", ["hulu:original", "disney_plus"], "FXNow excluded; Hulu original first"],
    ["only_murders", ["hulu:original", "disney_plus"], "Hulu original first"],
    ["shogun", ["hulu:original"], "FX is cable; Hulu network is the home"],
    ["andor", ["disney_plus:original"], "Disney+ network"],
    // Paramount+ originals via the "Paramount+ with Showtime" network.
    ["dexter_resurrection", ["paramount_plus:original"], "Premium + Apple/Amazon/Roku channels collapsed"],
    ["tulsa_king", ["paramount_plus:original"], "tiers listed under `free` are not free"],
    ["landman", ["paramount_plus:original"], "tiers collapsed"],
    ["yellowjackets", ["paramount_plus:original", "netflix"], "Showtime network → Paramount+ original ahead of Netflix"],
    // Starz/AMC+/MGM+ exist mostly as storefront channels.
    ["outlander", ["starz:original", "netflix"], "Starz channels collapsed; The Roku Channel dropped (only explained by Starz Roku Premium Channel)"],
    ["power_book_ii", ["starz:original"], "Prime Video under `free` ignored; Roku host dropped"],
    ["from", ["mgm_plus:original"], "Epix/MGM+ networks; Amazon/Roku channels collapsed"],
    ["dark_winds", ["netflix", "amc_plus"], "AMC is cable; Prime Video under `free` ignored; Hoopla excluded"],
    ["interview_with_the_vampire", ["netflix", "amc_plus"], "AMC+ Apple/Amazon/Roku channels collapsed"],
    ["the_walking_dead", ["netflix", "amc_plus", "pluto_tv:free"], "Pluto TV is a genuinely free service"],
    ["die_hart", ["roku_channel:original"], "Roku original stays as the free host"],
    ["poker_face", ["peacock:original"], "Peacock network"],
    ["fleabag", ["prime_video"], "Prime Video with no channel variant explaining it stays"],
    // Nothing qualifies: rent/buy only, or no US data at all.
    ["mr_robot", [], "no US streaming data"],
    ["westworld", [], "HBO original that left Max — the network never fabricates an entry"],
  ];

  it.each(expectations)("%s → %j (%s)", (slug, expected) => {
    expect(summarize(slug)).toEqual(expected);
  });

  it("gives Ted Lasso a single Apple TV+ entry with canonical name and logo", () => {
    expect(resolveWatchProviders(detailsFor("ted_lasso"))).toEqual([
      {
        key: "apple_tv",
        name: "Apple TV+",
        logoUrl: "https://image.tmdb.org/t/p/w92/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg",
        source: "original",
        tmdbProviderId: 350,
        displayPriority: 4,
      },
    ]);
  });

  it("uses the registry logo when a service only appears as a storefront channel", () => {
    const amc = resolveWatchProviders(detailsFor("dark_winds")).find((p) => p.key === "amc_plus");
    expect(amc?.logoUrl).toBe("https://image.tmdb.org/t/p/w92/ovmu6uot1XVvsemM2dDySXLiX57.jpg");
    expect(amc?.tmdbProviderId).toBe(526);
  });

  it("never lists rent or buy stores", () => {
    const theBoys = FIXTURES.the_boys.us!;
    expect(theBoys.buy.length).toBeGreaterThan(0);
    const keys = resolveWatchProviders(detailsFor("the_boys")).map((p) => p.key);
    expect(keys).toEqual(["prime_video"]);
    expect(
      resolveWatchProviders({
        "watch/providers": { results: { US: { rent: theBoys.buy, buy: theBoys.buy } } },
      }),
    ).toEqual([]);
  });

  it("does not list Paramount+ for Yellowstone unless TMDB lists it as flatrate", () => {
    const keys = resolveWatchProviders(detailsFor("yellowstone")).map((p) => p.key);
    expect(keys).not.toContain("paramount_plus");
    expect(keys).toEqual(["peacock"]);
  });
});

describe("resolveWatchProviders canonicalization rules", () => {
  const us = (buckets: Partial<Record<"flatrate" | "free" | "ads" | "rent" | "buy", unknown[]>>) => ({
    "watch/providers": { results: { US: buckets } },
  });
  const entry = (provider_name: string, provider_id?: number, display_priority = 50) => ({
    provider_id,
    provider_name,
    display_priority,
    logo_path: `/${provider_name.replace(/\W+/g, "").toLowerCase()}.jpg`,
  });

  it.each([
    ["Netflix Standard with Ads", "netflix"],
    ["Netflix Kids", "netflix"],
    ["Amazon Prime Video with Ads", "prime_video"],
    ["Max Amazon Channel with Ads", "max"],
    ["HBO Max Amazon Channel", "max"],
    ["Paramount+ with Showtime", "paramount_plus"],
    ["Paramount Plus Premium", "paramount_plus"],
    ["Paramount Plus Apple TV channel", "paramount_plus"],
    ["Paramount+ Roku Premium Channel", "paramount_plus"],
    ["Peacock Premium Plus", "peacock"],
    ["Peacock Premium Plus Amazon Channel", "peacock"],
    ["Hulu (No Ads)", "hulu"],
    ["Disney Plus", "disney_plus"],
    ["Apple TV", "apple_tv"],
    ["Apple TV Plus", "apple_tv"],
    ["Apple TV Amazon Channel", "apple_tv"],
    ["AMC+ Roku Premium Channel", "amc_plus"],
    ["AMC Plus Apple TV channel", "amc_plus"],
    ["Starz Apple TV channel", "starz"],
    ["MGM Plus Roku Premium Channel", "mgm_plus"],
    ["Amazon Prime Video Free with Ads", "prime_video"],
  ])("canonicalizes %s → %s by name alone", (name, key) => {
    expect(canonicalizeTmdbWatchProvider({ provider_name: name })?.key).toBe(key);
  });

  it("records the storefront host of a channel variant and trusts ids over renamed labels", () => {
    expect(canonicalizeTmdbWatchProvider({ provider_id: 2243, provider_name: "Apple TV Amazon Channel" })).toMatchObject({
      key: "apple_tv",
      host: "prime_video",
    });
    expect(canonicalizeTmdbWatchProvider({ provider_id: 1899, provider_name: "Some New Brand" })).toMatchObject({
      key: "max",
      host: null,
    });
    expect(canonicalizeTmdbWatchProvider({ provider_id: 350, provider_name: "Apple TV" })?.host).toBeNull();
  });

  it("keeps a storefront host when nothing explains it away (licensed on Netflix and Prime)", () => {
    const keys = resolveWatchProviders(
      us({ flatrate: [entry("Netflix", 8, 2), entry("Amazon Prime Video", 9, 3)] }),
    ).map((p) => p.key);
    expect(keys).toEqual(["netflix", "prime_video"]);
  });

  it("drops a storefront host that only appears alongside another service's channel", () => {
    const keys = resolveWatchProviders(
      us({ flatrate: [entry("Amazon Prime Video", 9, 3), entry("Max Amazon Channel", 1825, 11)] }),
    ).map((p) => p.key);
    expect(keys).toEqual(["max"]);
    // Apple TV as a host works the same way for a non-Apple show.
    expect(
      resolveWatchProviders(
        us({ flatrate: [entry("Apple TV", 350, 4), entry("Paramount Plus Apple TV channel", 1853, 23)] }),
      ).map((p) => p.key),
    ).toEqual(["paramount_plus"]);
  });

  it("keeps the storefront host when it is the original home", () => {
    const keys = resolveWatchProviders({
      networks: [{ id: 1024, name: "Prime Video" }],
      ...us({ flatrate: [entry("Amazon Prime Video", 9, 3), entry("Max Amazon Channel", 1825, 11)] }),
    }).map((p) => `${p.key}:${p.source}`);
    expect(keys).toEqual(["prime_video:original", "max:subscription"]);
  });

  it("promotes the original network's service even when its priority is worse", () => {
    const keys = resolveWatchProviders({
      networks: [{ id: 318, name: "STARZ" }],
      ...us({ flatrate: [entry("Netflix", 8, 2), entry("Starz", 43, 164)] }),
    }).map((p) => p.key);
    expect(keys).toEqual(["starz", "netflix"]);
  });

  it("never fabricates the original's service when TMDB does not list it", () => {
    expect(
      resolveWatchProviders({
        networks: [{ id: 49, name: "HBO" }],
        ...us({ flatrate: [entry("Tubi TV", 73, 346)] }),
      }).map((p) => `${p.key}:${p.source}`),
    ).toEqual(["tubi:free"]);
    expect(resolveWatchProviders({ networks: [{ id: 49, name: "HBO" }] })).toEqual([]);
  });

  it("only takes genuinely free services (or free tiers) from the free/ads buckets", () => {
    expect(
      resolveWatchProviders(
        us({
          flatrate: [entry("Netflix", 8, 2)],
          free: [entry("Amazon Prime Video", 9, 3), entry("Hoopla", 212, 36), entry("Some Trial Thing", 9999, 1)],
          ads: [entry("Tubi TV", 73, 346), entry("Pluto TV", 300, 72)],
        }),
      ).map((p) => `${p.key}:${p.source}`),
    ).toEqual(["netflix:subscription", "pluto_tv:free", "tubi:free"]);
    expect(
      resolveWatchProviders(us({ ads: [entry("Amazon Prime Video Free with Ads", 613, 140)] })).map(
        (p) => `${p.key}:${p.source}`,
      ),
    ).toEqual(["prime_video:free"]);
  });

  it("keeps unknown niche subscription services with a stable slug key and TMDB's name", () => {
    const providers = resolveWatchProviders(
      us({ flatrate: [entry("Rakuten Viki", 344, 96), entry("WOW Presents Plus Amazon Channel", 8888, 300)] }),
    );
    expect(providers.map((p) => [p.key, p.name])).toEqual([
      ["rakuten_viki", "Rakuten Viki"],
      ["wow_presents_plus", "WOW Presents Plus"],
    ]);
  });

  it("excludes live-TV bundles, cable on-demand, stores and network apps", () => {
    expect(
      resolveWatchProviders(
        us({
          flatrate: [
            entry("fuboTV", 257, 10),
            entry("Philo", 2383, 17),
            entry("YouTube TV", 2528, 38),
            entry("Sling TV Orange", 1809, 177),
            entry("Spectrum On Demand", 486, 119),
            entry("NBC", 79, 48),
            entry("USA Network", 322, 93),
            entry("FXNow", 123, 42),
            entry("DisneyNOW", 508, 122),
            entry("Xfinity Stream", 7777, 400),
            entry("Amazon Video", 10, 8),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("orders by TMDB display priority and caps the list", () => {
    const many = us({
      flatrate: [
        entry("Hulu", 15, 6),
        entry("Netflix", 8, 2),
        entry("Disney Plus", 337, 5),
        entry("Peacock Premium", 386, 16),
        entry("Paramount Plus Premium", 2303, 14),
        entry("Starz", 43, 164),
        entry("AMC+", 526, 31),
        entry("Crunchyroll", 283, 12),
      ],
    });
    expect(resolveWatchProviders(many).map((p) => p.key)).toEqual([
      "netflix",
      "disney_plus",
      "hulu",
      "crunchyroll",
      "paramount_plus",
      "peacock",
    ]);
    expect(resolveWatchProviders(many, { limit: 2 }).map((p) => p.key)).toEqual(["netflix", "disney_plus"]);
    expect(getWatchProviderKeys(many)).toEqual([
      "amc_plus",
      "crunchyroll",
      "disney_plus",
      "hulu",
      "netflix",
      "paramount_plus",
      "peacock",
      "starz",
    ]);
  });

  it("reads the slim camelCase projection and ignores other regions", () => {
    expect(
      resolveWatchProviders({
        networks: [{ id: 2739, name: "Disney+" }],
        watchProviders: {
          results: {
            CA: { flatrate: [{ providerName: "Netflix", logoUrl: "https://cdn.test/netflix.png" }] },
            US: {
              flatrate: [{ providerName: "Disney+", logoUrl: "https://cdn.test/disney.png", displayPriority: 5 }],
            },
          },
        },
      }),
    ).toEqual([
      {
        key: "disney_plus",
        name: "Disney+",
        logoUrl: "https://cdn.test/disney.png",
        source: "original",
        tmdbProviderId: null,
        displayPriority: 5,
      },
    ]);
  });

  it("prefers the base plan's logo and id over an ad tier's", () => {
    const [netflix] = resolveWatchProviders(
      us({
        flatrate: [
          { provider_id: 1796, provider_name: "Netflix Standard with Ads", logo_path: "/ads.jpg", display_priority: 151 },
          { provider_id: 8, provider_name: "Netflix", logo_path: "/base.jpg", display_priority: 2 },
        ],
      }),
    );
    expect(netflix).toMatchObject({ key: "netflix", tmdbProviderId: 8, logoUrl: "https://image.tmdb.org/t/p/w92/base.jpg", displayPriority: 2 });
  });
});

describe("watch provider helpers", () => {
  it.each([
    ["netflix", "netflix"],
    ["Netflix", "netflix"],
    [" NETFLIX ", "netflix"],
    ["apple_tv", "apple_tv"],
    ["Apple TV", "apple_tv"],
    ["Apple TV+", "apple_tv"],
    ["Apple TV Plus", "apple_tv"],
    ["disney_plus", "disney_plus"],
    ["Disney Plus", "disney_plus"],
    ["prime_video", "prime_video"],
    ["Amazon Prime Video", "prime_video"],
    ["prime", "prime_video"],
    ["HBO Max", "max"],
    ["max", "max"],
    ["Paramount+", "paramount_plus"],
    ["Peacock Premium", "peacock"],
    ["unknown", null],
    ["", null],
    ["NBC", null],
    [42, null],
  ])("normalizeWatchProviderToken(%j) → %j", (token, expected) => {
    expect(normalizeWatchProviderToken(token)).toBe(expected);
  });

  it.each([
    [[{ id: 49, name: "HBO" }], "max"],
    [[{ id: 2552, name: "Apple TV" }], "apple_tv"],
    [[{ id: 6, name: "NBC" }], null],
    [[{ id: 2076, name: "Paramount Network" }], null],
    [[{ id: 88, name: "FX" }, { id: 453, name: "Hulu" }], "hulu"],
    [[{ name: "Amazon Freevee" }], "prime_video"],
    [[{ name: "Showtime" }], "paramount_plus"],
    [[], null],
    [null, null],
  ])("getOriginalWatchServiceKey(%j) → %j", (networks, expected) => {
    expect(getOriginalWatchServiceKey(networks as any)).toBe(expected);
  });

  it("picks the first named provider as the label source", () => {
    expect(getPrimaryWatchProvider([{ name: " " }, { name: "Apple TV+", logoUrl: "x" }, { name: "Netflix" }])).toEqual({
      name: "Apple TV+",
      logoUrl: "x",
    });
    expect(getPrimaryWatchProvider([])).toBeNull();
    expect(getPrimaryWatchProvider(null)).toBeNull();
  });

  it("round-trips the arrival snapshot marker and flags stale snapshots", () => {
    const encoded = encodeWatchProviderSnapshot(["netflix", "peacock"]);
    expect(decodeWatchProviderSnapshot(encoded)).toEqual({ keys: ["netflix", "peacock"], isCurrentVersion: true });
    expect(decodeWatchProviderSnapshot(["netflix"])).toEqual({ keys: ["netflix"], isCurrentVersion: false });
    expect(decodeWatchProviderSnapshot(["netflix", "resolver:v1"])).toEqual({ keys: ["netflix"], isCurrentVersion: false });
    expect(decodeWatchProviderSnapshot(null)).toEqual({ keys: [], isCurrentVersion: false });
    expect(encodeWatchProviderSnapshot(encoded)).toEqual(encoded);
  });

  it("keeps the registry consistent: unique keys, unique TMDB ids, discover ids per service", () => {
    const keys = WATCH_SERVICES.map((service) => service.key);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = WATCH_SERVICES.flatMap((service) => service.tmdbProviderIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getWatchServiceTmdbProviderIds("apple_tv")).toEqual([350, 2243]);
    expect(getWatchServiceTmdbProviderIds("nope")).toEqual([]);
  });
});
