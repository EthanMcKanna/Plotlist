import { Alert, Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function LikeButton({
  targetType,
  targetId,
}: {
  targetType: "review" | "log" | "list";
  targetId: string;
}) {
  const { isAuthenticated } = useConvexAuth();
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

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (!isAuthenticated) {
          Alert.alert("Sign in required", "Sign in to like this.");
          return;
        }
        toggle({ targetType, targetId });
      }}
      disabled={!isAuthenticated}
      className={`rounded-full border px-4 py-2 ${
        isLiked ? "border-rose-500 bg-rose-500/10" : "border-dark-border bg-dark-card"
      } ${!isAuthenticated ? "opacity-60" : ""}`}
    >
      <Text
        className={`text-xs font-semibold uppercase tracking-wide ${
          isLiked ? "text-rose-400" : "text-text-secondary"
        }`}
      >
        {isLiked ? "Liked" : "Like"} · {likes.length}
      </Text>
    </Pressable>
  );
}
