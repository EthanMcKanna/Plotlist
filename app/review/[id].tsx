import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { LinkPressable } from "../../components/LinkPressable";
import { PageTitle } from "../../components/PageTitle";
import { ActionSheet } from "../../components/ActionSheet";
import {
  CommentsSection,
  formatCommentCount,
  useCommentThread,
} from "../../components/Comments";
import { GlassPressable } from "../../components/NativeGlass";
import { api } from "../../lib/plotlist/api";
import type { Id } from "../../lib/plotlist/types";
import { formatDate, formatEpisodeCode } from "../../lib/format";
import { notify, notifyError } from "../../lib/dialogs";
import { sharePlotlistLink } from "../../lib/share";
import { ReportModal } from "../../components/ReportModal";
import { SpoilerShield } from "../../components/SpoilerShield";
import { SHOW_BACK_BUTTON } from "../../lib/webLayout";

function ReviewHeader() {
  return (
    <View className="flex-row items-center px-4 pt-2">
      {SHOW_BACK_BUTTON ? (
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
      ) : null}
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
  const [showMenu, setShowMenu] = useState(false);
  const commentThread = useCommentThread("review", reviewId, { skip: !reviewId });
  const commentCountLabel = formatCommentCount(commentThread);
  const scrollRef = useRef<ScrollView>(null);
  // Y offset of the comments section inside the scroll content, captured on
  // layout so the comment button can jump straight to the thread.
  const commentsYRef = useRef(0);

  const handleScrollToComments = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scrollRef.current?.scrollTo({
      y: Math.max(commentsYRef.current - 12, 0),
      animated: true,
    });
  }, []);

  const handleComposerFocus = useCallback(() => {
    // Let the keyboard start animating so automaticallyAdjustKeyboardInsets
    // has grown the scroll range, then settle the composer just above it.
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 140);
  }, []);

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

  const showHeaderContent = (
    <>
      <Poster uri={show?.posterUrl ?? undefined} size="md" alt={show?.title} />
      <View className="flex-1 justify-center">
        <Text className="text-xl font-bold text-text-primary" numberOfLines={2}>
          {show?.title ?? "Unknown show"}
        </Text>
        {typeof review.seasonNumber === "number" &&
        typeof review.episodeNumber === "number" ? (
          <View className="mt-1.5 flex-row items-center gap-2">
            <View className="rounded-full bg-brand-500/10 px-2 py-0.5">
              <Text className="text-[11px] font-semibold text-brand-300">
                {formatEpisodeCode(review.seasonNumber, review.episodeNumber)}
              </Text>
            </View>
            {review.episodeTitle ? (
              <Text className="flex-1 text-sm text-text-secondary" numberOfLines={1}>
                {review.episodeTitle}
              </Text>
            ) : null}
          </View>
        ) : review.episodeTitle ? (
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
    </>
  );

  return (
    <Screen>
      <PageTitle
        title={
          show?.title
            ? `${authorName}'s review of ${show.title}`
            : `${authorName}'s review`
        }
      />
      <View className="flex-1">
        <ReviewHeader />
        <ScrollView
          ref={scrollRef}
          contentInsetAdjustmentBehavior="automatic"
          // iOS: grow the bottom inset so the inline comment composer can sit
          // above the keyboard (Android resizes the window natively).
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bounces={false}
          overScrollMode="never"
        >
          <View className="px-6 pb-10 pt-4">
            {show?._id ? (
              <LinkPressable
                href={`/show/${show._id}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="flex-row gap-4 web:transition-opacity active:opacity-80 hover:opacity-90"
              >
                {showHeaderContent}
              </LinkPressable>
            ) : (
              <View className="flex-row gap-4">{showHeaderContent}</View>
            )}

            {review.reviewText ? (
              <View className="mt-5">
                <SpoilerShield active={Boolean(review.spoiler)}>
                  <Text className="text-base leading-6 text-text-primary">
                    {review.reviewText}
                  </Text>
                </SpoilerShield>
              </View>
            ) : null}

            {/* ── Action bar: engagement left, overflow right ── */}
            <View className="mt-4 flex-row items-center border-y border-dark-border py-2">
              <LikeButton targetType="review" targetId={review._id} />
              <Pressable
                onPress={handleScrollToComments}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="View comments"
                className="ml-4 flex-row items-center gap-1.5 py-1 pr-1 active:opacity-70"
              >
                <Ionicons name="chatbubble-outline" size={22} color="#9BA1B0" />
                {commentCountLabel ? (
                  <Text className="text-[13px] font-semibold text-text-secondary">
                    {commentCountLabel}
                  </Text>
                ) : null}
              </Pressable>
              <View className="flex-1" />
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowMenu(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Review options"
                className="h-9 w-9 items-center justify-center rounded-full active:bg-dark-hover"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="#9BA1B0" />
              </Pressable>
            </View>

            <View
              className="mt-6"
              onLayout={(event) => {
                commentsYRef.current = event.nativeEvent.layout.y;
              }}
            >
              <CommentsSection
                thread={commentThread}
                onComposerFocus={handleComposerFocus}
              />
            </View>
          </View>
        </ScrollView>
      </View>
      <ActionSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        title="Review"
        options={[
          {
            label: "Share review",
            icon: "share-outline",
            onPress: () => {
              void sharePlotlistLink(
                `/review/${review._id}`,
                show?.title
                  ? `${authorName}'s review of ${show.title} on Plotlist`
                  : `${authorName}'s review on Plotlist`,
              );
            },
          },
          {
            label: "Report review",
            icon: "flag-outline",
            destructive: true,
            onPress: () => setShowReport(true),
          },
        ]}
      />
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={async (reason) => {
          try {
            await report({ targetType: "review", targetId: review._id, reason });
            notify("Report submitted", "Thanks for letting us know.");
          } catch (error) {
            notifyError("Could not report", String(error));
          }
        }}
      />
    </Screen>
  );
}
