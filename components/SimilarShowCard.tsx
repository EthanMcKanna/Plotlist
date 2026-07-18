import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { guardedPush } from "../lib/navigation";
import { notifyError } from "../lib/dialogs";
import { useAction } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
import { LinkPressable } from "./LinkPressable";
import { Poster } from "./Poster";

type SimilarShowCardProps = {
  externalId?: string;
  showId?: string;
  title: string;
  posterPath?: string | null;
  posterUrl?: string | null;
  rating?: number;
  subtitle?: string | null;
};

export function SimilarShowCard({
  externalId,
  showId,
  title,
  posterPath,
  posterUrl,
  rating,
  subtitle,
}: SimilarShowCardProps) {
  const ingestShow = useAction(api.shows.ingestFromCatalog);

  const handleIngestPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (!externalId) {
        throw new Error("Missing show identifier");
      }
      // First, ingest the show from TMDB to local database
      const nextShowId = await ingestShow({
        externalSource: "tmdb",
        externalId,
        title,
        posterUrl: posterUrl ?? posterPath ?? undefined,
      });

      // Navigate to the show details page
      guardedPush(`/show/${nextShowId}`);
    } catch (error) {
      console.error("Failed to load show:", error);
      notifyError("Error", "Failed to load show details. Please try again.");
    }
  };

  const content = (
    <>
      <Poster uri={posterUrl ?? posterPath ?? undefined} alt={title} size="md" />
      <Text className="mt-2 text-sm font-semibold text-text-primary" numberOfLines={2}>
        {title}
      </Text>
      {typeof rating === "number" ? (
        <View className="mt-1 flex-row items-center gap-1">
          <Ionicons name="star" size={12} color="#FBBF24" />
          <Text className="text-xs text-text-tertiary">{rating.toFixed(1)}</Text>
        </View>
      ) : null}
      {subtitle ? (
        <Text className="mt-1 text-xs text-text-tertiary" numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );

  if (showId) {
    return (
      <LinkPressable
        href={{ pathname: "/show/[id]", params: { id: showId } }}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        accessibilityLabel={`Open ${title}`}
        className="mr-4 w-32 web:transition-opacity active:opacity-80 hover:opacity-90"
      >
        {content}
      </LinkPressable>
    );
  }

  // No local show id yet — the show must be ingested before it has a route,
  // so this card can't be a plain link.
  return (
    <Pressable
      onPress={handleIngestPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      className="mr-4 w-32 web:transition-opacity active:opacity-80 hover:opacity-90"
    >
      {content}
    </Pressable>
  );
}
