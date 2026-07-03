import { memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import {
  INITIAL_VISIBLE_SEASONS,
  getSeasonToggleLabel,
  type SeasonLoadState,
} from "../lib/seasonGuide";
import { GlassPressable, GlassSurface } from "./NativeGlass";
import { ImdbLogo } from "./ImdbBadge";
import { ShimmerBlock } from "./ShowDetailSkeleton";

type EpisodeGuideEpisode = {
  id: number | string;
  name: string;
  episodeNumber: number;
  episode_number?: number;
  airDate?: string | null;
  air_date?: string | null;
  overview?: string | null;
  stillPath?: string | null;
  still_path?: string | null;
  voteAverage?: number;
  voteCount?: number;
  vote_average?: number;
  vote_count?: number;
};

type EpisodeGuideSeason = {
  id: number | string;
  name: string;
  season_number: number;
  air_date?: string | null;
  episode_count?: number;
  posterPath?: string | null;
  poster_path?: string | null;
};

type EpisodeGuideImdbSeason = {
  averageRating: number | null;
  episodes: { episodeNumber: number; rating: number }[];
};

type EpisodeGuideProps = {
  seasons: EpisodeGuideSeason[];
  visibleSeasonCount: number;
  seasonDetailsByNumber: Record<number, { episodes?: EpisodeGuideEpisode[] } | undefined>;
  seasonLoadStateByNumber: Record<number, SeasonLoadState | undefined>;
  seasonLoadErrorByNumber: Record<number, string | undefined>;
  // Missing key = ratings still loading for that season; null = resolved
  // with no IMDb ratings.
  imdbSeasonRatings?: Record<number, EpisodeGuideImdbSeason | null>;
  isAuthenticated: boolean;
  watchedEpisodeSet: Set<string>;
  myEpisodeRatingMap: Map<string, { rating: number; reviewText?: string }>;
  isEpisodeAvailable: (airDate?: string | null) => boolean;
  onLoadMoreSeasons: () => void;
  onRetrySeason: (seasonNumber: number) => void;
  onMarkSeasonWatched: (
    seasonNumber: number,
    episodes: { episodeNumber: number; title: string }[],
  ) => void;
  onUnmarkSeasonWatched: (seasonNumber: number) => void;
  onToggleEpisode: (seasonNumber: number, episode: EpisodeGuideEpisode) => void;
  onSelectEpisode: (
    seasonName: string,
    seasonNumber: number,
    episode: EpisodeGuideEpisode,
  ) => void;
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

function EpisodeGuideComponent({
  seasons,
  visibleSeasonCount,
  seasonDetailsByNumber,
  seasonLoadStateByNumber,
  seasonLoadErrorByNumber,
  imdbSeasonRatings,
  isAuthenticated,
  watchedEpisodeSet,
  myEpisodeRatingMap,
  isEpisodeAvailable,
  onLoadMoreSeasons,
  onRetrySeason,
  onMarkSeasonWatched,
  onUnmarkSeasonWatched,
  onToggleEpisode,
  onSelectEpisode,
}: EpisodeGuideProps) {
  if (seasons.length === 0) {
    return null;
  }

  const hasMore = seasons.length > INITIAL_VISIBLE_SEASONS;
  const visibleSeasons = seasons.slice(0, visibleSeasonCount);

  return (
    <View className="mt-10">
      <View className="px-6">
        <Text
          className="text-xs font-bold uppercase text-text-tertiary"
          style={{ letterSpacing: 1.5 }}
        >
          Episode Guide
        </Text>
        <Text className="mt-2 text-sm text-text-secondary" style={{ lineHeight: 21 }}>
          Browse episodes by season.
        </Text>
      </View>

      <View className="mt-4 gap-10">
        {visibleSeasons.map((season) => {
          const details = seasonDetailsByNumber[season.season_number];
          const episodes = (details?.episodes ?? []).map((episode) => ({
            ...episode,
            airDate: episode.airDate ?? episode.air_date ?? null,
            episodeNumber: episode.episodeNumber ?? episode.episode_number,
            stillPath:
              episode.stillPath ?? tmdbImageUrl(episode.still_path, "w780"),
            voteAverage: episode.voteAverage ?? episode.vote_average ?? 0,
            voteCount: episode.voteCount ?? episode.vote_count ?? 0,
          }));
          const availableEpisodes = episodes.filter((episode) =>
            isEpisodeAvailable(episode.airDate),
          );
          const watchedInSeason = availableEpisodes.filter((episode) =>
            watchedEpisodeSet.has(`S${season.season_number}E${episode.episodeNumber}`),
          ).length;
          const totalEpisodeCount =
            availableEpisodes.length > 0
              ? availableEpisodes.length
              : episodes.length > 0
                ? 0
                : season.episode_count ?? 0;
          const allWatched =
            availableEpisodes.length > 0 &&
            watchedInSeason === availableEpisodes.length;
          const hasAvailableEpisodes = availableEpisodes.length > 0;
          const loadState = seasonLoadStateByNumber[season.season_number] ?? "idle";
          const isLoading =
            loadState === "loading" || (loadState === "idle" && details === undefined);
          const hasLoadError = loadState === "error" && details === undefined;
          const seasonPosterPath =
            season.posterPath ?? tmdbImageUrl(season.poster_path, "w342");
          const seasonYear = season.air_date
            ? new Date(season.air_date).getFullYear()
            : null;
          const imdbSeason = imdbSeasonRatings?.[season.season_number];
          const imdbSeasonLoading = imdbSeason === undefined;
          const imdbEpisodeRatingByNumber = new Map(
            (imdbSeason?.episodes ?? []).map((entry) => [entry.episodeNumber, entry.rating]),
          );

          return (
            <View key={season.id}>
              <View className="mb-3 flex-row gap-3 px-6">
                {seasonPosterPath ? (
                  <Image
                    source={{ uri: seasonPosterPath }}
                    style={{
                      width: 54,
                      height: 81,
                      borderRadius: 8,
                      backgroundColor: "#1C2028",
                    }}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View
                    style={{
                      width: 54,
                      height: 81,
                      borderRadius: 8,
                      backgroundColor: "#1C2028",
                    }}
                    className="items-center justify-center"
                  >
                    <Ionicons name="albums-outline" size={22} color="#5A6070" />
                  </View>
                )}

                <View className="min-w-0 flex-1 justify-center">
                  <View className="flex-row items-center gap-3">
                    <Text
                      className="shrink text-xs font-bold uppercase tracking-widest"
                      numberOfLines={2}
                      style={{ color: allWatched ? "#0ea5e9" : "#5A6070" }}
                    >
                      {season.name}
                    </Text>
                    <View
                      className="h-px flex-1"
                      style={{
                        backgroundColor: allWatched
                          ? "rgba(14, 165, 233, 0.2)"
                          : "rgba(42, 46, 56, 0.8)",
                      }}
                    />
                    {episodes.length > 0 && isAuthenticated ? (
                      <Pressable
                        className="active:opacity-60"
                        disabled={!hasAvailableEpisodes}
                        style={{ opacity: hasAvailableEpisodes ? 1 : 0.45 }}
                        onPress={() => {
                          if (!hasAvailableEpisodes) {
                            return;
                          }
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          if (allWatched) {
                            onUnmarkSeasonWatched(season.season_number);
                            return;
                          }
                          onMarkSeasonWatched(
                            season.season_number,
                            availableEpisodes.map((episode) => ({
                              episodeNumber: episode.episodeNumber,
                              title: episode.name,
                            })),
                          );
                        }}
                      >
                        <Ionicons
                          name={allWatched ? "checkmark-circle" : "checkmark-circle-outline"}
                          size={20}
                          color={
                            !hasAvailableEpisodes
                              ? "#404654"
                              : allWatched
                                ? "#0ea5e9"
                                : "#5A6070"
                          }
                        />
                      </Pressable>
                    ) : null}
                  </View>

                  <View className="mt-2 flex-row flex-wrap items-center gap-2">
                    {episodes.length > 0 && isAuthenticated ? (
                      <GlassSurface
                        radius={999}
                        variant={allWatched ? "prominent" : "control"}
                        fallbackColor={
                          allWatched
                            ? "rgba(14,165,233,0.14)"
                            : "rgba(255,255,255,0.04)"
                        }
                        borderColor={
                          allWatched
                            ? "rgba(14,165,233,0.24)"
                            : "rgba(255,255,255,0.07)"
                        }
                        contentStyle={{ paddingHorizontal: 8, paddingVertical: 2 }}
                      >
                        <Text
                          className="text-xs font-medium"
                          style={{
                            color: allWatched ? "#38bdf8" : "#5A6070",
                          }}
                        >
                          {allWatched
                            ? "Complete"
                            : hasAvailableEpisodes
                              ? `${watchedInSeason}/${totalEpisodeCount}`
                              : "Upcoming"}
                        </Text>
                      </GlassSurface>
                    ) : (
                      <GlassSurface
                        radius={999}
                        variant="control"
                        fallbackColor="rgba(255,255,255,0.04)"
                        borderColor="rgba(255,255,255,0.07)"
                        contentStyle={{ paddingHorizontal: 8, paddingVertical: 2 }}
                      >
                        <Text className="text-xs font-medium text-text-tertiary">
                          {totalEpisodeCount} eps
                        </Text>
                      </GlassSurface>
                    )}
                    {imdbSeasonLoading ? (
                      <ShimmerBlock width={52} height={14} radius={7} />
                    ) : imdbSeason?.averageRating != null ? (
                      <View className="flex-row items-center gap-1">
                        <ImdbLogo height={12} />
                        <Text className="text-xs font-semibold text-text-secondary">
                          {imdbSeason.averageRating.toFixed(1)}
                        </Text>
                      </View>
                    ) : null}
                    {seasonYear ? (
                      <Text className="text-xs text-text-tertiary">
                        {seasonYear}
                      </Text>
                    ) : null}
                    {episodes.length > 0 && isAuthenticated ? (
                      <Text className="text-xs text-text-tertiary">
                        {totalEpisodeCount} episodes
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              {episodes.length > 0 && isAuthenticated && totalEpisodeCount > 0 && (watchedInSeason > 0 || allWatched) ? (
                <View
                  className="mx-6 mb-3 h-1 overflow-hidden rounded-full"
                  style={{
                    backgroundColor: allWatched
                      ? "rgba(14, 165, 233, 0.15)"
                      : "#1E2028",
                  }}
                >
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${(watchedInSeason / totalEpisodeCount) * 100}%`,
                      backgroundColor: allWatched ? "#0ea5e9" : "#0ea5e9",
                    }}
                  />
                </View>
              ) : null}

              {isLoading ? (
                <View className="items-center justify-center py-12">
                  <ActivityIndicator color="#38bdf8" size="small" />
                  <Text className="mt-2 text-sm text-text-tertiary">
                    Loading episodes...
                  </Text>
                </View>
              ) : hasLoadError ? (
                <View className="items-center px-6 py-8">
                  <Text className="text-center text-sm text-text-tertiary">
                    {seasonLoadErrorByNumber[season.season_number] ??
                      "Couldn't load episodes for this season."}
                  </Text>
                  <GlassPressable
                    radius={10}
                    variant="control"
                    style={{ marginTop: 16 }}
                    contentStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onRetrySeason(season.season_number);
                    }}
                  >
                    <Text className="text-sm font-semibold text-text-secondary">Retry</Text>
                  </GlassPressable>
                </View>
              ) : episodes.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 24,
                    gap: 14,
                    paddingRight: 24,
                  }}
                >
                  {episodes.map((episode) => {
                    const stillPath = episode.stillPath ?? episode.still_path ?? null;
                    const imdbRating =
                      imdbEpisodeRatingByNumber.get(episode.episodeNumber)?.toFixed(1) ??
                      null;
                    const episodeKey = `S${season.season_number}E${episode.episodeNumber}`;
                    const isWatched = watchedEpisodeSet.has(episodeKey);
                    const isAvailable = isEpisodeAvailable(episode.airDate);
                    const myRatingData = myEpisodeRatingMap.get(episodeKey);

                    return (
                      <Pressable
                        key={episode.id}
                        className="active:opacity-80"
                        style={{ width: 144 }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          onSelectEpisode(season.name, season.season_number, episode);
                        }}
                      >
                        <View
                          className="overflow-hidden rounded-xl border bg-dark-card"
                          style={{
                            width: 144,
                            height: 180,
                            borderColor: isWatched
                              ? "rgba(14, 165, 233, 0.35)"
                              : "rgba(42, 46, 56, 0.8)",
                          }}
                        >
                          <View>
                            {stillPath ? (
                              <Image
                                source={{ uri: stillPath }}
                                style={{
                                  width: 144,
                                  height: 81,
                                  borderRadius: 0,
                                  opacity: isWatched ? 0.55 : isAvailable ? 1 : 0.7,
                                }}
                                contentFit="cover"
                                transition={200}
                              />
                            ) : (
                              <View
                                className="items-center justify-center bg-dark-elevated"
                                style={{ width: 144, height: 81 }}
                              >
                                <Ionicons name="tv-outline" size={24} color="#5A6070" />
                              </View>
                            )}
                            {isAuthenticated && isAvailable ? (
                              <GlassPressable
                                radius={11}
                                variant={isWatched ? "prominent" : "control"}
                                fallbackColor={
                                  isWatched
                                    ? "rgba(14,165,233,0.82)"
                                    : "rgba(0,0,0,0.44)"
                                }
                                tintColor={isWatched ? "rgba(14,165,233,0.18)" : "rgba(255,255,255,0.08)"}
                                style={{
                                  position: "absolute",
                                  right: 4,
                                  top: 4,
                                }}
                                surfaceStyle={{ height: 22, width: 22 }}
                                contentStyle={{
                                  alignItems: "center",
                                  height: 22,
                                  justifyContent: "center",
                                  width: 22,
                                }}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  onToggleEpisode(season.season_number, episode);
                                }}
                              >
                                <Ionicons
                                  name={isWatched ? "checkmark" : "eye-outline"}
                                  size={12}
                                  color="white"
                                />
                              </GlassPressable>
                            ) : null}
                          </View>
                          <View className="w-full flex-1 p-2">
                            <Text
                              className="text-sm font-semibold"
                              numberOfLines={2}
                              style={{ color: isWatched ? "#94a3b8" : "#E8ECF4" }}
                            >
                              {episode.name}
                            </Text>
                            <View className="mt-1 flex-row items-center gap-1">
                              {myRatingData ? (
                                <>
                                  <Ionicons name="star" size={11} color="#FBBF24" />
                                  <Text className="text-xs font-semibold text-amber-300">
                                    {myRatingData.rating}
                                  </Text>
                                </>
                              ) : imdbSeasonLoading ? (
                                <ShimmerBlock width={48} height={12} radius={6} />
                              ) : imdbRating ? (
                                <>
                                  <ImdbLogo height={11} />
                                  <Text
                                    className="text-xs font-medium"
                                    style={{ color: isWatched ? "#64748b" : "#9BA1B0" }}
                                  >
                                    {imdbRating}
                                  </Text>
                                </>
                              ) : (
                                <Text className="text-xs text-text-tertiary">No rating</Text>
                              )}
                            </View>
                            <Text
                              className="mt-1 text-xs"
                              numberOfLines={2}
                              style={{ color: isWatched ? "#475569" : "#5A6070" }}
                            >
                              {episode.overview || "No synopsis available."}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <View className="px-6">
                  <Text className="text-sm text-text-tertiary">
                    No episodes found for this season.
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {hasMore ? (
          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLoadMoreSeasons();
            }}
            radius={12}
            variant="control"
            style={{ marginHorizontal: 24 }}
            contentStyle={{
              alignItems: "center",
              flexDirection: "row",
              gap: 8,
              justifyContent: "center",
              paddingVertical: 12,
            }}
          >
            <Text className="text-sm font-semibold text-text-secondary">
              {getSeasonToggleLabel(visibleSeasonCount, seasons.length)}
            </Text>
            <Ionicons
              name={visibleSeasonCount >= seasons.length ? "chevron-up" : "chevron-down"}
              size={18}
              color="#5A6070"
            />
          </GlassPressable>
        ) : null}
      </View>
    </View>
  );
}

export const EpisodeGuide = memo(EpisodeGuideComponent);
