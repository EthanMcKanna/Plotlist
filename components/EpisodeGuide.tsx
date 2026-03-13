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

type EpisodeGuideEpisode = {
  id: number | string;
  name: string;
  episodeNumber: number;
  airDate?: string | null;
  overview?: string | null;
  stillPath?: string | null;
  voteAverage?: number;
  voteCount?: number;
};

type EpisodeGuideSeason = {
  id: number | string;
  name: string;
  season_number: number;
  air_date?: string | null;
  episode_count?: number;
};

type EpisodeGuideProps = {
  seasons: EpisodeGuideSeason[];
  visibleSeasonCount: number;
  seasonDetailsByNumber: Record<number, { episodes?: EpisodeGuideEpisode[] } | undefined>;
  seasonLoadStateByNumber: Record<number, SeasonLoadState | undefined>;
  seasonLoadErrorByNumber: Record<number, string | undefined>;
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

function EpisodeGuideComponent({
  seasons,
  visibleSeasonCount,
  seasonDetailsByNumber,
  seasonLoadStateByNumber,
  seasonLoadErrorByNumber,
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
          const episodes = details?.episodes ?? [];
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

          return (
            <View key={season.id}>
              <View className="mb-2 flex-row items-center gap-3 px-6">
                <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                  {season.name}
                </Text>
                {episodes.length > 0 && isAuthenticated ? (
                  <View className="rounded-full bg-dark-elevated px-2 py-0.5">
                    <Text className="text-xs font-medium text-text-tertiary">
                      {hasAvailableEpisodes ? `${watchedInSeason}/${totalEpisodeCount}` : "Upcoming"}
                    </Text>
                  </View>
                ) : (
                  <View className="rounded-full bg-dark-elevated px-2 py-0.5">
                    <Text className="text-xs font-medium text-text-tertiary">
                      {totalEpisodeCount} eps
                    </Text>
                  </View>
                )}
                {season.air_date ? (
                  <Text className="text-xs text-text-tertiary">
                    {new Date(season.air_date).getFullYear()}
                  </Text>
                ) : null}
                <View className="h-px flex-1 bg-dark-border" />
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

              {episodes.length > 0 && isAuthenticated && watchedInSeason > 0 && totalEpisodeCount > 0 ? (
                <View className="mx-6 mb-3 h-1 overflow-hidden rounded-full bg-dark-elevated">
                  <View
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${(watchedInSeason / totalEpisodeCount) * 100}%` }}
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
                  <Pressable
                    className="mt-4 rounded-lg border border-dark-border bg-dark-elevated px-4 py-2 active:opacity-80"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onRetrySeason(season.season_number);
                    }}
                  >
                    <Text className="text-sm font-semibold text-text-secondary">Retry</Text>
                  </Pressable>
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
                    const tmdbRating =
                      (episode.voteCount ?? 0) > 0 && (episode.voteAverage ?? 0) > 0
                        ? episode.voteAverage?.toFixed(1)
                        : null;
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
                            borderColor: isWatched ? "#0ea5e9" : "rgba(42, 46, 56, 0.8)",
                          }}
                        >
                          <View>
                            {episode.stillPath ? (
                              <Image
                                source={{ uri: episode.stillPath }}
                                style={{
                                  width: 144,
                                  height: 81,
                                  borderRadius: 0,
                                  opacity: isWatched ? 0.5 : isAvailable ? 1 : 0.7,
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
                              <Pressable
                                className="absolute right-1 top-1 rounded-full active:opacity-60"
                                style={{
                                  backgroundColor: isWatched
                                    ? "#0ea5e9"
                                    : "rgba(0,0,0,0.6)",
                                  width: 26,
                                  height: 26,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  onToggleEpisode(season.season_number, episode);
                                }}
                              >
                                <Ionicons
                                  name={isWatched ? "checkmark" : "eye-outline"}
                                  size={14}
                                  color="white"
                                />
                              </Pressable>
                            ) : null}
                          </View>
                          <View className="w-full flex-1 p-2">
                            <Text
                              className="text-sm font-semibold text-text-primary"
                              numberOfLines={2}
                              style={{ opacity: isWatched ? 0.6 : 1 }}
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
                              ) : tmdbRating ? (
                                <>
                                  <Ionicons name="star" size={11} color="#FBBF24" />
                                  <Text className="text-xs font-medium text-text-secondary">
                                    {tmdbRating}
                                  </Text>
                                </>
                              ) : (
                                <Text className="text-xs text-text-tertiary">No rating</Text>
                              )}
                            </View>
                            <Text
                              className="mt-1 text-xs text-text-tertiary"
                              numberOfLines={2}
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
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLoadMoreSeasons();
            }}
            className="mx-6 flex-row items-center justify-center gap-2 rounded-xl border border-dark-border bg-dark-elevated py-3 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-text-secondary">
              {getSeasonToggleLabel(visibleSeasonCount, seasons.length)}
            </Text>
            <Ionicons
              name={visibleSeasonCount >= seasons.length ? "chevron-up" : "chevron-down"}
              size={18}
              color="#5A6070"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const EpisodeGuide = memo(EpisodeGuideComponent);
