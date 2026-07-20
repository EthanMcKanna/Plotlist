import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";

import { EmptyState } from "../../components/EmptyState";
import { FlashList } from "../../components/FlashList";
import { LinkPressable } from "../../components/LinkPressable";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import { notifyError } from "../../lib/dialogs";
import { useMutation, useQuery } from "../../lib/plotlist/react";

function MutedShowRow({
  item,
  onUnmute,
  unmuting,
}: {
  item: any;
  onUnmute: (showId: string) => void;
  unmuting: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
      <LinkPressable
        href={`/show/${item.showId}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        className="flex-1 flex-row items-center gap-3 pr-3 active:opacity-80 hover:opacity-80 web:transition-opacity"
      >
        {item.posterUrl ? (
          <Image
            source={{ uri: item.posterUrl }}
            style={{ width: 36, height: 52, borderRadius: 6 }}
            contentFit="cover"
          />
        ) : (
          <View
            className="items-center justify-center rounded-md bg-dark-elevated"
            style={{ width: 36, height: 52 }}
          />
        )}
        <Text
          className="flex-1 text-base font-semibold text-text-primary"
          numberOfLines={2}
        >
          {item.title}
        </Text>
      </LinkPressable>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onUnmute(item.showId);
        }}
        disabled={unmuting}
        className={`items-center justify-center rounded-full border border-dark-border bg-dark-card px-4 py-2 ${
          unmuting ? "opacity-60" : "active:bg-dark-hover hover:bg-dark-hover web:transition-colors"
        }`}
      >
        <Text className="text-xs font-semibold text-text-primary">Unmute</Text>
      </Pressable>
    </View>
  );
}

export default function MutedShowsScreen() {
  const mutedShows = useQuery(api.notifications.getMutedShows) as any[] | undefined;
  const unmuteShow = useMutation(api.notifications.unmuteShow);
  const [unmutingId, setUnmutingId] = useState<string | null>(null);

  const listContentStyle = useMemo(() => ({ paddingVertical: 16 }), []);

  const handleUnmute = useCallback(
    async (showId: string) => {
      setUnmutingId(showId);
      try {
        await unmuteShow({ showId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        notifyError("Could not unmute", String(error));
      } finally {
        setUnmutingId(null);
      }
    },
    [unmuteShow],
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <MutedShowRow
        item={item}
        onUnmute={handleUnmute}
        unmuting={unmutingId === item.showId}
      />
    ),
    [handleUnmute, unmutingId],
  );

  return (
    <Screen>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-semibold text-text-primary">Muted shows</Text>
        <Text className="mt-1 text-sm text-text-tertiary">
          Muted shows never send episode, premiere, or streaming alerts. Mute a
          show from the bell on its page.
        </Text>

        <View className="mt-6 flex-1">
          {mutedShows === undefined ? (
            <View className="mt-16 items-center">
              <ActivityIndicator color="#5A6070" />
            </View>
          ) : mutedShows.length > 0 ? (
            <FlashList
              data={mutedShows}
              renderItem={renderItem}
              keyExtractor={(item: any) => item.showId}
              estimatedItemSize={78}
              contentContainerStyle={listContentStyle}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          ) : (
            <View className="mt-4">
              <EmptyState
                title="No muted shows"
                description="Everything you track can notify you. Mute noisy shows from the bell on their page."
              />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}
