import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "../../components/FlashList";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useAuth, useQuery } from "../../lib/plotlist/react";
import { guardedPush } from "../../lib/navigation";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { EmptyState } from "../../components/EmptyState";
import { PeopleDiscovery } from "../../components/PeopleDiscovery";
import { RailSkeleton } from "../../components/RailSkeleton";
import { Screen } from "../../components/Screen";
import {
  SearchCommandCenter,
  type SearchMode,
} from "../../components/SearchCommandCenter";
import { SearchDiscoveryRail } from "../../components/SearchDiscoveryRail";
import { SearchResultRow } from "../../components/SearchResultRow";
import { api } from "../../lib/plotlist/api";
import {
  SEARCH_DISCOVER_SECTIONS,
  buildSearchDiscoverSections,
  getSearchDiscoverCacheKey,
  getSearchDiscoverFetchPlan,
  getSearchDiscoverSectionsForProviders,
  getDailyDiscoverPage,
  type SearchDiscoverSection,
} from "../../lib/searchDiscover";
import {
  CATALOG_SORT_OPTIONS,
  getCatalogSearchViewState,
  getTrimmedSearchQuery,
  sortCatalogResults,
  type CatalogSortKey,
} from "../../lib/searchExperience";
import { normalizeStreamingProviderKeys } from "../../lib/streamingProviders";
import { queryClient } from "../../lib/queryClient";
import { FACET_DEFS } from "../../lib/plotlist/facets";

const SHOW_QUERY_MIN_LENGTH = 3;
const VIBE_QUERY_MIN_LENGTH = 8;

// Canned prompts that teach what vibe search understands; tapping one runs it.
const VIBE_EXAMPLE_PROMPTS = [
  "cozy mystery in a small town",
  "mind-bending sci-fi that rewards theories",
  "funny but heartfelt, about grief",
  "high-stakes kitchen chaos",
  "slow-burn romance with great chemistry",
  "dark crime saga with a magnetic antihero",
];

// Compact browse entry: a curated slice of the facet taxonomy. The full
// catalog lives at /facet/[key].
const VIBE_BROWSE_FACET_KEYS = [
  "cozy-comfort",
  "prestige-antihero",
  "mind-bending",
  "cozy-crime",
  "feel-good",
  "true-crime-doc",
  "k-drama",
  "high-fantasy",
  "nordic-noir",
  "dark-comedy",
  "gentle-baking",
  "space-opera",
];

const DISCOVER_FETCH_LIMIT = 18;
const DISCOVER_SKELETONS = [
  { accent: "#F59E0B", kicker: "Discover", title: "Trending Today" },
  { accent: "#38BDF8", kicker: "Discover", title: "Fresh Premieres" },
  { accent: "#F472B6", kicker: "Discover", title: "Hidden Gems" },
];
const DISCOVER_ACCENTS: Record<string, string> = {
  airing_today: "#A3E635",
  apple_tv: "#F1F3F7",
  disney_plus: "#60A5FA",
  fresh_premieres: "#38BDF8",
  genre_comedy: "#FDE68A",
  genre_crime: "#FB7185",
  genre_drama: "#C084FC",
  genre_sci_fi: "#22D3EE",
  hidden_gems: "#F472B6",
  hulu: "#22C55E",
  max: "#818CF8",
  netflix: "#F87171",
  prime_video: "#38BDF8",
  top_rated: "#FACC15",
  trending_day: "#F59E0B",
};

let searchDiscoverCache:
  | { key: string; sections: SearchDiscoverSection<any>[] }
  | null = null;

export function getSearchSectionAccent(
  section: Pick<SearchDiscoverSection<any>, "key">,
  index = 0,
) {
  return (
    DISCOVER_ACCENTS[section.key] ??
    ["#38BDF8", "#22C55E", "#F59E0B", "#F472B6"][index % 4]
  );
}

/* ─── Section Header ───────────────────────────────────────────────── */

function SectionLine({
  label,
  count,
  icon,
}: {
  label: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="mb-2 flex-row items-center gap-2">
      <View className="flex-row items-center gap-1.5">
        {icon && <Ionicons name={icon} size={14} color="#5A6070" />}
        <Text className="text-[11px] font-bold uppercase text-text-tertiary">
          {label}
        </Text>
      </View>
      {count !== undefined && count > 0 && (
        <View className="rounded-full bg-dark-elevated px-1.5 py-0.5">
          <Text className="text-[11px] font-medium text-text-tertiary">
            {count}
          </Text>
        </View>
      )}
      <View className="flex-1 h-px bg-dark-border" />
    </View>
  );
}

function SearchLoadingRows() {
  return (
    <View className="py-1">
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          style={styles.resultSkeleton}
          className="flex-row gap-3"
        >
          <View className="h-[78px] w-[52px] rounded-lg bg-dark-elevated" />
          <View className="flex-1 py-1">
            <View className="h-4 w-3/4 rounded bg-dark-elevated" />
            <View className="mt-3 h-3 w-20 rounded bg-dark-elevated" />
            <View className="mt-4 h-3 w-full rounded bg-dark-elevated" />
            <View className="mt-2 h-3 w-2/3 rounded bg-dark-elevated" />
          </View>
        </View>
      ))}
    </View>
  );
}

function SearchDiscoverSkeletons() {
  return (
    <View style={styles.discoverSkeletonStack}>
      {DISCOVER_SKELETONS.map((section, index) => (
        <RailSkeleton
          key={section.title}
          index={index + 1}
          kicker={section.kicker}
          title={section.title}
          accent={section.accent}
          variant="poster"
        />
      ))}
    </View>
  );
}

function SearchErrorCard({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorCard}>
      <View style={styles.errorIcon}>
        <Ionicons name="refresh" size={18} color="#0D0F14" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-black text-text-primary">{title}</Text>
        <Text className="mt-1 text-sm leading-5 text-text-tertiary">
          {description}
        </Text>
      </View>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`Retry ${title}`}
        style={styles.retryButton}
        className="active:opacity-75"
      >
        <Text className="text-[13px] font-black text-text-inverse">Retry</Text>
      </Pressable>
    </View>
  );
}

/* ─── Main Screen ──────────────────────────────────────────────────── */

export default function SearchScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const hasProfile = Boolean(me?._id);
  const params = useLocalSearchParams();
  const inputRef = useRef<TextInput>(null);

  const [mode, setMode] = useState<SearchMode>("shows");
  const [query, setQuery] = useState("");
  const trimmedQuery = getTrimmedSearchQuery(query);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [vibeResults, setVibeResults] = useState<any[]>([]);
  const [vibeResultsQuery, setVibeResultsQuery] = useState("");
  const [isSearchingVibe, setIsSearchingVibe] = useState(false);
  const [vibeError, setVibeError] = useState<string | null>(null);
  const [vibeRetryKey, setVibeRetryKey] = useState(0);
  const [catalogResults, setCatalogResults] = useState<any[]>([]);
  const [catalogResultsQuery, setCatalogResultsQuery] = useState("");
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<{
    query: string;
    message: string;
  } | null>(null);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [sortKey, setSortKey] = useState<CatalogSortKey>("match");
  const deferredCatalogResults = useDeferredValue(catalogResults);
  const sortedCatalogResults = useMemo(
    () => sortCatalogResults(deferredCatalogResults, sortKey),
    [deferredCatalogResults, sortKey],
  );

  const catalogViewState = useMemo(
    () =>
      getCatalogSearchViewState({
        mode,
        query,
        debouncedQuery,
        minLength: SHOW_QUERY_MIN_LENGTH,
        isAuthenticated,
        isSearching: isSearchingCatalog,
        resultCount: deferredCatalogResults.length,
        pendingResultCount: catalogResults.length,
        resultsQuery: catalogResultsQuery,
        hasError: catalogError?.query === debouncedQuery,
      }),
    [
      mode,
      query,
      debouncedQuery,
      isAuthenticated,
      isSearchingCatalog,
      deferredCatalogResults.length,
      catalogResults.length,
      catalogResultsQuery,
      catalogError?.query,
    ],
  );
  const showCatalogPanel =
    catalogViewState.surface !== "hidden" &&
    catalogViewState.surface !== "discover";
  const showDiscover = catalogViewState.surface === "discover";

  // Damper: "No catalog results" only renders once the empty surface has
  // held for a beat. Any transient empty frame (render-ordering races the
  // view-state math can't see) keeps showing the loading skeleton instead
  // of flashing the empty state.
  const isCatalogEmptySurface = catalogViewState.surface === "empty";
  const [showCatalogEmptyState, setShowCatalogEmptyState] = useState(false);
  useEffect(() => {
    if (!isCatalogEmptySurface) {
      setShowCatalogEmptyState(false);
      return;
    }
    const handle = setTimeout(() => setShowCatalogEmptyState(true), 250);
    return () => clearTimeout(handle);
  }, [isCatalogEmptySurface]);

  /* ── URL param sync ────────────────────────────────────────── */

  const modeParam = useMemo(() => {
    if (typeof params.mode === "string") return params.mode;
    if (Array.isArray(params.mode)) return params.mode[0];
    return undefined;
  }, [params.mode]);

  useEffect(() => {
    if (modeParam === "people") setMode("people");
    else if (modeParam === "vibe") setMode("vibe");
    else if (modeParam === "shows") setMode("shows");
  }, [modeParam]);

  // Entry points (e.g. the home top bar) pass a fresh `focus` value so the
  // keyboard opens as soon as the screen settles.
  const focusParam = typeof params.focus === "string" ? params.focus : undefined;
  useEffect(() => {
    if (!focusParam) return;
    const handle = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(handle);
  }, [focusParam]);

  /* ── Actions / Mutations ───────────────────────────────────── */

  const searchCatalog = useAction(api.shows.searchCatalog);
  const searchByVibe = useAction(api.embeddings.searchByVibe);
  const getTmdbList = useAction(api.shows.getTmdbList);
  const ingestFromCatalog = useAction(api.shows.ingestFromCatalog);

  const [discoverSections, setDiscoverSections] = useState<
    SearchDiscoverSection<any>[]
  >([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);

  /* ── Effects ───────────────────────────────────────────────── */

  useEffect(() => {
    let active = true;

    if (
      mode !== "shows" ||
      !isAuthenticated ||
      debouncedQuery.length < SHOW_QUERY_MIN_LENGTH
    ) {
      setIsSearchingCatalog(false);
      setCatalogError(null);
      return;
    }

    setIsSearchingCatalog(true);
    setCatalogError(null);
    const requestQuery = debouncedQuery;

    searchCatalog({ text: requestQuery })
      .then((results) => {
        if (active) {
          setCatalogResults(results);
          setCatalogResultsQuery(requestQuery);
        }
      })
      .catch((error) => {
        if (active) {
          // Keep whatever results are on screen; the error banner renders
          // above them instead of blanking the list.
          setCatalogError({
            query: requestQuery,
            message:
              error instanceof Error
                ? error.message
                : "Catalog search failed. Please try again.",
          });
        }
      })
      .finally(() => {
        if (active) setIsSearchingCatalog(false);
      });

    return () => {
      active = false;
    };
  }, [mode, searchCatalog, debouncedQuery, isAuthenticated, catalogRetryKey]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(trimmedQuery), 250);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  /* ── Vibe (semantic) search ─────────────────────────────────── */

  useEffect(() => {
    let active = true;

    if (
      mode !== "vibe" ||
      !isAuthenticated ||
      debouncedQuery.length < VIBE_QUERY_MIN_LENGTH
    ) {
      setIsSearchingVibe(false);
      setVibeError(null);
      return;
    }

    setIsSearchingVibe(true);
    setVibeError(null);
    const requestQuery = debouncedQuery;

    searchByVibe({ query: requestQuery, limit: 20 })
      .then((results) => {
        if (active) {
          setVibeResults(Array.isArray(results) ? results : []);
          setVibeResultsQuery(requestQuery);
        }
      })
      .catch((error) => {
        if (active) {
          setVibeError(
            error instanceof Error
              ? error.message
              : "Vibe search failed. Please try again.",
          );
        }
      })
      .finally(() => {
        if (active) setIsSearchingVibe(false);
      });

    return () => {
      active = false;
    };
  }, [mode, searchByVibe, debouncedQuery, isAuthenticated, vibeRetryKey]);

  useEffect(() => {
    if (mode !== "vibe" || trimmedQuery.length >= VIBE_QUERY_MIN_LENGTH) {
      return;
    }
    setVibeResults([]);
    setVibeResultsQuery("");
    setVibeError(null);
  }, [mode, trimmedQuery]);

  useEffect(() => {
    if (mode !== "shows" || trimmedQuery.length >= SHOW_QUERY_MIN_LENGTH) {
      return;
    }
    setCatalogResults([]);
    setCatalogResultsQuery("");
    setCatalogError(null);
  }, [mode, trimmedQuery]);

  /* ── Fetch TMDB discover sections when idle ─────────────────── */

  // Provider rails collapse to the user's streaming services when set.
  const discoverDefinitions = useMemo(
    () =>
      getSearchDiscoverSectionsForProviders(
        SEARCH_DISCOVER_SECTIONS,
        normalizeStreamingProviderKeys(me?.streamingProviders),
      ),
    [me?.streamingProviders],
  );

  useEffect(() => {
    if (!showDiscover) {
      setIsLoadingDiscover(false);
      return;
    }
    let cancelled = false;

    const cacheKey = getSearchDiscoverCacheKey(discoverDefinitions);
    if (searchDiscoverCache?.key === cacheKey) {
      setDiscoverSections(searchDiscoverCache.sections);
      setIsLoadingDiscover(false);
      return;
    }

    setDiscoverSections([]);
    setIsLoadingDiscover(true);

    const resultsByKey: Record<string, any[]> = {};
    const loadSections = async (
      sections: typeof SEARCH_DISCOVER_SECTIONS,
    ) => {
      const results = await Promise.allSettled(
        sections.map((section) =>
          getTmdbList({
            category: section.category,
            limit: DISCOVER_FETCH_LIMIT,
            page: getDailyDiscoverPage(section),
          }),
        ),
      );

      sections.forEach((section, index) => {
        const result = results[index];
        if (result?.status === "fulfilled" && Array.isArray(result.value)) {
          resultsByKey[section.key] = result.value;
        }
      });

      const sectionsToRender = buildSearchDiscoverSections(
        discoverDefinitions,
        resultsByKey,
      );

      if (!cancelled) {
        setDiscoverSections(sectionsToRender);
        if (sectionsToRender.length > 0) {
          setIsLoadingDiscover(false);
        }
      }
      return sectionsToRender;
    };

    const { primary, secondary } = getSearchDiscoverFetchPlan(discoverDefinitions);

    void (async () => {
      const primarySections = await loadSections(primary);
      if (cancelled) return;

      if (secondary.length > 0) {
        const fullSections = await loadSections(secondary);
        if (cancelled) return;
        searchDiscoverCache = { key: cacheKey, sections: fullSections };
      } else {
        searchDiscoverCache = { key: cacheKey, sections: primarySections };
      }
      if (!cancelled) setIsLoadingDiscover(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [showDiscover, getTmdbList, discoverDefinitions]);

  /* ── Handlers ──────────────────────────────────────────────── */

  const handleAddFromCatalog = useCallback(
    async (item: any) => {
      if (!isAuthenticated) {
        Alert.alert(
          "Sign in to add shows",
          "Create an account to add shows and track what you watch.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Sign in", onPress: () => router.push("/sign-in") },
          ],
        );
        return;
      }
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const showId = await ingestFromCatalog({
          externalSource: item.externalSource,
          externalId: item.externalId,
          title: item.title,
          year: item.year,
          overview: item.overview,
          posterUrl: item.posterUrl,
          backdropUrl: item.backdropUrl,
          genreIds: item.genreIds,
        });
        // Seed the show query so the detail screen paints its hero
        // immediately, then mark it stale so full data refetches on mount.
        const showQueryKey = ["plotlist-rpc", "query", "shows:get", { showId }];
        if (!queryClient.getQueryData(showQueryKey)) {
          queryClient.setQueryData(showQueryKey, {
            _id: showId,
            id: showId,
            externalSource: item.externalSource ?? "tmdb",
            externalId: String(item.externalId ?? ""),
            title: item.title,
            year: item.year ?? null,
            overview: item.overview ?? null,
            posterUrl: item.posterUrl ?? null,
            backdropUrl: item.backdropUrl ?? null,
            genreIds: item.genreIds ?? null,
            extendedDetails: null,
          });
          void queryClient.invalidateQueries({ queryKey: showQueryKey });
        }
        guardedPush(`/show/${showId}`);
      } catch (error) {
        Alert.alert("Could not add show", String(error));
      }
    },
    [ingestFromCatalog, isAuthenticated, router],
  );

  // Vibe results are always local shows (they came from our vector index),
  // so navigation can seed the show query and push directly — no ingest.
  const handlePressVibeResult = useCallback((item: any) => {
    const show = item?.show;
    const showId = show?._id ?? show?.id ?? item?._id;
    if (!showId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const showQueryKey = ["plotlist-rpc", "query", "shows:get", { showId }];
    if (show && !queryClient.getQueryData(showQueryKey)) {
      queryClient.setQueryData(showQueryKey, { ...show, extendedDetails: null });
      void queryClient.invalidateQueries({ queryKey: showQueryKey });
    }
    guardedPush(`/show/${showId}`);
  }, []);

  const handleVibePrompt = useCallback((prompt: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(prompt);
    setDebouncedQuery(prompt);
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setCatalogResults([]);
    setCatalogResultsQuery("");
    setCatalogError(null);
    setVibeResults([]);
    setVibeResultsQuery("");
    setVibeError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    inputRef.current?.focus();
  }, []);

  const handleRetryCatalogSearch = useCallback(() => {
    setCatalogRetryKey((value) => value + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  /* ── List renderers ────────────────────────────────────────── */

  const listContentStyle = useMemo(() => ({ paddingVertical: 12 }), []);

  const renderCatalogItem = useCallback(
    ({ item }: { item: any }) => (
      <View>
        <SearchResultRow
          title={item.title}
          year={item.year}
          overview={item.overview}
          posterUrl={item.posterUrl}
          actionLabel={item.matchLabel ?? "Add to Plotlist"}
          onPress={() => handleAddFromCatalog(item)}
        />
      </View>
    ),
    [handleAddFromCatalog],
  );

  /* ── JSX ───────────────────────────────────────────────────── */

  return (
    <Screen scroll hasTabBar keyboardShouldPersistTaps="always">
      <View style={{ paddingBottom: 100 }}>
        <View className="px-5 pt-2">
          <SearchCommandCenter
            mode={mode}
            query={query}
            inputRef={inputRef}
            isFocused={isFocused}
            isBusy={catalogViewState.isBusy || isSearchingVibe}
            onModeChange={(nextMode) => {
              setMode(nextMode);
              setQuery("");
              setDebouncedQuery("");
              setCatalogResults([]);
              setCatalogResultsQuery("");
              setCatalogError(null);
              setVibeResults([]);
              setVibeResultsQuery("");
              setVibeError(null);
            }}
            onQueryChange={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onClear={handleClear}
          />

        </View>

        {/* ── Shows: Discover ──────────────────────────────────── */}
        {showDiscover && (
          <View>
            {isLoadingDiscover ? (
              <SearchDiscoverSkeletons />
            ) : discoverSections.length > 0 ? (
              discoverSections.map((section, sectionIndex) => (
                <SearchDiscoveryRail
                  key={section.key}
                  index={sectionIndex + 1}
                  section={section}
                  accent={getSearchSectionAccent(section, sectionIndex)}
                  actionLabel={section.logoUrl ? "All" : undefined}
                  onAction={
                    section.logoUrl
                      ? () => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          router.push(`/provider/${section.key}`);
                        }
                      : undefined
                  }
                  onPressItem={handleAddFromCatalog}
                />
              ))
            ) : (
              <View className="px-5">
                <EmptyState
                  title="Discover something new"
                  description="Start typing to search your library or the full catalog."
                />
              </View>
            )}
          </View>
        )}

        {/* ── Shows: Search results ───────────────────────────── */}
        {showCatalogPanel && (
          <View className="mt-4 px-5">
            <SectionLine
              label="Results"
              count={
                catalogViewState.surface === "results" &&
                sortedCatalogResults.length > 0
                  ? sortedCatalogResults.length
                  : undefined
              }
            />

            {catalogViewState.surface === "results" && (
              <View className="mb-2 flex-row flex-wrap gap-2">
                {CATALOG_SORT_OPTIONS.map((option) => {
                  const isActive = option.key === sortKey;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (!isActive) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSortKey(option.key);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      className="rounded-full px-3 py-1.5"
                      style={{
                        backgroundColor: isActive
                          ? "rgba(56,189,248,0.16)"
                          : "rgba(255,255,255,0.06)",
                        borderColor: isActive
                          ? "rgba(56,189,248,0.55)"
                          : "rgba(255,255,255,0.09)",
                        borderWidth: StyleSheet.hairlineWidth,
                      }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: isActive ? "#38BDF8" : "#9BA1B0" }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {catalogViewState.surface === "results" &&
              catalogError?.query === debouncedQuery && (
                <View className="mb-3">
                  <SearchErrorCard
                    title="Couldn't refresh results"
                    description="Showing your last results. Retry keeps your query in place."
                    onRetry={handleRetryCatalogSearch}
                  />
                </View>
              )}

            {catalogViewState.surface === "sign-in" ? (
              <EmptyState
                title="Sign in to search the catalog"
                description="Create an account to search every TV series."
              />
            ) : catalogViewState.surface === "loading" ? (
              <SearchLoadingRows />
            ) : catalogViewState.surface === "error" ? (
              <SearchErrorCard
                title="Catalog search stalled"
                description={
                  catalogError?.message ??
                  "The search service did not return a clean response. Retry keeps your query in place."
                }
                onRetry={handleRetryCatalogSearch}
              />
            ) : catalogViewState.surface === "results" ? (
              <View style={{ opacity: catalogViewState.isShowingPreviousResults ? 0.6 : 1 }}>
                <FlashList
                  data={sortedCatalogResults}
                  renderItem={renderCatalogItem}
                  keyExtractor={(item: any) =>
                    `${item.externalSource ?? "catalog"}:${item.externalId}`
                  }
                  estimatedItemSize={132}
                  contentContainerStyle={listContentStyle}
                  keyboardShouldPersistTaps="always"
                  scrollEnabled={false}
                />
              </View>
            ) : showCatalogEmptyState ? (
              <EmptyState
                title="No catalog results"
                description="Try a different search term."
              />
            ) : (
              <SearchLoadingRows />
            )}
          </View>
        )}

        {/* ── Vibe search ────────────────────────────────────── */}
        {mode === "vibe" && (
          <View className="mt-4 px-5">
            {!isAuthenticated ? (
              <EmptyState
                title="Sign in to search by vibe"
                description="Describe a mood or premise and we'll find shows that match."
              />
            ) : trimmedQuery.length < VIBE_QUERY_MIN_LENGTH ? (
              <View>
                <SectionLine label="Try a vibe" icon="sparkles-outline" />
                <View className="mb-5 flex-row flex-wrap gap-2">
                  {VIBE_EXAMPLE_PROMPTS.map((prompt) => (
                    <Pressable
                      key={prompt}
                      onPress={() => handleVibePrompt(prompt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Search for ${prompt}`}
                      className="rounded-full px-3 py-2"
                      style={styles.vibeChip}
                    >
                      <Text className="text-[13px] font-semibold text-text-secondary">
                        “{prompt}”
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <SectionLine label="Browse categories" icon="albums-outline" />
                <View className="flex-row flex-wrap gap-2">
                  {VIBE_BROWSE_FACET_KEYS.map((facetKey) => {
                    const facet = FACET_DEFS.find(
                      (candidate) => candidate.key === facetKey,
                    );
                    if (!facet) return null;
                    return (
                      <Pressable
                        key={facet.key}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          guardedPush(`/facet/${facet.key}`);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Browse ${facet.title}`}
                        className="rounded-full px-3 py-2"
                        style={styles.facetChip}
                      >
                        <Text className="text-[13px] font-semibold" style={{ color: "#38BDF8" }}>
                          {facet.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View>
                <SectionLine
                  label="Vibe matches"
                  count={
                    vibeResults.length > 0 && vibeResultsQuery === debouncedQuery
                      ? vibeResults.length
                      : undefined
                  }
                />
                {vibeError ? (
                  <SearchErrorCard
                    title="Vibe search stalled"
                    description={vibeError}
                    onRetry={() => {
                      setVibeRetryKey((value) => value + 1);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  />
                ) : isSearchingVibe && vibeResults.length === 0 ? (
                  <SearchLoadingRows />
                ) : vibeResults.length > 0 ? (
                  <View style={{ opacity: isSearchingVibe ? 0.6 : 1 }}>
                    <FlashList
                      data={vibeResults}
                      renderItem={({ item }: { item: any }) => (
                        <View>
                          <SearchResultRow
                            title={item.show?.title ?? "Untitled"}
                            year={item.show?.year}
                            overview={item.show?.overview}
                            posterUrl={item.show?.posterUrl}
                            actionLabel="View"
                            onPress={() => handlePressVibeResult(item)}
                          />
                        </View>
                      )}
                      keyExtractor={(item: any) => String(item._id ?? item.show?._id)}
                      estimatedItemSize={132}
                      contentContainerStyle={listContentStyle}
                      keyboardShouldPersistTaps="always"
                      scrollEnabled={false}
                    />
                  </View>
                ) : vibeResultsQuery === debouncedQuery && !isSearchingVibe ? (
                  <EmptyState
                    title="No matches for that vibe"
                    description="Try describing it differently — mood, plot, or era all work."
                  />
                ) : (
                  <SearchLoadingRows />
                )}
              </View>
            )}
          </View>
        )}

        {/* ── People ─────────────────────────────────────────── */}
        {mode === "people" && (
          <PeopleDiscovery query={trimmedQuery} hasProfile={hasProfile} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  discoverSkeletonStack: {
    marginTop: 2,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: "#161A22",
    borderColor: "rgba(244,114,182,0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: "#F472B6",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  resultSkeleton: {
    borderBottomColor: "rgba(255,255,255,0.07)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 94,
    overflow: "hidden",
    paddingVertical: 10,
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: "#F1F3F7",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  facetChip: {
    backgroundColor: "rgba(56,189,248,0.12)",
    borderColor: "rgba(56,189,248,0.4)",
    borderWidth: StyleSheet.hairlineWidth,
  },
  vibeChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
