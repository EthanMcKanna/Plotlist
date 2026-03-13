import { ScrollView, Text, View } from "react-native";

import { SimilarShowCard } from "./SimilarShowCard";

type RecommendationRailProps = {
  title: string;
  description?: string;
  items: Array<{
    showId?: string;
    externalId?: string;
    title: string;
    year?: number;
    posterUrl?: string;
    overview?: string;
    reason?: string;
    subtitle?: string;
  }>;
};

export function RecommendationRail({
  title,
  description,
  items,
}: RecommendationRailProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View className="mt-8">
      <View className="px-6">
        <Text
          className="text-xs font-bold uppercase text-text-tertiary"
          style={{ letterSpacing: 1.5 }}
        >
          {title}
        </Text>
        {description ? (
          <Text className="mt-2 text-sm text-text-tertiary">
            {description}
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingRight: 16 }}
      >
        {items.map((item) => (
          <SimilarShowCard
            key={`${item.showId ?? item.externalId ?? item.title}`}
            showId={item.showId}
            externalId={item.externalId}
            title={item.title}
            posterUrl={item.posterUrl}
            subtitle={item.subtitle ?? item.reason ?? item.overview}
          />
        ))}
      </ScrollView>
    </View>
  );
}
