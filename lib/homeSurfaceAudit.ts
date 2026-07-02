import {
  hasChartOnlyHomeSignal,
  hasCurrentHomeSignal,
  hasExplicitCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
  isGenericHomeSignal,
} from "./homeCurrentSignal";
import { getHomeRailIdentityKeys, getHomeRailTitleKey } from "./homeRailIdentity";
import type { HomeRailIdentityItem } from "./homeRailIdentity";

const DEFAULT_MIN_ACTIVE_SECTIONS = 6;
const DEFAULT_MIN_ITEMS_PER_SECTION = 3;
const DEFAULT_MAX_TITLE_APPEARANCES = 2;
const DEFAULT_MIN_CURRENT_SIGNAL_ITEMS = 5;
const DEFAULT_MIN_EXPLICIT_CURRENT_SIGNAL_ITEMS = 3;
const DEFAULT_MIN_CURRENT_SIGNAL_ITEMS_PER_SECTION = 1;
const DEFAULT_MIN_PROVIDER_ROOMS = 4;
const DEFAULT_MAX_PROVIDER_ROOM_TITLE_APPEARANCES = 2;
const DEFAULT_RECENT_YEAR_WINDOW = 2;
const DEFAULT_MAX_SIGNAL_PLATFORM_SHARE = 0.62;

export const CORE_HOME_SURFACE_SECTION_KEYS = [
  "hero",
  "for-you",
  "heat",
  "fresh",
  "quality",
  "quick",
] as const;

export type HomeSurfaceAuditItem = HomeRailIdentityItem & {
  posterUrl?: string | null;
  backdropUrl?: string | null;
  year?: number | null;
  signal?: string | null;
  editorialTier?: "verified_current" | string | null;
  homeScore?: number | null;
};

export type HomeSurfaceAuditSection = {
  key: string;
  label: string;
  items: HomeSurfaceAuditItem[];
  minItems?: number;
  minCurrentItems?: number;
};

export type HomeSurfaceAuditEdit = {
  key: string;
  title: string;
  items: HomeSurfaceAuditItem[];
};

export type HomeSurfaceAuditProviderRoom = {
  key: string;
  label: string;
  items: HomeSurfaceAuditItem[];
};

export type HomeSurfaceAuditInputs = {
  hero: HomeSurfaceAuditItem[];
  curated?: HomeSurfaceAuditEdit[];
  forYou?: HomeSurfaceAuditItem[];
  heat?: HomeSurfaceAuditItem[];
  fresh?: HomeSurfaceAuditItem[];
  critics?: HomeSurfaceAuditItem[];
  quick?: HomeSurfaceAuditItem[];
  rooms?: HomeSurfaceAuditProviderRoom[];
};

export type HomeSurfaceAuditIssue =
  | "too_few_sections"
  | "empty_section"
  | "underfilled_section"
  | "repeated_titles"
  | "duplicate_leads"
  | "missing_artwork"
  | "too_few_current_items"
  | "too_few_explicit_current_items"
  | "non_release_fresh_item"
  | "chart_only_personal_item"
  | "missing_required_section"
  | "too_few_provider_rooms"
  | "too_few_signal_platforms"
  | "signal_platform_overrepresented"
  | "too_few_demand_chart_titles"
  | "provider_room_repeated_titles"
  | "stale_section";

export type HomeSurfaceAuditFinding = {
  issue: HomeSurfaceAuditIssue;
  sectionKey?: string;
  title?: string;
  relatedTitles?: string[];
  detail: string;
};

export type HomeSurfaceAuditComposition = {
  sectionCount: number;
  activeSectionCount: number;
  itemCount: number;
  uniqueTitleCount: number;
  repeatedTitleCount: number;
  leadTitleCount: number;
  duplicateLeadCount: number;
  missingArtworkCount: number;
  currentSignalCount: number;
  explicitCurrentSignalCount: number;
  currentSignalCountBySection: Record<string, number>;
  explicitCurrentSignalCountBySection: Record<string, number>;
  providerRoomCount: number;
  providerRoomRepeatedTitleCount: number;
  signalPlatformCount?: number;
  signalPlatformCounts?: Record<string, number>;
  demandChartTitleCount?: number;
  missingDemandChartTitles?: string[];
  underfilledSectionKeys: string[];
  staleSectionKeys: string[];
};

export type HomeSurfaceAuditReport = {
  healthy: boolean;
  checkedAt: number;
  composition: HomeSurfaceAuditComposition;
  findings: HomeSurfaceAuditFinding[];
};

export type HomeSurfaceAuditOptions = {
  minActiveSections?: number;
  minItemsPerSection?: number;
  maxTitleAppearances?: number;
  minCurrentSignalItems?: number;
  minExplicitCurrentSignalItems?: number;
  minCurrentSignalItemsPerSection?: number;
  minProviderRooms?: number;
  maxProviderRoomTitleAppearances?: number;
  minSignalPlatformCount?: number;
  maxSignalPlatformShare?: number;
  demandChartTitles?: readonly string[];
  minDemandChartTitleCount?: number;
  recentYearWindow?: number;
  requiredActiveSectionKeys?: string[];
};

type TitleStat = {
  title: string;
  count: number;
};

function getTitleKey(item: HomeSurfaceAuditItem) {
  return getHomeRailTitleKey(item.title);
}

function getTitleKeyFromTitle(title: string) {
  return getHomeRailTitleKey(title);
}

function hasArtwork(item: HomeSurfaceAuditItem) {
  return Boolean(item.posterUrl?.trim() || item.backdropUrl?.trim());
}

function isReleaseWindowSection(section: HomeSurfaceAuditSection) {
  const text = `${section.key} ${section.label}`;
  return /\b(fresh|new|back|premieres?|returns?|returning|airing|today|tonight)\b/i.test(
    text,
  );
}

function hasNonReleaseFreshSignal(item: HomeSurfaceAuditItem) {
  const signal = item.signal?.trim();
  return Boolean(
    signal &&
      !isGenericHomeSignal(signal) &&
      !hasReleaseWindowHomeSignal(item),
  );
}

function isPersonalSection(section: HomeSurfaceAuditSection) {
  const text = `${section.key} ${section.label}`;
  return /\b(personal|for-you|for you|your shelf|shelf)\b/i.test(text);
}

function hasProvidedItems(items: HomeSurfaceAuditItem[] | undefined) {
  return Array.isArray(items);
}

function getUniqueItemTitles(items: HomeSurfaceAuditItem[]) {
  const seenTitleKeys = new Set<string>();
  const titles: string[] = [];

  for (const item of items) {
    const title = item.title.trim();
    if (!title) continue;
    const key = getTitleKeyFromTitle(title) ?? title.toLowerCase();
    if (seenTitleKeys.has(key)) continue;
    seenTitleKeys.add(key);
    titles.push(title);
  }

  return titles;
}

function getSectionRelatedTitles(section: HomeSurfaceAuditSection | undefined) {
  return getUniqueItemTitles(section?.items ?? []);
}

function getSectionStaleTitles(
  section: HomeSurfaceAuditSection | undefined,
  checkedAt: number,
  recentYearWindow: number,
) {
  if (!section) return [];
  return getUniqueItemTitles(
    section.items.filter(
      (item) =>
        !hasCurrentHomeSignal(item, {
          now: checkedAt,
          recentYearWindow,
        }),
    ),
  );
}

function getMissingArtworkTitles(sections: HomeSurfaceAuditSection[]) {
  return getUniqueItemTitles(
    sections.flatMap((section) =>
      section.items.filter((item) => !hasArtwork(item)),
    ),
  );
}

const SIGNAL_PLATFORM_PATTERNS = [
  { key: "netflix", label: "Netflix", pattern: /\bnetflix\b/i },
  { key: "apple_tv", label: "Apple TV+", pattern: /\bapple\s*tv\+?\b/i },
  { key: "max", label: "Max", pattern: /\b(?:hbo|hbo\s*max|max)\b/i },
  { key: "prime_video", label: "Prime Video", pattern: /\b(?:prime|prime\s*video|amazon)\b/i },
  { key: "disney_plus", label: "Disney+", pattern: /\bdisney\+?\b/i },
  { key: "hulu", label: "Hulu", pattern: /\bhulu\b/i },
  { key: "peacock", label: "Peacock", pattern: /\bpeacock\b/i },
  { key: "paramount_plus", label: "Paramount+", pattern: /\bparamount\+?\b/i },
  { key: "adult_swim", label: "Adult Swim", pattern: /\badult\s+swim\b/i },
  { key: "mgm_plus", label: "MGM+", pattern: /\bmgm\+?\b/i },
] as const;

function getSignalPlatform(text: string) {
  return SIGNAL_PLATFORM_PATTERNS.find((platform) =>
    platform.pattern.test(text),
  );
}

function getItemSignalPlatform(
  section: HomeSurfaceAuditSection,
  item: HomeSurfaceAuditItem,
) {
  if (section.key.startsWith("room:")) {
    return getSignalPlatform(section.label) ?? getSignalPlatform(item.signal ?? "");
  }
  return getSignalPlatform(`${item.signal ?? ""} ${section.label}`);
}

function createOptionalSection(
  section: HomeSurfaceAuditSection,
  provided: boolean,
) {
  return provided ? [section] : [];
}

export function buildHomeSurfaceAuditSections({
  hero,
  curated = [],
  forYou,
  heat,
  fresh,
  critics,
  quick,
  rooms = [],
}: HomeSurfaceAuditInputs): HomeSurfaceAuditSection[] {
  return [
    {
      key: "hero",
      label: "Hero",
      items: hero,
      minItems: 3,
      minCurrentItems: 2,
    },
    ...curated.map((edit) => ({
      key: `curated:${edit.key}`,
      label: edit.title,
      items: edit.items,
      minItems: 3,
      minCurrentItems: 1,
    })),
    ...createOptionalSection(
      {
        key: "for-you",
        label: "For you",
        items: forYou ?? [],
        minItems: 3,
        minCurrentItems: 1,
      },
      hasProvidedItems(forYou),
    ),
    ...createOptionalSection(
      {
        key: "heat",
        label: "Trending",
        items: heat ?? [],
        minItems: 3,
        minCurrentItems: 1,
      },
      hasProvidedItems(heat),
    ),
    ...createOptionalSection(
      {
        key: "fresh",
        label: "New",
        items: fresh ?? [],
        minItems: 4,
        minCurrentItems: 2,
      },
      hasProvidedItems(fresh),
    ),
    ...createOptionalSection(
      {
        key: "quality",
        label: "Acclaimed",
        items: critics ?? [],
        minItems: 4,
        minCurrentItems: 1,
      },
      hasProvidedItems(critics),
    ),
    ...createOptionalSection(
      {
        key: "quick",
        label: "Quick",
        items: quick ?? [],
        minItems: 4,
        minCurrentItems: 1,
      },
      hasProvidedItems(quick),
    ),
    ...rooms.map((room) => ({
      key: `room:${room.key}`,
      label: `${room.label} room`,
      items: room.items,
      minItems: 3,
      minCurrentItems: 1,
    })),
  ];
}

export function auditHomeSurfaceRender(
  input: HomeSurfaceAuditInputs,
  checkedAt = Date.now(),
  options: HomeSurfaceAuditOptions = {},
): HomeSurfaceAuditReport {
  const sections = buildHomeSurfaceAuditSections(input);
  const minProviderRooms =
    options.minProviderRooms ?? (Array.isArray(input.rooms) ? DEFAULT_MIN_PROVIDER_ROOMS : 0);
  const requiredActiveSectionKeys =
    options.requiredActiveSectionKeys ??
    CORE_HOME_SURFACE_SECTION_KEYS.filter((key) =>
      sections.some((section) => section.key === key),
    );

  return auditHomeSurface(sections, checkedAt, {
    ...options,
    minProviderRooms,
    minActiveSections:
      options.minActiveSections ?? Math.min(DEFAULT_MIN_ACTIVE_SECTIONS, sections.length),
    requiredActiveSectionKeys,
  });
}

export function getHomeSurfaceAuditComposition(
  sections: HomeSurfaceAuditSection[],
  checkedAt = Date.now(),
  options: HomeSurfaceAuditOptions = {},
): HomeSurfaceAuditComposition {
  const minItemsPerSection = options.minItemsPerSection ?? DEFAULT_MIN_ITEMS_PER_SECTION;
  const maxTitleAppearances = options.maxTitleAppearances ?? DEFAULT_MAX_TITLE_APPEARANCES;
  const maxProviderRoomTitleAppearances =
    options.maxProviderRoomTitleAppearances ??
    DEFAULT_MAX_PROVIDER_ROOM_TITLE_APPEARANCES;
  const minCurrentSignalItemsPerSection =
    options.minCurrentSignalItemsPerSection ?? DEFAULT_MIN_CURRENT_SIGNAL_ITEMS_PER_SECTION;
  const recentYearWindow = options.recentYearWindow ?? DEFAULT_RECENT_YEAR_WINDOW;
  const titleStats = new Map<string, TitleStat>();
  const leadStats = new Map<string, TitleStat>();
  const providerRoomTitleStats = new Map<string, TitleStat>();
  const signalPlatformCounts = new Map<string, TitleStat>();
  const demandChartTitleByKey = new Map(
    (options.demandChartTitles ?? []).flatMap((title) => {
      const key = getTitleKeyFromTitle(title);
      return key ? [[key, title] as const] : [];
    }),
  );
  const seenDemandChartTitleKeys = new Set<string>();
  const underfilledSectionKeys: string[] = [];
  const staleSectionKeys: string[] = [];
  const currentSignalCountBySection: Record<string, number> = {};
  const explicitCurrentSignalCountBySection: Record<string, number> = {};
  let activeSectionCount = 0;
  let itemCount = 0;
  let missingArtworkCount = 0;
  let currentSignalCount = 0;
  let explicitCurrentSignalCount = 0;
  let providerRoomCount = 0;

  for (const section of sections) {
    const minItems = section.minItems ?? minItemsPerSection;
    const minCurrentItems =
      section.minCurrentItems ?? minCurrentSignalItemsPerSection;
    const sectionItems = section.items ?? [];
    if (section.key.startsWith("room:") && sectionItems.length > 0) {
      providerRoomCount += 1;
    }
    let sectionCurrentSignalCount = 0;
    let sectionExplicitCurrentSignalCount = 0;
    if (sectionItems.length > 0) activeSectionCount += 1;
    if (sectionItems.length < minItems) underfilledSectionKeys.push(section.key);

    const lead = sectionItems[0];
    const leadKey = lead ? getTitleKey(lead) : null;
    if (leadKey) {
      const existing = leadStats.get(leadKey);
      leadStats.set(leadKey, {
        title: existing?.title ?? lead.title,
        count: (existing?.count ?? 0) + 1,
      });
    }

    for (const item of sectionItems) {
      itemCount += 1;
      if (!hasArtwork(item)) missingArtworkCount += 1;
      if (
        hasCurrentHomeSignal(item, {
          now: checkedAt,
          recentYearWindow,
        })
      ) {
        currentSignalCount += 1;
        sectionCurrentSignalCount += 1;
      }
      if (hasExplicitCurrentHomeSignal(item, { now: checkedAt })) {
        explicitCurrentSignalCount += 1;
        sectionExplicitCurrentSignalCount += 1;
      }
      const signalPlatform = getItemSignalPlatform(section, item);
      if (signalPlatform) {
        const existingPlatform = signalPlatformCounts.get(signalPlatform.key);
        signalPlatformCounts.set(signalPlatform.key, {
          title: existingPlatform?.title ?? signalPlatform.label,
          count: (existingPlatform?.count ?? 0) + 1,
        });
      }

      const titleKey = getTitleKey(item);
      if (!titleKey) continue;
      if (demandChartTitleByKey.has(titleKey)) {
        seenDemandChartTitleKeys.add(titleKey);
      }
      const existing = titleStats.get(titleKey);
      titleStats.set(titleKey, {
        title: existing?.title ?? item.title,
        count: (existing?.count ?? 0) + 1,
      });
      if (section.key.startsWith("room:")) {
        const existingProviderRoom = providerRoomTitleStats.get(titleKey);
        providerRoomTitleStats.set(titleKey, {
          title: existingProviderRoom?.title ?? item.title,
          count: (existingProviderRoom?.count ?? 0) + 1,
        });
      }
    }
    currentSignalCountBySection[section.key] = sectionCurrentSignalCount;
    explicitCurrentSignalCountBySection[section.key] =
      sectionExplicitCurrentSignalCount;
    if (sectionItems.length > 0 && sectionCurrentSignalCount < minCurrentItems) {
      staleSectionKeys.push(section.key);
    }
  }

  const repeatedTitleCount = [...titleStats.values()].filter(
    (stat) => stat.count > maxTitleAppearances,
  ).length;
  const providerRoomRepeatedTitleCount = [...providerRoomTitleStats.values()].filter(
    (stat) => stat.count > maxProviderRoomTitleAppearances,
  ).length;
  const duplicateLeadCount = [...leadStats.values()].filter((stat) => stat.count > 1).length;

  return {
    sectionCount: sections.length,
    activeSectionCount,
    itemCount,
    uniqueTitleCount: titleStats.size,
    repeatedTitleCount,
    leadTitleCount: leadStats.size,
    duplicateLeadCount,
    missingArtworkCount,
    currentSignalCount,
    explicitCurrentSignalCount,
    currentSignalCountBySection,
    explicitCurrentSignalCountBySection,
    providerRoomCount,
    providerRoomRepeatedTitleCount,
    signalPlatformCount: signalPlatformCounts.size,
    signalPlatformCounts: Object.fromEntries(
      [...signalPlatformCounts.entries()].map(([key, stat]) => [
        key,
        stat.count,
      ]),
    ),
    demandChartTitleCount: seenDemandChartTitleKeys.size,
    missingDemandChartTitles: [...demandChartTitleByKey.entries()]
      .filter(([key]) => !seenDemandChartTitleKeys.has(key))
      .map(([, title]) => title),
    underfilledSectionKeys,
    staleSectionKeys,
  };
}

export function auditHomeSurface(
  sections: HomeSurfaceAuditSection[],
  checkedAt = Date.now(),
  options: HomeSurfaceAuditOptions = {},
): HomeSurfaceAuditReport {
  const minActiveSections = options.minActiveSections ?? DEFAULT_MIN_ACTIVE_SECTIONS;
  const minItemsPerSection = options.minItemsPerSection ?? DEFAULT_MIN_ITEMS_PER_SECTION;
  const maxTitleAppearances = options.maxTitleAppearances ?? DEFAULT_MAX_TITLE_APPEARANCES;
  const maxProviderRoomTitleAppearances =
    options.maxProviderRoomTitleAppearances ??
    DEFAULT_MAX_PROVIDER_ROOM_TITLE_APPEARANCES;
  const minCurrentSignalItems =
    options.minCurrentSignalItems ?? DEFAULT_MIN_CURRENT_SIGNAL_ITEMS;
  const minExplicitCurrentSignalItems =
    options.minExplicitCurrentSignalItems ??
    DEFAULT_MIN_EXPLICIT_CURRENT_SIGNAL_ITEMS;
  const minProviderRooms = options.minProviderRooms ?? 0;
  const minSignalPlatformCount = options.minSignalPlatformCount ?? 0;
  const maxSignalPlatformShare =
    options.maxSignalPlatformShare ?? DEFAULT_MAX_SIGNAL_PLATFORM_SHARE;
  const minDemandChartTitleCount = options.minDemandChartTitleCount ?? 0;
  const recentYearWindow = options.recentYearWindow ?? DEFAULT_RECENT_YEAR_WINDOW;
  const composition = getHomeSurfaceAuditComposition(sections, checkedAt, options);
  const findings: HomeSurfaceAuditFinding[] = [];

  if (composition.activeSectionCount < minActiveSections) {
    findings.push({
      issue: "too_few_sections",
      detail: `Expected at least ${minActiveSections} active homepage sections`,
    });
  }

  if (composition.providerRoomCount < minProviderRooms) {
    findings.push({
      issue: "too_few_provider_rooms",
      detail: `Expected at least ${minProviderRooms} active streaming rooms`,
    });
  }

  if (
    minSignalPlatformCount > 0 &&
    (composition.signalPlatformCount ?? 0) < minSignalPlatformCount
  ) {
    findings.push({
      issue: "too_few_signal_platforms",
      detail: `Homepage current signals cover ${composition.signalPlatformCount ?? 0} platform(s); expected at least ${minSignalPlatformCount}`,
    });
  }

  for (const requiredKey of options.requiredActiveSectionKeys ?? []) {
    const section = sections.find((candidate) => candidate.key === requiredKey);
    if (section && section.items.length > 0) continue;
    findings.push({
      issue: "missing_required_section",
      sectionKey: requiredKey,
      detail: `${requiredKey} must be present with at least one show`,
    });
  }

  for (const section of sections) {
    const minItems = section.minItems ?? minItemsPerSection;
    if (section.items.length === 0) {
      findings.push({
        issue: "empty_section",
        sectionKey: section.key,
        detail: `${section.label} has no shows`,
      });
    } else if (section.items.length < minItems) {
      findings.push({
        issue: "underfilled_section",
        sectionKey: section.key,
        relatedTitles: getSectionRelatedTitles(section),
        detail: `${section.label} has ${section.items.length} shows; expected at least ${minItems}`,
      });
    }

    if (isReleaseWindowSection(section)) {
      for (const item of section.items) {
        if (!hasNonReleaseFreshSignal(item)) continue;
        findings.push({
          issue: "non_release_fresh_item",
          sectionKey: section.key,
          title: item.title,
          detail: `${section.label} includes ${item.title} with "${item.signal?.trim() ?? "demand signal"}"; fresh sections need a release, premiere, season, or date signal`,
        });
      }
    }

    if (isPersonalSection(section)) {
      for (const item of section.items) {
        if (!hasChartOnlyHomeSignal(item)) continue;
        findings.push({
          issue: "chart_only_personal_item",
          sectionKey: section.key,
          title: item.title,
          detail: `${section.label} includes ${item.title} with "${item.signal?.trim() ?? "chart demand"}"; personal shelves should use taste, quality, release, or viewing context before chart-only demand`,
        });
      }
    }
  }

  const titleCounts = new Map<string, TitleStat>();
  const leadCounts = new Map<string, TitleStat>();
  const providerRoomTitleCounts = new Map<string, TitleStat>();
  for (const section of sections) {
    const lead = section.items[0];
    const leadKey = lead ? getTitleKey(lead) : null;
    if (leadKey) {
      const existing = leadCounts.get(leadKey);
      leadCounts.set(leadKey, {
        title: existing?.title ?? lead.title,
        count: (existing?.count ?? 0) + 1,
      });
    }

    for (const item of section.items) {
      for (const identityKey of getHomeRailIdentityKeys(item)) {
        if (!identityKey.startsWith("title:")) continue;
        const existing = titleCounts.get(identityKey);
        titleCounts.set(identityKey, {
          title: existing?.title ?? item.title,
          count: (existing?.count ?? 0) + 1,
        });
        if (section.key.startsWith("room:")) {
          const existingProviderRoom = providerRoomTitleCounts.get(identityKey);
          providerRoomTitleCounts.set(identityKey, {
            title: existingProviderRoom?.title ?? item.title,
            count: (existingProviderRoom?.count ?? 0) + 1,
          });
        }
      }
    }
  }

  for (const stat of titleCounts.values()) {
    if (stat.count > maxTitleAppearances) {
      findings.push({
        issue: "repeated_titles",
        title: stat.title,
        detail: `${stat.title} appears ${stat.count} times across the homepage`,
      });
    }
  }

  for (const stat of leadCounts.values()) {
    if (stat.count > 1) {
      findings.push({
        issue: "duplicate_leads",
        title: stat.title,
        detail: `${stat.title} leads more than one homepage section`,
      });
    }
  }

  for (const stat of providerRoomTitleCounts.values()) {
    if (stat.count > maxProviderRoomTitleAppearances) {
      findings.push({
        issue: "provider_room_repeated_titles",
        title: stat.title,
        detail: `${stat.title} appears in ${stat.count} streaming rooms; expected at most ${maxProviderRoomTitleAppearances}`,
      });
    }
  }

  const signalPlatformCounts = composition.signalPlatformCounts ?? {};
  const signalPlatformTotal = Object.values(signalPlatformCounts).reduce(
    (total, count) => total + count,
    0,
  );
  if (minSignalPlatformCount > 0 && signalPlatformTotal > 0) {
    for (const [platform, count] of Object.entries(signalPlatformCounts)) {
      const share = count / signalPlatformTotal;
      if (share <= maxSignalPlatformShare) continue;
      findings.push({
        issue: "signal_platform_overrepresented",
        detail: `${platform} accounts for ${count} of ${signalPlatformTotal} platform-tagged homepage item(s)`,
      });
    }
  }

  if (
    minDemandChartTitleCount > 0 &&
    (composition.demandChartTitleCount ?? 0) < minDemandChartTitleCount
  ) {
    const missingTitles = composition.missingDemandChartTitles ?? [];
    const missingDetail =
      missingTitles.length > 0
        ? ` Missing: ${missingTitles.join(", ")}.`
        : "";
    findings.push({
      issue: "too_few_demand_chart_titles",
      relatedTitles: missingTitles,
      detail: `Homepage represents ${composition.demandChartTitleCount ?? 0} current daily-chart title(s); expected at least ${minDemandChartTitleCount}.${missingDetail}`,
    });
  }

  if (composition.missingArtworkCount > 0) {
    findings.push({
      issue: "missing_artwork",
      relatedTitles: getMissingArtworkTitles(sections),
      detail: `${composition.missingArtworkCount} homepage items are missing poster and backdrop art`,
    });
  }

  if (composition.currentSignalCount < minCurrentSignalItems) {
    findings.push({
      issue: "too_few_current_items",
      detail: `Only ${composition.currentSignalCount} homepage items have a fresh year or demand signal`,
    });
  }
  if (composition.explicitCurrentSignalCount < minExplicitCurrentSignalItems) {
    findings.push({
      issue: "too_few_explicit_current_items",
      detail: `Only ${composition.explicitCurrentSignalCount} homepage items have explicit release, airing, or demand signals`,
    });
  }

  for (const sectionKey of composition.staleSectionKeys) {
    const section = sections.find((candidate) => candidate.key === sectionKey);
    const minCurrentItems =
      section?.minCurrentItems ??
      options.minCurrentSignalItemsPerSection ??
      DEFAULT_MIN_CURRENT_SIGNAL_ITEMS_PER_SECTION;
    const currentCount = composition.currentSignalCountBySection[sectionKey] ?? 0;
    findings.push({
      issue: "stale_section",
      sectionKey,
      relatedTitles: getSectionStaleTitles(
        section,
        checkedAt,
        recentYearWindow,
      ),
      detail: `${section?.label ?? sectionKey} has ${currentCount} current item(s); expected at least ${minCurrentItems}`,
    });
  }

  return {
    healthy: findings.length === 0,
    checkedAt,
    composition,
    findings,
  };
}
