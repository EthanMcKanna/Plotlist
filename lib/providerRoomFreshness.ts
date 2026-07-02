import {
  getHomeSignalReleaseDistanceDays,
  hasChartOnlyHomeSignal,
  hasExplicitCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
  isHomeReleaseWindowNear,
} from "./homeCurrentSignal";
import { getHomeEditorialDemandConfidenceScore } from "./homeEditorialSeeds";

export type ProviderRoomFreshnessItem = {
  title?: string | null;
  signal?: string | null;
  homeSignal?: string | null;
  editorialTier?: string | null;
  homeScore?: number | null;
};

type ProviderRoomFreshnessRoom<TItem extends ProviderRoomFreshnessItem> = {
  items: TItem[];
};

function getProviderRoomSignalScore(
  show: ProviderRoomFreshnessItem,
  now?: Date | string | number,
) {
  const distance = getHomeSignalReleaseDistanceDays(show, now);
  if (
    show.editorialTier === "verified_current" &&
    isHomeReleaseWindowNear(show, { now, maxPastDays: 7, maxFutureDays: 14 })
  ) {
    return 180 - Math.abs(distance ?? 0) * 4;
  }
  if (isHomeReleaseWindowNear(show, { now, maxPastDays: 7, maxFutureDays: 14 })) {
    return 145 - Math.abs(distance ?? 0) * 4;
  }
  if (
    hasReleaseWindowHomeSignal(show) &&
    typeof distance === "number" &&
    distance > 14 &&
    distance <= 45
  ) {
    return 95 - distance;
  }
  if (
    hasReleaseWindowHomeSignal(show) &&
    typeof distance === "number" &&
    (distance < -14 || distance > 45)
  ) {
    return 0;
  }
  if (
    hasReleaseWindowHomeSignal(show) &&
    distance === null &&
    hasExplicitCurrentHomeSignal(show, { now })
  ) {
    return 130;
  }
  if (hasChartOnlyHomeSignal(show)) return 75;
  if (hasExplicitCurrentHomeSignal(show, { now })) return 60;
  return 0;
}

export function sortProviderRoomItemsForFreshness<T extends ProviderRoomFreshnessItem>(
  items: T[],
  now?: Date | string | number,
) {
  return [...items].sort((left, right) => {
    const signalDelta =
      getProviderRoomSignalScore(right, now) -
      getProviderRoomSignalScore(left, now);
    if (signalDelta !== 0) return signalDelta;
    const demandDelta =
      getHomeEditorialDemandConfidenceScore(right.title ?? "") -
      getHomeEditorialDemandConfidenceScore(left.title ?? "");
    if (demandDelta !== 0) return demandDelta;
    return (right.homeScore ?? 0) - (left.homeScore ?? 0);
  });
}

function getProviderRoomFreshnessScore(
  room: ProviderRoomFreshnessRoom<ProviderRoomFreshnessItem>,
  now?: Date | string | number,
) {
  const leadSignalScore = room.items[0]
    ? getProviderRoomSignalScore(room.items[0], now)
    : 0;
  const supportScore = room.items
    .slice(1)
    .map((item) => getProviderRoomSignalScore(item, now))
    .sort((left, right) => right - left)
    .slice(0, 2)
    .reduce((total, score) => total + score, 0);
  const explicitCurrentCount = room.items.filter((item) =>
    hasExplicitCurrentHomeSignal(item, { now }),
  ).length;
  const releaseSignalCount = room.items.filter((item) =>
    hasReleaseWindowHomeSignal(item),
  ).length;
  const homeScoreTotal = room.items.reduce(
    (total, item) => total + (item.homeScore ?? 0),
    0,
  );

  return (
    leadSignalScore * 1000 +
    supportScore * 4 +
    explicitCurrentCount * 6 +
    releaseSignalCount * 3 +
    Math.min(homeScoreTotal, 40)
  );
}

export function sortProviderRoomsForFreshness<
  TItem extends ProviderRoomFreshnessItem,
  TRoom extends ProviderRoomFreshnessRoom<TItem>,
>(
  rooms: TRoom[],
  now?: Date | string | number,
) {
  return rooms
    .map((room, index) => ({ room, index }))
    .sort((left, right) => {
      const scoreDelta =
        getProviderRoomFreshnessScore(right.room, now) -
        getProviderRoomFreshnessScore(left.room, now);
      if (scoreDelta !== 0) return scoreDelta;
      return left.index - right.index;
    })
    .map(({ room }) => room);
}
