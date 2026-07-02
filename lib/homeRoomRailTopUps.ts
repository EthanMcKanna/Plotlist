import type { SignatureRailItem } from "../components/SignatureRail";
import type { ProviderItem, ProviderRoom } from "../components/StreamingRooms";

import {
  hasCurrentHomeSignal,
  hasReleaseWindowHomeSignal,
} from "./homeCurrentSignal";
import { getHomeRailIdentityKeys } from "./homeRailIdentity";

export type HomeRoomRailTopUpCatalogItem = {
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  overview?: string | null;
  year?: number | null;
  genreIds?: number[] | null;
  tmdbVoteAverage?: number | null;
  tmdbVoteCount?: number | null;
  homeSignal?: string | null;
};

export type HomeRoomRailTopUpData = {
  generatedAt: number;
  streamingRooms: ProviderRoom[];
  getCatalogForKey: (key: string) => HomeRoomRailTopUpCatalogItem | null;
};

type RoomRailCandidate = {
  catalog: HomeRoomRailTopUpCatalogItem | null;
  item: SignatureRailItem;
  room: ProviderRoom;
};

type IndexedRoomRailCandidate = RoomRailCandidate & {
  originalIndex: number;
};

const QUICK_ROOM_GENRE_IDS = new Set([
  16, // Animated
  35, // Comedy
  10751, // Family
  10762, // Kids
]);

export function getProviderRoomItemRailKey(item: ProviderItem) {
  return (
    (item.externalSource && item.externalId
      ? `${item.externalSource}:${item.externalId}`
      : null) ??
    item.externalId ??
    item.title
  );
}

function toRoomRailCandidate(
  data: HomeRoomRailTopUpData,
  room: ProviderRoom,
  providerItem: ProviderItem,
): RoomRailCandidate {
  const key = String(getProviderRoomItemRailKey(providerItem));
  const catalog = data.getCatalogForKey(key);
  return {
    catalog,
    item: {
      key,
      title: catalog?.title ?? providerItem.title,
      posterUrl: catalog?.posterUrl ?? providerItem.posterUrl ?? null,
      backdropUrl: catalog?.backdropUrl ?? providerItem.backdropUrl ?? null,
      overview: catalog?.overview ?? null,
      year: catalog?.year ?? null,
      signal: catalog?.homeSignal ?? providerItem.homeSignal ?? null,
    },
    room,
  };
}

function getRoomRailTopUpCandidates(
  data: HomeRoomRailTopUpData,
  predicate: (candidate: RoomRailCandidate) => boolean,
) {
  const candidates: IndexedRoomRailCandidate[] = [];
  let originalIndex = 0;

  data.streamingRooms.forEach((room) => {
    room.items.forEach((providerItem) => {
      const candidate = toRoomRailCandidate(data, room, providerItem);
      if (!predicate(candidate)) return;
      candidates.push({ ...candidate, originalIndex });
      originalIndex += 1;
    });
  });

  return candidates;
}

function toDistinctRoomRailTopUpItems(
  candidates: IndexedRoomRailCandidate[],
  limit: number,
) {
  const seen = new Set<string>();
  const items: SignatureRailItem[] = [];

  candidates.forEach((candidate) => {
    if (items.length >= limit) return;
    const identityKeys = getHomeRailIdentityKeys(candidate.item);
    if (identityKeys.some((key) => seen.has(key))) return;
    identityKeys.forEach((key) => seen.add(key));
    items.push(candidate.item);
  });

  return items;
}

function getDistinctRoomRailTopUpItems(
  data: HomeRoomRailTopUpData,
  predicate: (candidate: RoomRailCandidate) => boolean,
  limit: number,
) {
  return toDistinctRoomRailTopUpItems(
    getRoomRailTopUpCandidates(data, predicate),
    limit,
  );
}

function hasCatalogQualityFloor(
  catalog: HomeRoomRailTopUpCatalogItem | null,
  minAverage: number,
  minVotes: number,
) {
  return Boolean(
    typeof catalog?.tmdbVoteAverage === "number" &&
      catalog.tmdbVoteAverage >= minAverage &&
      typeof catalog.tmdbVoteCount === "number" &&
      catalog.tmdbVoteCount >= minVotes,
  );
}

function getQuickRoomTopUpPriority(candidate: RoomRailCandidate) {
  const genreIds = candidate.catalog?.genreIds ?? [];
  const primaryGenreId = genreIds[0];
  const primaryQuickGenre =
    primaryGenreId !== undefined && QUICK_ROOM_GENRE_IDS.has(primaryGenreId);
  const releaseWindow = hasReleaseWindowHomeSignal(candidate.item);

  return (releaseWindow ? 20 : 0) + (primaryQuickGenre ? 0 : 10);
}

export function getHomeRoomHeatTopUpItems(
  data: HomeRoomRailTopUpData,
  limit = 12,
) {
  return getDistinctRoomRailTopUpItems(
    data,
    ({ item }) =>
      Boolean(item.signal?.trim()) &&
      hasCurrentHomeSignal(item, { now: data.generatedAt }) &&
      !hasReleaseWindowHomeSignal(item),
    limit,
  );
}

export function getHomeRoomQualityTopUpItems(
  data: HomeRoomRailTopUpData,
  limit = 12,
) {
  return getDistinctRoomRailTopUpItems(
    data,
    ({ catalog }) => hasCatalogQualityFloor(catalog, 7.6, 75),
    limit,
  );
}

export function getHomeRoomQuickTopUpItems(
  data: HomeRoomRailTopUpData,
  limit = 24,
) {
  const candidates = getRoomRailTopUpCandidates(
    data,
    ({ catalog }) => {
      const genreIds = catalog?.genreIds ?? [];
      return Boolean(
        hasCatalogQualityFloor(catalog, 6.5, 25) &&
          genreIds.some((genreId) => QUICK_ROOM_GENRE_IDS.has(genreId)),
      );
    },
  ).sort((left, right) => {
    const leftPriority = getQuickRoomTopUpPriority(left);
    const rightPriority = getQuickRoomTopUpPriority(right);
    return leftPriority - rightPriority || left.originalIndex - right.originalIndex;
  });

  return toDistinctRoomRailTopUpItems(candidates, limit);
}

export function getHomeRoomFreshTopUpItems(
  data: HomeRoomRailTopUpData,
  limit = 12,
) {
  return getDistinctRoomRailTopUpItems(
    data,
    ({ item }) => hasReleaseWindowHomeSignal(item),
    limit,
  );
}
