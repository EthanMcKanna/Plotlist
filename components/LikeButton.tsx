import { Alert, Platform, Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useAuth, useMutation, useQuery } from "../lib/plotlist/react";
import { api } from "../lib/plotlist/api";
import { promptSignIn } from "../lib/dialogs";
import { applyLikeToggleToCaches } from "../lib/likeCountPatch";
import { queryClient } from "../lib/queryClient";

const LIKED_COLOR = "#F43F5E";
const IDLE_COLOR = "#9BA1B0";

export function LikeButton({
  targetType,
  targetId,
  likeCount: seededCount,
  likedByViewer: seededLiked,
}: {
  targetType: "review" | "log" | "list";
  targetId: string;
  /**
   * Seed from the parent's payload when it already carries the count
   * (review details do) — the button then skips its own two queries and the
   * toggle patches that payload in place, so the count never jumps a beat
   * later. Without seeds the button fetches the like list itself.
   */
  likeCount?: number;
  likedByViewer?: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me);
  const toggle = useMutation(api.likes.toggle);
  const liked = useQuery(
    api.likes.getForUserTarget,
    isAuthenticated && seededLiked === undefined ? { targetType, targetId } : "skip",
  );
  const likes = useQuery(
    api.likes.listForTarget,
    seededCount === undefined ? { targetType, targetId, limit: 100 } : "skip",
  );
  const isLiked = seededLiked ?? Boolean(liked);
  const count = seededCount ?? (Array.isArray(likes) ? likes.length : 0);

  // Instagram-style pop: a quick squeeze, overshoot, and settle in ~300ms.
  // Timings only — a spring in the middle of a withSequence blocks until it
  // physically settles, which dragged this out for seconds and could leave
  // the heart oversized.
  const scale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (!isAuthenticated) {
      if (Platform.OS === "web") {
        promptSignIn("Sign in to like this.");
      } else {
        Alert.alert("Sign in required", "Sign in to like this.");
      }
      return;
    }
    const willLike = !isLiked;
    const viewerId = typeof me?._id === "string" ? me._id : null;
    if (willLike) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      scale.value = withSequence(
        withTiming(0.82, { duration: 70, easing: Easing.out(Easing.quad) }),
        withTiming(1.16, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 110, easing: Easing.inOut(Easing.quad) }),
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scale.value = withSequence(
        withTiming(0.88, { duration: 70, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 110, easing: Easing.inOut(Easing.quad) }),
      );
    }
    void toggle
      .withOptimisticUpdate((localStore) => {
        applyLikeToggleToCaches(
          localStore,
          queryClient,
          { targetType, targetId },
          willLike,
          viewerId,
        );
      })({ targetType, targetId })
      .catch((error) => {
        console.warn("Failed to toggle like", error);
      });
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: isLiked }}
      accessibilityLabel={
        isLiked
          ? `Unlike. ${count} ${count === 1 ? "like" : "likes"}`
          : `Like. ${count} ${count === 1 ? "like" : "likes"}`
      }
      style={styles.container}
      className="web:transition-opacity active:opacity-80 hover:opacity-80"
    >
      <Animated.View style={heartStyle}>
        <Ionicons
          name={isLiked ? "heart" : "heart-outline"}
          size={24}
          color={isLiked ? LIKED_COLOR : IDLE_COLOR}
          accessible={false}
          accessibilityElementsHidden
          aria-hidden={true}
          importantForAccessibility="no"
        />
      </Animated.View>
      {count > 0 ? (
        <Text
          className="text-[13px] font-semibold"
          style={{ color: isLiked ? LIKED_COLOR : IDLE_COLOR }}
        >
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    // Keeps the heart from hugging neighboring pill buttons while staying
    // visually borderless.
    paddingRight: 4,
  },
});
