import {
  hasCurrentHomeSignal,
  hasExplicitCurrentHomeSignal,
  type HomeCurrentSignalItem,
} from "./homeCurrentSignal";

export type HomeSection =
  | { kind: "continue-watching" }
  | { kind: "tonight" }
  | { kind: "ask" }
  | { kind: "for-you" }
  | { kind: "taste-rails" }
  | { kind: "heat" }
  | { kind: "fresh" }
  | { kind: "critics" }
  | { kind: "quick" }
  | { kind: "contact-sync" }
  | { kind: "friends" };

export type HomeSectionKind = HomeSection["kind"];
export type DiscoveryHomeSectionKind = Extract<
  HomeSectionKind,
  "heat" | "fresh" | "critics" | "quick"
>;
export type NumberedHomeSectionKind = Extract<
  HomeSectionKind,
  | "continue-watching"
  | "tonight"
  | "for-you"
  | "heat"
  | "fresh"
  | "critics"
  | "quick"
  | "friends"
>;

export type HomeDiscoverySectionSignal = {
  itemCount: number;
  currentCount?: number;
  explicitCurrentCount?: number;
};

export type HomeSocialSectionSignal = {
  feedItemCount?: number;
  peopleSuggestionCount?: number;
  hasSyncedContacts?: boolean;
  contactStatusKnown?: boolean;
};

export type HomeScheduleSectionSignal = {
  known?: boolean;
  tonightCount?: number;
  upcomingCount?: number;
};

export type HomeSectionPlanOptions = {
  hasProfile: boolean;
  showContactSyncNudge: boolean;
  contactNudgeDismissed: boolean | null;
  sectionSignals?: Partial<Record<DiscoveryHomeSectionKind, HomeDiscoverySectionSignal>>;
  socialSignal?: HomeSocialSectionSignal;
  scheduleSignal?: HomeScheduleSectionSignal;
  now?: Date | string | number;
  /**
   * Optional epoch seed that adds a small deterministic jitter to discovery
   * scores, so near-tied rails trade places across visits instead of
   * freezing into one order. Omit for fully signal-driven ranking.
   */
  rotationSeed?: number;
};

const DEFAULT_DISCOVERY_ORDER: DiscoveryHomeSectionKind[] = [
  "heat",
  "fresh",
  "critics",
  "quick",
];
const NUMBERED_HOME_SECTION_KINDS = new Set<HomeSectionKind>([
  "continue-watching",
  "tonight",
  "for-you",
  "heat",
  "fresh",
  "critics",
  "quick",
  "friends",
]);
const SIGNED_IN_DISCOVERY_PREVIEW_COUNT = 1;
const SIGNED_IN_DISCOVERY_TOTAL_COUNT = 4;
// Jitter stays below the smallest meaningful signal step (currentCount * 7)
// so it only reorders rails whose scores are effectively tied.
const DISCOVERY_ROTATION_JITTER_RANGE = 6;

const DISCOVERY_BASE_SCORE: Record<DiscoveryHomeSectionKind, number> = {
  heat: 70,
  fresh: 68,
  critics: 56,
  quick: 48,
};

export function getHomeDiscoverySectionSignal<T extends HomeCurrentSignalItem>(
  items: T[],
  now?: HomeSectionPlanOptions["now"],
): HomeDiscoverySectionSignal {
  return {
    itemCount: items.length,
    currentCount: items.filter((item) => hasCurrentHomeSignal(item, { now })).length,
    explicitCurrentCount: items.filter((item) =>
      hasExplicitCurrentHomeSignal(item, { now }),
    ).length,
  };
}

function toDate(value: HomeSectionPlanOptions["now"]) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  return new Date();
}

function getDaypartBoost(
  kind: DiscoveryHomeSectionKind,
  now: HomeSectionPlanOptions["now"],
) {
  if (now === undefined) return 0;
  const date = toDate(now);
  const hour = Number.isFinite(date.getTime()) ? date.getHours() : new Date().getHours();

  if (kind === "quick" && (hour >= 21 || hour < 5)) return 18;
  if (kind === "heat" && hour >= 17 && hour < 23) return 9;
  if (kind === "fresh" && hour >= 6 && hour < 14) return 6;
  return 0;
}

function getDiscoveryRotationJitter(
  kind: DiscoveryHomeSectionKind,
  rotationSeed: number | undefined,
) {
  if (rotationSeed === undefined) return 0;
  // FNV-1a over seed + kind, reduced to a small deterministic offset.
  let hash = 0x811c9dc5;
  const input = `${rotationSeed}|${kind}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % DISCOVERY_ROTATION_JITTER_RANGE;
}

function getDiscoverySectionScore(
  kind: DiscoveryHomeSectionKind,
  signals: Partial<Record<DiscoveryHomeSectionKind, HomeDiscoverySectionSignal>>,
  now: HomeSectionPlanOptions["now"],
  rotationSeed?: number,
) {
  const signal = signals[kind];
  if (signal && signal.itemCount <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const itemCount = signal?.itemCount ?? 0;
  const currentCount = signal?.currentCount ?? 0;
  const explicitCurrentCount = signal?.explicitCurrentCount ?? 0;

  return (
    DISCOVERY_BASE_SCORE[kind] +
    Math.min(itemCount, 10) * 3 +
    currentCount * 7 +
    explicitCurrentCount * 5 +
    getDaypartBoost(kind, now) +
    getDiscoveryRotationJitter(kind, rotationSeed)
  );
}

export function getRankedHomeDiscoverySections({
  sectionSignals = {},
  now,
  rotationSeed,
}: Pick<HomeSectionPlanOptions, "sectionSignals" | "now" | "rotationSeed"> = {}) {
  return DEFAULT_DISCOVERY_ORDER
    .map((kind, index) => ({
      kind,
      index,
      score: getDiscoverySectionScore(kind, sectionSignals, now, rotationSeed),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      return left.index - right.index;
    })
    .map(({ kind }) => kind);
}

export function isNumberedHomeSectionKind(
  kind: HomeSectionKind,
): kind is NumberedHomeSectionKind {
  return NUMBERED_HOME_SECTION_KINDS.has(kind);
}

export function getHomeSectionTestID(kind: HomeSectionKind) {
  return `home-section-${kind}`;
}

export function getHomeSectionDisplayIndexes(
  sections: HomeSection[],
  visibleKinds?: ReadonlySet<HomeSectionKind>,
) {
  const indexes = new Map<NumberedHomeSectionKind, number>();
  let nextIndex = 1;

  sections.forEach((section) => {
    if (!isNumberedHomeSectionKind(section.kind)) return;
    if (visibleKinds && !visibleKinds.has(section.kind)) return;
    indexes.set(section.kind, nextIndex);
    nextIndex += 1;
  });

  return indexes;
}

/**
 * Keep the on-screen section order stable while data loads. The plan
 * re-ranks discovery rails as their signals arrive, which is right across
 * visits but jarring mid-session: rails the user is already looking at
 * would trade places. Given the previously rendered order, this keeps the
 * relative order of every surviving section, slots newly appearing kinds in
 * at their planned position (before the nearest surviving section that
 * follows them in the plan), and drops kinds no longer planned.
 */
export function reconcileHomeSectionOrder(
  previousKinds: readonly HomeSectionKind[] | null | undefined,
  planned: HomeSection[],
): HomeSection[] {
  if (!previousKinds || previousKinds.length === 0) return planned;

  const sectionByKind = new Map(
    planned.map((section) => [section.kind, section]),
  );
  const surviving = previousKinds.filter((kind) => sectionByKind.has(kind));
  if (surviving.length === 0) return planned;

  const survivingSet = new Set(surviving);
  const orderedKinds: HomeSectionKind[] = [...surviving];
  const plannedKinds = planned.map((section) => section.kind);
  plannedKinds.forEach((kind, plannedIndex) => {
    if (survivingSet.has(kind)) return;
    const anchor = plannedKinds
      .slice(plannedIndex + 1)
      .find((candidate) => survivingSet.has(candidate));
    const anchorIndex = anchor ? orderedKinds.indexOf(anchor) : -1;
    if (anchorIndex === -1) {
      orderedKinds.push(kind);
    } else {
      orderedKinds.splice(anchorIndex, 0, kind);
    }
  });

  return orderedKinds
    .map((kind) => sectionByKind.get(kind))
    .filter((section): section is HomeSection => Boolean(section));
}

export function getHomeSectionPlan({
  hasProfile,
  showContactSyncNudge,
  contactNudgeDismissed,
  sectionSignals,
  socialSignal,
  scheduleSignal,
  now,
  rotationSeed,
}: HomeSectionPlanOptions): HomeSection[] {
  const discoverySections = getRankedHomeDiscoverySections({
    sectionSignals,
    now,
    rotationSeed,
  }).map((kind) => ({ kind }));
  const signedInDiscoverySections = hasProfile
    ? discoverySections.slice(0, SIGNED_IN_DISCOVERY_TOTAL_COUNT)
    : discoverySections;
  const openingDiscoverySections = hasProfile
    ? signedInDiscoverySections.slice(0, SIGNED_IN_DISCOVERY_PREVIEW_COUNT)
    : discoverySections;
  const remainingDiscoverySections = hasProfile
    ? signedInDiscoverySections.slice(SIGNED_IN_DISCOVERY_PREVIEW_COUNT)
    : [];
  const showContactSync =
    hasProfile && showContactSyncNudge && contactNudgeDismissed === false;
  const socialHasActivity = (socialSignal?.feedItemCount ?? 0) > 0;
  const socialHasPeople = (socialSignal?.peopleSuggestionCount ?? 0) > 0;
  const contactStatusKnown = socialSignal?.contactStatusKnown ?? false;
  const shouldInviteFromFriends =
    contactStatusKnown &&
    socialSignal?.hasSyncedContacts === false &&
    contactNudgeDismissed === true;
  const showFriends =
    hasProfile &&
    (socialHasActivity || socialHasPeople || shouldInviteFromFriends);
  const promoteFriends = showFriends && (socialHasActivity || socialHasPeople);
  const scheduleKnown = scheduleSignal?.known === true;
  const scheduleTonightCount = scheduleSignal?.tonightCount ?? 0;
  const scheduleUpcomingCount = scheduleSignal?.upcomingCount ?? 0;
  const scheduleHasTonight = scheduleTonightCount > 0;
  const showSchedule =
    hasProfile &&
    (!scheduleKnown || scheduleHasTonight || scheduleUpcomingCount > 0);
  const showUrgentSchedule = showSchedule && (!scheduleKnown || scheduleHasTonight);
  const showUpcomingSchedule = showSchedule && scheduleKnown && !scheduleHasTonight;

  return [
    ...(hasProfile
      ? [
          { kind: "continue-watching" as const },
          ...(showUrgentSchedule ? [{ kind: "tonight" as const }] : []),
          ...(showUpcomingSchedule ? [{ kind: "tonight" as const }] : []),
          // Static Ask Plotlist entry card — deliberately unconditional and
          // data-free so it's safe inside the warm-start cache.
          { kind: "ask" as const },
          ...openingDiscoverySections,
          ...(promoteFriends ? [{ kind: "friends" as const }] : []),
          { kind: "for-you" as const },
          // Recs v2 facet rails ("Because you're into X"); the section
          // renders nothing until the user has a taste profile.
          { kind: "taste-rails" as const },
        ]
      : []),
    ...(hasProfile ? remainingDiscoverySections : openingDiscoverySections),
    ...(showContactSync ? [{ kind: "contact-sync" as const }] : []),
    ...(showFriends && !promoteFriends ? [{ kind: "friends" as const }] : []),
  ];
}
