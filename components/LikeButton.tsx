import { Alert, Pressable, StyleSheet, Text } from "react-native";
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

const LIKED_COLOR = "#F43F5E";
const IDLE_COLOR = "#9BA1B0";

export function LikeButton({
  targetType,
  targetId,
}: {
  targetType: "review" | "log" | "list";
  targetId: string;
}) {
  const { isAuthenticated } = useAuth();
  const toggle = useMutation(api.likes.toggle).withOptimisticUpdate(
    (localStore, args) => {
      const likedQueryArgs = { targetType: args.targetType, targetId: args.targetId };
      const listQueryArgs = {
        targetType: args.targetType,
        targetId: args.targetId,
        limit: 100,
      };

      const current = localStore.getQuery(api.likes.getForUserTarget, likedQueryArgs);
      const optimisticId = `optimistic:${args.targetType}:${args.targetId}`;

      const nextLiked = !current;
      localStore.setQuery(
        api.likes.getForUserTarget,
        likedQueryArgs,
        nextLiked
          ? {
              _id: optimisticId,
              userId: "me",
              targetType: args.targetType,
              targetId: args.targetId,
              createdAt: Date.now(),
            }
          : null,
      );

      const currentList = localStore.getQuery(api.likes.listForTarget, listQueryArgs);
      if (!currentList) return;

      if (nextLiked) {
        const withoutOptimistic = currentList.filter(
          (like: any) => like._id !== optimisticId,
        );
        localStore.setQuery(api.likes.listForTarget, listQueryArgs, [
          {
            _id: optimisticId,
            userId: "me",
            targetType: args.targetType,
            targetId: args.targetId,
            createdAt: Date.now(),
          },
          ...withoutOptimistic,
        ]);
      } else {
        const toRemove = current?._id ?? optimisticId;
        localStore.setQuery(
          api.likes.listForTarget,
          listQueryArgs,
          currentList.filter((like: any) => like._id !== toRemove),
        );
      }
    },
  );
  const liked = useQuery(
    api.likes.getForUserTarget,
    isAuthenticated ? { targetType, targetId } : "skip",
  );
  const likes =
    useQuery(api.likes.listForTarget, { targetType, targetId, limit: 100 }) ?? [];
  const isLiked = !!liked;
  const count = likes.length;

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
      Alert.alert("Sign in required", "Sign in to like this.");
      return;
    }
    const willLike = !isLiked;
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
    toggle({ targetType, targetId });
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
      className="active:opacity-80"
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
