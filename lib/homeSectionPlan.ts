import {
  hasCurrentHomeSignal,
  hasExplicitCurrentHomeSignal,
  type HomeCurrentSignalItem,
} from "./homeCurrentSignal";

export type HomeSection =
  | { kind: "continue-watching" }
  | { kind: "tonight" }
  | { kind: "for-you" }
  | { kind: "heat" }
  | { kind: "fresh" }
  | { kind: "critics" }
  | { kind: "quick" }
  | { kind: "rooms" }
  | { kind: "contact-sync" }
  | { kind: "friends" };

export type HomeSectionKind = HomeSection["kind"];
export type DiscoveryHomeSectionKind = Extract<
  HomeSectionKind,
  "heat" | "fresh" | "critics" | "quick" | "rooms"
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
  | "rooms"
  | "friends"
>;

export type HomeDiscoverySectionSignal = {
  itemCount: number;
  currentCount?: number;
  explicitCurrentCount?: number;
  providerRoomCount?: number;
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
  "rooms",
];
const NUMBERED_HOME_SECTION_KINDS = new Set<HomeSectionKind>([
  "continue-watching",
  "tonight",
  "for-you",
  "heat",
  "fresh",
  "critics",
  "quick",
  "rooms",
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
  rooms: 44,
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

export function getHomeProviderRoomsSectionSignal<
  T extends HomeCurrentSignalItem,
>(rooms: Array<{ items: T[] }>, now?: HomeSectionPlanOptions["now"]): HomeDiscoverySectionSignal {
  const items = rooms.flatMap((room) => room.items);
  return {
    ...getHomeDiscoverySectionSignal(items, now),
    providerRoomCount: rooms.length,
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
  const day = Number.isFinite(date.getTime()) ? date.getDay() : new Date().getDay();
  const weekend = day === 0 || day === 6;

  if (kind === "quick" && (hour >= 21 || hour < 5)) return 18;
  if (kind === "heat" && hour >= 17 && hour < 23) return 9;
  if (kind === "fresh" && hour >= 6 && hour < 14) return 6;
  if (kind === "rooms" && weekend) return 8;
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
  if (signal && signal.itemCount <= 0 && (signal.providerRoomCount ?? 0) <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const itemCount = signal?.itemCount ?? 0;
  const currentCount = signal?.currentCount ?? 0;
  const explicitCurrentCount = signal?.explicitCurrentCount ?? 0;
  const providerRoomCount = signal?.providerRoomCount ?? 0;

  return (
    DISCOVERY_BASE_SCORE[kind] +
    Math.min(itemCount, 10) * 3 +
    currentCount * 7 +
    explicitCurrentCount * 5 +
    providerRoomCount * 6 +
    getDaypartBoost(kind, now) +
    getDiscoveryRotationJitter(kind, rotationSeed)
  );
}

export function getRankedHomeDiscoverySections({
  sectionSignals = {},
  now,
  rotationSeed,
}: Pick<HomeSectionPlanOptions, "sectionSignals" | "now" | "rotationSeed"> = {}) {
  return [...DEFAULT_DISCOVERY_ORDER].sort((left, right) => {
    const scoreDelta =
      getDiscoverySectionScore(right, sectionSignals, now, rotationSeed) -
      getDiscoverySectionScore(left, sectionSignals, now, rotationSeed);
    if (scoreDelta !== 0) return scoreDelta;
    return DEFAULT_DISCOVERY_ORDER.indexOf(left) - DEFAULT_DISCOVERY_ORDER.indexOf(right);
  });
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
          ...openingDiscoverySections,
          ...(promoteFriends ? [{ kind: "friends" as const }] : []),
          { kind: "for-you" as const },
        ]
      : []),
    ...(hasProfile ? remainingDiscoverySections : openingDiscoverySections),
    ...(showContactSync ? [{ kind: "contact-sync" as const }] : []),
    ...(showFriends && !promoteFriends ? [{ kind: "friends" as const }] : []),
  ];
}
