import { Alert, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Poster } from "./Poster";

type SimilarShowCardProps = {
  externalId: string;
  title: string;
  posterPath?: string | null;
  rating: number;
};

export function SimilarShowCard({
  externalId,
  title,
  posterPath,
  rating,
}: SimilarShowCardProps) {
  const ingestShow = useAction(api.shows.ingestFromCatalog);

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // First, ingest the show from TMDB to local database
      const showId = await ingestShow({
        externalSource: "tmdb",
        externalId,
        title,
        posterUrl: posterPath ?? undefined,
      });

      // Navigate to the show details page
      router.push(`/show/${showId}`);
    } catch (error) {
      console.error("Failed to load show:", error);
      Alert.alert("Error", "Failed to load show details. Please try again.");
    }
  };

  return (
    <Pressable onPress={handlePress} className="mr-4 w-32 active:opacity-80">
      <Poster uri={posterPath ?? undefined} size="md" />
      <Text className="mt-2 text-sm font-semibold text-text-primary" numberOfLines={2}>
        {title}
      </Text>
      <View className="mt-1 flex-row items-center gap-1">
        <Ionicons name="star" size={12} color="#FBBF24" />
        <Text className="text-xs text-text-tertiary">{rating.toFixed(1)}</Text>
      </View>
    </Pressable>
  );
}
