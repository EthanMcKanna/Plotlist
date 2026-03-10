import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FlashList } from "@shopify/flash-list";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { Screen } from "../../components/Screen";
import { api } from "../../convex/_generated/api";
import { formatDate } from "../../lib/format";

export default function ReportsAdminScreen() {
  const me = useQuery(api.users.me);
  const { results: reports, status, loadMore } = usePaginatedQuery(
    api.reports.listOpen,
    me?.isAdmin ? {} : "skip",
    { initialNumItems: 20 },
  );
  const resolve = useMutation(api.reports.resolve);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  if (!me?.isAdmin) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-text-tertiary">Admin access required.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">Reports</Text>
        <Text className="mt-1 text-sm text-text-tertiary">Open content reports.</Text>

        <View className="mt-6 flex-1">
          {reports.length > 0 ? (
            <FlashList
              data={reports}
              keyExtractor={(item: any) => item._id}
              estimatedItemSize={120}
              contentContainerStyle={{ paddingBottom: 40 }}
              onEndReached={() => {
                if (status === "CanLoadMore") {
                  loadMore(20);
                }
              }}
              onEndReachedThreshold={0.5}
              renderItem={({ item }: { item: any }) => (
                <View className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-4">
                  <Text className="text-xs uppercase tracking-wide text-text-tertiary">
                    {item.targetType} · {formatDate(item.createdAt)}
                  </Text>
                  <Text className="mt-2 text-sm text-text-primary">
                    Reason: {item.reason ?? "No reason provided"}
                  </Text>
                  <Text className="mt-2 text-xs text-text-tertiary">
                    Target ID: {item.targetId}
                  </Text>
                  <View className="mt-4 flex-row gap-3">
                    <Pressable
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        try {
                          setResolvingId(item._id);
                          await resolve({ reportId: item._id, action: "dismiss" });
                        } catch (error) {
                          Alert.alert("Could not resolve", String(error));
                        } finally {
                          setResolvingId(null);
                        }
                      }}
                      className="flex-1 items-center rounded-full border border-dark-border py-2"
                      disabled={resolvingId === item._id}
                    >
                      <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Dismiss
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        Alert.alert(
                          "Delete content",
                          "This will permanently delete the reported content.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  setResolvingId(item._id);
                                  await resolve({ reportId: item._id, action: "delete" });
                                } catch (error) {
                                  Alert.alert("Could not delete", String(error));
                                } finally {
                                  setResolvingId(null);
                                }
                              },
                            },
                          ],
                        );
                      }}
                      className="flex-1 items-center rounded-full bg-red-600 py-2"
                      disabled={resolvingId === item._id}
                    >
                      <Text className="text-xs font-semibold uppercase tracking-wide text-white">
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          ) : (
            <Text className="text-sm text-text-tertiary">No open reports.</Text>
          )}
        </View>
      </View>
    </Screen>
  );
}
