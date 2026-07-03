import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
} from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { guardedPush } from "../../lib/navigation";
import { useAction, useMutation } from "../../lib/plotlist/react";
import { api } from "../../lib/plotlist/api";

import { ContactsSyncCard } from "../../components/ContactsSyncCard";
import {
  ContinueWatchingRail,
  type ContinueWatchingItem,
  getActiveContinueWatchingItems,
  getContinueWatchingPreviewItems,
  shouldRenderContinueWatchingEmptyState,
  useContinueWatchingItems,
} from "../../components/ContinueWatchingRail";
import {
  FriendsActivity,
  getFriendsActivityFeedItems,
  getFriendsActivityPeople,
} from "../../components/FriendsActivity";
import { HomeCuratedEdits } from "../../components/HomeCuratedEdits";
import {
  HeroCarousel,
  type HeroSaveState,
  type HeroSlide,
} from "../../components/HeroCarousel";
import { LoadingScreen } from "../../components/LoadingScreen";
import { HomeTopBar } from "../../components/HomeTopBar";
import { RailSkeleton } from "../../components/RailSkeleton";
import { SignatureRail, type SignatureRailItem } from "../../components/SignatureRail";
import {
  getRoomFeaturedItem,
  getRoomSupportItems,
  StreamingRooms,
  type ProviderRoom,
} from "../../components/StreamingRooms";
import {
  type HomeSchedulePreviewState,
  TonightStrip,
  useHomeSchedulePreview,
} from "../../components/TonightStrip";

import { getContactSyncAlertCopy } from "../../lib/contactSync";
import { loadDeviceContacts } from "../../lib/deviceContacts";
import {
  buildHomeCuratedEdits,
  getHomeCuratedEditLeadPreviewKeys,
  getHomeCuratedEditPreviewKeys,
} from "../../lib/homeCuratedEdits";
import {
  buildFreshRailRoomTopUpItems,
  buildVisibleFreshRailItems,
} from "../../lib/homeFreshRail";
import {
  hasChartOnlyHomeSignal,
  hasReleaseWindowHomeSignal,
} from "../../lib/homeCurrentSignal";
import {
  getHomeRailIdentitySet,
  filterHomeRoomsWithUnpreviewedFeaturedItems,
  getHomeDiscoveryPreviewKeys,
  limitHomeRoomItemsByTitleAppearances,
  limitHomeRailItemsByTitleAppearances,
  prioritizeUnpreviewedHomeRailItems,
  prioritizeHomeRoomsAgainstPreviewKeys,
  removePreviewedHomeRailItems,
  topUpHomeRailItemsPreservingSources,
} from "../../lib/homeRailIdentity";
import { hasHomePersonalizationSignals } from "../../lib/homePersonalization";
import {
  getHomeRoomHeatTopUpItems,
  getHomeRoomQualityTopUpItems,
  getHomeRoomQuickTopUpItems,
  getProviderRoomItemRailKey,
} from "../../lib/homeRoomRailTopUps";
import {
  getHomeDiscoverySectionSignal,
  getHomeProviderRoomsSectionSignal,
  getHomeSectionDisplayIndexes,
  getHomeSectionPlan,
  getHomeSectionTestID,
  isNumberedHomeSectionKind,
  type HomeSection,
  type HomeSectionKind,
} from "../../lib/homeSectionPlan";
import {
  buildColdStartHomeShelfItems,
  buildPersonalHomeShelfItems,
  promoteContextualHomeShelfLead,
} from "../../lib/homeStarterShelf";
import { getContactsSyncDismissed, setContactsSyncDismissed } from "../../lib/preferences";
import {
  sortProviderRoomItemsForFreshness,
  sortProviderRoomsForFreshness,
  type HomeData,
  useHomeData,
} from "../../lib/useHomeData";
import { useScrollToTopOnTabPress } from "../../lib/useScrollToTopOnTabPress";

const FOR_YOU_ACCENT = "#22C55E";
const HEAT_ACCENT = "#F59E0B";
const FRESH_ACCENT = "#38BDF8";
const CRITICS_ACCENT = "#F472B6";
const QUICK_ACCENT = "#A3E635";
const ROOMS_ACCENT = "#F97316";
const MIN_FEATURE_RAIL_ITEMS = 3;
const MIN_POSTER_RAIL_ITEMS = 4;
const MIN_DISTINCT_POSTER_RAIL_ITEMS = 3;
const MIN_QUICK_RAIL_ITEMS = 2;
const MIN_PROVIDER_ROOM_ITEMS = 3;
const MIN_PROVIDER_ROOMS = 4;
const TARGET_FEATURE_RAIL_ITEMS = 5;
const TARGET_FRESH_RAIL_ITEMS = 4;
const TARGET_QUICK_RAIL_ITEMS = 3;
const FRESH_ROOM_TOP_UP_LIMIT = 8;
const MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES = 1;
const MAX_PROVIDER_ROOM_SURFACE_TITLE_APPEARANCES = 1;
const TARGET_PROVIDER_ROOM_ITEMS = 6;
export const HOME_NATIVE_INITIAL_RENDER_SECTION_COUNT = 6;

type WebDataSetViewProps = ComponentProps<typeof View> & {
  dataSet?: Record<string, string>;
};
const WebDataSetView = View as ComponentType<WebDataSetViewProps>;

export function getHomeSectionWebDataSet(
  kind: HomeSectionKind,
  sectionTestID: string,
) {
  return Platform.OS === "web"
    ? {
        homeSection: kind,
        homeSectionId: sectionTestID,
      }
    : undefined;
}

function withoutChartOnlyShelfItems(items: SignatureRailItem[]) {
  const filtered = items.filter((item) => !hasChartOnlyHomeSignal(item));
  return filtered.length >= MIN_FEATURE_RAIL_ITEMS ? filtered : items;
}

export function getHomeInitialRenderSectionCount(sectionCount: number) {
  if (Platform.OS === "web") return sectionCount;
  return Math.min(sectionCount, HOME_NATIVE_INITIAL_RENDER_SECTION_COUNT);
}

function getShelfTopUpCandidates(items: SignatureRailItem[], minimum: number) {
  return [...items.slice(minimum), ...items].filter(
    (item) => !hasChartOnlyHomeSignal(item),
  );
}

function getFreshRoomTopUpItems(data: HomeData): SignatureRailItem[] {
  const rooms = data.streamingRooms.map((room) => ({
    items: room.items.flatMap((item) => {
      const key = String(getProviderRoomItemRailKey(item));
      const catalog = data.getCatalogForKey(key);
      const title = catalog?.title ?? item.title;
      const railItem: SignatureRailItem = {
        key,
        title,
        posterUrl: catalog?.posterUrl ?? item.posterUrl ?? null,
        backdropUrl: catalog?.backdropUrl ?? item.backdropUrl ?? null,
        overview: catalog?.overview ?? null,
        year: catalog?.year ?? null,
        signal: catalog?.homeSignal ?? item.homeSignal ?? null,
      };
      return hasReleaseWindowHomeSignal(railItem) ? [railItem] : [];
    }),
  }));

  return buildFreshRailRoomTopUpItems(rooms, FRESH_ROOM_TOP_UP_LIMIT);
}

export type HomeSurfaceProps = {
  data: HomeData;
  continueWatchingItems?: ContinueWatchingItem[] | null;
  reduceMotionEnabled?: boolean;
  schedulePreview?: HomeSchedulePreviewState;
};

type PreviewDataModule = typeof import("../../lib/homePreviewData");

export function HomeSurface({
  data,
  continueWatchingItems: providedContinueWatchingItems,
  reduceMotionEnabled,
  schedulePreview: providedSchedulePreview,
}: HomeSurfaceProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const surfaceNow = data.generatedAt;
  const featureCardWidth = Math.min(Math.max(width - 48, 280), 360);
  const roomCardWidth = Math.min(Math.max(width - 96, 240), 320);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const listRef = useRef<Animated.FlatList<HomeSection>>(null);
  useScrollToTopOnTabPress(listRef as any);

  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [contactNudgeDismissed, setContactNudgeDismissed] = useState<boolean | null>(null);
  const [heroSaveStateByKey, setHeroSaveStateByKey] = useState<
    Partial<Record<string, HeroSaveState>>
  >({});
  const queriedContinueWatchingItems = useContinueWatchingItems(
    data.hasProfile && providedContinueWatchingItems === undefined,
  );
  const continueWatchingItems =
    providedContinueWatchingItems === undefined
      ? queriedContinueWatchingItems
      : providedContinueWatchingItems;
  const queriedSchedulePreview = useHomeSchedulePreview(
    data.hasProfile && !providedSchedulePreview,
  );
  const schedulePreview = providedSchedulePreview ?? queriedSchedulePreview;
  const activeContinueWatchingItems = useMemo(
    () => getActiveContinueWatchingItems(continueWatchingItems),
    [continueWatchingItems],
  );
  const hasPersonalTasteSignals = hasHomePersonalizationSignals(data.me, {
    activeShowCount: activeContinueWatchingItems.length,
  });

  const continueWatchingPreviewKeys = useMemo(
    () => getHomeRailIdentitySet(
      getContinueWatchingPreviewItems(activeContinueWatchingItems),
    ),
    [activeContinueWatchingItems],
  );
  const heroPreviewKeys = useMemo(
    () => getHomeRailIdentitySet(data.heroSlides),
    [data.heroSlides],
  );
  const personalPreviewKeys = useMemo(
    () => new Set([...continueWatchingPreviewKeys]),
    [continueWatchingPreviewKeys],
  );
  const curatedBlockedKeys = useMemo(
    () => new Set([...heroPreviewKeys, ...personalPreviewKeys]),
    [heroPreviewKeys, personalPreviewKeys],
  );
  const curatedHeatItems = useMemo(
    () => prioritizeUnpreviewedHomeRailItems(data.heat, personalPreviewKeys),
    [data.heat, personalPreviewKeys],
  );
  const curatedFreshItems = useMemo(
    () => prioritizeUnpreviewedHomeRailItems(data.fresh, personalPreviewKeys),
    [data.fresh, personalPreviewKeys],
  );
  const curatedEdits = useMemo(
    () =>
      buildHomeCuratedEdits({
        heat: curatedHeatItems,
        fresh: curatedFreshItems,
        critics: data.critics,
        quick: data.quick,
        blockedKeys: curatedBlockedKeys,
        now: surfaceNow,
      }),
    [
      curatedBlockedKeys,
      curatedHeatItems,
      curatedFreshItems,
      data.critics,
      data.quick,
      surfaceNow,
    ],
  );
  const curatedLeadPreviewKeys = useMemo(
    () => getHomeCuratedEditLeadPreviewKeys(curatedEdits),
    [curatedEdits],
  );
  const curatedVisiblePreviewKeys = useMemo(
    () => getHomeCuratedEditPreviewKeys(curatedEdits),
    [curatedEdits],
  );
  const curatedLeadItems = useMemo(
    () =>
      curatedEdits
        .map((edit) => edit.items[0])
        .filter((item): item is SignatureRailItem => Boolean(item)),
    [curatedEdits],
  );
  const curatedVisibleItems = useMemo(
    () => curatedEdits.flatMap((edit) => edit.items.slice(0, 4)),
    [curatedEdits],
  );
  const curatedSupportItems = useMemo(
    () => curatedEdits.flatMap((edit) => edit.items.slice(1, 4)),
    [curatedEdits],
  );
  const visibleHeroSurfaceItems = useMemo(
    () => data.heroSlides.slice(0, 1),
    [data.heroSlides],
  );
  const visibleOpeningSurfaceItems = useMemo(
    () => [
      ...getContinueWatchingPreviewItems(activeContinueWatchingItems),
      ...visibleHeroSurfaceItems,
      ...curatedLeadItems,
    ],
    [
      activeContinueWatchingItems,
      visibleHeroSurfaceItems,
      curatedLeadItems,
    ],
  );
  const visibleEditorialSurfaceItems = useMemo(
    () => [...visibleOpeningSurfaceItems, ...curatedSupportItems],
    [visibleOpeningSurfaceItems, curatedSupportItems],
  );
  const railPreviewKeys = useMemo(
    () => new Set([...heroPreviewKeys, ...personalPreviewKeys, ...curatedLeadPreviewKeys]),
    [heroPreviewKeys, personalPreviewKeys, curatedLeadPreviewKeys],
  );
  const visibleEditorialPreviewKeys = useMemo(
    () => new Set([...railPreviewKeys, ...curatedVisiblePreviewKeys]),
    [railPreviewKeys, curatedVisiblePreviewKeys],
  );
  const roomHardPreviewKeys = useMemo(
    () => new Set([...railPreviewKeys]),
    [railPreviewKeys],
  );
  const streamingRoomLeadPreviewItems = useMemo(() => {
    const rooms = prioritizeHomeRoomsAgainstPreviewKeys<
      ProviderRoom["items"][number],
      ProviderRoom
    >(
      data.streamingRooms,
      roomHardPreviewKeys,
      MIN_PROVIDER_ROOM_ITEMS,
    ).map((room) => ({
      ...room,
      items: sortProviderRoomItemsForFreshness(room.items, surfaceNow),
    }));
    return sortProviderRoomsForFreshness(rooms, surfaceNow)
      .map((room) => getRoomFeaturedItem(room.items, roomHardPreviewKeys, false))
      .filter((item): item is ProviderRoom["items"][number] => Boolean(item));
  }, [data.streamingRooms, roomHardPreviewKeys, surfaceNow]);
  const streamingRoomLeadSurfaceItems = useMemo(
    () =>
      streamingRoomLeadPreviewItems.map((item) => ({
        key: String(getProviderRoomItemRailKey(item)),
        title: item.title,
      })),
    [streamingRoomLeadPreviewItems],
  );
  const streamingRoomLeadPreviewKeys = useMemo(
    () => getHomeRailIdentitySet(streamingRoomLeadSurfaceItems),
    [streamingRoomLeadSurfaceItems],
  );
  const forYouPreviewKeys = useMemo(
    () => new Set([...visibleEditorialPreviewKeys, ...streamingRoomLeadPreviewKeys]),
    [streamingRoomLeadPreviewKeys, visibleEditorialPreviewKeys],
  );
  const forYouPrecedingSurfaceItems = useMemo(
    () => [...visibleOpeningSurfaceItems, ...streamingRoomLeadSurfaceItems],
    [streamingRoomLeadSurfaceItems, visibleOpeningSurfaceItems],
  );
  const primaryShelfItems = useMemo(
    () =>
      hasPersonalTasteSignals
        ? buildPersonalHomeShelfItems({
            forYou: withoutChartOnlyShelfItems(data.forYou),
            heat: data.heat,
            fresh: data.fresh,
            critics: data.critics,
            quick: data.quick,
            now: surfaceNow,
          })
        : buildColdStartHomeShelfItems({
            forYou: data.forYou,
            heat: data.heat,
            fresh: data.fresh,
            critics: data.critics,
            quick: data.quick,
            now: surfaceNow,
          }),
    [
      data.critics,
      data.forYou,
      data.fresh,
      data.heat,
      data.quick,
      hasPersonalTasteSignals,
      surfaceNow,
    ],
  );
  const forYouTopUpSources = useMemo(
    () => [
      {
        items: data.critics,
        candidates: getShelfTopUpCandidates(data.critics, MIN_POSTER_RAIL_ITEMS),
        minimumRemaining: MIN_POSTER_RAIL_ITEMS,
      },
      {
        items: data.quick,
        candidates: getShelfTopUpCandidates(data.quick, MIN_POSTER_RAIL_ITEMS),
        minimumRemaining: MIN_POSTER_RAIL_ITEMS,
      },
      {
        items: data.heat,
        candidates: getShelfTopUpCandidates(data.heat, MIN_FEATURE_RAIL_ITEMS),
        minimumRemaining: MIN_FEATURE_RAIL_ITEMS,
      },
      {
        items: data.fresh,
        candidates: getShelfTopUpCandidates(data.fresh, MIN_POSTER_RAIL_ITEMS),
        minimumRemaining: MIN_POSTER_RAIL_ITEMS,
      },
    ],
    [data.critics, data.fresh, data.quick, data.heat],
  );
  const softShelfItems = useMemo(
    () =>
      prioritizeUnpreviewedHomeRailItems(
        primaryShelfItems,
        curatedVisiblePreviewKeys,
      ),
    [primaryShelfItems, curatedVisiblePreviewKeys],
  );
  const forYouItems = useMemo(
    () => {
      const candidates = topUpHomeRailItemsPreservingSources(
        softShelfItems,
        forYouTopUpSources,
        forYouPreviewKeys,
        MIN_FEATURE_RAIL_ITEMS,
        TARGET_FEATURE_RAIL_ITEMS,
      );
      const contextualLeadCandidates = hasPersonalTasteSignals
        ? promoteContextualHomeShelfLead(candidates, { now: surfaceNow })
        : candidates;
      return limitHomeRailItemsByTitleAppearances(
        contextualLeadCandidates,
        forYouPrecedingSurfaceItems,
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_FEATURE_RAIL_ITEMS,
        TARGET_FEATURE_RAIL_ITEMS,
      );
    },
    [
      softShelfItems,
      forYouTopUpSources,
      hasPersonalTasteSignals,
      surfaceNow,
      forYouPreviewKeys,
      forYouPrecedingSurfaceItems,
    ],
  );
  const discoveryPreviewKeys = useMemo(
    () => getHomeDiscoveryPreviewKeys(visibleEditorialPreviewKeys, forYouItems),
    [visibleEditorialPreviewKeys, forYouItems],
  );
  const heatPreviewKeys = useMemo(
    () =>
      new Set([
        ...visibleEditorialPreviewKeys,
        ...getHomeRailIdentitySet(forYouItems),
      ]),
    [forYouItems, visibleEditorialPreviewKeys],
  );
  const heatRoomTopUpItems = useMemo(
    () => getHomeRoomHeatTopUpItems(data),
    [data],
  );
  const qualityRoomTopUpItems = useMemo(
    () => getHomeRoomQualityTopUpItems(data),
    [data],
  );
  const quickRoomTopUpItems = useMemo(
    () => getHomeRoomQuickTopUpItems(data),
    [data],
  );
  const heatItems = useMemo(
    () => {
      const candidates = removePreviewedHomeRailItems(
        [...data.heat, ...heatRoomTopUpItems],
        heatPreviewKeys,
        MIN_FEATURE_RAIL_ITEMS,
      );
      return limitHomeRailItemsByTitleAppearances(
        candidates,
        [...visibleEditorialSurfaceItems, ...forYouItems],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_FEATURE_RAIL_ITEMS,
        TARGET_FEATURE_RAIL_ITEMS,
      );
    },
    [
      data.heat,
      heatRoomTopUpItems,
      heatPreviewKeys,
      forYouItems,
      visibleEditorialSurfaceItems,
    ],
  );
  const pulseHeatItems = useMemo(
    () => heatItems.map((railItem) => ({ ...railItem, rank: null })),
    [heatItems],
  );
  const freshRoomTopUpItems = useMemo(
    () => getFreshRoomTopUpItems(data),
    [data],
  );
  const freshReservePreviewKeys = useMemo(
    () =>
      new Set([
        ...visibleEditorialPreviewKeys,
        ...getHomeRailIdentitySet(forYouItems),
        ...getHomeRailIdentitySet(heatItems),
      ]),
    [forYouItems, heatItems, visibleEditorialPreviewKeys],
  );
  const freshReserveCandidateItems = useMemo(
    () =>
      removePreviewedHomeRailItems(
        [...data.fresh, ...freshRoomTopUpItems],
        freshReservePreviewKeys,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
      ),
    [data.fresh, freshRoomTopUpItems, freshReservePreviewKeys],
  );
  const freshReserveItems = useMemo(
    () =>
      buildVisibleFreshRailItems({
        items: freshReserveCandidateItems,
        previewKeys: freshReservePreviewKeys,
        precedingItems: [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
        ],
        maxTitleAppearances: MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        minimumRemaining: MIN_DISTINCT_POSTER_RAIL_ITEMS,
        limit: MIN_DISTINCT_POSTER_RAIL_ITEMS,
        now: surfaceNow,
      }),
    [
      freshReserveCandidateItems,
      freshReservePreviewKeys,
      forYouItems,
      heatItems,
      surfaceNow,
      visibleEditorialSurfaceItems,
    ],
  );
  const criticsReservePreviewKeys = useMemo(
    () =>
      new Set([
        ...discoveryPreviewKeys,
        ...getHomeRailIdentitySet(heatItems),
        ...getHomeRailIdentitySet(freshReserveItems),
      ]),
    [discoveryPreviewKeys, heatItems, freshReserveItems],
  );
  const criticsReserveCandidateItems = useMemo(
    () =>
      removePreviewedHomeRailItems(
        [...data.critics, ...qualityRoomTopUpItems],
        criticsReservePreviewKeys,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
      ),
    [data.critics, qualityRoomTopUpItems, criticsReservePreviewKeys],
  );
  const criticsReserveItems = useMemo(
    () =>
      limitHomeRailItemsByTitleAppearances(
        criticsReserveCandidateItems,
        [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
          ...freshReserveItems,
        ],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
      ),
    [
      criticsReserveCandidateItems,
      forYouItems,
      heatItems,
      freshReserveItems,
      visibleEditorialSurfaceItems,
    ],
  );
  const quickPreviewKeys = useMemo(
    () =>
      new Set([
        ...discoveryPreviewKeys,
        ...getHomeRailIdentitySet(heatItems),
        ...getHomeRailIdentitySet(freshReserveItems),
        ...getHomeRailIdentitySet(criticsReserveItems),
      ]),
    [criticsReserveItems, discoveryPreviewKeys, freshReserveItems, heatItems],
  );
  const quickItems = useMemo(
    () => {
      const candidates = removePreviewedHomeRailItems(
        [...data.quick, ...quickRoomTopUpItems],
        quickPreviewKeys,
        MIN_QUICK_RAIL_ITEMS,
      );
      return limitHomeRailItemsByTitleAppearances(
        candidates,
        [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
        ],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_QUICK_RAIL_ITEMS,
        TARGET_QUICK_RAIL_ITEMS,
      );
    },
    [
      data.quick,
      quickRoomTopUpItems,
      quickPreviewKeys,
      forYouItems,
      heatItems,
      visibleEditorialSurfaceItems,
    ],
  );
  const freshPreviewKeys = useMemo(
    () =>
      new Set([
        ...visibleEditorialPreviewKeys,
        ...getHomeRailIdentitySet(forYouItems),
        ...getHomeRailIdentitySet(heatItems),
        ...getHomeRailIdentitySet(quickItems),
      ]),
    [forYouItems, heatItems, quickItems, visibleEditorialPreviewKeys],
  );
  const freshCandidateItems = useMemo(
    () =>
      removePreviewedHomeRailItems(
        [...data.fresh, ...freshRoomTopUpItems],
        freshPreviewKeys,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
      ),
    [data.fresh, freshRoomTopUpItems, freshPreviewKeys],
  );
  const freshItems = useMemo(
    () => {
      return buildVisibleFreshRailItems({
        items: freshCandidateItems,
        previewKeys: freshPreviewKeys,
        precedingItems: [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
          ...quickItems,
        ],
        maxTitleAppearances: MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        minimumRemaining: MIN_DISTINCT_POSTER_RAIL_ITEMS,
        limit: TARGET_FRESH_RAIL_ITEMS,
        now: surfaceNow,
      });
    },
    [
      freshCandidateItems,
      freshPreviewKeys,
      forYouItems,
      heatItems,
      quickItems,
      surfaceNow,
      visibleEditorialSurfaceItems,
    ],
  );
  const criticsPreviewKeys = useMemo(
    () =>
      new Set([
        ...discoveryPreviewKeys,
        ...getHomeRailIdentitySet(heatItems),
        ...getHomeRailIdentitySet(quickItems),
        ...getHomeRailIdentitySet(freshItems),
      ]),
    [discoveryPreviewKeys, heatItems, quickItems, freshItems],
  );
  const criticsItems = useMemo(
    () => {
      const candidates = removePreviewedHomeRailItems(
        [...data.critics, ...qualityRoomTopUpItems],
        criticsPreviewKeys,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
      );
      return limitHomeRailItemsByTitleAppearances(
        candidates,
        [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
          ...freshItems,
          ...quickItems,
        ],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
        MIN_POSTER_RAIL_ITEMS,
      );
    },
    [
      data.critics,
      qualityRoomTopUpItems,
      criticsPreviewKeys,
      forYouItems,
      heatItems,
      freshItems,
      quickItems,
      visibleEditorialSurfaceItems,
    ],
  );
  const roomSoftPreviewKeys = useMemo(
    () =>
      new Set([
        ...curatedVisiblePreviewKeys,
        ...getHomeRailIdentitySet(heatItems),
        ...getHomeRailIdentitySet(freshItems),
        ...getHomeRailIdentitySet(criticsItems),
        ...getHomeRailIdentitySet(quickItems),
      ]),
    [
      curatedVisiblePreviewKeys,
      heatItems,
      freshItems,
      criticsItems,
      quickItems,
    ],
  );
  const roomSurfaceItems = useMemo(
    () => [
      ...data.heroSlides,
      ...visibleOpeningSurfaceItems,
      ...forYouItems,
      ...heatItems,
      ...freshItems,
      ...criticsItems,
      ...quickItems,
      ...curatedVisibleItems,
    ],
    [
      data.heroSlides,
      visibleOpeningSurfaceItems,
      forYouItems,
      heatItems,
      freshItems,
      criticsItems,
      quickItems,
      curatedVisibleItems,
    ],
  );
  const roomSurfacePreviewKeys = useMemo(
    () => getHomeRailIdentitySet(roomSurfaceItems),
    [roomSurfaceItems],
  );
  const streamingRooms = useMemo(
    (): ProviderRoom[] => {
      const rooms = prioritizeHomeRoomsAgainstPreviewKeys<
        ProviderRoom["items"][number],
        ProviderRoom
      >(
        data.streamingRooms,
        roomHardPreviewKeys,
        MIN_PROVIDER_ROOM_ITEMS,
        roomSoftPreviewKeys,
      );
      const visibleRooms = rooms.flatMap((room) => {
        const items = limitHomeRoomItemsByTitleAppearances<
          ProviderRoom["items"][number]
        >(
          room.items,
          roomSurfaceItems,
          MAX_PROVIDER_ROOM_SURFACE_TITLE_APPEARANCES,
          MIN_PROVIDER_ROOM_ITEMS,
          TARGET_PROVIDER_ROOM_ITEMS,
        );
        const sortedItems = sortProviderRoomItemsForFreshness(items, surfaceNow);
        return sortedItems.length >= MIN_PROVIDER_ROOM_ITEMS
          ? [{ ...room, items: sortedItems }]
          : [];
      });
      const sortedRooms = sortProviderRoomsForFreshness(visibleRooms, surfaceNow);
      return filterHomeRoomsWithUnpreviewedFeaturedItems<
        ProviderRoom["items"][number],
        ProviderRoom
      >(
        sortedRooms,
        roomSurfacePreviewKeys,
        (items, mutedTitleKeys) =>
          getRoomFeaturedItem(items, mutedTitleKeys, false),
        MIN_PROVIDER_ROOMS,
      );
    },
    [
      data.streamingRooms,
      roomHardPreviewKeys,
      roomSoftPreviewKeys,
      roomSurfaceItems,
      roomSurfacePreviewKeys,
      surfaceNow,
    ],
  );
  const streamingRoomSignalRooms = useMemo(
    () =>
      streamingRooms.map((room) => {
        const featured = getRoomFeaturedItem(
          room.items,
          roomSurfacePreviewKeys,
          false,
        );
        const supportItems = getRoomSupportItems({
          items: room.items,
          featured,
          mutedSupportTitleKeys: roomSurfacePreviewKeys,
          softMutedSupportTitleKeys: roomSurfacePreviewKeys,
        });
        return {
          items: [featured, ...supportItems].filter(
            (item): item is ProviderRoom["items"][number] => Boolean(item),
          ),
        };
      }),
    [roomSurfacePreviewKeys, streamingRooms],
  );
  const discoverySectionSignals = useMemo(
    () => ({
      heat: getHomeDiscoverySectionSignal(heatItems, surfaceNow),
      fresh: getHomeDiscoverySectionSignal(freshItems, surfaceNow),
      critics: getHomeDiscoverySectionSignal(criticsItems, surfaceNow),
      quick: getHomeDiscoverySectionSignal(quickItems, surfaceNow),
      rooms: getHomeProviderRoomsSectionSignal(
        streamingRoomSignalRooms,
        surfaceNow,
      ),
    }),
    [
      heatItems,
      freshItems,
      criticsItems,
      quickItems,
      surfaceNow,
      streamingRoomSignalRooms,
    ],
  );
  const socialSectionSignal = useMemo(
    () => {
      const viewerId = data.me?._id ?? null;
      const displayablePeople = getFriendsActivityPeople(
        [
          { source: "contacts", people: data.contactMatches },
          { source: "taste", people: data.similarTaste },
          { source: "suggested", people: data.suggested },
        ],
        viewerId,
      );
      return {
        feedItemCount: getFriendsActivityFeedItems(data.feedItems, viewerId).length,
        peopleSuggestionCount: displayablePeople.length,
        hasSyncedContacts: data.hasSyncedContacts,
        contactStatusKnown: data.contactStatusKnown,
      };
    },
    [
      data.contactMatches,
      data.contactMatches.length,
      data.contactStatusKnown,
      data.feedItems,
      data.feedItems.length,
      data.hasSyncedContacts,
      data.me?._id,
      data.similarTaste,
      data.similarTaste.length,
      data.suggested,
      data.suggested.length,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void getContactsSyncDismissed().then((value) => {
      if (!cancelled) {
        setContactNudgeDismissed(Boolean(value));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ingestFromCatalog = useAction(api.shows.ingestFromCatalog);
  const setStatus = useMutation(api.watchStates.setStatus);
  const syncContacts = useAction(api.contacts.syncSnapshot);

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      await Promise.all([data.refresh(), schedulePreview.refresh()]);
    } finally {
      setRefreshing(false);
    }
  }, [data, schedulePreview]);

  const openShowFromKey = useCallback(
    async (key: string, fallbackTitle: string) => {
      const catalog = data.getCatalogForKey(key);
      if (!catalog) {
        Alert.alert("Could not open show", `Missing catalog data for ${fallbackTitle}.`);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const knownId = catalog._id ?? catalog.showId;
      if (knownId) {
        guardedPush({ pathname: "/show/[id]", params: { id: knownId } });
        return;
      }
      if (!catalog.externalId) {
        Alert.alert("Could not open show", "This catalog item is missing an id.");
        return;
      }
      try {
        const nextShowId = await ingestFromCatalog({
          externalSource: catalog.externalSource ?? "tmdb",
          externalId: catalog.externalId,
          title: catalog.title,
          year: catalog.year,
          overview: catalog.overview,
          posterUrl: catalog.posterUrl,
          backdropUrl: catalog.backdropUrl,
          genreIds: catalog.genreIds,
          tmdbPopularity: catalog.tmdbPopularity,
          tmdbVoteAverage: catalog.tmdbVoteAverage,
          tmdbVoteCount: catalog.tmdbVoteCount,
        });
        guardedPush(`/show/${nextShowId}`);
      } catch (error) {
        Alert.alert("Could not add show", String(error));
      }
    },
    [data, ingestFromCatalog],
  );

  const handlePressRailItem = useCallback(
    (item: SignatureRailItem) => {
      void openShowFromKey(item.key, item.title);
    },
    [openShowFromKey],
  );

  const handlePressHero = useCallback(
    (slide: HeroSlide) => {
      void openShowFromKey(slide.key, slide.title);
    },
    [openShowFromKey],
  );

  const handleSaveHero = useCallback(
    async (slide: HeroSlide) => {
      const existingState = heroSaveStateByKey[slide.key];
      if (existingState === "saving" || existingState === "saved") {
        return;
      }
      const catalog = data.getCatalogForKey(slide.key);
      if (!catalog) return;
      let showId = catalog._id ?? catalog.showId;
      setHeroSaveStateByKey((current) => ({ ...current, [slide.key]: "saving" }));
      try {
        if (!showId && catalog.externalId) {
          showId = await ingestFromCatalog({
            externalSource: catalog.externalSource ?? "tmdb",
            externalId: catalog.externalId,
            title: catalog.title,
            year: catalog.year,
            overview: catalog.overview,
            posterUrl: catalog.posterUrl,
            backdropUrl: catalog.backdropUrl,
            genreIds: catalog.genreIds,
            tmdbPopularity: catalog.tmdbPopularity,
            tmdbVoteAverage: catalog.tmdbVoteAverage,
            tmdbVoteCount: catalog.tmdbVoteCount,
          });
        }
        if (!showId) {
          setHeroSaveStateByKey((current) => {
            const next = { ...current };
            delete next[slide.key];
            return next;
          });
          Alert.alert("Could not save", "Missing show id.");
          return;
        }
        await setStatus({ showId, status: "watchlist" });
        setHeroSaveStateByKey((current) => ({ ...current, [slide.key]: "saved" }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        setHeroSaveStateByKey((current) => {
          const next = { ...current };
          delete next[slide.key];
          return next;
        });
        Alert.alert("Could not save", String(error));
      }
    },
    [data, heroSaveStateByKey, ingestFromCatalog, setStatus],
  );

  const handleSyncContacts = useCallback(async () => {
    try {
      setSyncing(true);
      const entries = await loadDeviceContacts();
      const result = await syncContacts({ entries });
      await setContactsSyncDismissed(false);
      setContactNudgeDismissed(false);
      const copy = getContactSyncAlertCopy(result);
      Alert.alert(copy.title, copy.message);
    } catch (error) {
      Alert.alert("Could not sync contacts", String(error));
    } finally {
      setSyncing(false);
    }
  }, [syncContacts]);

  const handleDismissNudge = useCallback(async () => {
    await setContactsSyncDismissed(true);
    setContactNudgeDismissed(true);
  }, []);

  const sections = useMemo(
    () =>
      getHomeSectionPlan({
        hasProfile: data.hasProfile,
        showContactSyncNudge: data.showContactSyncNudge,
        contactNudgeDismissed,
        sectionSignals: discoverySectionSignals,
        socialSignal: socialSectionSignal,
        scheduleSignal: {
          known: Boolean(schedulePreview.preview),
          tonightCount: schedulePreview.tonightCount,
          upcomingCount: schedulePreview.weekCount,
        },
        now: surfaceNow,
      }),
    [
      data.hasProfile,
      data.showContactSyncNudge,
      contactNudgeDismissed,
      discoverySectionSignals,
      schedulePreview.preview,
      schedulePreview.tonightCount,
      schedulePreview.weekCount,
      socialSectionSignal,
      surfaceNow,
    ],
  );
  const initialRenderSectionCount = getHomeInitialRenderSectionCount(
    sections.length,
  );
  const visibleNumberedSectionKinds = useMemo(() => {
    const plannedKinds = new Set(sections.map((section) => section.kind));
    const visible = new Set<HomeSectionKind>();
    const add = (kind: HomeSectionKind, condition: boolean) => {
      if (condition && plannedKinds.has(kind)) {
        visible.add(kind);
      }
    };

    add(
      "continue-watching",
      data.hasProfile &&
        Array.isArray(continueWatchingItems) &&
        (continueWatchingItems.length > 0 ||
          shouldRenderContinueWatchingEmptyState(continueWatchingItems, true)),
    );
    add(
      "tonight",
      data.hasProfile &&
        Boolean(schedulePreview.preview) &&
        schedulePreview.hasScheduleItems,
    );
    add("curated", data.hasProfile && curatedEdits.length > 0);
    add(
      "for-you",
      data.hasProfile && (data.loading.forYou || forYouItems.length > 0),
    );
    add("heat", data.loading.heat || heatItems.length > 0);
    add("fresh", data.loading.fresh || freshItems.length > 0);
    add("critics", data.loading.critics || criticsItems.length > 0);
    add("quick", data.loading.quick || quickItems.length > 0);
    add("rooms", data.loading.rooms || streamingRooms.length > 0);
    add("friends", data.hasProfile && plannedKinds.has("friends"));

    return visible;
  }, [
    continueWatchingItems,
    criticsItems.length,
    curatedEdits.length,
    data.hasProfile,
    data.loading.critics,
    data.loading.forYou,
    data.loading.fresh,
    data.loading.heat,
    data.loading.quick,
    data.loading.rooms,
    forYouItems.length,
    freshItems.length,
    heatItems.length,
    quickItems.length,
    schedulePreview.hasScheduleItems,
    schedulePreview.preview,
    sections,
    streamingRooms.length,
  ]);
  const sectionDisplayIndexByKind = useMemo(
    () => getHomeSectionDisplayIndexes(sections, visibleNumberedSectionKinds),
    [sections, visibleNumberedSectionKinds],
  );
  const getSectionDisplayIndex = useCallback(
    (kind: HomeSectionKind) =>
      isNumberedHomeSectionKind(kind)
        ? sectionDisplayIndexByKind.get(kind)
        : undefined,
    [sectionDisplayIndexByKind],
  );

  const renderSectionContent = (item: HomeSection) => {
    switch (item.kind) {
      case "hero":
        return (
          <HeroCarousel
            slides={data.heroSlides}
            scrollY={scrollY}
            onPressSlide={handlePressHero}
            onSavePress={data.hasProfile ? handleSaveHero : undefined}
            saveStateByKey={heroSaveStateByKey}
            topInset={insets.top}
            now={surfaceNow}
            reduceMotionEnabled={reduceMotionEnabled}
          />
        );
      case "curated":
        if (!data.hasProfile || curatedEdits.length === 0) return null;
        return (
          <HomeCuratedEdits
            edits={curatedEdits}
            index={getSectionDisplayIndex(item.kind)}
            onPressItem={handlePressRailItem}
          />
        );
      case "continue-watching":
        if (!data.hasProfile) return null;
        return (
          <ContinueWatchingRail
            items={continueWatchingItems ?? null}
            hideWhenEmpty
            index={getSectionDisplayIndex(item.kind)}
          />
        );
      case "tonight":
        if (!data.hasProfile) return null;
        return (
          <TonightStrip
            schedule={schedulePreview}
            index={getSectionDisplayIndex(item.kind)}
          />
        );
      case "for-you": {
        if (data.loading.forYou && forYouItems.length === 0) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker={hasPersonalTasteSignals ? "Personal" : "Start"}
              title={hasPersonalTasteSignals ? "For you" : "Start here"}
              accent={FOR_YOU_ACCENT}
              icon="sparkles"
              variant="feature"
            />
          );
        }
        if (forYouItems.length === 0) return null;
        return (
          <SignatureRail
            index={getSectionDisplayIndex(item.kind)}
            kicker={hasPersonalTasteSignals ? "Personal" : "Start"}
            title={hasPersonalTasteSignals ? "For you" : "Start here"}
            accent={FOR_YOU_ACCENT}
            icon="sparkles"
            layout="feature"
            items={forYouItems}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
          />
        );
      }
      case "heat": {
        if (data.loading.heat && heatItems.length === 0) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker="Now"
              title="Trending"
              accent={HEAT_ACCENT}
              icon="flame"
              variant="feature"
            />
          );
        }
        if (heatItems.length === 0) return null;
        return (
          <SignatureRail
            index={getSectionDisplayIndex(item.kind)}
            kicker="Now"
            title="Trending"
            accent={HEAT_ACCENT}
            icon="flame"
            layout="feature"
            items={pulseHeatItems}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
          />
        );
      }
      case "fresh": {
        if (data.loading.fresh && freshItems.length === 0) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker="Fresh"
              title="New"
              accent={FRESH_ACCENT}
              icon="sparkles"
              variant="poster"
            />
          );
        }
        if (freshItems.length === 0) return null;
        return (
          <SignatureRail
            index={getSectionDisplayIndex(item.kind)}
            kicker="Fresh"
            title="New"
            accent={FRESH_ACCENT}
            icon="sparkles"
            layout="poster"
            items={freshItems}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
          />
        );
      }
      case "critics": {
        if (data.loading.critics && criticsItems.length === 0) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker="Quality"
              title="Acclaimed"
              accent={CRITICS_ACCENT}
              icon="star"
              variant="poster"
            />
          );
        }
        if (criticsItems.length === 0) return null;
        return (
          <SignatureRail
            index={getSectionDisplayIndex(item.kind)}
            kicker="Quality"
            title="Acclaimed"
            accent={CRITICS_ACCENT}
            icon="star"
            layout="poster"
            items={criticsItems}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
          />
        );
      }
      case "quick": {
        if (data.loading.quick && quickItems.length === 0) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker="Short"
              title="Quick"
              accent={QUICK_ACCENT}
              icon="timer"
              variant="poster"
            />
          );
        }
        if (quickItems.length === 0) return null;
        return (
          <SignatureRail
            index={getSectionDisplayIndex(item.kind)}
            kicker="Short"
            title="Quick"
            accent={QUICK_ACCENT}
            icon="timer"
            layout="poster"
            items={quickItems}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
          />
        );
      }
      case "rooms": {
        if (data.loading.rooms && streamingRooms.length === 0) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker="Watch"
              title="Streaming"
              accent={ROOMS_ACCENT}
              icon="tv"
              variant="ribbon"
            />
          );
        }
        if (streamingRooms.length === 0) return null;
        return (
          <StreamingRooms
            rooms={streamingRooms}
            index={getSectionDisplayIndex(item.kind)}
            cardWidth={roomCardWidth}
            mutedHeroTitleKeys={roomHardPreviewKeys}
            mutedSupportTitleKeys={roomSurfacePreviewKeys}
            softMutedSupportTitleKeys={roomSurfacePreviewKeys}
            allowMutedFeaturedFallback={false}
          />
        );
      }
      case "contact-sync":
        return (
          <View className="mt-6 px-6">
            <ContactsSyncCard
              title="Find friends"
              description="Contacts stay private."
              buttonLabel="Sync contacts"
              variant="compact"
              onPress={handleSyncContacts}
              onDismiss={handleDismissNudge}
              loading={syncing}
            />
          </View>
        );
      case "friends":
        if (!data.hasProfile) return null;
        return (
          <FriendsActivity
            index={getSectionDisplayIndex(item.kind)}
            viewerId={data.me?._id ?? null}
            contactMatches={data.contactMatches}
            similarTaste={data.similarTaste}
            suggested={data.suggested}
            feedItems={data.feedItems}
            feedEmpty={data.feedEmpty}
            onSyncContacts={handleSyncContacts}
            syncingContacts={syncing}
            hasSyncedContacts={data.hasSyncedContacts}
          />
        );
      default:
        return null;
    }
  };

  const renderItem = ({ item }: { item: HomeSection }) => {
    const content = renderSectionContent(item);
    if (!content) return null;
    const sectionTestID = getHomeSectionTestID(item.kind);
    const sectionDataSet = getHomeSectionWebDataSet(item.kind, sectionTestID);

    return (
      <WebDataSetView
        testID={sectionTestID}
        {...(sectionDataSet ? { dataSet: sectionDataSet } : {})}
      >
        {content}
      </WebDataSetView>
    );
  };

  return (
    <View testID="home-surface" style={styles.root}>
      <Animated.FlatList
        testID="home-surface-list"
        ref={listRef}
        data={sections}
        keyExtractor={(item) => item.kind}
        renderItem={renderItem}
        initialNumToRender={initialRenderSectionCount}
        maxToRenderPerBatch={initialRenderSectionCount}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#38bdf8"
            progressViewOffset={insets.top + 8}
          />
        }
      />

      <HomeTopBar
        scrollY={scrollY}
        displayName={data.me?.displayName ?? data.me?.name ?? null}
        username={data.me?.username ?? null}
        avatarUrl={data.me?.avatarUrl ?? null}
        notificationCount={schedulePreview.tonightCount + schedulePreview.weekCount}
      />
    </View>
  );
}

function isHomeTabPreviewEnabled(previewParam: unknown) {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    previewParam === "1"
  );
}

function loadHomePreviewData() {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return Promise.resolve<PreviewDataModule | null>(null);
  }

  return Promise.resolve(
    (require as (id: string) => PreviewDataModule)("../../lib/homePreviewData"),
  );
}

function LiveHomeScreen() {
  const data = useHomeData();
  return <HomeSurface data={data} />;
}

function HomeTabPreviewScreen() {
  const [previewData, setPreviewData] = useState<PreviewDataModule | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadHomePreviewData().then((module) => {
      if (mounted && module) setPreviewData(module);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const props = useMemo<HomeSurfaceProps | null>(() => {
    if (!previewData) return null;
    const buildData = previewData[
      ["build", "Home", "Preview", "Data"].join("") as "buildHomePreviewData"
    ];
    const buildContinueWatching = previewData[
      [
        "build",
        "Home",
        "Preview",
        "Continue",
        "Watching",
        "Items",
      ].join("") as "buildHomePreviewContinueWatchingItems"
    ];
    const buildSchedule = previewData[
      ["build", "Home", "Preview", "Schedule"].join("") as "buildHomePreviewSchedule"
    ];
    return {
      data: buildData(previewData.HOME_PREVIEW_NOW),
      continueWatchingItems: buildContinueWatching(),
      schedulePreview: buildSchedule(),
    };
  }, [previewData]);

  if (!props) return <LoadingScreen />;

  return <HomeSurface {...props} />;
}

export default function HomeScreen() {
  const params = useLocalSearchParams();
  const previewParam = Array.isArray(params.preview)
    ? params.preview[0]
    : params.preview;

  if (isHomeTabPreviewEnabled(previewParam)) {
    return <HomeTabPreviewScreen />;
  }

  return <LiveHomeScreen />;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#0D0F14",
    flex: 1,
  },
  listContent: {
    paddingBottom: 110,
  },
});
