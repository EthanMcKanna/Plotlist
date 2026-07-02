import {
  getHomeRailIdentityKeys,
  type HomeRailIdentityItem,
} from "./homeRailIdentity";
import {
  getHomeSignalReleaseDistanceDays,
  hasCurrentHomeSignal,
  hasExplicitCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
  isHomeReleaseWindowNear,
} from "./homeCurrentSignal";

export type HomeCuratedEditItem = {
  key: string;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  overview?: string | null;
  year?: number | null;
  genreLabel?: string | null;
  signal?: string | null;
  homeSignal?: string | null;
  editorialTier?: "verified_current" | string | null;
  rank?: number | null;
} & HomeRailIdentityItem;

export type HomeCuratedEditIcon = "flame" | "radio" | "star" | "timer";

export type HomeCuratedEdit<T extends HomeCuratedEditItem = HomeCuratedEditItem> = {
  key: string;
  kicker: string;
  title: string;
  subtitle: string;
  accent: string;
  icon: HomeCuratedEditIcon;
  items: T[];
};

export type HomeCuratedEditComposition = {
  editCount: number;
  leadTitleCount: number;
  repeatedTitleCount: number;
  underfilledEditKeys: string[];
};

export type HomeCuratedEditAuditIssue =
  | "too_few_edits"
  | "repeated_titles"
  | "duplicate_leads"
  | "underfilled_edit";

export type HomeCuratedEditAuditFinding = {
  issue: HomeCuratedEditAuditIssue;
  detail?: string;
  editKey?: string;
};

export type HomeCuratedEditAuditReport = {
  healthy: boolean;
  checkedAt: number;
  composition: HomeCuratedEditComposition;
  findings: HomeCuratedEditAuditFinding[];
};

export type HomeCuratedEditCardMetrics = {
  cardWidth: number;
  compact: boolean;
};

type HomeCuratedEditsInput<T extends HomeCuratedEditItem> = {
  heat: T[];
  fresh: T[];
  critics: T[];
  quick: T[];
  blockedKeys?: Iterable<string>;
  now?: Date | string | number;
};

const MIN_EDIT_ITEMS = 3;
const MAX_EDIT_ITEMS = 4;
const MIN_HEALTHY_EDITS = 3;
const COMPACT_CARD_BREAKPOINT = 430;
const UNDATED_LIVE_SIGNAL_PATTERN =
  /\b(airing|breakouts?|drops?|finale|launch|new|premiere|returns?|season|s\d+|today|tonight)\b/i;

function pickDistinct<T extends HomeCuratedEditItem>(
  items: T[],
  limit = MAX_EDIT_ITEMS,
  blockedKeys: Set<string> = new Set(),
) {
  const seen = new Set<string>();
  const picked: T[] = [];
  items.forEach((item) => {
    if (picked.length >= limit) return;
    const keys = getHomeRailIdentityKeys(item);
    if (keys.some((key) => blockedKeys.has(key) || seen.has(key))) return;
    keys.forEach((key) => seen.add(key));
    picked.push(item);
  });
  return picked;
}

function createEdit<T extends HomeCuratedEditItem>(
  config: Omit<HomeCuratedEdit<T>, "items">,
  items: T[],
  blockedKeys: Set<string>,
  limit = MAX_EDIT_ITEMS,
) {
  const picked = pickDistinct(items, limit, blockedKeys);
  if (picked.length < MIN_EDIT_ITEMS) return [];
  picked.flatMap(getHomeRailIdentityKeys).forEach((key) => blockedKeys.add(key));
  return [{ ...config, items: picked }];
}

function getFreshWeekScore(item: HomeCuratedEditItem, now?: Date | string | number) {
  const distance = getHomeSignalReleaseDistanceDays(item, now);
  if (distance === null) return Number.NEGATIVE_INFINITY;
  const currentDayWeight = distance <= 0 ? 1 : 0.92;
  return 100 - Math.abs(distance) * 6 * currentDayWeight + (item.rank ? 1 / item.rank : 0);
}

function sortFreshWeekCandidates<T extends HomeCuratedEditItem>(
  items: T[],
  now?: Date | string | number,
) {
  return [...items].sort((left, right) => {
    const scoreDelta = getFreshWeekScore(right, now) - getFreshWeekScore(left, now);
    if (scoreDelta !== 0) return scoreDelta;
    return (
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
      (right.rank ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function sortPrestigeCandidates<T extends HomeCuratedEditItem>(
  items: T[],
  now?: Date | string | number,
) {
  return [...items].sort((left, right) => {
    const currentDelta =
      Number(hasCurrentHomeSignal(right, { now })) -
      Number(hasCurrentHomeSignal(left, { now }));
    if (currentDelta !== 0) return currentDelta;
    return (
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
      (right.rank ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function getShortEditScore(item: HomeCuratedEditItem, now?: Date | string | number) {
  const distance = getHomeSignalReleaseDistanceDays(item, now);
  if (isHomeReleaseWindowNear(item, { now, maxPastDays: 7, maxFutureDays: 14 })) {
    return 160 - Math.abs(distance ?? 0) * 5;
  }
  if (hasReleaseWindowHomeSignal(item) && typeof distance === "number") {
    return 80 - Math.min(60, Math.abs(distance));
  }
  if (hasExplicitCurrentHomeSignal(item, { now })) return 70;
  if (hasCurrentHomeSignal(item, { now })) return 20;
  return 0;
}

function sortShortEditCandidates<T extends HomeCuratedEditItem>(
  items: T[],
  now?: Date | string | number,
) {
  return [...items].sort((left, right) => {
    const scoreDelta = getShortEditScore(right, now) - getShortEditScore(left, now);
    if (scoreDelta !== 0) return scoreDelta;
    return (
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
      (right.rank ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function hasUndatedLiveConversationSignal(
  item: HomeCuratedEditItem,
  now?: Date | string | number,
) {
  const signal = (item.signal ?? item.homeSignal)?.trim();
  return Boolean(
    signal &&
      hasReleaseWindowHomeSignal(item) &&
      getHomeSignalReleaseDistanceDays(item, now) === null &&
      UNDATED_LIVE_SIGNAL_PATTERN.test(signal),
  );
}

export function buildHomeCuratedEdits<T extends HomeCuratedEditItem>({
  heat,
  fresh,
  critics,
  quick,
  blockedKeys: initialBlockedKeys,
  now,
}: HomeCuratedEditsInput<T>): HomeCuratedEdit<T>[] {
  const currentReturns = fresh.filter(hasReleaseWindowHomeSignal);
  const rankedCurrentReturns = sortFreshWeekCandidates(currentReturns, now);
  const currentWeekReturns = sortFreshWeekCandidates(
    currentReturns.filter((item) => isHomeReleaseWindowNear(item, { now })),
    now,
  );
  const explicitConversation = heat.filter((item) =>
    hasExplicitCurrentHomeSignal(item, { now }),
  );
  const releaseConversation = explicitConversation.filter(hasReleaseWindowHomeSignal);
  const nearReleaseConversation = sortFreshWeekCandidates(
    releaseConversation.filter((item) => isHomeReleaseWindowNear(item, { now })),
    now,
  );
  const liveConversation = releaseConversation.filter(
    (item) =>
      !isHomeReleaseWindowNear(item, { now }) &&
      hasUndatedLiveConversationSignal(item, now),
  );
  const staleReleaseConversation = releaseConversation.filter(
    (item) =>
      !isHomeReleaseWindowNear(item, { now }) &&
      !hasUndatedLiveConversationSignal(item, now),
  );
  const chartConversation = explicitConversation.filter(
    (item) => !hasReleaseWindowHomeSignal(item),
  );
  const chartConversationSet = new Set(chartConversation);
  const unsignaledHeatConversation = heat.filter(
    (item) =>
      !hasReleaseWindowHomeSignal(item) &&
      !chartConversationSet.has(item),
  );
  const blockedKeys = new Set(initialBlockedKeys ?? []);
  const freshWeekEdit = createEdit(
    {
      key: "fresh-week",
      kicker: "New returns",
      title: "New",
      subtitle: "Premieres and returns.",
      accent: "#38BDF8",
      icon: "radio",
    },
    currentWeekReturns.length >= MIN_EDIT_ITEMS
      ? currentWeekReturns
      : currentReturns.length >= MIN_EDIT_ITEMS
        ? rankedCurrentReturns
        : fresh,
    blockedKeys,
  );
  const conversationEdit = createEdit(
    {
      key: "conversation",
      kicker: "In conversation",
      title: "Trending",
      subtitle: "Current breakouts.",
      accent: "#F59E0B",
      icon: "flame",
    },
    [
      ...liveConversation,
      ...nearReleaseConversation,
      ...chartConversation,
      ...unsignaledHeatConversation,
      ...staleReleaseConversation,
      ...heat,
    ],
    blockedKeys,
  );
  const edits = [
    ...conversationEdit,
    ...freshWeekEdit,
    ...createEdit(
      {
        key: "prestige",
        kicker: "Taste anchors",
        title: "Critics",
        subtitle: "Acclaimed starts.",
        accent: "#F472B6",
        icon: "star",
      },
      sortPrestigeCandidates(critics, now),
      blockedKeys,
    ),
    ...createEdit(
      {
        key: "short",
        kicker: "Short list",
        title: "Quick",
        subtitle: "Shorter episodes.",
        accent: "#A3E635",
        icon: "timer",
      },
      sortShortEditCandidates(quick, now),
      blockedKeys,
      MIN_EDIT_ITEMS,
    ),
  ];
  return edits.slice(0, 4);
}

export function getHomeCuratedEditComposition(
  edits: Array<HomeCuratedEdit<HomeCuratedEditItem>>,
): HomeCuratedEditComposition {
  const titleCounts = new Map<string, number>();
  const leadTitles = new Set<string>();
  const underfilledEditKeys: string[] = [];

  edits.forEach((edit) => {
    if (edit.items.length < MIN_EDIT_ITEMS) {
      underfilledEditKeys.push(edit.key);
    }
    const leadTitle = edit.items[0]?.title.trim().toLowerCase();
    if (leadTitle) {
      leadTitles.add(leadTitle);
    }
    edit.items.forEach((item) => {
      const title = item.title.trim().toLowerCase();
      if (!title) return;
      titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    });
  });

  return {
    editCount: edits.length,
    leadTitleCount: leadTitles.size,
    repeatedTitleCount: Array.from(titleCounts.values()).filter((count) => count > 1).length,
    underfilledEditKeys,
  };
}

export function getHomeCuratedEditPreviewKeys(
  edits: Array<HomeCuratedEdit<HomeCuratedEditItem>>,
) {
  return new Set(
    edits
      .flatMap((edit) => edit.items)
      .filter((item): item is HomeCuratedEditItem => Boolean(item))
      .flatMap(getHomeRailIdentityKeys),
  );
}

export function getHomeCuratedEditLeadPreviewKeys(
  edits: Array<HomeCuratedEdit<HomeCuratedEditItem>>,
) {
  return new Set(
    edits
      .map((edit) => edit.items[0])
      .filter((item): item is HomeCuratedEditItem => Boolean(item))
      .flatMap(getHomeRailIdentityKeys),
  );
}

export function auditHomeCuratedEdits(
  edits: Array<HomeCuratedEdit<HomeCuratedEditItem>>,
  checkedAt = Date.now(),
): HomeCuratedEditAuditReport {
  const composition = getHomeCuratedEditComposition(edits);
  const findings: HomeCuratedEditAuditFinding[] = [];

  if (composition.editCount < MIN_HEALTHY_EDITS) {
    findings.push({
      issue: "too_few_edits",
      detail: `Expected at least ${MIN_HEALTHY_EDITS} curated edits`,
    });
  }
  if (composition.repeatedTitleCount > 0) {
    findings.push({
      issue: "repeated_titles",
      detail: `${composition.repeatedTitleCount} title(s) repeat across curated edits`,
    });
  }
  if (composition.leadTitleCount < composition.editCount) {
    findings.push({
      issue: "duplicate_leads",
      detail: "Curated edit cards should not repeat lead titles",
    });
  }
  composition.underfilledEditKeys.forEach((editKey) => {
    findings.push({
      issue: "underfilled_edit",
      editKey,
      detail: `Curated edit ${editKey} has fewer than ${MIN_EDIT_ITEMS} items`,
    });
  });

  return {
    healthy: findings.length === 0,
    checkedAt,
    composition,
    findings,
  };
}

export function getHomeCuratedEditCardMetrics(width: number): HomeCuratedEditCardMetrics {
  const compact = width < COMPACT_CARD_BREAKPOINT;
  return {
    cardWidth: compact
      ? Math.min(Math.max(width - 64, 272), 326)
      : Math.min(Math.max(width - 72, 272), 342),
    compact,
  };
}
