import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "../../lib/plotlist/react";

import { Screen } from "../../components/Screen";
import { Poster } from "../../components/Poster";
import { LikeButton } from "../../components/LikeButton";
import { Comments } from "../../components/Comments";
import { api } from "../../lib/plotlist/api";
import type { Id } from "../../lib/plotlist/types";
import { formatDate } from "../../lib/format";
import { ReportModal } from "../../components/ReportModal";

export default function ReviewScreen() {
  const params = useLocalSearchParams();
  const reviewId = (typeof params.id === "string" ? params.id : "") as Id<"reviews">;
  const data = useQuery(api.reviews.getDetailed, { reviewId });
  const report = useMutation(api.reports.create);
  const [showReport, setShowReport] = useState(false);

  if (!data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text className="text-base text-text-tertiary">Review not found.</Text>
        </View>
      </Screen>
    );
  }

  const { review, author, show } = data;

  return (
    <Screen scroll>
      <View className="px-6 pt-6">
        <View className="flex-row gap-4">
          <Poster uri={show?.posterUrl ?? undefined} size="md" />
          <View className="flex-1">
            <Text className="text-xl font-semibold text-text-primary">
              {show?.title ?? "Unknown show"}
            </Text>
            <Text className="mt-1 text-sm text-text-tertiary">
              Reviewed by {author?.displayName ?? author?.name ?? "Someone"}
            </Text>
            <Text className="mt-1 text-sm text-text-tertiary">
              {formatDate(review.createdAt)} · Rating {review.rating}/5
            </Text>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-dark-border bg-dark-card p-4">
          <Text className="text-base text-text-primary">{review.reviewText}</Text>
        </View>

        <View className="mt-4">
          <View className="flex-row items-center gap-3">
            <LikeButton targetType="review" targetId={review._id} />
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowReport(true);
              }}
              className="rounded-full border border-dark-border px-4 py-2"
            >
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Report
              </Text>
            </Pressable>
          </View>
          <Comments targetType="review" targetId={review._id} />
        </View>
      </View>
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={async (reason) => {
          try {
            await report({ targetType: "review", targetId: review._id, reason });
            Alert.alert("Report submitted", "Thanks for letting us know.");
          } catch (error) {
            Alert.alert("Could not report", String(error));
          }
        }}
      />
    </Screen>
  );
}
