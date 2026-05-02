import { ScrollView, Text, View } from "react-native";

import { SimilarShowCard } from "./SimilarShowCard";

type RecommendationRailProps = {
  title: string;
  description?: string;
  items: Array<{
    _id?: string;
    show?: {
      _id?: string;
      externalId?: string;
      title?: string;
      year?: number;
      posterUrl?: string;
      overview?: string;
    } | null;
    showId?: string;
    externalId?: string;
    title?: string;
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
        {items.map((item, index) => {
          const show = item.show ?? item;
          const title = show.title ?? item.title ?? "Unknown";
          const showId = item.showId ?? show._id ?? item._id;
          const externalId = item.externalId ?? show.externalId;
          const posterUrl = show.posterUrl ?? item.posterUrl;
          const subtitle = item.subtitle ?? item.reason ?? show.overview ?? item.overview;

          return (
            <SimilarShowCard
              key={`${showId ?? externalId ?? title}-${index}`}
              showId={showId}
              externalId={externalId}
              title={title}
              posterUrl={posterUrl}
              subtitle={subtitle}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
