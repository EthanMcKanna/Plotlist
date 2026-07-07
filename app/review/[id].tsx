import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryState } from "../../lib/plotlist/react";

import { Screen } from "../../components/Screen";
import { Poster } from "../../components/Poster";
import { LikeButton } from "../../components/LikeButton";
import { Comments } from "../../components/Comments";
import { GlassPressable } from "../../components/NativeGlass";
import { api } from "../../lib/plotlist/api";
import type { Id } from "../../lib/plotlist/types";
import { formatDate } from "../../lib/format";
import { guardedPush } from "../../lib/navigation";
import { ReportModal } from "../../components/ReportModal";

function ReviewHeader() {
  return (
    <View className="flex-row items-center px-4 pt-2">
      <GlassPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        radius={20}
        variant="control"
        contentStyle={{
          alignItems: "center",
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
      </GlassPressable>
      <Text className="ml-3 text-lg font-bold text-text-primary">Review</Text>
    </View>
  );
}

function StateMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-center text-base text-text-tertiary">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="mt-4 rounded-full border border-dark-border bg-dark-card px-5 py-2.5 active:bg-dark-hover"
        >
          <Text className="text-sm font-semibold text-text-primary">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RatingStars({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  const stars: string[] = [];
  for (let i = 0; i < fullStars; i++) stars.push("★");
  if (halfStar) stars.push("½");
  return (
    <Text className="text-base text-amber-400" style={{ letterSpacing: 2 }}>
      {stars.join("")}
    </Text>
  );
}

export default function ReviewScreen() {
  const params = useLocalSearchParams();
  const reviewId = (typeof params.id === "string" ? params.id : "") as Id<"reviews">;
  const { data, isLoading, isError, refetch } = useQueryState(
    api.reviews.getDetailed,
    reviewId ? { reviewId } : "skip",
  );
  const report = useMutation(api.reports.create);
  const [showReport, setShowReport] = useState(false);

  if (isLoading) {
    return (
      <Screen>
        <ReviewHeader />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#5A6070" />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ReviewHeader />
        <StateMessage
          message="Couldn't load this review. Check your connection."
          onRetry={refetch}
        />
      </Screen>
    );
  }

  if (!data || !reviewId) {
    return (
      <Screen>
        <ReviewHeader />
        <StateMessage message="This review is no longer available." />
      </Screen>
    );
  }

  const { review, author, show } = data;
  const authorName = author?.displayName ?? author?.name ?? "Someone";

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ReviewHeader />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View className="px-6 pb-10 pt-4">
            <Pressable
              onPress={() => {
                if (show?._id) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  guardedPush(`/show/${show._id}`);
                }
              }}
              disabled={!show?._id}
              className="flex-row gap-4 active:opacity-80"
            >
              <Poster uri={show?.posterUrl ?? undefined} size="md" />
              <View className="flex-1 justify-center">
                <Text className="text-xl font-bold text-text-primary" numberOfLines={2}>
                  {show?.title ?? "Unknown show"}
                </Text>
                {review.episodeTitle ? (
                  <Text className="mt-1 text-sm text-text-secondary" numberOfLines={1}>
                    {review.episodeTitle}
                  </Text>
                ) : null}
                <View className="mt-2">
                  <RatingStars rating={review.rating} />
                </View>
                <Text className="mt-2 text-xs text-text-tertiary">
                  {authorName} · {formatDate(review.createdAt)}
                </Text>
              </View>
            </Pressable>

            {review.reviewText ? (
              <View className="mt-5 rounded-3xl border border-dark-border bg-dark-card p-4">
                <Text className="text-base leading-6 text-text-primary">
                  {review.reviewText}
                </Text>
              </View>
            ) : null}

            <View className="mt-4 flex-row items-center gap-3">
              <LikeButton targetType="review" targetId={review._id} />
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowReport(true);
                }}
                className="rounded-full border border-dark-border px-4 py-2 active:bg-dark-hover"
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Report
                </Text>
              </Pressable>
            </View>

            <View className="mt-6">
              <Comments targetType="review" targetId={review._id} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
