import { useCallback, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";

import { api } from "../convex/_generated/api";
import { formatDate } from "../lib/format";

export function Comments({
  targetType,
  targetId,
}: {
  targetType: "review" | "log" | "list";
  targetId: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const { results: comments, status, loadMore } = usePaginatedQuery(
    api.comments.listForTarget,
    { targetType, targetId },
    { initialNumItems: 20 },
  );
  const add = useMutation(api.comments.add);

  const [text, setText] = useState("");

  const handleAdd = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Sign in to post a comment.");
      return;
    }
    if (!text.trim()) return;
    try {
      await add({ targetType, targetId, text });
      setText("");
    } catch (error) {
      Alert.alert("Could not comment", String(error));
    }
  }, [add, targetId, targetType, text]);

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <View className="mt-3 rounded-2xl border border-dark-border bg-dark-card p-3">
        <Text className="text-xs text-text-tertiary">{formatDate(item.createdAt)}</Text>
        <Text className="mt-1 text-sm text-text-primary">{item.text}</Text>
      </View>
    ),
    [],
  );

  return (
    <View className="mt-4">
      <Text className="text-base font-semibold text-text-primary">Comments</Text>
      <View className="mt-3 flex-row gap-2">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={
            isAuthenticated ? "Add a comment" : "Sign in to comment"
          }
          editable={isAuthenticated}
          placeholderTextColor="#5A6070"
          className={`flex-1 rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-[16px] text-text-primary ${
            !isAuthenticated ? "text-text-tertiary" : ""
          }`}
        />
        <Pressable
          onPress={handleAdd}
          disabled={!isAuthenticated}
          className="items-center justify-center rounded-2xl bg-brand-500 px-4"
        >
          <Text className="text-sm font-semibold text-white">Post</Text>
        </Pressable>
      </View>

      {comments.length > 0 ? (
        <FlashList
          data={comments}
          renderItem={renderItem}
          keyExtractor={(item: any) => item._id}
          estimatedItemSize={80}
          scrollEnabled={false}
        />
      ) : (
        <Text className="mt-3 text-sm text-text-tertiary">No comments yet.</Text>
      )}

      {status === "CanLoadMore" ? (
        <Pressable
          onPress={() => loadMore(20)}
          className="mt-3 self-start rounded-full border border-dark-border px-4 py-2"
        >
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Load more
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
