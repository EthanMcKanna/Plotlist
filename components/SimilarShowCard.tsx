import { Alert, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
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

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (showId) {
        router.push(`/show/${showId}`);
        return;
      }
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
      router.push(`/show/${nextShowId}`);
    } catch (error) {
      console.error("Failed to load show:", error);
      Alert.alert("Error", "Failed to load show details. Please try again.");
    }
  };

  return (
    <Pressable onPress={handlePress} className="mr-4 w-32 active:opacity-80">
      <Poster uri={posterUrl ?? posterPath ?? undefined} size="md" />
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
    </Pressable>
  );
}
