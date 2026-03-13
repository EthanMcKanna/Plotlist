import { Image } from "expo-image";
import { Text, View } from "react-native";

type SharedFavoriteShow = {
  showId?: string;
  title: string;
  posterUrl?: string | null;
};

export function TasteMatchSummary({
  percent,
  sharedFavoriteShows,
  variant = "card",
}: {
  percent: number;
  sharedFavoriteShows: SharedFavoriteShow[];
  variant?: "compact" | "card";
}) {
  const isCompact = variant === "compact";

  return (
    <View
      className={
        isCompact
          ? "mt-2 rounded-2xl bg-brand-500/8 px-3 py-2"
          : "rounded-2xl border border-brand-500/20 bg-brand-500/8 p-4"
      }
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          {!isCompact ? (
            <Text className="text-xs font-bold uppercase tracking-widest text-brand-300">
              Taste Match
            </Text>
          ) : null}
          <Text
            className={`font-semibold text-text-primary ${isCompact ? "text-sm" : "mt-1 text-lg"}`}
          >
            {percent}% match
          </Text>
          <Text className={`text-text-tertiary ${isCompact ? "mt-0.5 text-xs" : "mt-1 text-sm"}`}>
            {sharedFavoriteShows.length > 0
              ? "You both love some of the same shows."
              : "Your watch history and favorites align closely."}
          </Text>
        </View>
        <View className="rounded-full bg-brand-500/15 px-3 py-1.5">
          <Text className="text-xs font-semibold uppercase tracking-wide text-brand-300">
            {percent}%
          </Text>
        </View>
      </View>

      {sharedFavoriteShows.length > 0 ? (
        <View className={isCompact ? "mt-2" : "mt-3"}>
          {!isCompact ? (
            <Text className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Shared Favorites
            </Text>
          ) : null}
          <View className={`flex-row items-center ${isCompact ? "mt-1.5" : "mt-2.5"}`}>
            {sharedFavoriteShows.map((show, index) => (
              <View
                key={show.showId ?? `${show.title}-${index}`}
                className="mr-2 overflow-hidden rounded-lg border border-dark-border bg-dark-card"
              >
                <Image
                  source={show.posterUrl ? { uri: show.posterUrl } : undefined}
                  style={{
                    width: isCompact ? 26 : 34,
                    height: isCompact ? 39 : 51,
                  }}
                  contentFit="cover"
                />
              </View>
            ))}
            <Text
              className={`flex-1 text-text-secondary ${isCompact ? "text-xs" : "text-sm"}`}
              numberOfLines={isCompact ? 1 : 2}
            >
              {sharedFavoriteShows.map((show) => show.title).join(" • ")}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
