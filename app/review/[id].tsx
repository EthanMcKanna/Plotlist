import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";

import { Screen } from "../../components/Screen";
import { Poster } from "../../components/Poster";
import { Avatar } from "../../components/Avatar";
import { LikeButton } from "../../components/LikeButton";
import { Comments } from "../../components/Comments";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatRelativeTime } from "../../lib/format";
import { ReportModal } from "../../components/ReportModal";

function RatingStars({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  const stars: string[] = [];
  for (let i = 0; i < fullStars; i++) stars.push("★");
  if (halfStar) stars.push("½");
  return (
    <Text className="text-2xl text-amber-400" style={{ letterSpacing: 2 }}>
      {stars.join("")}
    </Text>
  );
}

export default function ReviewScreen() {
  const router = useRouter();
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
  const authorLabel = author?.displayName ?? author?.name ?? "Someone";

  return (
    <Screen scroll>
      <View className="px-6 pt-6">
        {/* Show card — tappable to navigate */}
        <Pressable
          onPress={() => {
            if (show?._id) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/show/${show._id}`);
            }
          }}
          className="flex-row gap-4 rounded-2xl border border-dark-border bg-dark-card p-3 active:bg-dark-hover"
        >
          <Poster uri={show?.posterUrl ?? undefined} size="md" />
          <View className="flex-1 justify-center">
            <Text className="text-lg font-bold text-text-primary">
              {show?.title ?? "Unknown show"}
            </Text>
            {show?.year ? (
              <Text className="mt-0.5 text-sm text-text-tertiary">{show.year}</Text>
            ) : null}
            <View className="mt-2 flex-row items-center gap-1.5">
              <Text className="text-xs font-medium text-brand-500">View show details</Text>
              <Text className="text-xs text-brand-500">→</Text>
            </View>
          </View>
        </Pressable>

        {/* Rating */}
        <View className="mt-6 items-center">
          <RatingStars rating={review.rating} />
          <Text className="mt-1 text-sm text-text-tertiary">
            {review.rating} out of 5
          </Text>
        </View>

        {/* Review text */}
        {review.reviewText ? (
          <View className="mt-6">
            <Text className="text-base leading-7 text-text-primary">
              {review.reviewText}
            </Text>
          </View>
        ) : null}

        {/* Author + meta */}
        <View className="mt-6 flex-row items-center gap-3">
          <Pressable
            onPress={() => {
              if (author?._id) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/profile/${author._id}`);
              }
            }}
            className="flex-row flex-1 items-center gap-3 active:opacity-80"
          >
            <Avatar
              uri={data.authorAvatarUrl}
              label={authorLabel}
              size={36}
            />
            <View>
              <Text className="text-sm font-semibold text-text-primary">
                {authorLabel}
              </Text>
              <Text className="text-xs text-text-tertiary">
                {formatRelativeTime(review.createdAt)}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Divider */}
        <View className="mt-6 h-px bg-dark-border" />

        {/* Actions */}
        <View className="mt-4 flex-row items-center gap-3">
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

        {/* Comments */}
        <Comments targetType="review" targetId={review._id} />
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
