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
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAccent } from "../../lib/appearanceStore";
import { notifyError } from "../../lib/dialogs";
import { guardedPush } from "../../lib/navigation";
import { queryDataUpdatedAt, useAction, useQuery } from "../../lib/plotlist/react";
import { queryClient } from "../../lib/queryClient";
import { getUpNextQueryArgs } from "../../lib/upNextQueryArgs";
import { api } from "../../lib/plotlist/api";

import { ContactsSyncCard } from "../../components/ContactsSyncCard";
import { GlassPressable } from "../../components/NativeGlass";
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
  useIsWideLayout,
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
  reconcileHomeSectionOrder,
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
  HOME_RAIL_DISTINCT_FLOOR,
  HOME_RAIL_POOL_LIMIT,
  type HomeData,
  useHomeData,
} from "../../lib/useHomeData";
import { useScrollToTopOnTabPress } from "../../lib/useScrollToTopOnTabPress";

const FOR_YOU_ACCENT = "#22C55E";
const HEAT_ACCENT = "#F59E0B";
const CRITICS_ACCENT = "#F472B6";
const QUICK_ACCENT = "#A3E635";
const MIN_FEATURE_RAIL_ITEMS = 3;
// Foregrounding after this long refetches the Continue rail before re-ranking it.
const CONTINUE_FOREGROUND_REFRESH_MS = 5 * 60 * 1000;
const MIN_DISTINCT_POSTER_RAIL_ITEMS = 3;
const MIN_QUICK_RAIL_ITEMS = 2;
// How deep each discovery rail runs. SignatureRail mounts a leading window
// and reveals the rest on scroll, so this is scroll depth, not first-frame
// work; the minimums above still decide whether a rail shows at all.
const TARGET_DISCOVERY_RAIL_ITEMS = 24;
// Rails stay distinct from the rails above them while they hold this many
// distinct titles; below it, a title may repeat across two discovery rails
// (behind the distinct ones) instead of leaving the later rail short. The
// Continue rail and the shelf lead are never repeated.
const DISCOVERY_RAIL_DISTINCT_FLOOR = HOME_RAIL_DISTINCT_FLOOR;
// Section ordering reads each rail's leading items — roughly one screen of
// cards — so a deep pool does not inflate a rail's currentness score.
const SECTION_SIGNAL_ITEM_WINDOW = 6;
const FRESH_ROOM_TOP_UP_LIMIT = 8;
// A rail prefers titles not yet on the surface (one appearance) …
const MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES = 1;
// … and a repeat below the floor may put a title on a second discovery
// rail, never a third.
const MAX_DISCOVERY_TITLE_TOTAL_APPEARANCES = 2;
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

const homeSectionKeyExtractor = (item: HomeSection) => item.kind;

function getFreshRoomTopUpItems(
  data: Pick<HomeData, "streamingRooms" | "getCatalogForKey">,
): SignatureRailItem[] {
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
  const isWideLayout = useIsWideLayout();
  const webPageStyle = useWebPageStyle();
  const insets = useSafeAreaInsets();
  const accent = useAccent();
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
  // Every layout gets the same rail depth (the rail reveals it lazily); only
  // the reserve — the leading titles a later rail holds back from earlier
  // ones — scales with how many cards a wide layout shows at once.
  const targetRailItems = TARGET_DISCOVERY_RAIL_ITEMS;
  const reserveRailLimit = isWideLayout ? 8 : MIN_DISTINCT_POSTER_RAIL_ITEMS;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const listRef = useRef<Animated.FlatList<HomeSection>>(null);
  useScrollToTopOnTabPress(listRef as any);

  const [refreshing, setRefreshing] = useState(false);
  // The Continue rail re-ranks only at natural "fresh look" moments — tab
  // focus, pull-to-refresh, app foreground — so a mark-watched tap never
  // reorders cards under the user's finger (see ContinueWatchingRail).
  const [continueOrderEpoch, setContinueOrderEpoch] = useState(0);
  const bumpContinueOrderEpoch = useCallback(() => {
    setContinueOrderEpoch((current) => current + 1);
  }, []);
  useFocusEffect(bumpContinueOrderEpoch);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      bumpContinueOrderEpoch();
      // Episodes drop while the app is backgrounded; if the rail's data is
      // old enough to have missed one, refetch it (cheap, per-user) so a
      // fresh look really is fresh.
      const updatedAt = queryDataUpdatedAt(api.episodeProgress.getUpNext, getUpNextQueryArgs());
      if (updatedAt !== null && Date.now() - updatedAt > CONTINUE_FOREGROUND_REFRESH_MS) {
        void queryClient.invalidateQueries({
          queryKey: ["plotlist-rpc", "query", "episodeProgress:getUpNext"],
          refetchType: "active",
        });
      }
    });
    return () => subscription.remove();
  }, [bumpContinueOrderEpoch]);
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
            limit: HOME_RAIL_POOL_LIMIT,
            now: surfaceNow,
          })
        : buildColdStartHomeShelfItems({
            forYou: data.forYou,
            heat: data.heat,
            fresh: data.fresh,
            critics: data.critics,
            quick: data.quick,
            limit: HOME_RAIL_POOL_LIMIT,
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
  // For You borrows from the other rails only while each keeps its distinct
  // floor, so filling the shelf never leaves a later rail short.
  const forYouTopUpSources = useMemo(
    () => [
      {
        items: data.critics,
        candidates: getShelfTopUpCandidates(data.critics, DISCOVERY_RAIL_DISTINCT_FLOOR),
        minimumRemaining: DISCOVERY_RAIL_DISTINCT_FLOOR,
      },
      {
        items: data.quick,
        candidates: getShelfTopUpCandidates(data.quick, DISCOVERY_RAIL_DISTINCT_FLOOR),
        minimumRemaining: DISCOVERY_RAIL_DISTINCT_FLOOR,
      },
      {
        items: data.heat,
        candidates: getShelfTopUpCandidates(data.heat, DISCOVERY_RAIL_DISTINCT_FLOOR),
        minimumRemaining: DISCOVERY_RAIL_DISTINCT_FLOOR,
      },
      {
        items: data.fresh,
        candidates: getShelfTopUpCandidates(data.fresh, DISCOVERY_RAIL_DISTINCT_FLOOR),
        minimumRemaining: DISCOVERY_RAIL_DISTINCT_FLOOR,
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
        targetRailItems,
      );
      const contextualLeadCandidates = hasPersonalTasteSignals
        ? promoteContextualHomeShelfLead(candidates, { now: surfaceNow })
        : candidates;
      return limitHomeRailItemsByTitleAppearances(
        contextualLeadCandidates,
        forYouPrecedingSurfaceItems,
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_FEATURE_RAIL_ITEMS,
        targetRailItems,
      );
    },
    [
      primaryShelfItems,
      forYouTopUpSources,
      hasPersonalTasteSignals,
      surfaceNow,
      forYouPreviewKeys,
      forYouPrecedingSurfaceItems,
      targetRailItems,
    ],
  );
  // Hard dedupe for every rail below For You: the Continue rail and the
  // shelf lead never repeat. Everything else rendered earlier is only
  // budgeted against (soft), via each rail's preceding-items list.
  const discoveryHardPreviewKeys = useMemo(
    () =>
      new Set([
        ...visibleEditorialPreviewKeys,
        ...getHomeRailIdentitySet(forYouItems.slice(0, 1)),
      ]),
    [forYouItems, visibleEditorialPreviewKeys],
  );
  const heatRoomTopUpItems = useMemo(
    () => getHomeRoomHeatTopUpItems(data),
    [data.generatedAt, data.getCatalogForKey, data.streamingRooms],
  );
  const qualityRoomTopUpItems = useMemo(
    () => getHomeRoomQualityTopUpItems(data),
    [data.generatedAt, data.getCatalogForKey, data.streamingRooms],
  );
  const quickRoomTopUpItems = useMemo(
    () => getHomeRoomQuickTopUpItems(data),
    [data.generatedAt, data.getCatalogForKey, data.streamingRooms],
  );
  const heatItems = useMemo(
    () => {
      const candidates = removePreviewedHomeRailItems(
        [...data.heat, ...heatRoomTopUpItems],
        discoveryHardPreviewKeys,
        MIN_FEATURE_RAIL_ITEMS,
      );
      return limitHomeRailItemsByTitleAppearances(
        candidates,
        [...visibleEditorialSurfaceItems, ...forYouItems],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_FEATURE_RAIL_ITEMS,
        targetRailItems,
        {
          distinctFloor: DISCOVERY_RAIL_DISTINCT_FLOOR,
          maxTotalAppearances: MAX_DISCOVERY_TITLE_TOTAL_APPEARANCES,
        },
      );
    },
    [
      data.heat,
      heatRoomTopUpItems,
      discoveryHardPreviewKeys,
      forYouItems,
      visibleEditorialSurfaceItems,
      targetRailItems,
    ],
  );
  const pulseHeatItems = useMemo(
    () => heatItems.map((railItem) => ({ ...railItem, rank: null })),
    [heatItems],
  );
  const freshRoomTopUpItems = useMemo(
    () => getFreshRoomTopUpItems(data),
    [data.getCatalogForKey, data.streamingRooms],
  );
  // Reserves: the leading fresh/critics titles are settled before Quick
  // picks so a later rail cannot take them; they keep the strict (small)
  // limits since only the head of each rail is reserved.
  const freshReservePreviewKeys = useMemo(
    () =>
      new Set([
        ...visibleEditorialPreviewKeys,
        ...getHomeRailIdentitySet(forYouItems),
        ...getHomeRailIdentitySet(heatItems),
      ]),
    [forYouItems, heatItems, visibleEditorialPreviewKeys],
  );
  const freshCandidateItems = useMemo(
    () =>
      removePreviewedHomeRailItems(
        [...data.fresh, ...freshRoomTopUpItems],
        discoveryHardPreviewKeys,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
      ),
    [data.fresh, freshRoomTopUpItems, discoveryHardPreviewKeys],
  );
  const freshReserveItems = useMemo(
    () =>
      buildVisibleFreshRailItems({
        items: freshCandidateItems,
        previewKeys: freshReservePreviewKeys,
        precedingItems: [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
        ],
        maxTitleAppearances: MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        minimumRemaining: MIN_DISTINCT_POSTER_RAIL_ITEMS,
        limit: reserveRailLimit,
        now: surfaceNow,
      }),
    [
      freshCandidateItems,
      freshReservePreviewKeys,
      forYouItems,
      heatItems,
      reserveRailLimit,
      surfaceNow,
      visibleEditorialSurfaceItems,
    ],
  );
  const criticsCandidateItems = useMemo(
    () =>
      removePreviewedHomeRailItems(
        [...data.critics, ...qualityRoomTopUpItems],
        discoveryHardPreviewKeys,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
      ),
    [data.critics, qualityRoomTopUpItems, discoveryHardPreviewKeys],
  );
  const criticsReserveItems = useMemo(
    () =>
      limitHomeRailItemsByTitleAppearances(
        criticsCandidateItems,
        [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
          ...freshReserveItems,
        ],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
        reserveRailLimit,
      ),
    [
      criticsCandidateItems,
      forYouItems,
      heatItems,
      freshReserveItems,
      reserveRailLimit,
      visibleEditorialSurfaceItems,
    ],
  );
  const quickItems = useMemo(
    () => {
      const candidates = removePreviewedHomeRailItems(
        [...data.quick, ...quickRoomTopUpItems],
        discoveryHardPreviewKeys,
        MIN_QUICK_RAIL_ITEMS,
      );
      return limitHomeRailItemsByTitleAppearances(
        candidates,
        [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
          ...freshReserveItems,
          ...criticsReserveItems,
        ],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_QUICK_RAIL_ITEMS,
        targetRailItems,
        {
          distinctFloor: DISCOVERY_RAIL_DISTINCT_FLOOR,
          maxTotalAppearances: MAX_DISCOVERY_TITLE_TOTAL_APPEARANCES,
        },
      );
    },
    [
      data.quick,
      quickRoomTopUpItems,
      discoveryHardPreviewKeys,
      forYouItems,
      heatItems,
      freshReserveItems,
      criticsReserveItems,
      targetRailItems,
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
        distinctFloor: DISCOVERY_RAIL_DISTINCT_FLOOR,
        maxTotalAppearances: MAX_DISCOVERY_TITLE_TOTAL_APPEARANCES,
        limit: targetRailItems,
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
      targetRailItems,
      visibleEditorialSurfaceItems,
    ],
  );
  const criticsItems = useMemo(
    () =>
      limitHomeRailItemsByTitleAppearances(
        criticsCandidateItems,
        [
          ...visibleEditorialSurfaceItems,
          ...forYouItems,
          ...heatItems,
          ...freshItems,
          ...quickItems,
        ],
        MAX_VISIBLE_DISCOVERY_TITLE_APPEARANCES,
        MIN_DISTINCT_POSTER_RAIL_ITEMS,
        targetRailItems,
        {
          distinctFloor: DISCOVERY_RAIL_DISTINCT_FLOOR,
          maxTotalAppearances: MAX_DISCOVERY_TITLE_TOTAL_APPEARANCES,
        },
      ),
    [
      criticsCandidateItems,
      forYouItems,
      heatItems,
      freshItems,
      quickItems,
      targetRailItems,
      visibleEditorialSurfaceItems,
    ],
  );
  const discoverySectionSignals = useMemo(
    () => ({
      heat: getHomeDiscoverySectionSignal(
        heatItems.slice(0, SECTION_SIGNAL_ITEM_WINDOW),
        surfaceNow,
      ),
      fresh: getHomeDiscoverySectionSignal(
        freshItems.slice(0, SECTION_SIGNAL_ITEM_WINDOW),
        surfaceNow,
      ),
      critics: getHomeDiscoverySectionSignal(
        criticsItems.slice(0, SECTION_SIGNAL_ITEM_WINDOW),
        surfaceNow,
      ),
      quick: getHomeDiscoverySectionSignal(
        quickItems.slice(0, SECTION_SIGNAL_ITEM_WINDOW),
        surfaceNow,
      ),
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
      bumpContinueOrderEpoch();
    }
  }, [bumpContinueOrderEpoch, data.refresh, schedulePreview]);

  const openShowFromKey = useCallback(
    async (key: string, fallbackTitle: string) => {
      const catalog = data.getCatalogForKey(key);
      if (!catalog) {
        notifyError("Could not open show", `Missing catalog data for ${fallbackTitle}.`);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const knownId = catalog._id ?? catalog.showId;
      if (knownId) {
        guardedPush({ pathname: "/show/[id]", params: { id: knownId } });
        return;
      }
      if (!catalog.externalId) {
        notifyError("Could not open show", "This catalog item is missing an id.");
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
        notifyError("Could not add show", String(error));
      }
    },
    [data.getCatalogForKey, ingestFromCatalog],
  );

  const handlePressRailItem = useCallback(
    (item: SignatureRailItem) => {
      void openShowFromKey(item.key, item.title);
    },
    [openShowFromKey],
  );

  // On web, rail cards whose show already exists in the catalog render as
  // real links (cmd/middle-click work); items that still need ingest keep
  // the onPressItem fallback. Native output is untouched.
  const withShowHrefs = useCallback(
    (items: SignatureRailItem[]) => {
      if (Platform.OS !== "web") return items;
      return items.map((item) => {
        const catalog = data.getCatalogForKey(item.key);
        const knownId = catalog?._id ?? catalog?.showId;
        return knownId
          ? { ...item, href: `/show/${knownId}` as Href }
          : item;
      });
    },
    [data.getCatalogForKey],
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

  // Section order is sticky for the life of the surface: data arriving after
  // first paint may add or remove sections, but never reorders the ones
  // already on screen. Re-ranking (signals, rotation) applies on the next
  // mount. The ref mutation inside the memo is safe because reconciling an
  // already-reconciled order is a no-op.
  const stickySectionOrderRef = useRef<HomeSectionKind[] | null>(null);
  const sections = useMemo(
    () => {
      const planned = getHomeSectionPlan({
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
      });
      const reconciled = reconcileHomeSectionOrder(
        stickySectionOrderRef.current,
        planned,
      );
      stickySectionOrderRef.current = reconciled.map((section) => section.kind);
      return reconciled;
    },
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

  const renderSectionContent = useCallback((item: HomeSection) => {
    switch (item.kind) {
      case "continue-watching":
        if (!data.hasProfile) return null;
        return (
          <ContinueWatchingRail
            items={continueWatchingItems ?? null}
            activeItems={activeContinueWatchingItems}
            hideWhenEmpty
            index={getSectionDisplayIndex(item.kind)}
            orderEpoch={continueOrderEpoch}
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
              accent={accent.ramp[400]}
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
      case "ask":
        // Static entry card — no RPC on mount, safe for the warm-start cache.
        if (!data.hasProfile) return null;
        return (
          <View className="mt-6 px-6">
            <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                guardedPush("/ask");
              }}
              radius={16}
              variant="tinted"
              accessibilityRole="button"
              accessibilityLabel="Ask Plotlist what to watch tonight"
              contentStyle={styles.askCardContent}
            >
              <View
                style={[
                  styles.askCardIcon,
                  { backgroundColor: accent.rgba(400, 0.16) },
                ]}
              >
                <Ionicons
                  name="sparkles"
                  size={17}
                  color={accent.ramp[400]}
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden={true}
                  importantForAccessibility="no"
                />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-bold text-text-primary">
                  Ask Plotlist
                </Text>
                <Text className="mt-0.5 text-[12px] text-text-tertiary" numberOfLines={1}>
                  Tell me what you're in the mood for
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={15}
                color="#5A6070"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
            </GlassPressable>
          </View>
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
            items={withShowHrefs(forYouItems)}
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
                items={withShowHrefs(rail.items)}
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
            items={withShowHrefs(pulseHeatItems)}
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
              accent={accent.ramp[400]}
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
            accent={accent.ramp[400]}
            icon="sparkles"
            layout="poster"
            items={withShowHrefs(freshItems)}
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
            items={withShowHrefs(criticsItems)}
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
            items={withShowHrefs(quickItems)}
            featureCardWidth={featureCardWidth}
            onPressItem={handlePressRailItem}
          />
        );
      }
      case "contact-sync":
        // Device contact sync is native-only.
        if (Platform.OS === "web") return null;
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
  }, [
    accent,
    activeContinueWatchingItems,
    continueWatchingItems,
    criticsItems,
    data.contactMatches,
    data.feedEmpty,
    data.friendActivity,
    data.hasProfile,
    data.hasSyncedContacts,
    data.loading.critics,
    data.loading.forYou,
    data.loading.fresh,
    data.loading.heat,
    data.loading.quick,
    data.me,
    data.similarTaste,
    data.suggested,
    data.tasteRails,
    featureCardWidth,
    forYouItems,
    freshItems,
    getSectionDisplayIndex,
    continueOrderEpoch,
    handleDismissNudge,
    handlePressRailItem,
    handleSyncContacts,
    hasPersonalTasteSignals,
    heatItems,
    pulseHeatItems,
    quickItems,
    railHeaderCopy,
    scheduleLoading,
    schedulePreview,
    syncing,
    warmScheduleHasItems,
    withShowHrefs,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: HomeSection }) => {
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
    },
    [renderSectionContent],
  );

  // Desktop web replaces the floating mobile top bar (avatar + bell live in
  // the sidebar there) with an inline greeting header.
  const desktopHeader = isDesktopWeb ? (
    <View className="flex-row items-center justify-between gap-4 px-6 pb-2 pt-8">
      <Text className="flex-1 text-[28px] font-black tracking-tight text-text-primary">
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
        keyExtractor={homeSectionKeyExtractor}
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
            tintColor={accent.ramp[400]}
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
  askCardContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  askCardIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
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
