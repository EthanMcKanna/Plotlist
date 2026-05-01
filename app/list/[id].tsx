import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "../../lib/plotlist/react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Screen } from "../../components/Screen";
import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { Poster } from "../../components/Poster";
import { api } from "../../lib/plotlist/api";
import type { Id } from "../../lib/plotlist/types";
import { ReportModal } from "../../components/ReportModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const H_PADDING = 24;
const GAP = 12;
const NUM_COLS = 3;
const ITEM_WIDTH =
  (SCREEN_WIDTH - H_PADDING * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS;
const POSTER_HEIGHT = ITEM_WIDTH * 1.5;
const METADATA_HEIGHT = 54;
const ITEM_HEIGHT = POSTER_HEIGHT + METADATA_HEIGHT;
const CARD_SPRING = { damping: 24, stiffness: 180, mass: 0.95 };

function getGridPosition(index: number) {
  "worklet";
  return {
    x: (index % NUM_COLS) * (ITEM_WIDTH + GAP),
    y: Math.floor(index / NUM_COLS) * (ITEM_HEIGHT + GAP),
  };
}

function getIndexFromPosition(x: number, y: number, itemCount: number) {
  "worklet";
  const col = Math.max(
    0,
    Math.min(NUM_COLS - 1, Math.floor((x + ITEM_WIDTH / 2) / (ITEM_WIDTH + GAP))),
  );
  const row = Math.max(0, Math.floor((y + ITEM_HEIGHT / 2) / (ITEM_HEIGHT + GAP)));
  return Math.max(0, Math.min(itemCount - 1, row * NUM_COLS + col));
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function SortablePosterCard({
  item,
  index,
  totalItems,
  isOwner,
  draggingId,
  activeIndex,
  activeX,
  activeY,
  activeScale,
  dragOriginX,
  dragOriginY,
  onPress,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  item: any;
  index: number;
  totalItems: number;
  isOwner: boolean;
  draggingId: string | null;
  activeIndex: SharedValue<number>;
  activeX: SharedValue<number>;
  activeY: SharedValue<number>;
  activeScale: SharedValue<number>;
  dragOriginX: SharedValue<number>;
  dragOriginY: SharedValue<number>;
  onPress: (showId: string) => void;
  onDragStart: (itemId: string, index: number) => void;
  onDragMove: (toIndex: number) => void;
  onDragEnd: () => void;
}) {
  const itemId = item.item._id as string;
  const isActive = draggingId === itemId;
  const target = getGridPosition(index);
  const canDrag = isOwner && totalItems > 1;

  const animatedStyle = useAnimatedStyle(
    () => ({
      position: "absolute",
      width: ITEM_WIDTH,
      zIndex: isActive ? 20 : 1,
      transform: [
        {
          translateX: isActive ? activeX.value : withSpring(target.x, CARD_SPRING),
        },
        {
          translateY: isActive ? activeY.value : withSpring(target.y, CARD_SPRING),
        },
        {
          scale: isActive ? activeScale.value : withSpring(1, CARD_SPRING),
        },
      ],
    }),
    [isActive, target.x, target.y],
  );

  const dragGesture = Gesture.Pan()
    .enabled(canDrag)
    .activateAfterLongPress(220)
    .onStart(() => {
      runOnJS(onDragStart)(itemId, index);
    })
    .onUpdate((event) => {
      activeX.value = dragOriginX.value + event.translationX;
      activeY.value = dragOriginY.value + event.translationY;

      const nextIndex = getIndexFromPosition(
        activeX.value,
        activeY.value,
        totalItems,
      );

      if (nextIndex !== activeIndex.value) {
        runOnJS(onDragMove)(nextIndex);
      }
    })
    .onEnd(() => {
      if (activeIndex.value < 0) {
        return;
      }
      const targetPosition = getGridPosition(activeIndex.value);
      activeX.value = withSpring(targetPosition.x, CARD_SPRING);
      activeScale.value = withSpring(1, CARD_SPRING);
      activeY.value = withSpring(targetPosition.y, CARD_SPRING, (finished) => {
        if (finished) {
          runOnJS(onDragEnd)();
        }
      });
    });

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={() => onPress(item.show._id)}
          className="active:opacity-80"
        >
          <View className="overflow-hidden rounded-2xl">
            <Poster uri={item.show?.posterUrl} width={ITEM_WIDTH} />
            <View className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1">
              <Text className="text-[11px] font-semibold text-white">
                #{index + 1}
              </Text>
            </View>
          </View>
          <Text
            className="mt-2 text-xs font-medium text-text-primary"
            numberOfLines={2}
          >
            {item.show?.title ?? "Unknown"}
          </Text>
          <Text className="mt-0.5 text-xs text-text-tertiary">
            {item.show?.year ?? "Unknown year"}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export default function ListScreen() {
  const params = useLocalSearchParams();
  const listId = (typeof params.id === "string" ? params.id : "") as Id<"lists">;
  const list = useQuery(api.lists.get, { listId });
  const me = useQuery(api.users.me);
  const rawItems = useQuery(api.listItems.listDetailed, { listId });
  const items = useMemo(
    () => rawItems?.filter((entry: any) => entry.show) ?? [],
    [rawItems],
  );
  const report = useMutation(api.reports.create);
  const reorder = useMutation(api.listItems.reorder);
  const coverUrl = useQuery(
    api.storage.getUrl,
    list?.coverStorageId ? { storageId: list.coverStorageId } : "skip",
  );
  const [orderedItems, setOrderedItems] = useState(items);
  const [showReport, setShowReport] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const gridHeight = useMemo(() => {
    if (orderedItems.length === 0) return 0;
    const rows = Math.ceil(orderedItems.length / NUM_COLS);
    return rows * ITEM_HEIGHT + (rows - 1) * GAP;
  }, [orderedItems.length]);
  const orderedItemsRef = useRef(orderedItems);
  const draggingIdRef = useRef<string | null>(null);
  const activeIndex = useSharedValue(-1);
  const activeX = useSharedValue(0);
  const activeY = useSharedValue(0);
  const activeScale = useSharedValue(1);
  const dragOriginX = useSharedValue(0);
  const dragOriginY = useSharedValue(0);

  useEffect(() => {
    if (!draggingIdRef.current) {
      setOrderedItems((prev: any[]) => {
        if (
          prev.length === items.length &&
          prev.every((entry: any, index: number) => entry === items[index])
        ) {
          return prev;
        }
        return items;
      });
    }
  }, [items]);

  useEffect(() => {
    orderedItemsRef.current = orderedItems;
  }, [orderedItems]);

  const isOwner = useMemo(
    () => !!(me && list && me._id === list.ownerId),
    [list, me],
  );

  const handleReorder = useCallback(
    async (nextOrder: typeof orderedItems) => {
      try {
        await reorder({
          listId,
          orderedItemIds: nextOrder.map((entry: any) => entry.item._id),
        });
      } catch (error) {
        Alert.alert("Reorder failed", String(error));
        setOrderedItems(items);
      }
    },
    [items, listId, reorder],
  );

  const handlePosterPress = useCallback((showId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/show/${showId}`);
  }, []);

  const handleDragStart = useCallback((itemId: string, index: number) => {
    const position = getGridPosition(index);
    draggingIdRef.current = itemId;
    setDraggingId(itemId);
    activeIndex.value = index;
    dragOriginX.value = position.x;
    dragOriginY.value = position.y;
    activeX.value = position.x;
    activeY.value = position.y;
    activeScale.value = withSpring(1.02, CARD_SPRING);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeIndex, activeScale, activeX, activeY, dragOriginX, dragOriginY]);

  const handleDragMove = useCallback(
    (toIndex: number) => {
      const activeId = draggingIdRef.current;
      if (!activeId) {
        return;
      }
      setOrderedItems((prev: any[]) => {
        const fromIndex = prev.findIndex((entry) => entry.item._id === activeId);
        if (fromIndex < 0 || fromIndex === toIndex) {
          return prev;
        }
        activeIndex.value = toIndex;
        Haptics.selectionAsync();
        const next = moveArrayItem(prev, fromIndex, toIndex);
        return next;
      });
    },
    [activeIndex],
  );

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    activeIndex.value = -1;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void handleReorder(orderedItemsRef.current);
  }, [activeIndex, handleReorder]);

  const renderPoster = useCallback(
    (item: any, index: number) => (
      <SortablePosterCard
        key={item.item._id}
        item={item}
        index={index}
        totalItems={orderedItems.length}
        isOwner={isOwner}
        draggingId={draggingId}
        activeIndex={activeIndex}
        activeX={activeX}
        activeY={activeY}
        activeScale={activeScale}
        dragOriginX={dragOriginX}
        dragOriginY={dragOriginY}
        onPress={handlePosterPress}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    ),
    [
      activeIndex,
      activeScale,
      activeX,
      activeY,
      dragOriginX,
      dragOriginY,
      draggingId,
      handleDragEnd,
      handleDragMove,
      handleDragStart,
      handlePosterPress,
      isOwner,
      orderedItems.length,
    ],
  );

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!draggingId}
      >
        <View className="px-6 pb-10 pt-6">
          <Text className="text-2xl font-semibold text-text-primary">
            {list?.title ?? "List"}
          </Text>
          {list?.description ? (
            <Text className="mt-2 text-sm text-text-secondary">
              {list.description}
            </Text>
          ) : null}

          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={{ width: "100%", height: 180, borderRadius: 16, marginTop: 16 }}
              contentFit="cover"
            />
          ) : null}

          {!isOwner ? (
            <View className="mt-4">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowReport(true);
                }}
                className="rounded-full border border-dark-border bg-dark-card px-4 py-2"
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Report list
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View className="mt-6">
            <SectionHeader title="Shows" />
            {isOwner && orderedItems.length > 1 ? (
              <Text className="mt-2 text-sm text-text-tertiary">
                Hold and drag posters to reorder.
              </Text>
            ) : null}
            {orderedItems.length > 0 ? (
              <View className="mt-4" style={{ height: gridHeight }}>
                {orderedItems.map(renderPoster)}
              </View>
            ) : (
              <View className="mt-4">
                <EmptyState
                  title="No shows yet"
                  description="Add shows to your list."
                />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={async (reason) => {
          try {
            await report({ targetType: "list", targetId: listId, reason });
            Alert.alert("Report submitted", "Thanks for the report.");
          } catch (error) {
            Alert.alert("Could not report", String(error));
          }
        }}
      />
    </Screen>
  );
}
