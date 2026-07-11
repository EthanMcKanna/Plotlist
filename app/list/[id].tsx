import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useMutation, useQuery } from "../../lib/plotlist/react";
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
import { CommentsPreview } from "../../components/Comments";
import { LikeButton } from "../../components/LikeButton";
import { Poster } from "../../components/Poster";
import { Avatar } from "../../components/Avatar";
import { ListForm } from "../../components/ListForm";
import { api } from "../../lib/plotlist/api";
import { guardedPush } from "../../lib/navigation";
import { sharePlotlistLink } from "../../lib/share";
import { getUserFacingApiErrorMessage } from "../../lib/api/client";
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

function getDetailedListItem(entry: any) {
  return entry?.item ?? entry;
}

function getDetailedListItemId(entry: any): string | null {
  const item = getDetailedListItem(entry);
  return typeof item?._id === "string"
    ? item._id
    : typeof item?.id === "string"
      ? item.id
      : null;
}

function getDetailedListItemShow(entry: any) {
  return entry?.show ?? entry?.item?.show ?? null;
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
  const itemId = getDetailedListItemId(item) ?? `${index}`;
  const show = getDetailedListItemShow(item);
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
          onPress={() => {
            if (show?._id) {
              onPress(show._id);
            }
          }}
          className="active:opacity-80"
        >
          <View className="overflow-hidden rounded-2xl">
            <Poster uri={show?.posterUrl} width={ITEM_WIDTH} />
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
            {show?.title ?? "Unknown"}
          </Text>
          <Text className="mt-0.5 text-xs text-text-tertiary">
            {show?.year ?? "Unknown year"}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export default function ListScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const listId = (typeof params.id === "string" ? params.id : "") as Id<"lists">;
  const list = useQuery(api.lists.get, { listId });
  const me = useQuery(api.users.me);
  const rawItems = useQuery(api.listItems.listDetailed, { listId });
  const items = useMemo(
    () =>
      rawItems?.filter(
        (entry: any) => getDetailedListItemId(entry) && getDetailedListItemShow(entry),
      ) ?? [],
    [rawItems],
  );
  const report = useMutation(api.reports.create);
  const reorder = useMutation(api.listItems.reorder);
  const followList = useMutation(api.lists.follow).withOptimisticUpdate(
    (localStore) => {
      const current = localStore.getQuery(api.lists.get, { listId });
      if (current) {
        const optimistic = {
          ...current,
          viewerIsFollowing: true,
          followerCount: (current.followerCount ?? 0) + 1,
        };
        localStore.setQuery(api.lists.get, { listId }, optimistic);
        localStore.setPaginatedQuery(api.lists.listFollowedByUser, {}, (page) => {
          if (!page) return page;
          const rows = (page.page ?? page.results ?? []).filter(
            (item: any) => item._id !== listId,
          );
          return { ...page, page: [optimistic, ...rows], results: [optimistic, ...rows] };
        });
      }
    },
  );
  const unfollowList = useMutation(api.lists.unfollow).withOptimisticUpdate(
    (localStore) => {
      const current = localStore.getQuery(api.lists.get, { listId });
      if (current) {
        localStore.setQuery(api.lists.get, { listId }, {
          ...current,
          viewerIsFollowing: false,
          followerCount: Math.max(0, (current.followerCount ?? 1) - 1),
        });
      }
      localStore.setPaginatedQuery(api.lists.listFollowedByUser, {}, (page) => {
        if (!page) return page;
        const rows = (page.page ?? page.results ?? []).filter(
          (item: any) => item._id !== listId,
        );
        return { ...page, page: rows, results: rows };
      });
    },
  );
  const updateList = useMutation(api.lists.update).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.lists.get, { listId });
      if (current) {
        localStore.setQuery(api.lists.get, { listId }, {
          ...current,
          ...(args.title !== undefined ? { title: args.title } : null),
          ...(args.description !== undefined ? { description: args.description } : null),
          ...(args.isPublic !== undefined ? { isPublic: args.isPublic } : null),
        });
      }
    },
  );
  const deleteList = useMutation(api.lists.deleteList).withOptimisticUpdate(
    (localStore, args) => {
      const ownerId = localStore.getQuery(api.lists.get, { listId })?.ownerId;
      if (!ownerId) return;
      localStore.setPaginatedQuery(api.lists.listForUser, { userId: ownerId }, (page) => {
        if (!page) return page;
        const rows = (page.page ?? page.results ?? []).filter(
          (item: any) => item._id !== args.listId,
        );
        return { ...page, page: rows, results: rows };
      });
    },
  );
  const listCoverUrl =
    typeof list?.coverUrl === "string" && list.coverUrl.length > 0
      ? list.coverUrl
      : null;
  const legacyCoverStorageId =
    typeof list?.coverStorageId === "string" && list.coverStorageId.length > 0
      ? list.coverStorageId
      : null;
  const resolvedLegacyCoverUrl = useQuery(
    api.storage.getUrl,
    !listCoverUrl && legacyCoverStorageId ? { storageId: legacyCoverStorageId } : "skip",
  );
  const coverUrl = listCoverUrl ?? resolvedLegacyCoverUrl;
  const [orderedItems, setOrderedItems] = useState(items);
  const [showReport, setShowReport] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [followPending, setFollowPending] = useState(false);
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
          itemIds: nextOrder
            .map((entry: any) => getDetailedListItemId(entry))
            .filter((id: string | null): id is string => Boolean(id)),
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
    guardedPush(`/show/${showId}`);
  }, []);

  const handleToggleFollow = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Follow lists after signing in.");
      return;
    }
    if (followPending) {
      return;
    }
    setFollowPending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (list?.viewerIsFollowing) {
        await unfollowList({ listId });
      } else {
        await followList({ listId });
      }
    } catch (error) {
      Alert.alert("Something went wrong", String(error));
    } finally {
      setFollowPending(false);
    }
  }, [followList, followPending, isAuthenticated, list?.viewerIsFollowing, listId, unfollowList]);

  const openEdit = useCallback(() => {
    if (!list) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditTitle(list.title ?? "");
    setEditDescription(list.description ?? "");
    setEditIsPublic(Boolean(list.isPublic));
    setEditVisible(true);
  }, [list]);

  const handleSaveEdit = useCallback(async () => {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      Alert.alert("Missing title", "Give your list a name.");
      return;
    }
    setSavingEdit(true);
    try {
      await updateList({
        listId,
        title: trimmedTitle,
        description: editDescription.trim() || null,
        isPublic: editIsPublic,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditVisible(false);
    } catch (error) {
      Alert.alert("Could not save changes", getUserFacingApiErrorMessage(error) ?? String(error));
    } finally {
      setSavingEdit(false);
    }
  }, [editDescription, editIsPublic, editTitle, listId, updateList]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete list",
      `Are you sure you want to delete "${list?.title ?? "this list"}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setEditVisible(false);
              await deleteList({ listId });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/me/lists");
              }
            } catch (error) {
              Alert.alert("Could not delete list", String(error));
            }
          },
        },
      ],
    );
  }, [deleteList, list?.title, listId, router]);

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
        const fromIndex = prev.findIndex((entry) => getDetailedListItemId(entry) === activeId);
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
        key={getDetailedListItemId(item) ?? `${index}`}
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
        bounces={false}
        overScrollMode="never"
      >
        <View className="px-6 pb-10 pt-6">
          {list === null ? (
            <View className="mt-10">
              <EmptyState
                title="List unavailable"
                description="This list may be private or no longer exists."
              />
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace("/home");
                  }
                }}
                className="mt-4 self-center rounded-full border border-dark-border px-5 py-2.5 active:bg-dark-hover"
              >
                <Text className="text-sm font-semibold text-text-secondary">Go back</Text>
              </Pressable>
            </View>
          ) : list === undefined ? (
            <View className="mt-16 items-center">
              <ActivityIndicator color="#5A6070" />
            </View>
          ) : (
            <>
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-2xl font-semibold text-text-primary">
              {list.title}
            </Text>
            <View className="flex-row items-center gap-2">
              {list.isPublic ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    void sharePlotlistLink(`/list/${listId}`, `${list.title} on Plotlist`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Share list"
                  className="h-9 w-9 items-center justify-center rounded-full bg-dark-elevated active:bg-dark-hover"
                >
                  <Ionicons name="share-outline" size={16} color="#9BA1B0" />
                </Pressable>
              ) : null}
              {isOwner ? (
                <Pressable
                  onPress={openEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Edit list"
                  className="h-9 w-9 items-center justify-center rounded-full bg-dark-elevated active:bg-dark-hover"
                >
                  <Ionicons name="pencil" size={16} color="#9BA1B0" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {list.description ? (
            <Text className="mt-2 text-sm text-text-secondary">
              {list.description}
            </Text>
          ) : null}

          {/* ── Creator + meta ── */}
          {list.owner ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                guardedPush(`/profile/${list.owner._id}`);
              }}
              className="mt-4 flex-row items-center gap-3 self-start rounded-full py-1 pr-3 active:opacity-70"
            >
              <Avatar
                uri={list.owner.avatarUrl}
                label={list.ownerName ?? list.owner.username}
                size={32}
              />
              <View>
                <Text className="text-sm font-semibold text-text-primary">
                  {list.ownerName ?? "Unknown"}
                </Text>
                {list.owner.username ? (
                  <Text className="text-xs text-text-tertiary">@{list.owner.username}</Text>
                ) : null}
              </View>
            </Pressable>
          ) : null}

          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full bg-dark-elevated px-3 py-1.5">
              <Ionicons
                name={list.isPublic ? "globe-outline" : "lock-closed-outline"}
                size={12}
                color="#9BA1B0"
              />
              <Text className="text-xs font-semibold text-text-secondary">
                {list.isPublic ? "Public" : "Private"}
              </Text>
            </View>
            <View className="rounded-full bg-dark-elevated px-3 py-1.5">
              <Text className="text-xs font-semibold text-text-secondary">
                {orderedItems.length} {orderedItems.length === 1 ? "show" : "shows"}
              </Text>
            </View>
            {list.isPublic ? (
              <View className="rounded-full bg-dark-elevated px-3 py-1.5">
                <Text className="text-xs font-semibold text-text-secondary">
                  {list.followerCount ?? 0}{" "}
                  {(list.followerCount ?? 0) === 1 ? "follower" : "followers"}
                </Text>
              </View>
            ) : null}
          </View>

          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={{ width: "100%", height: 180, borderRadius: 16, marginTop: 16 }}
              contentFit="cover"
            />
          ) : null}

          {/* ── Like (public lists only; private links dead-end for others) ── */}
          {list.isPublic ? (
            <View className="mt-4 flex-row items-center">
              <LikeButton targetType="list" targetId={listId} />
            </View>
          ) : null}

          {!isOwner && list.isPublic ? (
            <View className="mt-4 flex-row items-center gap-2">
              <Pressable
                onPress={handleToggleFollow}
                disabled={followPending}
                accessibilityRole="button"
                accessibilityLabel={list.viewerIsFollowing ? "Unfollow list" : "Follow list"}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-full px-5 py-2.5 ${
                  list.viewerIsFollowing
                    ? "border border-dark-border bg-dark-card active:bg-dark-hover"
                    : "bg-brand-500 active:bg-brand-600"
                }`}
              >
                <Ionicons
                  name={list.viewerIsFollowing ? "checkmark" : "bookmark-outline"}
                  size={15}
                  color={list.viewerIsFollowing ? "#9BA1B0" : "#fff"}
                />
                <Text
                  className={`text-sm font-semibold ${
                    list.viewerIsFollowing ? "text-text-secondary" : "text-white"
                  }`}
                >
                  {list.viewerIsFollowing ? "Following" : "Follow list"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowReport(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Report list"
                className="h-10 w-10 items-center justify-center rounded-full border border-dark-border bg-dark-card active:bg-dark-hover"
              >
                <Ionicons name="flag-outline" size={16} color="#9BA1B0" />
              </Pressable>
            </View>
          ) : !isOwner ? (
            <View className="mt-4">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowReport(true);
                }}
                className="self-start rounded-full border border-dark-border bg-dark-card px-4 py-2"
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

          <View className="mt-8">
            <CommentsPreview targetType="list" targetId={listId} />
          </View>
            </>
          )}
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

      {/* ── Edit sheet (owner) ── */}
      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end bg-black/50"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setEditVisible(false);
            }}
            className="absolute inset-0"
          />
          <View
            className="rounded-t-3xl border border-dark-border bg-dark-card px-4 pt-4"
            style={{ paddingBottom: insets.bottom + 24 }}
          >
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-dark-border" />
            </View>
            <Text className="mb-4 px-2 text-lg font-semibold text-text-primary">
              Edit list
            </Text>
            <ListForm
              title={editTitle}
              description={editDescription}
              isPublic={editIsPublic}
              saving={savingEdit}
              submitLabel="Save"
              savingLabel="Saving..."
              onChangeTitle={setEditTitle}
              onChangeDescription={setEditDescription}
              onToggleVisibility={() => setEditIsPublic((prev) => !prev)}
              onSubmit={handleSaveEdit}
            />
            <Pressable
              onPress={handleDelete}
              className="mt-4 items-center rounded-xl border border-red-500/30 bg-red-500/10 py-3.5 active:bg-red-500/20"
            >
              <Text className="text-sm font-semibold text-red-400">Delete list</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
