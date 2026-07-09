import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { api } from "../../lib/plotlist/api";
import type { Id } from "../../lib/plotlist/types";
import { EmptyState } from "../../components/EmptyState";
import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { ReviewRow } from "../../components/ReviewRow";
import { StarRating } from "../../components/StarRating";
import { CastMember } from "../../components/CastMember";
import { VideoPlayer } from "../../components/VideoPlayer";
import { SimilarShowCard } from "../../components/SimilarShowCard";
import { Avatar } from "../../components/Avatar";
import { formatDate } from "../../lib/format";
import { StatusSelector } from "../../components/StatusSelector";
import { EpisodeGuide } from "../../components/EpisodeGuide";
import { ImdbLogo } from "../../components/ImdbBadge";
import {
  SHOW_BACKDROP_HEIGHT,
  SHOW_POSTER_HEIGHT,
  SHOW_POSTER_WIDTH,
  ShimmerBlock,
  ShowDetailSkeleton,
} from "../../components/ShowDetailSkeleton";
import { mapGenreIdsToNames } from "../../lib/plotlist/embeddingUtils";
import {
  optimisticMarkSeasonWatched,
  optimisticToggleEpisode,
  optimisticUnmarkSeasonWatched,
} from "../../lib/episodeProgressOptimistic";
import {
  optimisticRateEpisode,
  optimisticRemoveEpisodeRating,
} from "../../lib/episodeRatingOptimistic";
import {
  INITIAL_VISIBLE_SEASONS,
  getInitialVisibleSeasonCount,
  getNextVisibleSeasonCount,
  getSeasonLoadErrorMessage,
  type SeasonLoadState,
} from "../../lib/seasonGuide";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const BACKDROP_HEIGHT = SHOW_BACKDROP_HEIGHT;
const DISMISS_THRESHOLD = 120;
const DISMISS_VELOCITY = 500;
const POSTER_HEIGHT = SHOW_POSTER_HEIGHT;
const POSTER_WIDTH = SHOW_POSTER_WIDTH;
type WatchStatus = "watchlist" | "watching" | "completed" | "dropped";
type ExtendedDetailsLoadState = "idle" | "loading" | "ready";

const PREVIEW_SHOW_ID = "show_preview_pluribus" as Id<"shows">;
const PREVIEW_BACKDROP =
  "https://image.tmdb.org/t/p/w1280/ulm1ex4JFYJByyaPyqTr47MFyEQ.jpg";
const PREVIEW_POSTER =
  "https://image.tmdb.org/t/p/w500/z7Nga7Q9IGFWs5OEduY2gGFxnX3.jpg";
const PREVIEW_STILL =
  "https://image.tmdb.org/t/p/w780/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg";

const PREVIEW_SHOW = {
  _id: PREVIEW_SHOW_ID,
  title: "Pluribus",
  year: 2026,
  overview:
    "A high-concept mystery about a city that keeps getting brighter while one person tries to understand what everyone else has accepted.",
  posterUrl: PREVIEW_POSTER,
  backdropUrl: PREVIEW_BACKDROP,
  externalId: "225171",
  genreIds: [],
  tmdbVoteAverage: 8.4,
  tmdbVoteCount: 1842,
  extendedDetails: {
    backdropPath: PREVIEW_BACKDROP,
    posterPath: PREVIEW_POSTER,
    tagline: "Something is wrong with all this harmony.",
    contentRating: "TV-MA",
    episodeRunTime: 52,
    firstAirDate: "2026-05-29",
    genres: [
      { id: 1, name: "Sci-Fi" },
      { id: 2, name: "Mystery" },
      { id: 3, name: "Drama" },
    ],
    numberOfEpisodes: 10,
    numberOfSeasons: 1,
    status: "Returning Series",
    voteAverage: 8.4,
    voteCount: 1842,
    networks: [{ id: 1, name: "Apple TV" }],
    createdBy: [{ id: 1, name: "Vince Gilligan" }],
    watchProviders: [
      {
        id: "apple-tv",
        name: "Apple TV",
        logoUrl: "https://image.tmdb.org/t/p/w92/2E03IAZsX4ZaUqM7tXlctEPMGWS.jpg",
        deepLinkUrl: null,
      },
    ],
    cast: [
      { id: 1, name: "Rhea Seehorn", character: "Carol", profilePath: null },
      { id: 2, name: "Karolina Wydra", character: "Zosia", profilePath: null },
      { id: 3, name: "Carlos Manuel Vesga", character: "Manousos", profilePath: null },
    ],
    crew: [{ id: 1, name: "Gordon Geary", job: "Director" }],
    seasons: [
      {
        id: 1,
        name: "Season 1",
        season_number: 1,
        seasonNumber: 1,
        episode_count: 10,
        episodeCount: 10,
        posterPath: PREVIEW_POSTER,
        poster_path: PREVIEW_POSTER,
        air_date: "2026-05-29",
      },
    ],
    similar: [
      {
        id: "preview-severance",
        title: "Severance",
        posterUrl: "https://image.tmdb.org/t/p/w500/lFf6LLrQjYldcZItzOkGmMMigP7.jpg",
        voteAverage: 8.6,
        overview: "Workplace surrealism with a sharp mystery spine.",
      },
      {
        id: "preview-devs",
        title: "Devs",
        posterUrl: "https://image.tmdb.org/t/p/w500/ceK1qY97sB8z2pmW1vA1LcXx0pH.jpg",
        voteAverage: 7.7,
        overview: "A polished tech thriller about fate, grief, and control.",
      },
    ],
  },
};

const PREVIEW_ME = {
  _id: "user_preview",
  id: "user_preview",
  displayName: "Preview User",
  username: "preview",
};

const PREVIEW_REVIEWS = [
  {
    review: {
      _id: "review_preview_1",
      rating: 4.5,
      reviewText:
        "Exactly the kind of strange, precise TV that rewards paying attention.",
      spoiler: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 5,
    },
    author: { displayName: "Maya" },
    authorAvatarUrl: null,
  },
  {
    review: {
      _id: "review_preview_2",
      rating: 4,
      reviewText: "The atmosphere is immaculate. Every control surface feels intentional.",
      spoiler: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 26,
    },
    author: { displayName: "Julian" },
    authorAvatarUrl: null,
  },
];

const PREVIEW_SEASON_DETAILS = {
  1: {
    episodes: [
      {
        id: "preview-episode-1",
        name: "Pilot",
        episodeNumber: 1,
        airDate: "2026-05-29",
        runtime: 52,
        overview:
          "Carol notices the first impossible pattern and starts testing the edge of the city's new calm.",
        stillPath: PREVIEW_STILL,
        voteAverage: 8.5,
        voteCount: 184,
        crew: [{ id: 1, name: "Gordon Geary", job: "Director" }],
        guestStars: [{ id: 2, name: "Carlos Manuel Vesga", character: "Manousos" }],
      },
      {
        id: "preview-episode-2",
        name: "Perfect Weather",
        episodeNumber: 2,
        airDate: "2026-06-05",
        runtime: 50,
        overview:
          "The city gets kinder, cleaner, and harder to trust as Carol follows a signal no one else can hear.",
        stillPath: PREVIEW_BACKDROP,
        voteAverage: 8.2,
        voteCount: 96,
        crew: [],
        guestStars: [],
      },
    ],
  },
};

const PREVIEW_EPISODE_REVIEWS = [
  {
    review: {
      _id: "episode_review_preview_1",
      rating: 5,
      reviewText: "That final quiet beat is doing a lot of work.",
    },
    author: { displayName: "Nora" },
    authorAvatarUrl: null,
  },
];

const PREVIEW_EPISODE_STATS = {
  averageRating: 4.7,
  reviewCount: 18,
};

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
    contentRating: details.contentRating ?? details.content_rating,
    createdBy: details.createdBy ?? details.created_by ?? [],
    episodeRunTime:
      details.episodeRunTime ??
      (Array.isArray(details.episode_run_time) ? details.episode_run_time[0] : undefined),
    firstAirDate: details.firstAirDate ?? details.first_air_date ?? null,
    genres: Array.isArray(details.genres) ? details.genres : [],
    lastAirDate: details.lastAirDate ?? details.last_air_date ?? null,
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
    voteAverage: details.voteAverage ?? details.vote_average ?? null,
    voteCount: details.voteCount ?? details.vote_count ?? null,
  };
}

type ImdbSeasonRatingsData = {
  averageRating: number | null;
  episodes: { episodeNumber: number; rating: number }[];
};

// show: undefined = still loading, null = resolved with no rating.
// seasons: missing key = still loading, null = resolved with no ratings.
type ImdbRatingsData = {
  show: { rating: number | null; votes: number | null } | null | undefined;
  seasons: Record<number, ImdbSeasonRatingsData | null>;
};

const EMPTY_IMDB_RATINGS: ImdbRatingsData = { show: undefined, seasons: {} };

const PREVIEW_IMDB_RATINGS: ImdbRatingsData = {
  show: { rating: 8.4, votes: 241338 },
  seasons: {
    1: {
      averageRating: 8.4,
      episodes: [
        { episodeNumber: 1, rating: 8.5 },
        { episodeNumber: 2, rating: 8.2 },
      ],
    },
  },
};

export default function ShowScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const previewParam =
    typeof params.preview === "string"
      ? params.preview
      : Array.isArray(params.preview)
        ? params.preview[0]
        : null;
  const isShowPreview =
    typeof __DEV__ !== "undefined" && __DEV__ && previewParam === "1";
  const routeShowId = (typeof params.id === "string" ? params.id : "") as Id<"shows">;
  const showId = isShowPreview ? PREVIEW_SHOW_ID : routeShowId;
  const openSeason = typeof params.openSeason === "string" ? Number(params.openSeason) : undefined;
  const openEpisode = typeof params.openEpisode === "string" ? Number(params.openEpisode) : undefined;
  const readParam = (value: unknown) =>
    typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  const openEpisodePreview = useMemo(() => {
    if (openEpisode === undefined || !Number.isFinite(openEpisode)) return null;
    const name = readParam(params.epName);
    const still = readParam(params.epStill);
    const overview = readParam(params.epOverview);
    const runtimeRaw = readParam(params.epRuntime);
    const airRaw = readParam(params.epAir);
    const airMs = airRaw ? Number(airRaw) : NaN;
    return {
      id: `preview-S${openSeason}E${openEpisode}`,
      name: name || `Episode ${openEpisode}`,
      episodeNumber: openEpisode,
      overview: overview ?? null,
      stillPath: still ?? null,
      runtime: runtimeRaw ? Number(runtimeRaw) : null,
      airDate: Number.isFinite(airMs) ? new Date(airMs).toISOString() : null,
      __preview: true as const,
    };
    // params objects are recreated each render; key off the primitive values.
  }, [
    openSeason,
    openEpisode,
    params.epName,
    params.epStill,
    params.epOverview,
    params.epRuntime,
    params.epAir,
  ]);
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
  const autoOpenHandledRef = useRef(false);

  const { isAuthenticated: sessionAuthenticated } = useAuth();
  const isAuthenticated = isShowPreview || sessionAuthenticated;
  const queriedShow = useQuery(
    api.shows.get,
    !isShowPreview && showId ? { showId } : "skip",
  );
  const show = isShowPreview ? PREVIEW_SHOW : queriedShow;
  const queriedMe = useQuery(api.users.me, isShowPreview ? "skip" : {});
  const me = isShowPreview ? PREVIEW_ME : queriedMe;
  const queriedWatchState = useQuery(
    api.watchStates.getForShow,
    !isShowPreview && isAuthenticated && showId ? { showId } : "skip",
  );
  const watchState = isShowPreview
    ? { _id: "watch_preview", showId, status: "watching", updatedAt: Date.now() }
    : queriedWatchState;
  const {
    results: queriedReviews,
    status: queriedReviewsStatus,
    loadMore: queriedLoadMoreReviews,
  } = usePaginatedQuery(
    api.reviews.listForShowDetailed,
    !isShowPreview && showId ? { showId } : "skip",
    { initialNumItems: 20 },
  );
  const reviews = isShowPreview ? PREVIEW_REVIEWS : queriedReviews;
  const reviewsStatus = isShowPreview ? "Exhausted" : queriedReviewsStatus;
  const loadMoreReviews = isShowPreview
    ? () => undefined
    : queriedLoadMoreReviews;
  const { results: queriedLists } = usePaginatedQuery(
    api.lists.listForUser,
    !isShowPreview && isAuthenticated && me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 20 },
  );
  const lists = isShowPreview
    ? [
        { _id: "list_preview_favorites", title: "All-time favorites" },
        { _id: "list_preview_sci_fi", title: "Smart sci-fi" },
      ]
    : queriedLists;

  const setStatus = useMutation(api.watchStates.setStatus).withOptimisticUpdate(
    (localStore, args) => {
      const previousState = localStore.getQuery(api.watchStates.getForShow, {
        showId: args.showId,
      });
      const previousStatus = previousState?.status;
      const now = Date.now();
      const optimisticState = {
        _id: previousState?._id ?? `optimistic:${args.showId}`,
        userId: previousState?.userId ?? me?._id ?? "me",
        showId: args.showId,
        status: args.status,
        updatedAt: now,
      };

      localStore.setQuery(
        api.watchStates.getForShow,
        { showId: args.showId },
        optimisticState,
      );
      const currentStates = localStore.getQuery(api.watchStates.listForUser, {}) ?? [];
      if (Array.isArray(currentStates)) {
        localStore.setQuery(api.watchStates.listForUser, {}, [
          optimisticState,
          ...currentStates.filter((state: any) => state.showId !== args.showId),
        ]);
      }
      const currentCounts = localStore.getQuery(api.watchStates.getCounts, {});
      if (currentCounts) {
        const nextCounts = { ...currentCounts };
        if (previousStatus && nextCounts[previousStatus] !== undefined) {
          nextCounts[previousStatus] = Math.max(0, nextCounts[previousStatus] - 1);
        } else {
          nextCounts.total = (nextCounts.total ?? 0) + 1;
        }
        nextCounts[args.status] = (nextCounts[args.status] ?? 0) + 1;
        localStore.setQuery(api.watchStates.getCounts, {}, nextCounts);
      }
    }
  );
  const removeStatus = useMutation(api.watchStates.removeStatus).withOptimisticUpdate(
    (localStore, args) => {
      const previousState = localStore.getQuery(api.watchStates.getForShow, {
        showId: args.showId,
      });
      localStore.setQuery(
        api.watchStates.getForShow,
        { showId: args.showId },
        null
      );
      const currentStates = localStore.getQuery(api.watchStates.listForUser, {}) ?? [];
      if (Array.isArray(currentStates)) {
        localStore.setQuery(
          api.watchStates.listForUser,
          {},
          currentStates.filter((state: any) => state.showId !== args.showId),
        );
      }
      const currentCounts = localStore.getQuery(api.watchStates.getCounts, {});
      if (currentCounts) {
        const nextCounts = { ...currentCounts };
        if (previousState?.status && nextCounts[previousState.status] !== undefined) {
          nextCounts[previousState.status] = Math.max(0, nextCounts[previousState.status] - 1);
        }
        nextCounts.total = Math.max(0, (nextCounts.total ?? 0) - 1);
        localStore.setQuery(api.watchStates.getCounts, {}, nextCounts);
      }
    }
  );
  const createReview = useMutation(api.reviews.create).withOptimisticUpdate(
    (localStore, args) => {
      const now = Date.now();
      const optimisticReviewId = `optimistic:review:${args.showId}:${now}`;
      const optimisticReview = {
        review: {
          _id: optimisticReviewId,
          id: optimisticReviewId,
          authorId: me?._id ?? "me",
          showId: args.showId,
          rating: args.rating,
          reviewText: args.reviewText,
          spoiler: args.spoiler ?? false,
          seasonNumber: null,
          episodeNumber: null,
          episodeTitle: null,
          createdAt: now,
          updatedAt: now,
        },
        author: me,
        show,
        likeCount: 0,
        likedByViewer: false,
      };

      localStore.setPaginatedQuery(
        api.reviews.listForShowDetailed,
        { showId: args.showId },
        (current) => {
          if (!current) return current;
          const page = current.page ?? current.results ?? [];
          const withoutDuplicate = page.filter(
            (item: any) => item.review?._id !== optimisticReviewId,
          );
          return {
            ...current,
            page: [optimisticReview, ...withoutDuplicate],
            results: [optimisticReview, ...withoutDuplicate],
          };
        },
      );
    },
  );
  const rateEpisode = useMutation(api.reviews.rateEpisode).withOptimisticUpdate(
    (localStore, args) => optimisticRateEpisode(localStore, args),
  );
  const removeEpisodeRating = useMutation(
    api.reviews.removeEpisodeRating,
  ).withOptimisticUpdate((localStore, args) =>
    optimisticRemoveEpisodeRating(localStore, args),
  );
  const queriedEpisodeRatings = useQuery(
    api.reviews.getMyEpisodeRatings,
    !isShowPreview && isAuthenticated && showId ? { showId } : "skip",
  );
  const myEpisodeRatings = isShowPreview
    ? [{ seasonNumber: 1, episodeNumber: 1, rating: 4.5, reviewText: "Sharp, strange, and beautifully paced." }]
    : queriedEpisodeRatings;
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
  const createListWithShow = useMutation(api.lists.create).withOptimisticUpdate(
    (localStore, args) => {
      if (!me?._id) return;
      const now = Date.now();
      const optimisticDoc = {
        _id: `optimistic:list:${now}`,
        _creationTime: now,
        ownerId: me._id,
        title: args.title,
        description: null,
        isPublic: args.isPublic ?? true,
        coverUrl: null,
        createdAt: now,
        updatedAt: now,
        itemCount: 1,
        followerCount: 0,
        viewerIsFollowing: false,
        isOwner: true,
      };
      localStore.setPaginatedQuery(api.lists.listForUser, { userId: me._id }, (current) => {
        if (!current) return current;
        const page = current.page ?? current.results ?? [];
        return { ...current, page: [optimisticDoc, ...page], results: [optimisticDoc, ...page] };
      });
    },
  );
  const queriedListMembership = useQuery(
    api.listItems.getShowMembership,
    !isShowPreview && isAuthenticated && showId ? { showId } : "skip",
  );
  const listMembership = isShowPreview
    ? [{ listId: "list_preview_sci_fi" }]
    : queriedListMembership;
  const serverMemberSet = useMemo(
    () =>
      new Set<string>(
        (listMembership ?? [])
          .map((membership: any) =>
            typeof membership === "string" ? membership : membership?.listId,
          )
          .filter(Boolean),
      ),
    [listMembership],
  );
  const queriedEpisodeProgress = useQuery(
    api.episodeProgress.getProgressForShow,
    !isShowPreview && isAuthenticated && showId ? { showId } : "skip",
  );
  const episodeProgress = isShowPreview
    ? [{ seasonNumber: 1, episodeNumber: 1 }]
    : queriedEpisodeProgress;
  const watchedEpisodeSet = useMemo(() => {
    const set = new Set<string>();
    if (episodeProgress) {
      for (const ep of episodeProgress) {
        set.add(`S${ep.seasonNumber}E${ep.episodeNumber}`);
      }
    }
    return set;
  }, [episodeProgress]);
  const toggleEpisode = useMutation(
    api.episodeProgress.toggleEpisode,
  ).withOptimisticUpdate(optimisticToggleEpisode);
  const markSeasonWatched = useMutation(
    api.episodeProgress.markSeasonWatched,
  ).withOptimisticUpdate(optimisticMarkSeasonWatched);
  const unmarkSeasonWatched = useMutation(
    api.episodeProgress.unmarkSeasonWatched,
  ).withOptimisticUpdate(optimisticUnmarkSeasonWatched);
  const getExtendedDetails = useAction(api.shows.getExtendedDetails);
  const getSeasonDetails = useAction(api.shows.getSeasonDetails);
  const getImdbRatings = useAction(api.shows.getImdbRatings);
  const getSimilarShows = useAction(api.embeddings.getSimilarShows);

  const [fetchedExtendedDetails, setFetchedExtendedDetails] = useState<{
    showId: string;
    details: any;
  } | null>(null);
  const [extendedDetailsLoadState, setExtendedDetailsLoadState] =
    useState<ExtendedDetailsLoadState>(isShowPreview ? "ready" : "idle");
  const [similarShows, setSimilarShows] = useState<any[]>([]);
  const [loadingSimilarShows, setLoadingSimilarShows] = useState(false);
  const [seasonDetailsByNumber, setSeasonDetailsByNumber] = useState<Record<number, any>>(
    () => (isShowPreview ? PREVIEW_SEASON_DETAILS : {})
  );
  const [seasonLoadStateByNumber, setSeasonLoadStateByNumber] = useState<
    Record<number, SeasonLoadState>
  >(() => {
    const initialState: Record<number, SeasonLoadState> = {};
    if (isShowPreview) {
      initialState[1] = "loaded";
    }
    return initialState;
  });
  const [seasonLoadErrorByNumber, setSeasonLoadErrorByNumber] = useState<
    Record<number, string>
  >({});
  const [visibleSeasonCount, setVisibleSeasonCount] = useState(INITIAL_VISIBLE_SEASONS);
  const [imdbRatings, setImdbRatings] = useState<ImdbRatingsData>(() =>
    isShowPreview ? PREVIEW_IMDB_RATINGS : EMPTY_IMDB_RATINGS,
  );
  const imdbRequestedSeasonsRef = useRef<Set<number>>(new Set());
  const imdbShowRequestedRef = useRef(false);
  const imdbUnavailableRef = useRef(false);
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
  const [newListMode, setNewListMode] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  const [episodeReviewExpanded, setEpisodeReviewExpanded] = useState(false);
  const [episodeReviewText, setEpisodeReviewText] = useState("");
  const [optimisticMemberSet, setOptimisticMemberSet] = useState<Set<string> | null>(
    null
  );
  const [optimisticStatus, setOptimisticStatus] = useState<WatchStatus | null | undefined>(
    undefined
  );
  const memberSet = optimisticMemberSet ?? serverMemberSet;
  const currentStatus = optimisticStatus === undefined ? watchState?.status : optimisticStatus;
  const showHasLoaded = show !== undefined;
  const showExternalId = show?.externalId;
  const cachedExtendedDetails = useMemo(
    () => normalizeExtendedDetails(show?.extendedDetails),
    [show?.extendedDetails],
  );
  const activeDetails =
    fetchedExtendedDetails?.showId === showId
      ? fetchedExtendedDetails.details
      : cachedExtendedDetails;
  const hasCachedExtendedDetails = Boolean(cachedExtendedDetails);
  const fallbackGenres = useMemo(
    () =>
      mapGenreIdsToNames(show?.genreIds).map((name) => ({
        id: `catalog-${name}`,
        name,
      })),
    [show?.genreIds],
  );
  const displayGenres =
    activeDetails?.genres?.length > 0 ? activeDetails.genres : fallbackGenres;

  useEffect(() => {
    if (!optimisticMemberSet) {
      return;
    }
    if (
      optimisticMemberSet.size === serverMemberSet.size &&
      [...optimisticMemberSet].every((listId) => serverMemberSet.has(listId))
    ) {
      setOptimisticMemberSet(null);
    }
  }, [optimisticMemberSet, serverMemberSet]);

  useEffect(() => {
    if (optimisticStatus === undefined) {
      return;
    }
    const actualStatus = watchState?.status ?? null;
    if (actualStatus === optimisticStatus) {
      setOptimisticStatus(undefined);
    }
  }, [optimisticStatus, watchState?.status]);

  // Episode sheet gesture animation
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const sheetOverlayOpacity = useSharedValue(0);
  // Live scroll offset of the sheet's ScrollView, tracked on the UI thread so
  // the pan gesture can decide (without JS-thread lag) whether the list is at
  // the top and therefore free to be dragged down to dismiss.
  const sheetScrollY = useSharedValue(0);
  const sheetScrollRef = useAnimatedRef<Animated.ScrollView>();
  const sheetScrollHandler = useAnimatedScrollHandler((e) => {
    sheetScrollY.value = e.contentOffset.y;
  });
  // Y offset (within the "px-5" content block, i.e. below the hero) of the
  // rating card that holds the review input, so we can scroll it clear of the
  // keyboard on focus.
  const reviewCardYRef = useRef(0);
  const revealReviewInput = useCallback(() => {
    // The hero image is a full-width 16:9 block above the content, so the
    // review card's absolute scroll offset is heroHeight + its layout Y.
    const heroHeight = (SCREEN_WIDTH * 9) / 16;
    const target = Math.max(heroHeight + reviewCardYRef.current - 12, 0);
    // Let the keyboard begin animating so automaticallyAdjustKeyboardInsets has
    // expanded the scroll range before we scroll.
    setTimeout(() => {
      sheetScrollRef.current?.scrollTo({ y: target, animated: true });
    }, 140);
  }, []);

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

  // Runs simultaneously with the inner ScrollView (via
  // simultaneousWithExternalGesture) so drag-to-dismiss keeps working even when
  // the episode has enough content to scroll. We only translate the sheet while
  // the list is pinned to the top and the finger is moving down; otherwise the
  // ScrollView owns the gesture and scrolls normally.
  const episodePanGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (sheetScrollY.value <= 0 && e.translationY > 0) {
        sheetTranslateY.value = e.translationY;
        sheetOverlayOpacity.value = interpolate(
          e.translationY,
          [0, SCREEN_HEIGHT * 0.4],
          [1, 0],
          Extrapolation.CLAMP,
        );
      } else if (sheetTranslateY.value !== 0) {
        // Finger returned into the scrollable area — snap the sheet home so the
        // list scrolls instead of half-dragging.
        sheetTranslateY.value = 0;
        sheetOverlayOpacity.value = 1;
      }
    })
    .onEnd((e) => {
      const dragged = sheetTranslateY.value;
      if (
        dragged > DISMISS_THRESHOLD ||
        (e.velocityY > DISMISS_VELOCITY && dragged > 8)
      ) {
        sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        sheetOverlayOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(closeEpisodeSheet)();
      } else if (dragged !== 0) {
        sheetTranslateY.value = withTiming(0, { duration: 250 });
        sheetOverlayOpacity.value = withTiming(1, { duration: 150 });
      }
    })
    // RNGH/Reanimated ref typings disagree; the runtime ref is correct.
    .simultaneousWithExternalGesture(sheetScrollRef as never)
    .activeOffsetY(12)
    .failOffsetY(-12);

  const seasonDetailsByNumberRef = useRef<Record<number, any>>({});
  const seasonLoadStateByNumberRef = useRef<Record<number, SeasonLoadState>>({});
  const seasonLoadErrorByNumberRef = useRef<Record<number, string>>({});
  const seasonLoadPromisesRef = useRef<Map<number, Promise<any>>>(new Map());
  const activeShowExternalIdRef = useRef<string | null>(null);
  const queriedEpisodeCommunityReviews = useQuery(
    api.reviews.listForEpisodeDetailed,
    !isShowPreview && selectedEpisode && showId
      ? {
          showId,
          seasonNumber: selectedEpisode.seasonNumber,
          episodeNumber: selectedEpisode.episode.episodeNumber,
        }
      : "skip",
  );
  const episodeCommunityReviews = isShowPreview
    ? PREVIEW_EPISODE_REVIEWS
    : queriedEpisodeCommunityReviews;
  const queriedEpisodeStats = useQuery(
    api.reviews.getEpisodeStats,
    !isShowPreview && selectedEpisode && showId
      ? {
          showId,
          seasonNumber: selectedEpisode.seasonNumber,
          episodeNumber: selectedEpisode.episode.episodeNumber,
        }
      : "skip",
  );
  const episodeStats = isShowPreview ? PREVIEW_EPISODE_STATS : queriedEpisodeStats;
  const episodeCommunityReviewItems = useMemo(() => {
    if (Array.isArray(episodeCommunityReviews)) {
      return episodeCommunityReviews;
    }
    return episodeCommunityReviews?.results ?? episodeCommunityReviews?.page ?? [];
  }, [episodeCommunityReviews]);
  const hasEpisodeRatingStats =
    typeof episodeStats?.averageRating === "number" && (episodeStats.reviewCount ?? episodeStats.count ?? 0) > 0;

  useEffect(() => {
    let cancelled = false;

    const fetchExtendedDetails = async () => {
      if (isShowPreview) {
        setFetchedExtendedDetails(null);
        setExtendedDetailsLoadState("ready");
        return;
      }
      if (!showHasLoaded) {
        setFetchedExtendedDetails(null);
        setExtendedDetailsLoadState("idle");
        return;
      }
      if (!showId || !showExternalId) {
        setFetchedExtendedDetails(null);
        setExtendedDetailsLoadState("ready");
        return;
      }
      if (hasCachedExtendedDetails) {
        setFetchedExtendedDetails(null);
        setExtendedDetailsLoadState("ready");
        void getExtendedDetails({ showId }).catch((error) => {
          if (!cancelled) {
            console.error("Failed to refresh extended details:", error);
          }
        });
        return;
      }

      setExtendedDetailsLoadState("loading");
      try {
        const details = await getExtendedDetails({ showId });
        if (cancelled) {
          return;
        }
        setFetchedExtendedDetails({
          showId,
          details: normalizeExtendedDetails(details),
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch extended details:", error);
        }
      } finally {
        if (!cancelled) {
          setExtendedDetailsLoadState("ready");
        }
      }
    };
    void fetchExtendedDetails();

    return () => {
      cancelled = true;
    };
  }, [
    getExtendedDetails,
    hasCachedExtendedDetails,
    isShowPreview,
    showExternalId,
    showHasLoaded,
    showId,
  ]);

  // Watching → completed promotion for fully watched ended shows happens
  // server-side (syncWatchStateAfterEpisodeChange) whenever episode progress
  // changes; the client no longer writes statuses on its own.

  const isEpisodeAvailable = useCallback(
    (airDate?: string | null) => {
      if (activeDetails?.status === "Ended") {
        return true;
      }

      const timestamp = new Date(airDate ?? "").getTime();
      return Number.isFinite(timestamp) && timestamp <= Date.now();
    },
    [activeDetails?.status],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchSimilarShows = async () => {
      if (isShowPreview) {
        setLoadingSimilarShows(false);
        return;
      }
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
  }, [getSimilarShows, isShowPreview, showId]);
  const similarShowItems = useMemo(() => {
    if (similarShows.length > 0) {
      return similarShows;
    }
    const tmdbSimilar = activeDetails?.similar;
    if (Array.isArray(tmdbSimilar)) {
      return tmdbSimilar;
    }
    if (Array.isArray(tmdbSimilar?.results)) {
      return tmdbSimilar.results;
    }
    return [];
  }, [activeDetails?.similar, similarShows]);

  const seasonOptions = useMemo(
    () =>
      (activeDetails?.seasons ?? [])
        .filter((season: any) => season.season_number > 0)
        .sort((a: any, b: any) => a.season_number - b.season_number),
    [activeDetails?.seasons]
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

      const inFlightLoad = runLoad();
      seasonLoadPromisesRef.current.set(seasonNumber, inFlightLoad);
      return await inFlightLoad;
    },
    [cacheSeasonDetails, getSeasonDetails, setSeasonRequestState, show?.externalId, showId],
  );

  const ensureSeasonDetailsLoaded = useCallback(
    async (seasonNumbers: number[], options?: { forceRetry?: boolean }) => {
      const loadedSeasonDetails = new Map<number, any>();
      const uniqueSeasonNumbers = Array.from(new Set(seasonNumbers));

      // Seasons load concurrently — each is an independent TMDB proxy call
      // and loadSeasonDetails dedupes per-season in-flight requests.
      await Promise.all(
        uniqueSeasonNumbers.map(async (seasonNumber) => {
          const existingDetails = seasonDetailsByNumberRef.current[seasonNumber];
          if (existingDetails !== undefined) {
            loadedSeasonDetails.set(seasonNumber, existingDetails);
            return;
          }

          const requestState = seasonLoadStateByNumberRef.current[seasonNumber] ?? "idle";
          if (requestState === "error" && !options?.forceRetry) {
            return;
          }

          try {
            const details = await loadSeasonDetails(seasonNumber, options);
            loadedSeasonDetails.set(seasonNumber, details);
          } catch (error) {
            console.error("Failed to fetch season details:", error);
          }
        }),
      );

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
    const nextSeasonDetails = isShowPreview ? PREVIEW_SEASON_DETAILS : {};
    const nextSeasonLoadState: Record<number, SeasonLoadState> = isShowPreview
      ? { 1: "loaded" }
      : {};
    setSeasonDetailsByNumber(nextSeasonDetails);
    seasonDetailsByNumberRef.current = nextSeasonDetails;
    setSeasonLoadStateByNumber(nextSeasonLoadState);
    seasonLoadStateByNumberRef.current = nextSeasonLoadState;
    setSeasonLoadErrorByNumber({});
    seasonLoadErrorByNumberRef.current = {};
    seasonLoadPromisesRef.current = new Map();
    setVisibleSeasonCount(INITIAL_VISIBLE_SEASONS);
    setSelectedEpisode(null);
    setEpisodeSheetVisible(false);
    setImdbRatings(isShowPreview ? PREVIEW_IMDB_RATINGS : EMPTY_IMDB_RATINGS);
    imdbRequestedSeasonsRef.current = new Set();
    imdbShowRequestedRef.current = false;
    imdbUnavailableRef.current = false;
  }, [isShowPreview, show?.externalId]);

  // IMDb ratings load lazily and merge into one map: the show-level rating as
  // soon as the show is known, then each season's episode ratings as that
  // season's guide entries load. Every requested slot is resolved (data or
  // null) when a response lands so skeletons always clear; results are keyed
  // by show/season, so late responses merge safely and only a show switch
  // discards them.
  useEffect(() => {
    if (isShowPreview || !showId || !show?.externalId || imdbUnavailableRef.current) {
      return;
    }
    const externalId = show.externalId;
    const pendingSeasons = Object.keys(seasonDetailsByNumber)
      .map(Number)
      .filter(
        (seasonNumber) =>
          seasonNumber >= 1 && !imdbRequestedSeasonsRef.current.has(seasonNumber),
      );
    if (imdbShowRequestedRef.current && pendingSeasons.length === 0) {
      return;
    }
    imdbShowRequestedRef.current = true;
    for (const seasonNumber of pendingSeasons) {
      imdbRequestedSeasonsRef.current.add(seasonNumber);
    }
    const resolvePending = (result: {
      show?: { rating: number | null; votes: number | null } | null;
      seasons?: Record<number, ImdbSeasonRatingsData>;
    } | null) => {
      setImdbRatings((current) => ({
        show: result?.show ?? current.show ?? null,
        seasons: {
          ...current.seasons,
          ...Object.fromEntries(
            pendingSeasons.map((seasonNumber) => [
              seasonNumber,
              result?.seasons?.[seasonNumber] ?? current.seasons[seasonNumber] ?? null,
            ]),
          ),
        },
      }));
    };
    void getImdbRatings({ showId, seasonNumbers: pendingSeasons })
      .then((result) => {
        if (activeShowExternalIdRef.current !== externalId) {
          return;
        }
        if (!result) {
          // No IMDb id (or the feature is off): resolve everything and stop
          // asking for this show.
          imdbUnavailableRef.current = true;
          resolvePending(null);
          return;
        }
        // Seasons the server couldn't resolve this call (unrated so far, or
        // past its inline fetch cap) stay eligible for the next request.
        for (const seasonNumber of pendingSeasons) {
          if (!result.seasons?.[seasonNumber]) {
            imdbRequestedSeasonsRef.current.delete(seasonNumber);
          }
        }
        resolvePending(result);
      })
      .catch(() => {
        if (activeShowExternalIdRef.current !== externalId) {
          return;
        }
        for (const seasonNumber of pendingSeasons) {
          imdbRequestedSeasonsRef.current.delete(seasonNumber);
        }
        resolvePending(null);
      });
  }, [getImdbRatings, isShowPreview, seasonDetailsByNumber, show?.externalId, showId]);

  // Clear episode content after sheet dismiss animation (fallback if onDismiss doesn't fire)
  useEffect(() => {
    if (!episodeSheetVisible && selectedEpisode) {
      const id = setTimeout(() => {
        setSelectedEpisode(null);
        setEpisodeReviewExpanded(false);
        setEpisodeReviewText("");
      }, 400);
      return () => clearTimeout(id);
    }
  }, [episodeSheetVisible, selectedEpisode]);

  // Open the episode sheet the instant we arrive from a deep link. We seed it
  // with the preview episode the caller already had (still/name/overview/
  // runtime), so the popup appears immediately instead of waiting on the
  // season-details fetch. The enrich effect below swaps in the full episode
  // once that data lands.
  useEffect(() => {
    if (
      deepLinkConsumed ||
      autoOpenHandledRef.current ||
      openSeason === undefined ||
      openEpisode === undefined ||
      !Number.isFinite(openSeason) ||
      !Number.isFinite(openEpisode) ||
      !showHasLoaded
    ) {
      return;
    }

    const seasonDetails = seasonDetailsByNumber[openSeason];
    const fullEpisode = seasonDetails?.episodes?.find(
      (ep: any) => ep.episodeNumber === openEpisode,
    );

    // Prefer the fully loaded episode; otherwise fall back to the preview
    // payload so we never block on the network. Bail only when we have
    // neither (e.g. a bare deep link with no preview and no season yet).
    const episode = fullEpisode ?? openEpisodePreview;
    if (!episode) return;

    const seasonMeta = seasonsWithEpisodes.find(
      (s: any) => s.season_number === openSeason,
    );
    const seasonName = seasonMeta?.name ?? `Season ${openSeason}`;

    autoOpenHandledRef.current = true;
    setDeepLinkConsumed(true);
    setSelectedEpisode({
      episode,
      seasonName,
      seasonNumber: openSeason,
    });
    openEpisodeSheet();
  }, [
    deepLinkConsumed,
    openSeason,
    openEpisode,
    openEpisodePreview,
    seasonDetailsByNumber,
    seasonsWithEpisodes,
    showHasLoaded,
    openEpisodeSheet,
  ]);

  // Make sure the deep-linked season is actually fetched even if it sits
  // beyond the initially visible seasons, so the preview upgrades to the full
  // episode and the season poster/air metadata resolve.
  useEffect(() => {
    if (
      isShowPreview ||
      openSeason === undefined ||
      !Number.isFinite(openSeason) ||
      !show?.externalId
    ) {
      return;
    }
    if (seasonDetailsByNumberRef.current[openSeason] !== undefined) return;
    void ensureSeasonDetailsLoaded([openSeason]);
  }, [isShowPreview, openSeason, show?.externalId, ensureSeasonDetailsLoaded]);

  // Once the deep-linked season's real episode data arrives, replace the
  // lightweight preview with the full episode (crew, guest stars, exact air
  // date, still) — but only while the preview is still showing and the user
  // hasn't navigated to a different episode.
  useEffect(() => {
    if (openSeason === undefined || openEpisode === undefined) return;
    const seasonDetails = seasonDetailsByNumber[openSeason];
    const fullEpisode = seasonDetails?.episodes?.find(
      (ep: any) => ep.episodeNumber === openEpisode,
    );
    if (!fullEpisode) return;
    setSelectedEpisode((prev) => {
      if (
        !prev ||
        prev.seasonNumber !== openSeason ||
        prev.episode?.episodeNumber !== openEpisode ||
        !prev.episode?.__preview
      ) {
        return prev;
      }
      const seasonMeta = seasonsWithEpisodes.find(
        (s: any) => s.season_number === openSeason,
      );
      return {
        episode: fullEpisode,
        seasonName: seasonMeta?.name ?? prev.seasonName,
        seasonNumber: openSeason,
      };
    });
  }, [openSeason, openEpisode, seasonDetailsByNumber, seasonsWithEpisodes]);

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

  const handleStatus = useCallback(
    (value: WatchStatus) => {
      if (isShowPreview) {
        setOptimisticStatus(value);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }
      if (!isAuthenticated) {
        Alert.alert("Sign in required", "Set your watch status after signing in.");
        return;
      }
      setOptimisticStatus(value);
      // Choosing "completed" also marks every released episode as watched —
      // the server backfills progress and diary rows in the same mutation, so
      // there's no client-side season syncing left to do here.
      void setStatus({ showId, status: value }).catch((error) => {
        setOptimisticStatus(undefined);
        Alert.alert("Couldn't update status", String(error));
      });
    },
    [isAuthenticated, isShowPreview, setStatus, showId]
  );

  const handleRemoveStatus = useCallback(() => {
    if (isShowPreview) {
      setOptimisticStatus(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (!isAuthenticated) return;
    setOptimisticStatus(null);
    void removeStatus({ showId }).catch((error) => {
      setOptimisticStatus(undefined);
      Alert.alert("Couldn't update status", String(error));
    });
  }, [isAuthenticated, isShowPreview, removeStatus, showId]);

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
    const draft = { rating, reviewText, spoiler };
    Keyboard.dismiss();
    setRating(0);
    setReviewText("");
    setSpoiler(false);
    setReviewSheetVisible(false);
    setTimeout(() => setReviewSheetVisible(false), 0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isShowPreview) {
      return;
    }

    try {
      await createReview({ showId, ...draft });
    } catch (error) {
      setRating(draft.rating);
      setReviewText(draft.reviewText);
      setSpoiler(draft.spoiler);
      setReviewSheetVisible(true);
      Alert.alert("Could not publish review", String(error));
    }
  }, [createReview, isAuthenticated, isShowPreview, rating, reviewText, showId, spoiler]);

  const handleToggleList = useCallback(
    (listId: Id<"lists">) => {
      if (!isAuthenticated) {
        Alert.alert("Sign in required", "Add to a list after signing in.");
        return;
      }
      // Rows inserted optimistically don't exist server-side yet.
      if (typeof listId === "string" && listId.startsWith("optimistic:")) {
        return;
      }
      const isCurrentlyIn = memberSet.has(listId);
      const nextMemberSet = new Set<string>(memberSet);
      if (isCurrentlyIn) {
        nextMemberSet.delete(listId);
      } else {
        nextMemberSet.add(listId);
      }
      setOptimisticMemberSet(nextMemberSet);
      Haptics.impactAsync(
        isCurrentlyIn
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium,
      );
      if (isShowPreview) {
        return;
      }
      void toggleListItem({ listId, showId }).catch((error) => {
        setOptimisticMemberSet(null);
        Alert.alert("Error", String(error));
      });
    },
    [toggleListItem, isAuthenticated, isShowPreview, showId, memberSet],
  );

  const handleCreateListFromPicker = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Create a list after signing in.");
      return;
    }
    const trimmedTitle = newListTitle.trim();
    if (!trimmedTitle || creatingList) {
      return;
    }
    setCreatingList(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isShowPreview) {
        setNewListTitle("");
        setNewListMode(false);
        return;
      }
      // The server seeds the new list with this show in the same mutation.
      const newListId = await createListWithShow({ title: trimmedTitle, showId });
      if (typeof newListId === "string") {
        setOptimisticMemberSet((prev) => {
          const next = new Set<string>(prev ?? serverMemberSet);
          next.add(newListId);
          return next;
        });
      }
      setNewListTitle("");
      setNewListMode(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Could not create list", String(error));
    } finally {
      setCreatingList(false);
    }
  }, [
    createListWithShow,
    creatingList,
    isAuthenticated,
    isShowPreview,
    newListTitle,
    serverMemberSet,
    showId,
  ]);

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
    if (displayGenres.length > 0) {
      parts.push(
        displayGenres
          .slice(0, 3)
          .map((g: any) => g.name)
          .join(", ")
      );
    }
    if (activeDetails?.episodeRunTime) {
      parts.push(`${activeDetails.episodeRunTime}m`);
    }
    return parts.join("  ·  ");
  }, [show?.year, displayGenres, activeDetails?.episodeRunTime]);

  const imdbShowLoading = imdbRatings.show === undefined;
  const imdbShowRating = imdbRatings.show?.rating ?? null;
  const imdbShowVotes = imdbRatings.show?.votes ?? null;

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
    activeDetails?.backdropPath ??
    show?.backdropUrl ??
    null;
  const showQuerySettled = isShowPreview || showHasLoaded;
  const extendedDetailsSettled =
    isShowPreview ||
    !showExternalId ||
    Boolean(activeDetails) ||
    extendedDetailsLoadState === "ready";
  // Reviews render below the fold and stream in on their own; gating first
  // paint on them (or showing the app-icon boot screen) made every show tap
  // feel like an app relaunch.
  const initialDetailSurfaceReady = showQuerySettled && extendedDetailsSettled;

  if (!initialDetailSurfaceReady) {
    return <ShowDetailSkeleton onBack={handleBackPress} />;
  }

  if (!show) {
    return (
      <View className="flex-1 justify-center bg-dark-bg px-6">
        <EmptyState
          title="Show not found"
          description="This show is no longer available."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-bg">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
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
                boxShadow: "0 12px 24px rgba(0,0,0,0.6)",
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
          <GlassPressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={handleBackPress}
            radius={20}
            surfaceStyle={{
              height: 40,
              width: 40,
            }}
            contentStyle={{
              alignItems: "center",
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#F1F3F7" />
          </GlassPressable>

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
          {activeDetails?.tagline ? (
            <Text
              className="mt-3 text-center text-sm italic text-text-tertiary"
              style={{ lineHeight: 20 }}
            >
              "{activeDetails.tagline}"
            </Text>
          ) : null}

          {/* Rating & Content Rating */}
          <View className="mt-4 flex-row flex-wrap items-center justify-center gap-3">
            {imdbShowLoading ? (
              <ShimmerBlock width={132} height={37} radius={999} />
            ) : imdbShowRating !== null ? (
              <GlassSurface
                radius={999}
                variant="surface"
                fallbackColor="rgba(245,197,24,0.10)"
                tintColor="rgba(245,197,24,0.10)"
                borderColor="rgba(245,197,24,0.18)"
                contentStyle={{
                  alignItems: "center",
                  flexDirection: "row",
                  gap: 7,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <ImdbLogo height={16} />
                <Text className="text-lg font-bold text-text-primary">
                  {imdbShowRating.toFixed(1)}
                </Text>
                <Text className="text-sm text-text-tertiary">/10</Text>
                {imdbShowVotes ? (
                  <Text className="text-xs text-text-tertiary">
                    ({imdbShowVotes.toLocaleString()})
                  </Text>
                ) : null}
              </GlassSurface>
            ) : null}
            {activeDetails?.contentRating && (
              <GlassSurface
                radius={8}
                variant="surface"
                fallbackColor="rgba(255,255,255,0.06)"
                borderColor="rgba(255,255,255,0.16)"
                contentStyle={{ paddingHorizontal: 9, paddingVertical: 3 }}
              >
                <Text
                  className="text-xs font-bold text-text-secondary"
                  style={{ letterSpacing: 0.5 }}
                >
                  {activeDetails.contentRating}
                </Text>
              </GlassSurface>
            )}
          </View>

        </View>

        {/* ─── Status + Actions ─── */}
        <View className="mt-6 px-6">
          <View className="flex-row items-center gap-2.5">
            <View className="flex-1">
              <StatusSelector
                currentStatus={currentStatus as any}
                onSelect={handleStatus}
                onRemove={handleRemoveStatus}
              />
            </View>
            <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setReviewSheetVisible(true);
              }}
              accessibilityLabel="Write a review"
              accessibilityRole="button"
              radius={16}
              variant="control"
              fallbackColor="rgba(245,158,11,0.10)"
              tintColor="rgba(245,158,11,0.10)"
              borderColor="rgba(245,158,11,0.20)"
              surfaceStyle={{
                width: 52,
                height: 52,
              }}
              contentStyle={{
                alignItems: "center",
                justifyContent: "center",
                width: 52,
                height: 52,
              }}
            >
              <Ionicons name="create-outline" size={22} color="#F59E0B" />
            </GlassPressable>
            <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setListPickerVisible(true);
              }}
              accessibilityLabel="Add to list"
              accessibilityRole="button"
              radius={16}
              variant={memberSet.size > 0 ? "prominent" : "control"}
              fallbackColor={
                memberSet.size > 0 ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.06)"
              }
              tintColor={
                memberSet.size > 0 ? "rgba(34,197,94,0.10)" : undefined
              }
              borderColor={
                memberSet.size > 0 ? "rgba(34,197,94,0.22)" : undefined
              }
              surfaceStyle={{
                width: 52,
                height: 52,
              }}
              contentStyle={{
                alignItems: "center",
                justifyContent: "center",
                width: 52,
                height: 52,
              }}
            >
              <Ionicons
                name={memberSet.size > 0 ? "list" : "list-outline"}
                size={22}
                color={memberSet.size > 0 ? "#22C55E" : "#9BA1B0"}
              />
            </GlassPressable>
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
        {activeDetails && (
          <GlassSurface
            radius={18}
            variant="surface"
            fallbackColor="rgba(22,26,34,0.72)"
            style={{ marginHorizontal: 24, marginTop: 32 }}
            contentStyle={{ flexDirection: "row" }}
          >
            <GlanceItem
              label="Seasons"
              value={String(activeDetails.numberOfSeasons ?? "—")}
              border
            />
            <GlanceItem
              label="Episodes"
              value={String(activeDetails.numberOfEpisodes ?? "—")}
              border
            />
            <GlanceItem
              label="Status"
              value={
                activeDetails.status === "Returning Series"
                  ? "Returning"
                  : activeDetails.status === "Ended"
                    ? "Ended"
                    : activeDetails.status ?? "—"
              }
            />
          </GlassSurface>
        )}

        {/* ─── Details ─── */}
        {activeDetails && (
          <View className="mx-6 mt-8">
            <Text
              className="mb-4 text-xs font-bold uppercase text-text-tertiary"
              style={{ letterSpacing: 1.5 }}
            >
              Details
            </Text>

            {activeDetails.firstAirDate && (
              <DetailRow
                label="First aired"
                value={formatDate(new Date(activeDetails.firstAirDate).getTime())}
              />
            )}
            {activeDetails.lastAirDate && activeDetails.status === "Ended" && (
              <DetailRow
                label="Last aired"
                value={formatDate(new Date(activeDetails.lastAirDate).getTime())}
              />
            )}
            {activeDetails.episodeRunTime && (
              <DetailRow
                label="Runtime"
                value={`${activeDetails.episodeRunTime} min per episode`}
              />
            )}
            {activeDetails.networks?.length > 0 && (
              <DetailRow
                label="Network"
                value={activeDetails.networks.map((n: any) => n.name).join(", ")}
              />
            )}
            {activeDetails.createdBy?.length > 0 && (
              <DetailRow
                label="Created by"
                value={activeDetails.createdBy.map((c: any) => c.name).join(", ")}
              />
            )}
          </View>
        )}

        {activeDetails?.watchProviders &&
          activeDetails.watchProviders.length > 0 && (
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
                {activeDetails.watchProviders.map((provider: any) => (
                  <GlassPressable
                    key={provider.id}
                    disabled={!provider.deepLinkUrl}
                    onPress={() => handleProviderPress(provider)}
                    radius={999}
                    variant="control"
                    fallbackColor="rgba(22,26,34,0.70)"
                    style={{ marginRight: 10 }}
                    surfaceStyle={{ opacity: provider.deepLinkUrl ? 1 : 0.55 }}
                    contentStyle={{
                      alignItems: "center",
                      flexDirection: "row",
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
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
                  </GlassPressable>
                ))}
              </ScrollView>
            </View>
          )}

        {/* ─── Genres ─── */}
        {displayGenres.length > 0 && (
            <View className="mt-8 px-6">
              <Text
                className="mb-3 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Genres
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {displayGenres.map((genre: any) => (
                  <GlassSurface
                    key={genre.id}
                    radius={999}
                    variant="surface"
                    fallbackColor="rgba(22,26,34,0.58)"
                    borderColor="rgba(255,255,255,0.09)"
                    contentStyle={{ paddingHorizontal: 14, paddingVertical: 6 }}
                  >
                    <Text className="text-xs font-medium text-text-secondary">
                      {genre.name}
                    </Text>
                  </GlassSurface>
                ))}
              </View>
            </View>
          )}

        {/* ─── Cast ─── */}
        {activeDetails?.cast &&
          activeDetails.cast.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Cast
              </Text>
              <FlashList
                data={activeDetails.cast}
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
        {activeDetails?.crew &&
          activeDetails.crew.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Crew
              </Text>
              <FlashList
                data={activeDetails.crew}
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

        {seasonsWithEpisodes.length > 0 && (
          <EpisodeGuide
            seasons={seasonsWithEpisodes}
            visibleSeasonCount={visibleSeasonCount}
            seasonDetailsByNumber={seasonDetailsByNumber}
            seasonLoadStateByNumber={seasonLoadStateByNumber}
            seasonLoadErrorByNumber={seasonLoadErrorByNumber}
            imdbSeasonRatings={imdbRatings.seasons}
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
              if (isShowPreview) return;
              void ensureSeasonDetailsLoaded([seasonNumber], { forceRetry: true });
            }}
            onMarkSeasonWatched={(seasonNumber, episodes) => {
              if (isShowPreview) return;
              // Explicit season button is a deliberate watch action, so it
              // opts into diary logs (the completed-status backfill happens
              // server-side and writes its own diary rows).
              void markSeasonWatched({
                showId,
                seasonNumber,
                episodes,
                createLog: true,
              });
            }}
            onUnmarkSeasonWatched={(seasonNumber) => {
              if (isShowPreview) return;
              void unmarkSeasonWatched({
                showId,
                seasonNumber,
              });
            }}
            onToggleEpisode={(seasonNumber, episode) => {
              if (isShowPreview) return;
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
        {activeDetails?.videos &&
          activeDetails.videos.length > 0 && (
            <View className="mt-10">
              <Text
                className="mb-4 px-6 text-xs font-bold uppercase text-text-tertiary"
                style={{ letterSpacing: 1.5 }}
              >
                Trailers & Videos
              </Text>
              <FlashList
                data={activeDetails.videos}
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
            <GlassSurface
              radius={18}
              variant="surface"
              fallbackColor="rgba(22,26,34,0.68)"
              style={{ marginBottom: 16 }}
              contentStyle={{
                alignItems: "center",
                flexDirection: "row",
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
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
            </GlassSurface>
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
                <GlassPressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    loadMoreReviews(20);
                  }}
                  radius={999}
                  variant="control"
                  style={{ alignSelf: "flex-start", marginTop: 8 }}
                  contentStyle={{
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Load more
                  </Text>
                </GlassPressable>
              ) : null}
            </View>
          ) : reviewsStatus === "LoadingFirstPage" ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator color="#7dd3fc" />
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
        <KeyboardAvoidingView
          className="flex-1 justify-end bg-black/50"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setListPickerVisible(false);
            }}
            className="absolute inset-0"
          />
          <GlassSurface
            radius={28}
            variant="sheet"
            style={{
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            }}
            contentStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24 }}
          >
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-dark-border" />
            </View>
            <Text className="mb-4 px-6 text-lg font-semibold text-text-primary">
              Add to list
            </Text>
            <View className="px-4">
              {lists.length > 0 ? (
                <ScrollView
                  style={{ maxHeight: 320 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View className="gap-2">
                    {lists.map((list) => {
                      const isIn = memberSet.has(list._id);
                      return (
                        <GlassPressable
                          key={list._id}
                          onPress={() => handleToggleList(list._id)}
                          radius={14}
                          variant={isIn ? "prominent" : "control"}
                          fallbackColor={
                            isIn ? "rgba(14,165,233,0.12)" : "rgba(255,255,255,0.03)"
                          }
                          borderColor={isIn ? "rgba(14,165,233,0.24)" : "transparent"}
                          contentStyle={{
                            alignItems: "center",
                            flexDirection: "row",
                            gap: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                          }}
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
                            numberOfLines={1}
                          >
                            {list.title}
                          </Text>
                          {isIn ? (
                            <Text className="text-xs text-brand-400">Added</Text>
                          ) : null}
                        </GlassPressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : !newListMode ? (
                <View className="items-center py-4">
                  <Ionicons name="list-outline" size={28} color="#5A6070" />
                  <Text className="mt-2 text-sm text-text-tertiary">
                    No lists yet — create your first below
                  </Text>
                </View>
              ) : null}

              {/* ── New list (inline create) ── */}
              {newListMode ? (
                <View className="mt-3 rounded-2xl border border-dark-border bg-dark-bg p-3">
                  <TextInput
                    value={newListTitle}
                    onChangeText={setNewListTitle}
                    placeholder="List name"
                    placeholderTextColor="#5A6070"
                    autoFocus
                    maxLength={100}
                    returnKeyType="done"
                    onSubmitEditing={handleCreateListFromPicker}
                    className="rounded-xl border border-dark-border bg-dark-card px-4 py-3 text-base text-text-primary"
                  />
                  <View className="mt-3 flex-row items-center justify-end gap-2">
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setNewListMode(false);
                        setNewListTitle("");
                      }}
                      className="rounded-full px-4 py-2.5 active:bg-dark-hover"
                    >
                      <Text className="text-sm font-medium text-text-tertiary">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCreateListFromPicker}
                      disabled={!newListTitle.trim() || creatingList}
                      className={`rounded-full px-5 py-2.5 ${
                        newListTitle.trim() && !creatingList
                          ? "bg-brand-500 active:bg-brand-600"
                          : "bg-dark-elevated"
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          newListTitle.trim() && !creatingList
                            ? "text-white"
                            : "text-text-tertiary"
                        }`}
                      >
                        {creatingList ? "Creating..." : "Create & add"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNewListMode(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Create a new list"
                  className="mt-3 flex-row items-center gap-3 rounded-2xl border border-dashed border-dark-border px-4 py-3.5 active:bg-dark-hover"
                >
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-brand-500/15">
                    <Ionicons name="add" size={16} color="#0ea5e9" />
                  </View>
                  <Text className="text-base font-medium text-brand-400">New list</Text>
                </Pressable>
              )}
            </View>
          </GlassSurface>
        </KeyboardAvoidingView>
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
            <GlassSurface
              radius={18}
              variant="control"
              fallbackColor="rgba(22,26,34,0.72)"
              contentStyle={{ minHeight: 140 }}
            >
              <TextInput
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="Share your thoughts..."
                placeholderTextColor="#5A6070"
                multiline
                autoFocus
                className="text-base text-text-primary"
                style={{
                  minHeight: 140,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  textAlignVertical: "top",
                }}
              />
            </GlassSurface>

            <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSpoiler((prev) => !prev);
              }}
              radius={999}
              variant="control"
              fallbackColor={spoiler ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.04)"}
              tintColor={spoiler ? "rgba(239,68,68,0.10)" : undefined}
              borderColor={spoiler ? "rgba(239,68,68,0.28)" : undefined}
              style={{ alignSelf: "flex-start", marginTop: 16 }}
              contentStyle={{
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
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
            </GlassPressable>
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
          const sheetImdbSeason = imdbRatings.seasons[selectedEpisode.seasonNumber];
          const sheetImdbLoading = sheetImdbSeason === undefined;
          const sheetImdbRating =
            sheetImdbSeason?.episodes.find(
              (entry) => entry.episodeNumber === selectedEpisode.episode.episodeNumber,
            )?.rating ?? null;
          const selectedStillPath =
            selectedEpisode.episode.stillPath ?? selectedEpisode.episode.still_path ?? null;

          return (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              pointerEvents: "box-none",
            }}
          >
            {/* Dimmed backdrop */}
            <Animated.View
              style={[
                { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
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
                    // Sit just below the notch / Dynamic Island so the rounded
                    // top edge is never clipped by the status bar. A small
                    // constant gap keeps a consistent sliver of backdrop on
                    // every device (including non-notched ones).
                    top: Math.max(insets.top, 12) + 6,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "transparent",
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    overflow: "hidden",
                  },
                  episodeSheetStyle,
                ]}
              >
                <GlassSurface
                  radius={20}
                  variant="sheet"
                  fallbackColor="rgba(13,15,20,0.94)"
                  style={{
                    flex: 1,
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                  }}
                  contentStyle={{ flex: 1 }}
                >
                <Animated.ScrollView
                  ref={sheetScrollRef}
                  className="flex-1"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  automaticallyAdjustKeyboardInsets
                  scrollEventThrottle={16}
                  onScroll={sheetScrollHandler}
                  bounces={false}
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

                {/* Drag grabber overlaid on image */}
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", top: 8, left: 0, right: 0, alignItems: "center", zIndex: 10 }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 5,
                      borderRadius: 2.5,
                      backgroundColor: "rgba(255,255,255,0.6)",
                      shadowColor: "#000",
                      shadowOpacity: 0.35,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 1 },
                    }}
                  />
                </View>

                <LinearGradient
                  colors={[
                    "rgba(13, 15, 20, 0.5)",
                    "rgba(13, 15, 20, 0)",
                    "rgba(13, 15, 20, 0)",
                    "rgba(13, 15, 20, 0.35)",
                    "rgba(13, 15, 20, 0.72)",
                    "rgba(13, 15, 20, 0.94)",
                    "#0D0F14",
                  ]}
                  locations={[0, 0.16, 0.42, 0.62, 0.8, 0.93, 1]}
                  style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
                />

                {/* Close button */}
                <GlassPressable
                  accessibilityLabel="Close episode details"
                  accessibilityRole="button"
                  radius={16}
                  variant="control"
                  fallbackColor="rgba(0,0,0,0.42)"
                  tintColor="rgba(255,255,255,0.08)"
                  style={{ position: "absolute", right: 16, top: 16 }}
                  surfaceStyle={{ height: 32, width: 32 }}
                  contentStyle={{
                    alignItems: "center",
                    height: 32,
                    justifyContent: "center",
                    width: 32,
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    closeEpisodeSheet();
                  }}
                >
                  <Ionicons name="close" size={18} color="white" />
                </GlassPressable>

                {/* Episode code badge */}
                <View className="absolute bottom-4 left-5 right-5">
                  <GlassSurface
                    radius={999}
                    variant="control"
                    fallbackColor="rgba(0,0,0,0.34)"
                    tintColor="rgba(255,255,255,0.07)"
                    style={{ alignSelf: "flex-start" }}
                    contentStyle={{
                      alignItems: "center",
                      flexDirection: "row",
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                  >
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
                  </GlassSurface>
                </View>
              </View>

              {/* Seamless bridge: dissolves the still's dark bottom edge into the
                  sheet material so there's no hard cutoff between thumbnail and
                  content. Zero net layout height (negative margins cancel). */}
              <LinearGradient
                pointerEvents="none"
                colors={["#0D0F14", "rgba(13, 15, 20, 0)"]}
                style={{ height: 32, marginTop: -16, marginBottom: -16 }}
              />

              <View className="px-5">
                {/* Title */}
                <Text className="text-2xl font-bold tracking-tight text-text-primary">
                  {selectedEpisode.episode.name}
                </Text>

                {/* Action row: watched + rating inline */}
                {isAuthenticated && (
                  <View className="mt-5 flex-row items-center gap-3">
                    {/* Watched toggle */}
                    <GlassPressable
                      disabled={!sheetIsAvailable}
                      radius={999}
                      variant={sheetIsWatched ? "prominent" : "control"}
                      fallbackColor={
                        sheetIsWatched
                          ? "rgba(14,165,233,0.15)"
                          : "rgba(255,255,255,0.05)"
                      }
                      tintColor={sheetIsWatched ? "rgba(14,165,233,0.12)" : undefined}
                      borderColor={
                        sheetIsWatched ? "rgba(14,165,233,0.28)" : "rgba(255,255,255,0.08)"
                      }
                      surfaceStyle={{ opacity: sheetIsAvailable ? 1 : 0.5 }}
                      contentStyle={{
                        alignItems: "center",
                        flexDirection: "row",
                        gap: 8,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                      }}
                      onPress={() => {
                        if (!sheetIsAvailable) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        if (isShowPreview) return;
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
                    </GlassPressable>

                    {/* IMDb rating pill */}
                    {sheetImdbLoading ? (
                      <ShimmerBlock width={82} height={40} radius={999} />
                    ) : sheetImdbRating !== null ? (
                      <GlassSurface
                        radius={999}
                        variant="control"
                        fallbackColor="rgba(245,197,24,0.08)"
                        tintColor="rgba(245,197,24,0.08)"
                        borderColor="rgba(245,197,24,0.16)"
                        contentStyle={{
                          alignItems: "center",
                          flexDirection: "row",
                          gap: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                        }}
                      >
                        <ImdbLogo height={13} />
                        <Text className="text-sm font-semibold" style={{ color: "#fcd34d" }}>
                          {sheetImdbRating.toFixed(1)}
                        </Text>
                      </GlassSurface>
                    ) : null}
                  </View>
                )}

                {/* Overview */}
                {selectedEpisode.episode.overview ? (
                  <Text className="mt-5 text-[15px] leading-6 text-text-secondary">
                    {selectedEpisode.episode.overview}
                  </Text>
                ) : null}

                {/* ─── Your rating ─── */}
                {isAuthenticated && sheetIsAvailable && (
                  <GlassSurface
                    radius={18}
                    variant="surface"
                    fallbackColor="rgba(22,26,34,0.66)"
                    style={{ marginTop: 24 }}
                    contentStyle={{ padding: 16 }}
                    onLayout={(e) => {
                      reviewCardYRef.current = e.nativeEvent.layout.y;
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold uppercase text-text-tertiary" style={{ letterSpacing: 1.2 }}>
                        Your rating
                      </Text>
                      {myEpRating > 0 && (
                        <Text className="text-sm font-medium text-text-tertiary">
                          {myEpRating}/5
                        </Text>
                      )}
                    </View>
                    <View className="mt-3">
                      <StarRating
                        value={myEpRating}
                        onChange={(val) => {
                          if (val === 0 && myEpRating > 0) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (isShowPreview) return;
                            const removeArgs = {
                              showId,
                              seasonNumber: selectedEpisode.seasonNumber,
                              episodeNumber: selectedEpisode.episode.episodeNumber,
                            };
                            const performRemove = () => {
                              setEpisodeReviewExpanded(false);
                              setEpisodeReviewText("");
                              removeEpisodeRating(removeArgs).catch(() => {
                                Alert.alert(
                                  "Couldn't remove rating",
                                  "Check your connection and try again.",
                                );
                              });
                            };
                            if (myEpReviewText) {
                              Alert.alert(
                                "Remove rating?",
                                "Your episode review will be deleted too.",
                                [
                                  { text: "Cancel", style: "cancel" },
                                  { text: "Remove", style: "destructive", onPress: performRemove },
                                ],
                              );
                            } else {
                              performRemove();
                            }
                          } else if (val > 0) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            if (isShowPreview) return;
                            rateEpisode({
                              showId,
                              seasonNumber: selectedEpisode.seasonNumber,
                              episodeNumber: selectedEpisode.episode.episodeNumber,
                              episodeTitle: selectedEpisode.episode.name,
                              rating: val,
                            }).catch(() => {
                              Alert.alert(
                                "Couldn't save rating",
                                "Check your connection and try again.",
                              );
                            });
                          }
                        }}
                        size={32}
                      />
                    </View>

                    {/* Episode review */}
                    {myEpRating > 0 && (
                      <View className="mt-3">
                        {episodeReviewExpanded ? (
                          <View>
                            <GlassSurface
                              radius={12}
                              variant="control"
                              fallbackColor="rgba(255,255,255,0.05)"
                              contentStyle={{ minHeight: 80 }}
                            >
                              <TextInput
                                value={episodeReviewText}
                                onChangeText={setEpisodeReviewText}
                                placeholder="What did you think of this episode?"
                                placeholderTextColor="#5A6070"
                                multiline
                                autoFocus
                                onFocus={revealReviewInput}
                                className="text-sm text-text-primary"
                                style={{
                                  minHeight: 80,
                                  paddingHorizontal: 12,
                                  paddingVertical: 10,
                                  textAlignVertical: "top",
                                }}
                                maxLength={5000}
                              />
                            </GlassSurface>
                            <View className="mt-2 flex-row items-center gap-4">
                              {myEpReviewText ? (
                                <Pressable
                                  accessibilityLabel="Delete episode review"
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    setEpisodeReviewExpanded(false);
                                    setEpisodeReviewText("");
                                    if (isShowPreview) return;
                                    rateEpisode({
                                      showId,
                                      seasonNumber: selectedEpisode.seasonNumber,
                                      episodeNumber: selectedEpisode.episode.episodeNumber,
                                      episodeTitle: selectedEpisode.episode.name,
                                      rating: myEpRating,
                                      reviewText: "",
                                    }).catch(() => {
                                      Alert.alert(
                                        "Couldn't delete review",
                                        "Check your connection and try again.",
                                      );
                                    });
                                  }}
                                  hitSlop={8}
                                >
                                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                </Pressable>
                              ) : null}
                              <View className="flex-1" />
                              <Pressable
                                onPress={() => {
                                  setEpisodeReviewExpanded(false);
                                  setEpisodeReviewText("");
                                }}
                                hitSlop={8}
                              >
                                <Text className="text-sm text-text-tertiary">Cancel</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  const draft = episodeReviewText.trim();
                                  if (!draft) return;
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  setEpisodeReviewExpanded(false);
                                  setEpisodeReviewText("");
                                  if (isShowPreview) return;
                                  rateEpisode({
                                    showId,
                                    seasonNumber: selectedEpisode.seasonNumber,
                                    episodeNumber: selectedEpisode.episode.episodeNumber,
                                    episodeTitle: selectedEpisode.episode.name,
                                    rating: myEpRating,
                                    reviewText: draft,
                                  }).catch(() => {
                                    setEpisodeReviewText(draft);
                                    setEpisodeReviewExpanded(true);
                                    Alert.alert(
                                      "Couldn't save review",
                                      "Check your connection and try again.",
                                    );
                                  });
                                }}
                                disabled={!episodeReviewText.trim()}
                                hitSlop={8}
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
                        ) : myEpReviewText ? (
                          <GlassPressable
                            accessibilityLabel="Edit episode review"
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setEpisodeReviewText(myEpReviewText);
                              setEpisodeReviewExpanded(true);
                            }}
                            radius={12}
                            variant="control"
                            fallbackColor="rgba(255,255,255,0.05)"
                            contentStyle={{ padding: 12 }}
                          >
                            <Text className="text-sm text-text-secondary" numberOfLines={4}>
                              {myEpReviewText}
                            </Text>
                            <View className="mt-1.5 flex-row items-center gap-1">
                              <Ionicons name="pencil-outline" size={11} color="#5A6070" />
                              <Text className="text-[11px] text-text-tertiary">Tap to edit</Text>
                            </View>
                          </GlassPressable>
                        ) : (
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
                        )}
                      </View>
                    )}
                  </GlassSurface>
                )}

                {/* ─── Community Reviews ─── */}
                {(hasEpisodeRatingStats || episodeCommunityReviewItems.length > 0) && (
                  <View className="mt-6">
                    <View className="flex-row items-center gap-2.5">
                      <Text className="text-xs font-semibold uppercase text-text-tertiary" style={{ letterSpacing: 1.2 }}>
                        Community
                      </Text>
                      {hasEpisodeRatingStats && (
                        <GlassSurface
                          radius={999}
                          variant="control"
                          fallbackColor="rgba(251,191,36,0.08)"
                          tintColor="rgba(251,191,36,0.08)"
                          borderColor="rgba(251,191,36,0.14)"
                          contentStyle={{
                            alignItems: "center",
                            flexDirection: "row",
                            gap: 4,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Ionicons name="star" size={10} color="#fbbf24" />
                          <Text className="text-[11px] font-semibold" style={{ color: "#fcd34d" }}>
                            {episodeStats.averageRating.toFixed(1)}
                          </Text>
                          <Text className="text-[11px] text-text-tertiary">
                            ({episodeStats.reviewCount ?? episodeStats.count})
                          </Text>
                        </GlassSurface>
                      )}
                    </View>
                    {episodeCommunityReviewItems.length > 0 && (
                      <View className="mt-3 gap-3">
                        {episodeCommunityReviewItems.map((item: any) => (
                          <GlassSurface
                            key={item.review._id}
                            radius={18}
                            variant="surface"
                            fallbackColor="rgba(22,26,34,0.58)"
                            contentStyle={{ padding: 14 }}
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
                          </GlassSurface>
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
                            <GlassSurface
                              key={`${selectedEpisode.episode.id}-${person.id}-${person.job}`}
                              radius={999}
                              variant="surface"
                              fallbackColor="rgba(255,255,255,0.05)"
                              borderColor="rgba(255,255,255,0.08)"
                              contentStyle={{ paddingHorizontal: 12, paddingVertical: 6 }}
                            >
                              <Text className="text-xs text-text-secondary">
                                <Text className="font-medium text-text-primary">{person.name}</Text>
                                {" · "}{person.job}
                              </Text>
                            </GlassSurface>
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
                            <GlassSurface
                              key={`${selectedEpisode.episode.id}-guest-${person.id}`}
                              radius={999}
                              variant="surface"
                              fallbackColor="rgba(14,165,233,0.06)"
                              borderColor="rgba(14,165,233,0.12)"
                              contentStyle={{ paddingHorizontal: 12, paddingVertical: 6 }}
                            >
                              <Text className="text-xs text-text-secondary">
                                <Text className="font-medium text-text-primary">{person.name}</Text>
                                {person.character ? ` as ${person.character}` : ""}
                              </Text>
                            </GlassSurface>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </Animated.ScrollView>
                </GlassSurface>
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
