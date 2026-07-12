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
  Text,
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
import { useAction, useQuery } from "../../lib/plotlist/react";
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
  getFriendsActivityPeople,
} from "../../components/FriendsActivity";
import { LoadingScreen } from "../../components/LoadingScreen";
import {
  getHomeTopBarGreetingLine,
  HOME_TOP_BAR_HEIGHT,
  HomeTopBar,
} from "../../components/HomeTopBar";
import { RailSkeleton } from "../../components/RailSkeleton";
import { SignatureRail, type SignatureRailItem } from "../../components/SignatureRail";
import {
  type HomeSchedulePreviewState,
  SCHEDULE_CARD_HEIGHT,
  SCHEDULE_CARD_WIDTH,
  TonightStrip,
  useHomeSchedulePreview,
} from "../../components/TonightStrip";

import { useContactSync } from "../../lib/useContactSync";
import {
  useContentWidth,
  useIsDesktopWeb,
  useWebPageStyle,
} from "../../lib/webLayout";
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
  getHomeDiscoveryPreviewKeys,
  limitHomeRailItemsByTitleAppearances,
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
import { getHomeDiscoveryRailHeaderCopy } from "../../lib/homeRailHeaderCopy";
import {
  getHomeDiscoverySectionSignal,
  getHomeSectionDisplayIndexes,
  getHomeSectionPlan,
  getHomeSectionTestID,
  isNumberedHomeSectionKind,
  type HomeSection,
  type HomeSectionKind,
} from "../../lib/homeSectionPlan";
import { getHomeRotationEpoch } from "../../lib/homeSurfaceRotation";
import {
  buildColdStartHomeShelfItems,
  buildPersonalHomeShelfItems,
  promoteContextualHomeShelfLead,
} from "../../lib/homeStarterShelf";
import { getHomeWarmScheduleSnapshot } from "../../lib/homeWarmCache";
import { getContactsSyncDismissed, setContactsSyncDismissed } from "../../lib/preferences";
import {
  type HomeData,
  useHomeData,
} from "../../lib/useHomeData";
import { useScrollToTopOnTabPress } from "../../lib/useScrollToTopOnTabPress";

const FOR_YOU_ACCENT = "#22C55E";
const HEAT_ACCENT = "#F59E0B";
const FRESH_ACCENT = "#38BDF8";
const CRITICS_ACCENT = "#F472B6";
const QUICK_ACCENT = "#A3E635";
const MIN_FEATURE_RAIL_ITEMS = 3;
const MIN_POSTER_RAIL_ITEMS = 4;
const MIN_DISTINCT_POSTER_RAIL_ITEMS = 3;
const MIN_QUICK_RAIL_ITEMS = 2;
const TARGET_FEATURE_RAIL_ITEMS = 5;
const TARGET_FRESH_RAIL_ITEMS = 4;
const TARGET_QUICK_RAIL_ITEMS = 3;
const FRESH_ROOM_TOP_UP_LIMIT = 8;
const MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES = 1;
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
  schedulePreview?: HomeSchedulePreviewState;
};

type PreviewDataModule = typeof import("../../lib/homePreviewData");

export function HomeSurface({
  data,
  continueWatchingItems: providedContinueWatchingItems,
  schedulePreview: providedSchedulePreview,
}: HomeSurfaceProps) {
  const width = useContentWidth();
  const isDesktopWeb = useIsDesktopWeb();
  const webPageStyle = useWebPageStyle();
  const insets = useSafeAreaInsets();
  const surfaceNow = data.generatedAt;
  // Discovery rail kickers shift with the time of day (titles stay fixed).
  const railHeaderCopy = useMemo(
    () => ({
      heat: getHomeDiscoveryRailHeaderCopy("heat", { now: surfaceNow }),
      fresh: getHomeDiscoveryRailHeaderCopy("fresh", { now: surfaceNow }),
      critics: getHomeDiscoveryRailHeaderCopy("critics", { now: surfaceNow }),
      quick: getHomeDiscoveryRailHeaderCopy("quick", { now: surfaceNow }),
    }),
    [surfaceNow],
  );
  const featureCardWidth = Math.min(Math.max(width - 48, 280), 360);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const listRef = useRef<Animated.FlatList<HomeSection>>(null);
  useScrollToTopOnTabPress(listRef as any);

  const [refreshing, setRefreshing] = useState(false);
  const [contactNudgeDismissed, setContactNudgeDismissed] = useState<boolean | null>(null);
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
  // Whether last session's schedule had content decides if the tonight strip
  // holds its slot with a skeleton or stays collapsed while loading.
  const [warmScheduleHasItems] = useState(() => {
    const snapshot = getHomeWarmScheduleSnapshot();
    return Boolean(
      snapshot && (snapshot.tonightCount > 0 || snapshot.weekCount > 0),
    );
  });
  const scheduleLoading =
    data.hasProfile && !schedulePreview.preview && schedulePreview.loading;
  const unreadNotifications = Number(
    useQuery(
      api.notifications.getUnreadCount,
      data.hasProfile ? {} : "skip",
    ) ?? 0,
  );
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
  const personalPreviewKeys = useMemo(
    () => new Set([...continueWatchingPreviewKeys]),
    [continueWatchingPreviewKeys],
  );
  const visibleOpeningSurfaceItems = useMemo(
    () => getContinueWatchingPreviewItems(activeContinueWatchingItems),
    [activeContinueWatchingItems],
  );
  const visibleEditorialSurfaceItems = visibleOpeningSurfaceItems;
  const railPreviewKeys = personalPreviewKeys;
  const visibleEditorialPreviewKeys = railPreviewKeys;
  const forYouPreviewKeys = useMemo(
    () => new Set([...visibleEditorialPreviewKeys]),
    [visibleEditorialPreviewKeys],
  );
  const forYouPrecedingSurfaceItems = useMemo(
    () => [...visibleOpeningSurfaceItems],
    [visibleOpeningSurfaceItems],
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
  const forYouItems = useMemo(
    () => {
      const candidates = topUpHomeRailItemsPreservingSources(
        primaryShelfItems,
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
      primaryShelfItems,
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
  const discoverySectionSignals = useMemo(
    () => ({
      heat: getHomeDiscoverySectionSignal(heatItems, surfaceNow),
      fresh: getHomeDiscoverySectionSignal(freshItems, surfaceNow),
      critics: getHomeDiscoverySectionSignal(criticsItems, surfaceNow),
      quick: getHomeDiscoverySectionSignal(quickItems, surfaceNow),
    }),
    [
      heatItems,
      freshItems,
      criticsItems,
      quickItems,
      surfaceNow,
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
        feedItemCount: data.friendActivity.length,
        peopleSuggestionCount: displayablePeople.length,
        hasSyncedContacts: data.hasSyncedContacts,
        contactStatusKnown: data.contactStatusKnown,
      };
    },
    [
      data.contactMatches,
      data.contactMatches.length,
      data.contactStatusKnown,
      data.friendActivity,
      data.friendActivity.length,
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
  // Shared sync engine: permission recovery, query invalidation, and the
  // silent daily background resync — home is frame one, so this is where
  // the background refresh usually runs.
  const { isSyncing: syncing, syncNow } = useContactSync({
    enabled: data.hasProfile,
    hasSyncedBefore: data.hasSyncedContacts,
  });

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

  const handleSyncContacts = useCallback(async () => {
    const result = await syncNow();
    if (result) {
      setContactNudgeDismissed(false);
    }
  }, [syncNow]);

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
        rotationSeed: getHomeRotationEpoch(surfaceNow),
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
        (continueWatchingItems === undefined ||
          (Array.isArray(continueWatchingItems) &&
            (continueWatchingItems.length > 0 ||
              shouldRenderContinueWatchingEmptyState(
                continueWatchingItems,
                true,
              )))),
    );
    add(
      "tonight",
      data.hasProfile &&
        ((Boolean(schedulePreview.preview) && schedulePreview.hasScheduleItems) ||
          (scheduleLoading && warmScheduleHasItems)),
    );
    add(
      "for-you",
      data.hasProfile && (data.loading.forYou || forYouItems.length > 0),
    );
    add("heat", data.loading.heat || heatItems.length > 0);
    add("fresh", data.loading.fresh || freshItems.length > 0);
    add("critics", data.loading.critics || criticsItems.length > 0);
    add("quick", data.loading.quick || quickItems.length > 0);
    add("friends", data.hasProfile && plannedKinds.has("friends"));

    return visible;
  }, [
    continueWatchingItems,
    criticsItems.length,
    data.hasProfile,
    data.loading.critics,
    data.loading.forYou,
    data.loading.fresh,
    data.loading.heat,
    data.loading.quick,
    forYouItems.length,
    freshItems.length,
    heatItems.length,
    quickItems.length,
    scheduleLoading,
    schedulePreview.hasScheduleItems,
    schedulePreview.preview,
    sections,
    warmScheduleHasItems,
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
        if (scheduleLoading && warmScheduleHasItems) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker="Schedule"
              title="Releases"
              accent="#38BDF8"
              icon="radio"
              variant="banner"
              cardWidth={SCHEDULE_CARD_WIDTH}
              cardHeight={SCHEDULE_CARD_HEIGHT}
            />
          );
        }
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
              variant="poster"
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
            layout="poster"
            items={forYouItems}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
          />
        );
      }
      case "taste-rails": {
        // Recs v2 facet rails; silent until the taste profile produces them,
        // so there is no skeleton — the section simply appears when ready.
        if (data.tasteRails.length === 0) return null;
        return (
          <View>
            {data.tasteRails.map((rail) => (
              <SignatureRail
                key={rail.key}
                kicker="Because you're into"
                title={rail.title}
                accent={FOR_YOU_ACCENT}
                icon="color-wand"
                layout="poster"
                items={rail.items}
                featureCardWidth={featureCardWidth}
                onPressItem={handlePressRailItem}
              />
            ))}
          </View>
        );
      }
      case "heat": {
        if (data.loading.heat && heatItems.length === 0) {
          return (
            <RailSkeleton
              index={getSectionDisplayIndex(item.kind)}
              kicker={railHeaderCopy.heat.kicker}
              title={railHeaderCopy.heat.title}
              accent={HEAT_ACCENT}
              icon="flame"
              variant="poster"
            />
          );
        }
        if (heatItems.length === 0) return null;
        return (
          <SignatureRail
            index={getSectionDisplayIndex(item.kind)}
            kicker={railHeaderCopy.heat.kicker}
            title={railHeaderCopy.heat.title}
            accent={HEAT_ACCENT}
            icon="flame"
            layout="poster"
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
              kicker={railHeaderCopy.fresh.kicker}
              title={railHeaderCopy.fresh.title}
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
            kicker={railHeaderCopy.fresh.kicker}
            title={railHeaderCopy.fresh.title}
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
              kicker={railHeaderCopy.critics.kicker}
              title={railHeaderCopy.critics.title}
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
            kicker={railHeaderCopy.critics.kicker}
            title={railHeaderCopy.critics.title}
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
              kicker={railHeaderCopy.quick.kicker}
              title={railHeaderCopy.quick.title}
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
            kicker={railHeaderCopy.quick.kicker}
            title={railHeaderCopy.quick.title}
            accent={QUICK_ACCENT}
            icon="timer"
            layout="poster"
            items={quickItems}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
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
            activity={data.friendActivity}
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

  // Desktop web replaces the floating mobile top bar (avatar + bell live in
  // the sidebar there) with an inline greeting header.
  const desktopHeader = isDesktopWeb ? (
    <View className="px-6 pb-2 pt-8">
      <Text className="text-[28px] font-black tracking-tight text-text-primary">
        {getHomeTopBarGreetingLine(
          new Date(surfaceNow),
          data.me?.displayName ?? data.me?.name ?? null,
        )}
      </Text>
    </View>
  ) : null;

  return (
    <View testID="home-surface" style={styles.root}>
      <Animated.FlatList
        testID="home-surface-list"
        ref={listRef}
        data={sections}
        keyExtractor={(item) => item.kind}
        renderItem={renderItem}
        ListHeaderComponent={desktopHeader}
        initialNumToRender={initialRenderSectionCount}
        maxToRenderPerBatch={initialRenderSectionCount}
        contentContainerStyle={[
          styles.listContent,
          webPageStyle,
          isDesktopWeb
            ? styles.desktopListContent
            : { paddingTop: insets.top + HOME_TOP_BAR_HEIGHT },
        ]}
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

      {isDesktopWeb ? null : (
        <HomeTopBar
          scrollY={scrollY}
          displayName={data.me?.displayName ?? data.me?.name ?? null}
          username={data.me?.username ?? null}
          avatarUrl={data.me?.avatarUrl ?? null}
          notificationCount={unreadNotifications}
        />
      )}
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
  desktopListContent: {
    paddingBottom: 56,
  },
});
