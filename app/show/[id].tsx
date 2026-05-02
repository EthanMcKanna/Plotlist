import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useAction,
  useAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "../../lib/plotlist/react";
import { FlashList } from "../../components/FlashList";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { api } from "../../lib/plotlist/api";
import type { Id } from "../../lib/plotlist/types";
import { EmptyState } from "../../components/EmptyState";
import { ReviewRow } from "../../components/ReviewRow";
import { StarRating } from "../../components/StarRating";
import { CastMember } from "../../components/CastMember";
import { VideoPlayer } from "../../components/VideoPlayer";
import { SimilarShowCard } from "../../components/SimilarShowCard";
import { Avatar } from "../../components/Avatar";
import { formatDate } from "../../lib/format";
import { StatusSelector } from "../../components/StatusSelector";
import { EpisodeGuide } from "../../components/EpisodeGuide";
import {
  INITIAL_VISIBLE_SEASONS,
  getInitialVisibleSeasonCount,
  getNextVisibleSeasonCount,
  getSeasonLoadErrorMessage,
  type SeasonLoadState,
} from "../../lib/seasonGuide";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const BACKDROP_HEIGHT = 340;
const DISMISS_THRESHOLD = 120;
const DISMISS_VELOCITY = 500;
const POSTER_HEIGHT = 240;
const POSTER_WIDTH = 160;

function tmdbImageUrl(path: unknown, size = "original") {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function normalizeEpisodeDetails(episode: any) {
  return {
    ...episode,
    airDate: episode.airDate ?? episode.air_date ?? null,
    episodeNumber: episode.episodeNumber ?? episode.episode_number,
    seasonNumber: episode.seasonNumber ?? episode.season_number,
    stillPath: episode.stillPath ?? tmdbImageUrl(episode.still_path, "w780"),
    voteAverage: episode.voteAverage ?? episode.vote_average ?? 0,
    voteCount: episode.voteCount ?? episode.vote_count ?? 0,
  };
}

function normalizeSeasonDetails(details: any) {
  if (!details) {
    return details;
  }

  return {
    ...details,
    airDate: details.airDate ?? details.air_date ?? null,
    posterPath: details.posterPath ?? tmdbImageUrl(details.poster_path, "w342"),
    seasonNumber: details.seasonNumber ?? details.season_number,
    episodes: Array.isArray(details.episodes)
      ? details.episodes.map(normalizeEpisodeDetails)
      : [],
  };
}

function normalizeExtendedDetails(details: any) {
  if (!details) {
    return details;
  }
  const seasons = Array.isArray(details.seasons)
    ? details.seasons.map((season: any) => ({
        ...season,
        airDate: season.airDate ?? season.air_date ?? null,
        episodeCount: season.episodeCount ?? season.episode_count ?? 0,
        posterPath: season.posterPath ?? tmdbImageUrl(season.poster_path, "w342"),
        seasonNumber: season.seasonNumber ?? season.season_number,
      }))
    : [];
  const regularSeasons = seasons.filter((season: any) => season.seasonNumber > 0);

  return {
    ...details,
    backdropPath: tmdbImageUrl(details.backdrop_path, "w1280") ?? details.backdropPath,
    episodeRunTime:
      details.episodeRunTime ??
      (Array.isArray(details.episode_run_time) ? details.episode_run_time[0] : undefined),
    numberOfEpisodes:
      details.numberOfEpisodes ??
      details.number_of_episodes ??
      regularSeasons.reduce(
        (total: number, season: any) => total + (season.episodeCount ?? season.episode_count ?? 0),
        0,
      ),
    numberOfSeasons:
      details.numberOfSeasons ??
      details.number_of_seasons ??
      regularSeasons.length,
    posterPath: details.posterPath ?? tmdbImageUrl(details.poster_path, "w500"),
    seasons,
  };
}

export default function ShowScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showId = (typeof params.id === "string" ? params.id : "") as Id<"shows">;
  const openSeason = typeof params.openSeason === "string" ? Number(params.openSeason) : undefined;
  const openEpisode = typeof params.openEpisode === "string" ? Number(params.openEpisode) : undefined;
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);

  const { isAuthenticated } = useAuth();
  const show = useQuery(api.shows.get, showId ? { showId } : "skip");
  const me = useQuery(api.users.me);
  const watchState = useQuery(
    api.watchStates.getForShow,
    isAuthenticated && showId ? { showId } : "skip"
  );
  const {
    results: reviews,
    status: reviewsStatus,
    loadMore: loadMoreReviews,
  } = usePaginatedQuery(
    api.reviews.listForShowDetailed,
    showId ? { showId } : "skip",
    { initialNumItems: 20 }
  );
  const { results: lists } = usePaginatedQuery(
    api.lists.listForUser,
    isAuthenticated && me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 20 }
  );

  const setStatus = useMutation(api.watchStates.setStatus).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(
        api.watchStates.getForShow,
        { showId: args.showId },
        {
          _id: `optimistic:${args.showId}`,
          userId: "me",
          showId: args.showId,
          status: args.status,
          updatedAt: Date.now(),
        }
      );
    }
  );
  const removeStatus = useMutation(api.watchStates.removeStatus).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setQuery(
        api.watchStates.getForShow,
        { showId: args.showId },
        null
      );
    }
  );
  const createReview = useMutation(api.reviews.create);
  const rateEpisode = useMutation(api.reviews.rateEpisode);
  const removeEpisodeRating = useMutation(api.reviews.removeEpisodeRating);
  const myEpisodeRatings = useQuery(
    api.reviews.getMyEpisodeRatings,
    isAuthenticated && showId ? { showId } : "skip",
  );
  const myEpisodeRatingMap = useMemo(() => {
    const map = new Map<string, { rating: number; reviewText?: string }>();
    if (myEpisodeRatings) {
      for (const r of myEpisodeRatings) {
        if (r.seasonNumber != null && r.episodeNumber != null) {
          map.set(`S${r.seasonNumber}E${r.episodeNumber}`, {
            rating: r.rating,
            reviewText: r.reviewText ?? undefined,
          });
        }
      }
    }
    return map;
  }, [myEpisodeRatings]);
  const toggleListItem = useMutation(api.listItems.toggle);
  const listMembership = useQuery(
    api.listItems.getShowMembership,
    isAuthenticated && showId ? { showId } : "skip",
  );
  const memberSet = useMemo(
    () => new Set(listMembership ?? []),
    [listMembership],
  );
  const episodeProgress = useQuery(
    api.episodeProgress.getProgressForShow,
    isAuthenticated && showId ? { showId } : "skip",
  );
  const watchedEpisodeSet = useMemo(() => {
    const set = new Set<string>();
    if (episodeProgress) {
      for (const ep of episodeProgress) {
        set.add(`S${ep.seasonNumber}E${ep.episodeNumber}`);
      }
    }
    return set;
  }, [episodeProgress]);
  const toggleEpisode = useMutation(api.episodeProgress.toggleEpisode);
  const markSeasonWatched = useMutation(api.episodeProgress.markSeasonWatched);
  const unmarkSeasonWatched = useMutation(api.episodeProgress.unmarkSeasonWatched);
  const getExtendedDetails = useAction(api.shows.getExtendedDetails);
  const getSeasonDetails = useAction(api.shows.getSeasonDetails);
  const getSimilarShows = useAction(api.embeddings.getSimilarShows);

  const [extendedDetails, setExtendedDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [similarShows, setSimilarShows] = useState<any[]>([]);
  const [loadingSimilarShows, setLoadingSimilarShows] = useState(false);
  const [seasonDetailsByNumber, setSeasonDetailsByNumber] = useState<Record<number, any>>(
    {}
  );
  const [seasonLoadStateByNumber, setSeasonLoadStateByNumber] = useState<
    Record<number, SeasonLoadState>
  >({});
  const [seasonLoadErrorByNumber, setSeasonLoadErrorByNumber] = useState<
    Record<number, string>
  >({});
  const [visibleSeasonCount, setVisibleSeasonCount] = useState(INITIAL_VISIBLE_SEASONS);
  const [selectedEpisode, setSelectedEpisode] = useState<{
    episode: any;
    seasonName: string;
    seasonNumber: number;
  } | null>(null);
  const [episodeSheetVisible, setEpisodeSheetVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [listPickerVisible, setListPickerVisible] = useState(false);
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  const [episodeReviewExpanded, setEpisodeReviewExpanded] = useState(false);
  const [episodeReviewText, setEpisodeReviewText] = useState("");

  // Episode sheet gesture animation
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const sheetOverlayOpacity = useSharedValue(0);
  const episodeScrollOffset = useRef(0);

  const openEpisodeSheet = useCallback(() => {
    setEpisodeSheetVisible(true);
    sheetTranslateY.value = SCREEN_HEIGHT;
    sheetOverlayOpacity.value = 0;
    requestAnimationFrame(() => {
      sheetTranslateY.value = withTiming(0, { duration: 340 });
      sheetOverlayOpacity.value = withTiming(1, { duration: 280 });
    });
  }, []);

  const closeEpisodeSheet = useCallback(() => {
    sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 280 });
    sheetOverlayOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => {
      setEpisodeSheetVisible(false);
      setSelectedEpisode(null);
      setEpisodeReviewExpanded(false);
      setEpisodeReviewText("");
    }, 290);
  }, []);

  const episodeSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: sheetOverlayOpacity.value,
  }));

  const episodePanGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow downward drag when scrolled to top
      if (episodeScrollOffset.current <= 0 && e.translationY > 0) {
        sheetTranslateY.value = e.translationY;
        sheetOverlayOpacity.value = interpolate(
          e.translationY,
          [0, SCREEN_HEIGHT * 0.4],
          [1, 0],
          Extrapolation.CLAMP,
        );
      }
    })
    .onEnd((e) => {
      if (
        e.translationY > DISMISS_THRESHOLD ||
        e.velocityY > DISMISS_VELOCITY
      ) {
        sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        sheetOverlayOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(closeEpisodeSheet)();
      } else {
        sheetTranslateY.value = withTiming(0, { duration: 250 });
        sheetOverlayOpacity.value = withTiming(1, { duration: 150 });
      }
    })
    .activeOffsetY(10)
    .failOffsetY(-5);

  const seasonDetailsByNumberRef = useRef<Record<number, any>>({});
  const seasonLoadStateByNumberRef = useRef<Record<number, SeasonLoadState>>({});
  const seasonLoadErrorByNumberRef = useRef<Record<number, string>>({});
  const seasonLoadPromisesRef = useRef<Map<number, Promise<any>>>(new Map());
  const seasonLoadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeShowExternalIdRef = useRef<string | null>(null);
  const episodeCommunityReviews = useQuery(
    api.reviews.listForEpisodeDetailed,
    selectedEpisode && showId
      ? {
          showId,
          seasonNumber: selectedEpisode.seasonNumber,
          episodeNumber: selectedEpisode.episode.episodeNumber,
        }
      : "skip",
  );
  const episodeStats = useQuery(
    api.reviews.getEpisodeStats,
    selectedEpisode && showId
      ? {
          showId,
          seasonNumber: selectedEpisode.seasonNumber,
          episodeNumber: selectedEpisode.episode.episodeNumber,
        }
      : "skip",
  );
  const episodeCommunityReviewItems = useMemo(() => {
    if (Array.isArray(episodeCommunityReviews)) {
      return episodeCommunityReviews;
    }
    return episodeCommunityReviews?.results ?? episodeCommunityReviews?.page ?? [];
  }, [episodeCommunityReviews]);
  const hasEpisodeRatingStats =
    typeof episodeStats?.averageRating === "number" && (episodeStats.reviewCount ?? episodeStats.count ?? 0) > 0;

  useEffect(() => {
    const fetchExtendedDetails = async () => {
      if (!showId || !show?.externalId) {
        setLoadingDetails(false);
        return;
      }

      setLoadingDetails(true);
      try {
        const details = await getExtendedDetails({ showId });
        setExtendedDetails(normalizeExtendedDetails(details));
      } catch (error) {
        console.error("Failed to fetch extended details:", error);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchExtendedDetails();
  }, [show?.externalId, getExtendedDetails, showId]);

  useEffect(() => {
    if (!isAuthenticated || !watchState || !episodeProgress || !extendedDetails) {
      return;
    }

    if (extendedDetails.status !== "Ended") {
      return;
    }

    const totalEpisodes =
      typeof extendedDetails.numberOfEpisodes === "number"
        ? extendedDetails.numberOfEpisodes
        : 0;
    if (totalEpisodes <= 0) {
      return;
    }

    const watchedCount = episodeProgress.length;
    if (watchState.status === "watching" && watchedCount >= totalEpisodes) {
      void setStatus({ showId, status: "completed" });
    }
  }, [
    episodeProgress,
    extendedDetails,
    isAuthenticated,
    setStatus,
    showId,
    watchState,
  ]);

  const isEpisodeAvailable = useCallback(
    (airDate?: string | null) => {
      if (extendedDetails?.status === "Ended") {
        return true;
      }

      const timestamp = new Date(airDate ?? "").getTime();
      return Number.isFinite(timestamp) && timestamp <= Date.now();
    },
    [extendedDetails?.status],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchSimilarShows = async () => {
      if (!showId) {
        return;
      }
      setLoadingSimilarShows(true);
      try {
        const items = await getSimilarShows({ showId, limit: 10 });
        if (!cancelled) {
          setSimilarShows(items);
        }
      } catch {
        if (!cancelled) {
          setSimilarShows([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSimilarShows(false);
        }
      }
    };

    fetchSimilarShows();
    return () => {
      cancelled = true;
    };
  }, [getSimilarShows, showId]);
  const similarShowItems = useMemo(() => {
    if (similarShows.length > 0) {
      return similarShows;
    }
    const tmdbSimilar = extendedDetails?.similar;
    if (Array.isArray(tmdbSimilar)) {
      return tmdbSimilar;
    }
    if (Array.isArray(tmdbSimilar?.results)) {
      return tmdbSimilar.results;
    }
    return [];
  }, [extendedDetails?.similar, similarShows]);

  const seasonOptions = useMemo(
    () =>
      (extendedDetails?.seasons ?? [])
        .filter((season: any) => season.season_number > 0)
        .sort((a: any, b: any) => a.season_number - b.season_number),
    [extendedDetails?.seasons]
  );

  useEffect(() => {
    seasonDetailsByNumberRef.current = seasonDetailsByNumber;
  }, [seasonDetailsByNumber]);

  useEffect(() => {
    seasonLoadStateByNumberRef.current = seasonLoadStateByNumber;
  }, [seasonLoadStateByNumber]);

  useEffect(() => {
    seasonLoadErrorByNumberRef.current = seasonLoadErrorByNumber;
  }, [seasonLoadErrorByNumber]);

  useEffect(() => {
    activeShowExternalIdRef.current = show?.externalId ?? null;
  }, [show?.externalId]);

  const setSeasonRequestState = useCallback(
    (seasonNumber: number, nextState: SeasonLoadState, errorMessage?: string) => {
      setSeasonLoadStateByNumber((current) => {
        const next = { ...current, [seasonNumber]: nextState };
        seasonLoadStateByNumberRef.current = next;
        return next;
      });
      setSeasonLoadErrorByNumber((current) => {
        const next = { ...current };
        if (nextState === "error" && errorMessage) {
          next[seasonNumber] = errorMessage;
        } else {
          delete next[seasonNumber];
        }
        seasonLoadErrorByNumberRef.current = next;
        return next;
      });
    },
    [],
  );

  const cacheSeasonDetails = useCallback((seasonNumber: number, details: any) => {
    const normalizedDetails = normalizeSeasonDetails(details);
    setSeasonDetailsByNumber((current) => {
      const next = { ...current, [seasonNumber]: normalizedDetails };
      seasonDetailsByNumberRef.current = next;
      return next;
    });
  }, []);

  const loadSeasonDetails = useCallback(
    async (seasonNumber: number, options?: { forceRetry?: boolean }) => {
      const existingDetails = seasonDetailsByNumberRef.current[seasonNumber];
      if (existingDetails !== undefined) {
        return existingDetails;
      }

      const inFlight = seasonLoadPromisesRef.current.get(seasonNumber);
      if (inFlight) {
        return await inFlight;
      }

      const currentState = seasonLoadStateByNumberRef.current[seasonNumber] ?? "idle";
      if (currentState === "error" && !options?.forceRetry) {
        throw new Error(
          seasonLoadErrorByNumberRef.current[seasonNumber] ??
            "Couldn't load episodes for this season.",
        );
      }

      const runLoad = async () => {
        const externalId = show?.externalId;
        if (!externalId) {
          throw new Error("Missing show details");
        }

        setSeasonRequestState(seasonNumber, "loading");
        try {
          const details = await getSeasonDetails({
            showId,
            seasonNumber,
          });
          const normalizedDetails = normalizeSeasonDetails(details);
          if (activeShowExternalIdRef.current !== externalId) {
            return normalizedDetails;
          }
          cacheSeasonDetails(seasonNumber, normalizedDetails);
          setSeasonRequestState(seasonNumber, "loaded");
          return normalizedDetails;
        } catch (error) {
          if (activeShowExternalIdRef.current !== externalId) {
            throw error;
          }
          const errorMessage = getSeasonLoadErrorMessage(error);
          setSeasonRequestState(seasonNumber, "error", errorMessage);
          throw new Error(errorMessage, { cause: error });
        } finally {
          seasonLoadPromisesRef.current.delete(seasonNumber);
        }
      };

      const queuedLoad = seasonLoadQueueRef.current.then(runLoad, runLoad);
      seasonLoadPromisesRef.current.set(seasonNumber, queuedLoad);
      seasonLoadQueueRef.current = queuedLoad.then(
        () => undefined,
        () => undefined,
      );
      return await queuedLoad;
    },
    [cacheSeasonDetails, getSeasonDetails, setSeasonRequestState, show?.externalId, showId],
  );

  const ensureSeasonDetailsLoaded = useCallback(
    async (seasonNumbers: number[], options?: { forceRetry?: boolean }) => {
      const loadedSeasonDetails = new Map<number, any>();
      const uniqueSeasonNumbers = Array.from(new Set(seasonNumbers));

      for (const seasonNumber of uniqueSeasonNumbers) {
        const existingDetails = seasonDetailsByNumberRef.current[seasonNumber];
        if (existingDetails !== undefined) {
          loadedSeasonDetails.set(seasonNumber, existingDetails);
          continue;
        }

        const requestState = seasonLoadStateByNumberRef.current[seasonNumber] ?? "idle";
        if (requestState === "error" && !options?.forceRetry) {
          continue;
        }

        try {
          const details = await loadSeasonDetails(seasonNumber, options);
          loadedSeasonDetails.set(seasonNumber, details);
        } catch (error) {
          console.error("Failed to fetch season details:", error);
        }
      }

      return loadedSeasonDetails;
    },
    [loadSeasonDetails],
  );

  const seasonsWithEpisodes = useMemo(
    () =>
      seasonOptions.filter((season: any) => {
        const details = seasonDetailsByNumber[season.season_number];
        const episodes = details?.episodes ?? [];
        const episodeCount = season.episode_count ?? 0;
        return details ? episodes.length > 0 : episodeCount > 0;
      }),
    [seasonDetailsByNumber, seasonOptions],
  );

  useEffect(() => {
    setSeasonDetailsByNumber({});
    seasonDetailsByNumberRef.current = {};
    setSeasonLoadStateByNumber({});
    seasonLoadStateByNumberRef.current = {};
    setSeasonLoadErrorByNumber({});
    seasonLoadErrorByNumberRef.current = {};
    seasonLoadPromisesRef.current = new Map();
    seasonLoadQueueRef.current = Promise.resolve();
    setVisibleSeasonCount(INITIAL_VISIBLE_SEASONS);
    setSelectedEpisode(null);
    setEpisodeSheetVisible(false);
  }, [show?.externalId]);

  // Clear episode content after sheet dismiss animation (fallback if onDismiss doesn't fire)
  useEffect(() => {
    if (!episodeSheetVisible && selectedEpisode) {
      const id = setTimeout(() => setSelectedEpisode(null), 400);
      return () => clearTimeout(id);
    }
  }, [episodeSheetVisible, selectedEpisode]);

  // Auto-open episode detail sheet when navigated with openSeason/openEpisode params
  useEffect(() => {
    if (
      deepLinkConsumed ||
      openSeason === undefined ||
      openEpisode === undefined ||
      !Number.isFinite(openSeason) ||
      !Number.isFinite(openEpisode)
    ) {
      return;
    }

    const seasonDetails = seasonDetailsByNumber[openSeason];
    if (!seasonDetails?.episodes) return;

    const episode = seasonDetails.episodes.find(
      (ep: any) => ep.episodeNumber === openEpisode,
    );
    if (!episode) return;

    const seasonMeta = seasonsWithEpisodes.find(
      (s: any) => s.season_number === openSeason,
    );
    const seasonName = seasonMeta?.name ?? `Season ${openSeason}`;

    setDeepLinkConsumed(true);
    setSelectedEpisode({
      episode,
      seasonName,
      seasonNumber: openSeason,
    });
    openEpisodeSheet();
  }, [deepLinkConsumed, openSeason, openEpisode, seasonDetailsByNumber, seasonsWithEpisodes]);

  const visibleSeasonNumbers = useMemo<number[]>(
    () =>
      seasonsWithEpisodes
        .slice(0, visibleSeasonCount)
        .map((season: any) => season.season_number),
    [seasonsWithEpisodes, visibleSeasonCount],
  );

  useEffect(() => {
    if (!show?.externalId || visibleSeasonNumbers.length === 0) return;

    let cancelled = false;

    const loadVisibleSeasons = async () => {
      const missingSeasonNumbers = visibleSeasonNumbers.filter((seasonNumber: number) => {
        const requestState = seasonLoadStateByNumberRef.current[seasonNumber] ?? "idle";
        return (
          seasonDetailsByNumberRef.current[seasonNumber] === undefined &&
          requestState !== "loading" &&
          requestState !== "error"
        );
      });

      if (missingSeasonNumbers.length === 0) {
        return;
      }

      await ensureSeasonDetailsLoaded(missingSeasonNumbers);
      if (cancelled) {
        return;
      }
    };

    void loadVisibleSeasons();

    return () => {
      cancelled = true;
    };
  }, [
    ensureSeasonDetailsLoaded,
    show?.externalId,
    visibleSeasonNumbers,
  ]);

  const markCurrentlyAvailableEpisodesWatched = useCallback(async () => {
    if (!show?.externalId) {
      return;
    }

    const seasonsToSync = seasonOptions.map((season: any) => season.season_number);
    await ensureSeasonDetailsLoaded(seasonsToSync, { forceRetry: true });

    const missingSeasonNumbers = seasonsToSync.filter(
      (seasonNumber: number) =>
        seasonDetailsByNumberRef.current[seasonNumber] === undefined,
    );

    if (missingSeasonNumbers.length > 0) {
      throw new Error("Couldn't load every season. Try again in a moment.");
    }

    for (const seasonNumber of seasonsToSync) {
      const details = seasonDetailsByNumberRef.current[seasonNumber];
      const airedEpisodes = (details?.episodes ?? []).filter((episode: any) => {
        if (typeof episode?.episodeNumber !== "number") {
          return false;
        }
        return isEpisodeAvailable(episode.airDate);
      });

      if (airedEpisodes.length === 0) {
        continue;
      }

      await markSeasonWatched({
        showId,
        seasonNumber,
        createLog: false,
        episodes: airedEpisodes.map((episode: any) => ({
          episodeNumber: episode.episodeNumber,
          title: episode.name,
        })),
      });
    }
  }, [
    ensureSeasonDetailsLoaded,
    isEpisodeAvailable,
    markSeasonWatched,
    seasonOptions,
    show?.externalId,
    showId,
  ]);

  const handleStatus = useCallback(
    async (value: "watchlist" | "watching" | "completed" | "dropped") => {
      if (!isAuthenticated) {
        Alert.alert("Sign in required", "Set your watch status after signing in.");
        return;
      }
      try {
        if (value === "completed") {
          await markCurrentlyAvailableEpisodesWatched();
        }
        await setStatus({ showId, status: value });
      } catch (error) {
        Alert.alert("Couldn't update status", String(error));
      }
    },
    [isAuthenticated, markCurrentlyAvailableEpisodesWatched, setStatus, showId]
  );

  const handleRemoveStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    await removeStatus({ showId });
  }, [isAuthenticated, removeStatus, showId]);

  const handleReview = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Post a review after signing in.");
      return;
    }
    if (rating < 0.5 || rating > 5) {
      Alert.alert("Invalid rating", "Tap the stars to set a rating.");
      return;
    }
    if (!reviewText) {
      Alert.alert("Missing review", "Write a short review first.");
      return;
    }
    try {
      await createReview({ showId, rating, reviewText, spoiler });
      setRating(0);
      setReviewText("");
      setSpoiler(false);
      setReviewSheetVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Could not publish review", String(error));
    }
  }, [createReview, isAuthenticated, rating, reviewText, showId, spoiler]);

  const handleToggleList = useCallback(
    async (listId: Id<"lists">) => {
      if (!isAuthenticated) {
        Alert.alert("Sign in required", "Add to a list after signing in.");
        return;
      }
      const isCurrentlyIn = memberSet.has(listId);
      Haptics.impactAsync(
        isCurrentlyIn
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium,
      );
      try {
        await toggleListItem({ listId, showId });
      } catch (error) {
        Alert.alert("Error", String(error));
      }
    },
    [toggleListItem, isAuthenticated, showId, memberSet],
  );

  const renderReview = useCallback(
    ({ item }: { item: any }) => (
      <ReviewRow
        id={item.review._id}
        rating={item.review.rating}
        reviewText={item.review.reviewText}
        authorName={
          item.author?.displayName ?? item.author?.name ?? item.author?.username ?? "Someone"
        }
        authorUsername={item.author?.username}
        authorAvatarUrl={item.authorAvatarUrl}
        createdAt={item.review.createdAt}
        spoiler={item.review.spoiler}
      />
    ),
    []
  );

  // Build metadata line: "2024 · Drama, Thriller · 52m"
  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (show?.year) parts.push(String(show.year));
    if (extendedDetails?.genres?.length > 0) {
      parts.push(
        extendedDetails.genres
          .slice(0, 3)
          .map((g: any) => g.name)
          .join(", ")
      );
    }
    if (extendedDetails?.episodeRunTime) {
      parts.push(`${extendedDetails.episodeRunTime}m`);
    }
    return parts.join("  ·  ");
  }, [show?.year, extendedDetails?.genres, extendedDetails?.episodeRunTime]);

  const ratingDisplay = extendedDetails?.voteAverage
    ? extendedDetails.voteAverage.toFixed(1)
    : null;

  const communitySummary = useMemo(() => {
    if (reviews.length === 0) {
      return null;
    }

    const averageRating =
      reviews.reduce((sum: number, item: any) => sum + item.review.rating, 0) / reviews.length;
    const recentReviewers = reviews
      .map((item: any) => {
        const label =
          item.author?.displayName ?? item.author?.name ?? item.author?.username ?? null;
        if (!label) return null;
        return {
          id: item.review._id,
          label,
          avatarUrl: item.authorAvatarUrl ?? null,
        };
      })
      .filter(Boolean)
      .slice(0, 3);

    return {
      averageRating,
      recentReviewers,
      reviewCount: reviews.length,
    };
  }, [reviews]);
  const handleProviderPress = useCallback(async (provider: { deepLinkUrl?: string | null }) => {
    if (!provider.deepLinkUrl) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL(provider.deepLinkUrl);
    } catch {
      Alert.alert("Couldn't open provider", "Try again in a moment.");
    }
  }, []);
  const handleBackPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/home");
  }, [router]);
  const backdropUri =
    extendedDetails?.backdropPath ??
    show?.backdropUrl ??
    null;

  return (
    <View className="flex-1 bg-dark-bg">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Cinematic Hero ─── */}
        <View style={{ height: BACKDROP_HEIGHT + POSTER_HEIGHT * 0.45 }}>
          {/* Backdrop */}
          <View style={{ height: BACKDROP_HEIGHT, width: SCREEN_WIDTH }}>
            {backdropUri ? (
              <Image
                source={{ uri: backdropUri }}
                style={{ width: SCREEN_WIDTH, height: BACKDROP_HEIGHT }}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={300}
              />
            ) : (
              <View
                style={{ width: SCREEN_WIDTH, height: BACKDROP_HEIGHT }}
                className="bg-dark-elevated"
              />
            )}
            {/* Gradient overlay — dissolves backdrop into background */}
            <LinearGradient
              colors={[
                "rgba(13, 15, 20, 0)",
                "rgba(13, 15, 20, 0.4)",
                "rgba(13, 15, 20, 0.85)",
                "rgba(13, 15, 20, 1)",
              ]}
              locations={[0, 0.45, 0.75, 1]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: BACKDROP_HEIGHT,
              }}
            />
            {/* Subtle side vignette */}
            <LinearGradient
              colors={["rgba(13, 15, 20, 0.6)", "transparent", "rgba(13, 15, 20, 0.6)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
            />
          </View>

          {/* Poster — floating centered over backdrop bottom edge */}
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <View
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.6,
                shadowRadius: 24,
                elevation: 20,
              }}
            >
              <Image
                source={show?.posterUrl ? { uri: show.posterUrl } : undefined}
                style={{
                  width: POSTER_WIDTH,
                  height: POSTER_HEIGHT,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={300}
              />
            </View>
          </View>
        </View>

        {/* Navigation overlay — back button & activity menu */}
        <View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            right: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            zIndex: 10,
          }}
        >
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={handleBackPress}
            className="active:opacity-70"
          >
            <BlurView
              intensity={60}
              tint="dark"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Ionicons name="chevron-back" size={22} color="#F1F3F7" />
            </BlurView>
          </Pressable>

          <View style={{ width: 40 }} />
        </View>

        {/* ─── Title & Metadata ─── */}
        <View className="items-center px-8 pt-5">
          <Text
            className="text-center text-2xl font-bold text-text-primary"
            style={{ letterSpacing: 0.3 }}
          >
            {show?.title ?? "Loading..."}
          </Text>

          {metaLine ? (
            <Text
              className="mt-2 text-center text-sm text-text-secondary"
              style={{ letterSpacing: 0.8 }}
            >
              {metaLine}
            </Text>
          ) : null}

          {/* Tagline */}
          {extendedDetails?.tagline ? (
            <Text
              className="mt-3 text-center text-sm italic text-text-tertiary"
              style={{ lineHeight: 20 }}
            >
              "{extendedDetails.tagline}"
            </Text>
          ) : null}

          {/* Rating & Content Rating */}
          <View className="mt-4 flex-row items-center gap-4">
            {ratingDisplay && (
              <View className="flex-row items-center gap-2">
                <Ionicons name="star" size={16} color="#FBBF24" />
                <Text className="text-lg font-bold text-text-primary">
                  {ratingDisplay}
                </Text>
                <Text className="text-sm text-text-tertiary">/10</Text>
                {extendedDetails?.voteCount ? (
                  <Text className="text-xs text-text-tertiary">
                    ({extendedDetails.voteCount.toLocaleString()})
                  </Text>
                ) : null}
              </View>
            )}
            {extendedDetails?.contentRating && (
              <View className="rounded-md border border-text-tertiary px-2 py-0.5">
                <Text
                  className="text-xs font-bold text-text-secondary"
                  style={{ letterSpacing: 0.5 }}
                >
                  {extendedDetails.contentRating}
                </Text>
              </View>
            )}
          </View>

        </View>

        {/* ─── Status + Actions ─── */}
        <View className="mt-6 px-6">
          <View className="flex-row items-center gap-2.5">
            <View className="flex-1">
              <StatusSelector
                currentStatus={watchState?.status as any}
                onSelect={handleStatus}
                onRemove={handleRemoveStatus}
              />
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setReviewSheetVisible(true);
              }}
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#2A2E38",
                backgroundColor: "#161A22",
                alignItems: "center",
                justifyContent: "center",
              }}
              className="active:opacity-70"
            >
              <Ionicons name="create-outline" size={22} color="#F59E0B" />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setListPickerVisible(true);
              }}
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: memberSet.size > 0 ? "rgba(34, 197, 94, 0.25)" : "#2A2E38",
                backgroundColor: memberSet.size > 0 ? "rgba(34, 197, 94, 0.1)" : "#161A22",
                alignItems: "center",
                justifyContent: "center",
              }}
              className="active:opacity-70"
            >
              <Ionicons
                name={memberSet.size > 0 ? "list" : "list-outline"}
                size={22}
                color={memberSet.size > 0 ? "#22C55E" : "#9BA1B0"}
              />
            </Pressable>
          </View>
        </View>

        {/* ─── Overview ─── */}
        <View className="mt-8 px-6">
          <Text
            className="text-sm text-text-secondary"
            style={{ lineHeight: 22 }}
          >
            {show?.overview ?? "No overview available."}
          </Text>
        </View>

        {/* ─── At a Glance ─── */}
        {!loadingDetails && extendedDetails && (
          <View className="mx-6 mt-8 flex-row rounded-2xl border border-dark-border bg-dark-card">
            <GlanceItem
              label="Seasons"
              value={String(extendedDetails.numberOfSeasons ?? "—")}
              border
            />
            <GlanceItem
              label="Episodes"
              value={String(extendedDetails.numberOfEpisodes ?? "—")}
              border
            />
            <GlanceItem
              label="Status"
              value={
                extendedDetails.status === "Returning Series"
                  ? "Returning"
                  : extendedDetails.status === "Ended"
                    ? "Ended"
                    : extendedDetails.status ?? "—"
              }
            />
          </View>
        )}

        {/* ─── Details ─── */}
        {!loadingDetails && extendedDetails && (
          <View className="mx-6 mt-8">
            <Text
              className="mb-4 text-xs font-bold uppercase text-text-tertiary"
              style={{ letterSpacing: 1.5 }}
            >
              Details
            </Text>

            {extendedDetails.firstAirDate && (
              <DetailRow
                label="First aired"
                value={formatDate(new Date(extendedDetails.firstAirDate).getTime())}
              />
            )}
            {extendedDetails.lastAirDate && extendedDetails.status === "Ended" && (
              <DetailRow
                label="Last aired"
                value={formatDate(new Date(extendedDetails.lastAirDate).getTime())}
              />
            )}
            {extendedDetails.episodeRunTime && (
              <DetailRow
                label="Runtime"
                value={`${extendedDetails.episodeRunTime} min per episode`}
              />
            )}
            {extendedDetails.networks?.length > 0 && (
              <DetailRow
                label="Network"
                value={extendedDetails.networks.map((n: any) => n.name).join(", ")}
              />
            )}
            {extendedDetails.createdBy?.length > 0 && (
              <DetailRow
                label="Created by"
                value={extendedDetails.createdBy.map((c: any) => c.name).join(", ")}
              />
            )}
          </View>
        )}

        {!loadingDetails &&
          extendedDetails?.watchProviders &&
          extendedDetails.watchProviders.length > 0 && (
            <View className="mt-8 px-6">
              <View className="mb-3">
                <View>
                  <Text
                    className="text-xs font-bold uppercase text-text-tertiary"
                    style={{ letterSpacing: 1.5 }}
                  >
                    Where to Watch
                  </Text>
                  <Text className="mt-2 text-sm text-text-secondary">
                    Streaming availability in the US.
                  </Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 8 }}
              >
                {extendedDetails.watchProviders.map((provider: any) => (
                  <Pressable
                    key={provider.id}
                    disabled={!provider.deepLinkUrl}
                    onPress={() => handleProviderPress(provider)}
                    className="mr-2.5 flex-row items-center gap-2 rounded-full border border-dark-border bg-dark-card px-3 py-2 active:opacity-80"
                  >
                    {provider.logoUrl ? (
                      <Image
                        source={{ uri: provider.logoUrl }}
                        style={{ width: 24, height: 24, borderRadius: 6 }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View className="h-6 w-6 items-center justify-center rounded-md bg-dark-elevated">
                        <Ionicons name="play-circle-outline" size={14} color="#9BA1B0" />
                      </View>
                    )}
                    <Text className="text-sm font-medium text-text-primary">
                      {provider.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

        {/* ─── Genres ─── */}
        {!loadingDetails &&
          extendedDetails?.genres &&
          extendedDetails.genres.length > 0 && (
            <View className="mt-8 px-6">
              <Text
                className="mb-3 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Genres
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {extendedDetails.genres.map((genre: any) => (
                  <View
                    key={genre.id}
                    className="rounded-full border border-dark-border bg-dark-card px-3.5 py-1.5"
                  >
                    <Text className="text-xs font-medium text-text-secondary">
                      {genre.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        {/* ─── Cast ─── */}
        {!loadingDetails &&
          extendedDetails?.cast &&
          extendedDetails.cast.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Cast
              </Text>
              <FlashList
                data={extendedDetails.cast}
                renderItem={({ item }: { item: any }) => (
                  <CastMember
                    name={item.name}
                    role={item.character}
                    profilePath={item.profilePath}
                  />
                )}
                keyExtractor={(item: any) => String(item.id)}
                estimatedItemSize={120}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 4 }}
              />
            </View>
          )}

        {/* ─── Crew ─── */}
        {!loadingDetails &&
          extendedDetails?.crew &&
          extendedDetails.crew.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Crew
              </Text>
              <FlashList
                data={extendedDetails.crew}
                renderItem={({ item }: { item: any }) => (
                  <CastMember
                    name={item.name}
                    role={item.job}
                    profilePath={item.profilePath}
                  />
                )}
                keyExtractor={(item: any) => String(item.id)}
                estimatedItemSize={120}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 4 }}
              />
            </View>
          )}

        {!loadingDetails && seasonsWithEpisodes.length > 0 && (
          <EpisodeGuide
            seasons={seasonsWithEpisodes}
            visibleSeasonCount={visibleSeasonCount}
            seasonDetailsByNumber={seasonDetailsByNumber}
            seasonLoadStateByNumber={seasonLoadStateByNumber}
            seasonLoadErrorByNumber={seasonLoadErrorByNumber}
            isAuthenticated={isAuthenticated}
            watchedEpisodeSet={watchedEpisodeSet}
            myEpisodeRatingMap={myEpisodeRatingMap}
            isEpisodeAvailable={isEpisodeAvailable}
            onLoadMoreSeasons={() => {
              setVisibleSeasonCount((current) =>
                current >= seasonsWithEpisodes.length
                  ? getInitialVisibleSeasonCount(seasonsWithEpisodes.length)
                  : getNextVisibleSeasonCount(current, seasonsWithEpisodes.length),
              );
            }}
            onRetrySeason={(seasonNumber) => {
              void ensureSeasonDetailsLoaded([seasonNumber], { forceRetry: true });
            }}
            onMarkSeasonWatched={(seasonNumber, episodes) => {
              void markSeasonWatched({
                showId,
                seasonNumber,
                episodes,
              });
            }}
            onUnmarkSeasonWatched={(seasonNumber) => {
              void unmarkSeasonWatched({
                showId,
                seasonNumber,
              });
            }}
            onToggleEpisode={(seasonNumber, episode) => {
              void toggleEpisode({
                showId,
                seasonNumber,
                episodeNumber: episode.episodeNumber,
                episodeTitle: episode.name,
              });
            }}
            onSelectEpisode={(seasonName, seasonNumber, episode) => {
              setSelectedEpisode({
                episode,
                seasonName,
                seasonNumber,
              });
              openEpisodeSheet();
            }}
          />
        )}

        {/* ─── Trailers & Videos ─── */}
        {!loadingDetails &&
          extendedDetails?.videos &&
          extendedDetails.videos.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Trailers & Videos
              </Text>
              <FlashList
                data={extendedDetails.videos}
                renderItem={({ item }: { item: any }) => (
                  <View style={{ width: 256, marginRight: 16 }}>
                    <VideoPlayer
                      videoKey={item.key}
                      title={item.name}
                      type={item.type}
                    />
                  </View>
                )}
                keyExtractor={(item: any) => item.id}
                estimatedItemSize={272}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingRight: 16 }}
              />
            </View>
          )}

        {/* ─── Divider ─── */}
        <View className="mx-6 mt-10 h-px bg-dark-border" />

        {/* ─── Community Reviews ─── */}
        <View className="mt-8 px-6">
          <Text
            className="mb-4 text-xs font-bold uppercase text-text-tertiary"
            style={{ letterSpacing: 1.5 }}
          >
            Community Reviews
          </Text>
          {communitySummary ? (
            <View className="mb-4 flex-row items-center rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
              <View className="mr-3 flex-row">
                {communitySummary.recentReviewers.map((reviewer: any, index: number) => (
                  <View
                    key={reviewer.id}
                    style={{ marginLeft: index === 0 ? 0 : -8 }}
                    className="rounded-full border-2 border-dark-card"
                  >
                    <Avatar uri={reviewer.avatarUrl} label={reviewer.label} size={28} />
                  </View>
                ))}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-primary">
                  {communitySummary.averageRating.toFixed(1)} out of 5 from recent reviews
                </Text>
                <Text className="mt-1 text-xs text-text-tertiary">
                  Based on {communitySummary.reviewCount} community review
                  {communitySummary.reviewCount === 1 ? "" : "s"}.
                </Text>
              </View>
            </View>
          ) : null}
          {reviews.length > 0 ? (
            <View>
              <FlashList
                data={reviews}
                renderItem={renderReview}
                keyExtractor={(item: any) => item.review._id}
                estimatedItemSize={120}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                contentContainerStyle={{ paddingBottom: 8 }}
                scrollEnabled={false}
              />
              {reviewsStatus === "CanLoadMore" ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    loadMoreReviews(20);
                  }}
                  className="mt-2 self-start rounded-full border border-dark-border px-4 py-2"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Load more
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <EmptyState
              title="No reviews yet"
              description="Be the first to review this show!"
            />
          )}
        </View>

        {/* ─── Similar Shows ─── */}
        {!loadingSimilarShows &&
          similarShowItems.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                More Like This
              </Text>
              <FlashList
                data={similarShowItems}
                renderItem={({ item }: { item: any }) => {
                  const itemShow = item.show ?? item;
                  const candidateShowId = item.showId ?? itemShow._id ?? itemShow.id ?? item._id;
                  const itemShowId =
                    typeof candidateShowId === "string" && candidateShowId.startsWith("show_")
                      ? candidateShowId
                      : undefined;
                  const itemExternalId =
                    item.externalId ?? itemShow.externalId ?? itemShow.id ?? candidateShowId;
                  const itemTitle =
                    itemShow.title ?? itemShow.name ?? itemShow.original_name ?? "Untitled";
                  const itemPosterUrl =
                    itemShow.posterUrl ??
                    item.posterUrl ??
                    tmdbImageUrl(itemShow.poster_path ?? item.poster_path, "w500");
                  const itemPosterPath =
                    itemShow.posterPath ??
                    item.posterPath ??
                    tmdbImageUrl(itemShow.poster_path ?? item.poster_path, "w500");
                  const itemRating =
                    typeof item.score === "number"
                      ? undefined
                      : itemShow.tmdbVoteAverage ??
                        itemShow.voteAverage ??
                        itemShow.vote_average ??
                        item.voteAverage;

                  return (
                    <SimilarShowCard
                      showId={itemShowId}
                      externalId={itemShowId ? undefined : String(itemExternalId)}
                      title={itemTitle}
                      posterUrl={itemPosterUrl}
                      posterPath={itemPosterPath}
                      rating={itemRating}
                      subtitle={
                        item.sharedGenres?.length
                          ? item.sharedGenres.join(" • ")
                          : itemShow.overview ?? item.overview
                      }
                    />
                  );
                }}
                keyExtractor={(item: any) => {
                  const itemShow = item.show ?? item;
                  return String(
                    item.showId ??
                      itemShow._id ??
                      itemShow.id ??
                      item._id ??
                      itemShow.externalId ??
                      itemShow.title ??
                      itemShow.name,
                  );
                }}
                estimatedItemSize={160}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingRight: 16 }}
              />
            </View>
          )}

        {/* Bottom spacing */}
        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>

      {/* List picker sheet */}
      <Modal
        visible={listPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setListPickerVisible(false)}
      >
        <Pressable
          onPress={() => setListPickerVisible(false)}
          className="flex-1 justify-end bg-black/50"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl bg-dark-elevated pb-8 pt-4"
          >
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-dark-border" />
            </View>
            <Text className="mb-4 px-6 text-lg font-semibold text-text-primary">
              Add to list
            </Text>
            <View className="px-4">
              {lists.length > 0 ? (
                <View className="gap-2">
                  {lists.map((list) => {
                    const isIn = memberSet.has(list._id);
                    return (
                      <Pressable
                        key={list._id}
                        onPress={() => handleToggleList(list._id)}
                        className={`flex-row items-center gap-3 rounded-xl px-4 py-3.5 active:opacity-80 ${
                          isIn ? "bg-brand-500/10" : ""
                        }`}
                      >
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-full ${
                            isIn ? "bg-brand-500" : "border-2 border-dark-border"
                          }`}
                        >
                          {isIn ? (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          ) : null}
                        </View>
                        <Text
                          className={`flex-1 text-base font-medium ${
                            isIn ? "text-text-primary" : "text-text-secondary"
                          }`}
                        >
                          {list.title}
                        </Text>
                        {isIn ? (
                          <Text className="text-xs text-brand-400">Added</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View className="items-center py-6">
                  <Ionicons name="list-outline" size={28} color="#5A6070" />
                  <Text className="mt-2 text-sm text-text-tertiary">No lists yet</Text>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setListPickerVisible(false);
                      router.push("/me/lists");
                    }}
                    className="mt-2"
                  >
                    <Text className="text-sm font-medium text-brand-400">
                      Create a list
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Review sheet */}
      <Modal
        visible={reviewSheetVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        statusBarTranslucent
        onRequestClose={() => setReviewSheetVisible(false)}
      >
        <View className="flex-1 bg-dark-bg" style={{ backgroundColor: "#0D0F14" }}>
          <View className="flex-row items-center justify-between border-b border-dark-border px-6 py-4">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setReviewSheetVisible(false);
              }}
            >
              <Text className="text-base text-text-tertiary">Cancel</Text>
            </Pressable>
            <Text className="text-base font-semibold text-text-primary">
              Write a Review
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleReview();
              }}
              disabled={rating < 0.5 || !reviewText}
            >
              <Text
                className={`text-base font-semibold ${
                  rating >= 0.5 && reviewText
                    ? "text-brand-500"
                    : "text-text-tertiary"
                }`}
              >
                Publish
              </Text>
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 24,
              paddingBottom: insets.bottom + 32,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="mb-6">
              <Text className="mb-3 text-sm font-semibold text-text-secondary">
                Your rating
              </Text>
              <StarRating value={rating} onChange={setRating} size={36} />
              {rating > 0 && (
                <Text className="mt-2 text-sm text-text-tertiary">
                  {rating} out of 5 stars
                </Text>
              )}
            </View>

            <Text className="mb-2 text-sm font-semibold text-text-secondary">
              Review
            </Text>
            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Share your thoughts..."
              placeholderTextColor="#5A6070"
              multiline
              autoFocus
              className="min-h-[140px] rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-base text-text-primary"
              style={{ textAlignVertical: "top" }}
            />

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSpoiler((prev) => !prev);
              }}
              className={`mt-4 flex-row items-center gap-2 self-start rounded-full border px-3.5 py-2 ${
                spoiler
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-dark-border bg-dark-card"
              }`}
            >
              <Ionicons
                name={spoiler ? "warning" : "warning-outline"}
                size={14}
                color={spoiler ? "#EF4444" : "#9BA1B0"}
              />
              <Text
                className={`text-sm font-medium ${
                  spoiler ? "text-red-400" : "text-text-secondary"
                }`}
              >
                {spoiler ? "Contains spoilers" : "No spoilers"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Episode Detail Sheet */}
      {episodeSheetVisible && selectedEpisode && (() => {
          const sheetEpKey = `S${selectedEpisode.seasonNumber}E${selectedEpisode.episode.episodeNumber}`;
          const sheetIsWatched = watchedEpisodeSet.has(sheetEpKey);
          const sheetIsAvailable = isEpisodeAvailable(selectedEpisode.episode.airDate);
          const myEpData = myEpisodeRatingMap.get(sheetEpKey);
          const myEpRating = myEpData?.rating ?? 0;
          const myEpReviewText = myEpData?.reviewText;
          const epCode = `S${String(selectedEpisode.seasonNumber).padStart(2, "0")} E${String(selectedEpisode.episode.episodeNumber).padStart(2, "0")}`;
          const hasTmdbRating = selectedEpisode.episode.voteCount > 0 && selectedEpisode.episode.voteAverage > 0;
          const selectedStillPath =
            selectedEpisode.episode.stillPath ?? selectedEpisode.episode.still_path ?? null;

          return (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} pointerEvents="box-none">
            {/* Dimmed backdrop */}
            <Animated.View
              style={[
                { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" },
                overlayStyle,
              ]}
            >
              <Pressable style={{ flex: 1 }} onPress={closeEpisodeSheet} />
            </Animated.View>

            {/* Sheet */}
            <GestureDetector gesture={episodePanGesture}>
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    top: 48,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "#0D0F14",
                    borderTopLeftRadius: 14,
                    borderTopRightRadius: 14,
                    overflow: "hidden",
                  },
                  episodeSheetStyle,
                ]}
              >
                <ScrollView
                  className="flex-1"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                  keyboardShouldPersistTaps="handled"
                  scrollEventThrottle={16}
                  onScroll={(e) => {
                    episodeScrollOffset.current = e.nativeEvent.contentOffset.y;
                  }}
                  bounces={episodeScrollOffset.current > 0}
                >
              {/* Hero image with gradient overlay and metadata */}
              <View className="relative" style={{ aspectRatio: 16 / 9 }}>
                {selectedStillPath ? (
                  <Image
                    source={{ uri: selectedStillPath }}
                    style={{ width: "100%", height: "100%", backgroundColor: "#1C2028" }}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center" style={{ backgroundColor: "#1C2028" }}>
                    <Ionicons name="tv-outline" size={40} color="#3b3f4a" />
                  </View>
                )}

                {/* Drag indicator overlaid on image */}
                <View style={{ position: "absolute", top: 6, left: 0, right: 0, alignItems: "center", zIndex: 10 }}>
                  <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)" }} />
                </View>

                <LinearGradient
                  colors={["rgba(13, 15, 20, 0.4)", "transparent", "rgba(13, 15, 20, 0.85)", "#0D0F14"]}
                  locations={[0, 0.25, 0.75, 1]}
                  style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
                />

                {/* Close button */}
                <Pressable
                  className="absolute top-4 right-4 items-center justify-center rounded-full active:opacity-60"
                  style={{
                    width: 32,
                    height: 32,
                    backgroundColor: "rgba(0,0,0,0.5)",
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    closeEpisodeSheet();
                  }}
                >
                  <Ionicons name="close" size={18} color="white" />
                </Pressable>

                {/* Episode code badge */}
                <View className="absolute bottom-4 left-5 right-5">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="text-xs font-bold text-white/70"
                      style={{ letterSpacing: 1.2 }}
                    >
                      {epCode}
                    </Text>
                    {selectedEpisode.episode.runtime ? (
                      <>
                        <View className="h-1 w-1 rounded-full bg-white/30" />
                        <Text className="text-xs text-white/50">
                          {selectedEpisode.episode.runtime} min
                        </Text>
                      </>
                    ) : null}
                    {selectedEpisode.episode.airDate ? (
                      <>
                        <View className="h-1 w-1 rounded-full bg-white/30" />
                        <Text className="text-xs text-white/50">
                          {formatDate(new Date(selectedEpisode.episode.airDate).getTime())}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>

              <View className="px-5">
                {/* Title */}
                <Text className="text-2xl font-bold tracking-tight text-text-primary">
                  {selectedEpisode.episode.name}
                </Text>

                {/* Action row: watched + rating inline */}
                {isAuthenticated && (
                  <View className="mt-5 flex-row items-center gap-3">
                    {/* Watched toggle */}
                    <Pressable
                      className="flex-row items-center gap-2 rounded-full px-4 py-2.5 active:opacity-80"
                      disabled={!sheetIsAvailable}
                      style={{
                        backgroundColor: sheetIsWatched
                          ? "rgba(14, 165, 233, 0.15)"
                          : "rgba(90, 96, 112, 0.12)",
                        borderWidth: 1,
                        borderColor: sheetIsWatched
                          ? "rgba(14, 165, 233, 0.3)"
                          : "transparent",
                        opacity: sheetIsAvailable ? 1 : 0.5,
                      }}
                      onPress={() => {
                        if (!sheetIsAvailable) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        toggleEpisode({
                          showId,
                          seasonNumber: selectedEpisode.seasonNumber,
                          episodeNumber: selectedEpisode.episode.episodeNumber,
                          episodeTitle: selectedEpisode.episode.name,
                        });
                      }}
                    >
                      <Ionicons
                        name={sheetIsWatched ? "checkmark-circle" : "checkmark-circle-outline"}
                        size={18}
                        color={sheetIsWatched ? "#38bdf8" : "#6B7280"}
                      />
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: sheetIsWatched ? "#7dd3fc" : "#9BA1B0" }}
                      >
                        {sheetIsWatched
                          ? "Watched"
                          : sheetIsAvailable
                            ? "Mark Watched"
                            : selectedEpisode.episode.airDate
                              ? `Airs ${formatDate(new Date(selectedEpisode.episode.airDate).getTime())}`
                              : "Not yet available"}
                      </Text>
                    </Pressable>

                    {/* TMDB rating pill */}
                    {hasTmdbRating && (
                      <View className="flex-row items-center gap-1.5 rounded-full px-3 py-2.5" style={{ backgroundColor: "rgba(251, 191, 36, 0.08)" }}>
                        <Ionicons name="star" size={13} color="#fbbf24" />
                        <Text className="text-sm font-semibold" style={{ color: "#fcd34d" }}>
                          {selectedEpisode.episode.voteAverage.toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Overview */}
                {selectedEpisode.episode.overview ? (
                  <Text className="mt-5 text-[15px] leading-6 text-text-secondary">
                    {selectedEpisode.episode.overview}
                  </Text>
                ) : null}

                {/* ─── Your Rating ─── */}
                {isAuthenticated && sheetIsAvailable && (
                  <View className="mt-6 rounded-2xl p-4" style={{ backgroundColor: "rgba(90, 96, 112, 0.08)" }}>
                    <Text className="mb-3 text-xs font-semibold uppercase text-text-tertiary" style={{ letterSpacing: 1.2 }}>
                      Your Rating
                    </Text>
                    <View className="flex-row items-center justify-between">
                      <StarRating
                        value={myEpRating}
                        onChange={(val) => {
                          if (val === 0 && myEpRating > 0) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            removeEpisodeRating({
                              showId,
                              seasonNumber: selectedEpisode.seasonNumber,
                              episodeNumber: selectedEpisode.episode.episodeNumber,
                            });
                          } else if (val > 0) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            rateEpisode({
                              showId,
                              seasonNumber: selectedEpisode.seasonNumber,
                              episodeNumber: selectedEpisode.episode.episodeNumber,
                              episodeTitle: selectedEpisode.episode.name,
                              rating: val,
                            });
                          }
                        }}
                        size={32}
                      />
                      {myEpRating > 0 && (
                        <Text className="text-sm font-medium text-text-tertiary">
                          {myEpRating}/5
                        </Text>
                      )}
                    </View>

                    {/* Review text */}
                    {myEpRating > 0 && (
                      <View className="mt-3">
                        {myEpReviewText && !episodeReviewExpanded ? (
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setEpisodeReviewText(myEpReviewText);
                              setEpisodeReviewExpanded(true);
                            }}
                            className="rounded-xl p-3 active:opacity-80"
                            style={{ backgroundColor: "rgba(90, 96, 112, 0.1)" }}
                          >
                            <Text className="text-sm text-text-secondary" numberOfLines={4}>
                              {myEpReviewText}
                            </Text>
                          </Pressable>
                        ) : !episodeReviewExpanded ? (
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setEpisodeReviewExpanded(true);
                            }}
                            className="flex-row items-center gap-1.5 pt-1"
                          >
                            <Ionicons name="chatbubble-outline" size={13} color="#9BA1B0" />
                            <Text className="text-sm text-text-tertiary">
                              Add a review...
                            </Text>
                          </Pressable>
                        ) : (
                          <View>
                            <TextInput
                              value={episodeReviewText}
                              onChangeText={setEpisodeReviewText}
                              placeholder="What did you think?"
                              placeholderTextColor="#5A6070"
                              multiline
                              autoFocus
                              className="min-h-[80px] rounded-xl px-3 py-2.5 text-sm text-text-primary"
                              style={{ textAlignVertical: "top", backgroundColor: "rgba(90, 96, 112, 0.1)" }}
                              maxLength={5000}
                            />
                            <View className="mt-2 flex-row items-center justify-end gap-3">
                              <Pressable
                                onPress={() => {
                                  setEpisodeReviewExpanded(false);
                                  setEpisodeReviewText("");
                                }}
                              >
                                <Text className="text-sm text-text-tertiary">Cancel</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  rateEpisode({
                                    showId,
                                    seasonNumber: selectedEpisode.seasonNumber,
                                    episodeNumber: selectedEpisode.episode.episodeNumber,
                                    episodeTitle: selectedEpisode.episode.name,
                                    rating: myEpRating,
                                    reviewText: episodeReviewText || undefined,
                                  });
                                  setEpisodeReviewExpanded(false);
                                  setEpisodeReviewText("");
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                }}
                                disabled={!episodeReviewText.trim()}
                              >
                                <Text
                                  className={`text-sm font-semibold ${
                                    episodeReviewText.trim()
                                      ? "text-brand-500"
                                      : "text-text-tertiary"
                                  }`}
                                >
                                  Save
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* ─── Community Reviews ─── */}
                {(hasEpisodeRatingStats || episodeCommunityReviewItems.length > 0) && (
                  <View className="mt-6">
                    <View className="flex-row items-center gap-2.5">
                      <Text className="text-xs font-semibold uppercase text-text-tertiary" style={{ letterSpacing: 1.2 }}>
                        Community
                      </Text>
                      {hasEpisodeRatingStats && (
                        <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(251, 191, 36, 0.08)" }}>
                          <Ionicons name="star" size={10} color="#fbbf24" />
                          <Text className="text-[11px] font-semibold" style={{ color: "#fcd34d" }}>
                            {episodeStats.averageRating.toFixed(1)}
                          </Text>
                          <Text className="text-[11px] text-text-tertiary">
                            ({episodeStats.reviewCount ?? episodeStats.count})
                          </Text>
                        </View>
                      )}
                    </View>
                    {episodeCommunityReviewItems.length > 0 && (
                      <View className="mt-3 gap-3">
                        {episodeCommunityReviewItems.map((item: any) => (
                          <View
                            key={item.review._id}
                            className="rounded-2xl p-3.5"
                            style={{ backgroundColor: "rgba(90, 96, 112, 0.08)" }}
                          >
                            <View className="flex-row items-center gap-2.5">
                              <Avatar
                                uri={item.authorAvatarUrl}
                                label={item.author?.displayName ?? item.author?.username ?? "?"}
                                size={26}
                              />
                              <Text className="flex-1 text-[13px] font-semibold text-text-primary">
                                {item.author?.displayName ?? item.author?.username ?? "User"}
                              </Text>
                              <View className="flex-row items-center gap-1">
                                {Array.from({ length: 5 }, (_, i) => (
                                  <Ionicons
                                    key={i}
                                    name={i < Math.round(item.review.rating) ? "star" : "star-outline"}
                                    size={11}
                                    color={i < Math.round(item.review.rating) ? "#fbbf24" : "#3b3f4a"}
                                  />
                                ))}
                              </View>
                            </View>
                            {item.review.reviewText ? (
                              <Text className="mt-2 text-sm leading-5 text-text-secondary" numberOfLines={4}>
                                {item.review.reviewText}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* ─── Crew & Guest Stars ─── */}
                {(selectedEpisode.episode.crew?.length > 0 || selectedEpisode.episode.guestStars?.length > 0) && (
                  <View className="mt-6">
                    {selectedEpisode.episode.crew?.length > 0 && (
                      <View>
                        <Text className="text-xs font-semibold uppercase text-text-tertiary" style={{ letterSpacing: 1.2 }}>
                          Crew
                        </Text>
                        <View className="mt-2.5 flex-row flex-wrap gap-2">
                          {selectedEpisode.episode.crew.map((person: any) => (
                            <View
                              key={`${selectedEpisode.episode.id}-${person.id}-${person.job}`}
                              className="rounded-full px-3 py-1.5"
                              style={{ backgroundColor: "rgba(90, 96, 112, 0.1)" }}
                            >
                              <Text className="text-xs text-text-secondary">
                                <Text className="font-medium text-text-primary">{person.name}</Text>
                                {" · "}{person.job}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {selectedEpisode.episode.guestStars?.length > 0 && (
                      <View className={selectedEpisode.episode.crew?.length > 0 ? "mt-5" : ""}>
                        <Text className="text-xs font-semibold uppercase text-text-tertiary" style={{ letterSpacing: 1.2 }}>
                          Guest Stars
                        </Text>
                        <View className="mt-2.5 flex-row flex-wrap gap-2">
                          {selectedEpisode.episode.guestStars.map((person: any) => (
                            <View
                              key={`${selectedEpisode.episode.id}-guest-${person.id}`}
                              className="rounded-full px-3 py-1.5"
                              style={{ backgroundColor: "rgba(14, 165, 233, 0.06)" }}
                            >
                              <Text className="text-xs text-text-secondary">
                                <Text className="font-medium text-text-primary">{person.name}</Text>
                                {person.character ? ` as ${person.character}` : ""}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>
              </Animated.View>
            </GestureDetector>
          </View>
          );
        })()}
    </View>
  );
}

/* ─── Inline Sub-components ─── */

function GlanceItem({
  label,
  value,
  border,
}: {
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <View
      className={`flex-1 items-center py-4 ${
        border ? "border-r border-dark-border" : ""
      }`}
    >
      <Text className="text-lg font-bold text-text-primary">{value}</Text>
      <Text className="mt-1 text-xs text-text-tertiary">{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center border-b border-dark-border/50 py-3">
      <Text className="w-28 text-sm text-text-tertiary">{label}</Text>
      <Text className="flex-1 text-sm font-medium text-text-primary">{value}</Text>
    </View>
  );
}
