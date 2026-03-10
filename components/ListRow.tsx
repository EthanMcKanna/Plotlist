import { useCallback, useRef } from "react";
import { Alert, Animated, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";

export function ListRow({
  id,
  title,
  description,
  onDelete,
}: {
  id: string;
  title: string;
  description?: string | null;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const swipeableRef = useRef<Swipeable>(null);
  const isOpen = useRef(false);

  const confirmDelete = useCallback(() => {
    swipeableRef.current?.close();
    Alert.alert("Delete list", `Are you sure you want to delete "${title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onDelete?.();
        },
      },
    ]);
  }, [title, onDelete]);

  const renderRightActions = useCallback(
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0.5],
        extrapolate: "clamp",
      });

      return (
        <Pressable
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            confirmDelete();
          }}
          className="ml-3 items-center justify-center rounded-2xl bg-red-500 px-6"
        >
          <Animated.View style={{ transform: [{ scale }] }} className="items-center gap-1">
            <Ionicons name="trash-outline" size={20} color="#fff" />
            <Text className="text-xs font-semibold text-white">Delete</Text>
          </Animated.View>
        </Pressable>
      );
    },
    [confirmDelete],
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      onSwipeableWillOpen={() => {
        if (isOpen.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          confirmDelete();
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }}
      onSwipeableOpen={() => {
        isOpen.current = true;
      }}
      onSwipeableClose={() => {
        isOpen.current = false;
      }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/list/${id}`);
        }}
        className="rounded-2xl border border-dark-border bg-dark-card p-4 active:bg-dark-hover"
      >
        <Text className="text-base font-semibold text-text-primary">{title}</Text>
        {description ? (
          <Text className="mt-1 text-sm text-text-secondary" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </Pressable>
    </Swipeable>
  );
}
