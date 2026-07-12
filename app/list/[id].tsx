import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { ActionSheet } from "../../components/ActionSheet";
import {
  CommentsSection,
  formatCommentCount,
  useCommentThread,
} from "../../components/Comments";
import { LikeButton } from "../../components/LikeButton";
import { Poster } from "../../components/Poster";
import { Avatar } from "../../components/Avatar";
import { ListForm } from "../../components/ListForm";
import { api } from "../../lib/plotlist/api";
import { guardedPush } from "../../lib/navigation";
import { usePosterGridLayout } from "../../lib/webLayout";
import { sharePlotlistLink } from "../../lib/share";
import { getUserFacingApiErrorMessage } from "../../lib/api/client";
import type { Id } from "../../lib/plotlist/types";
import { PageTitle } from "../../components/PageTitle";
import { ReportModal } from "../../components/ReportModal";

const GAP = 12;
const METADATA_HEIGHT = 54;
const CARD_SPRING = { damping: 24, stiffness: 180, mass: 0.95 };
// The page reads as a single centered column on desktop web; the drag grid
// gains columns as that column widens (3 on phones, unchanged natively).
const WEB_LIST_MAX_WIDTH = 920;

type DragGridMetrics = {
  numColumns: number;
  itemWidth: number;
  itemHeight: number;
};

function getGridPosition(index: number, grid: DragGridMetrics) {
  "worklet";
  return {
    x: (index % grid.numColumns) * (grid.itemWidth + GAP),
    y: Math.floor(index / grid.numColumns) * (grid.itemHeight + GAP),
  };
}

function getIndexFromPosition(
  x: number,
  y: number,
  itemCount: number,
  grid: DragGridMetrics,
) {
  "worklet";
  const col = Math.max(
    0,
    Math.min(
      grid.numColumns - 1,
      Math.floor((x + grid.itemWidth / 2) / (grid.itemWidth + GAP)),
    ),
  );
  const row = Math.max(
    0,
    Math.floor((y + grid.itemHeight / 2) / (grid.itemHeight + GAP)),
  );
  return Math.max(0, Math.min(itemCount - 1, row * grid.numColumns + col));
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
  grid,
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
  grid: DragGridMetrics;
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
  const target = getGridPosition(index, grid);
  const canDrag = isOwner && totalItems > 1;

  const animatedStyle = useAnimatedStyle(
    () => ({
      position: "absolute",
      width: grid.itemWidth,
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
    [isActive, target.x, target.y, grid.itemWidth],
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
        grid,
      );

      if (nextIndex !== activeIndex.value) {
        runOnJS(onDragMove)(nextIndex);
      }
    })
    .onEnd(() => {
      if (activeIndex.value < 0) {
        return;
      }
      const targetPosition = getGridPosition(activeIndex.value, grid);
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
            <Poster uri={show?.posterUrl} width={grid.itemWidth} />
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
          ...(args.commentsEnabled !== undefined
            ? { commentsEnabled: args.commentsEnabled }
            : null),
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
  // Older cached list docs predate the toggle; missing means on.
  const commentsEnabled = list ? list.commentsEnabled !== false : true;
  const commentThread = useCommentThread("list", listId, {
    skip: !list || !commentsEnabled,
  });
  const commentCountLabel = formatCommentCount(commentThread);
  const [orderedItems, setOrderedItems] = useState(items);
  const [showReport, setShowReport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editCommentsEnabled, setEditCommentsEnabled] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Y offset of the comments section inside the scroll content, captured on
  // layout so the action-bar comment button can jump straight to the thread.
  const commentsYRef = useRef(0);
  const posterGrid = usePosterGridLayout({
    maxWidth: WEB_LIST_MAX_WIDTH,
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });
  const grid = useMemo<DragGridMetrics>(
    () => ({
      numColumns: posterGrid.numColumns,
      itemWidth: posterGrid.itemWidth,
      itemHeight: posterGrid.itemWidth * 1.5 + METADATA_HEIGHT,
    }),
    [posterGrid.numColumns, posterGrid.itemWidth],
  );
  const gridHeight = useMemo(() => {
    if (orderedItems.length === 0) return 0;
    const rows = Math.ceil(orderedItems.length / grid.numColumns);
    return rows * grid.itemHeight + (rows - 1) * GAP;
  }, [orderedItems.length, grid]);
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
    setEditCommentsEnabled(list.commentsEnabled !== false);
    setEditVisible(true);
  }, [list]);

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
        commentsEnabled: editCommentsEnabled,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditVisible(false);
    } catch (error) {
      Alert.alert("Could not save changes", getUserFacingApiErrorMessage(error) ?? String(error));
    } finally {
      setSavingEdit(false);
    }
  }, [editCommentsEnabled, editDescription, editIsPublic, editTitle, listId, updateList]);

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
    const position = getGridPosition(index, grid);
    draggingIdRef.current = itemId;
    setDraggingId(itemId);
    activeIndex.value = index;
    dragOriginX.value = position.x;
    dragOriginY.value = position.y;
    activeX.value = position.x;
    activeY.value = position.y;
    activeScale.value = withSpring(1.02, CARD_SPRING);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeIndex, activeScale, activeX, activeY, dragOriginX, dragOriginY, grid]);

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
        grid={grid}
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
      grid,
      handleDragEnd,
      handleDragMove,
      handleDragStart,
      handlePosterPress,
      isOwner,
      orderedItems.length,
    ],
  );

  return (
    <Screen webMaxWidth={WEB_LIST_MAX_WIDTH}>
      <PageTitle title={list?.title} />
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        // iOS: grow the bottom inset so the inline comment composer can sit
        // above the keyboard (Android resizes the window natively).
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
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
          {/* ── Hero cover ── */}
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={{ width: "100%", height: 170, borderRadius: 20 }}
              contentFit="cover"
            />
          ) : null}

          {/* ── Title ── */}
          <Text
            className={`text-[26px] font-bold leading-8 text-text-primary ${
              coverUrl ? "mt-4" : ""
            }`}
          >
            {list.title}
          </Text>

          {/* ── Byline ── */}
          {list.owner ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                guardedPush(`/profile/${list.owner._id}`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${list.ownerName ?? "creator"}'s profile`}
              className="mt-3 flex-row items-center gap-2.5 self-start active:opacity-70"
            >
              <Avatar
                uri={list.owner.avatarUrl}
                label={list.ownerName ?? list.owner.username}
                size={28}
              />
              <Text className="text-sm font-semibold text-text-primary" numberOfLines={1}>
                {list.ownerName ?? "Unknown"}
              </Text>
              {list.owner.username ? (
                <Text className="text-sm text-text-tertiary" numberOfLines={1}>
                  @{list.owner.username}
                </Text>
              ) : null}
            </Pressable>
          ) : null}

          {/* ── Meta line ── */}
          <View className="mt-2.5 flex-row items-center gap-1.5">
            <Ionicons
              name={list.isPublic ? "globe-outline" : "lock-closed-outline"}
              size={13}
              color="#5A6070"
            />
            <Text className="text-[13px] text-text-tertiary">
              {[
                list.isPublic ? "Public list" : "Private list",
                `${orderedItems.length} ${orderedItems.length === 1 ? "show" : "shows"}`,
                list.isPublic
                  ? `${list.followerCount ?? 0} ${
                      (list.followerCount ?? 0) === 1 ? "follower" : "followers"
                    }`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>

          {/* ── Description ── */}
          {list.description ? (
            <Text className="mt-3 text-sm leading-[21px] text-text-secondary">
              {list.description}
            </Text>
          ) : null}

          {/* ── Action bar: engagement on the left, primary action on the right ── */}
          <View className="mt-5 flex-row items-center border-y border-dark-border py-2">
            {list.isPublic ? (
              <LikeButton targetType="list" targetId={listId} />
            ) : null}
            {commentsEnabled ? (
              <Pressable
                onPress={handleScrollToComments}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="View comments"
                className={`flex-row items-center gap-1.5 py-1 pr-1 active:opacity-70 ${
                  list.isPublic ? "ml-4" : ""
                }`}
              >
                <Ionicons name="chatbubble-outline" size={22} color="#9BA1B0" />
                {commentCountLabel ? (
                  <Text className="text-[13px] font-semibold text-text-secondary">
                    {commentCountLabel}
                  </Text>
                ) : null}
              </Pressable>
            ) : null}
            {list.isPublic ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void sharePlotlistLink(`/list/${listId}`, `${list.title} on Plotlist`);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Share list"
                className="ml-4 py-1 pr-1 active:opacity-70"
              >
                <Ionicons name="share-outline" size={22} color="#9BA1B0" />
              </Pressable>
            ) : null}
            <View className="flex-1" />
            {isOwner ? (
              <Pressable
                onPress={openEdit}
                accessibilityRole="button"
                accessibilityLabel="Edit list"
                className="flex-row items-center gap-1.5 rounded-full border border-dark-border bg-dark-card px-4 py-2 active:bg-dark-hover"
              >
                <Ionicons name="pencil" size={13} color="#9BA1B0" />
                <Text className="text-[13px] font-semibold text-text-secondary">Edit</Text>
              </Pressable>
            ) : list.isPublic ? (
              <View className="flex-row items-center gap-1">
                <Pressable
                  onPress={handleToggleFollow}
                  disabled={followPending}
                  accessibilityRole="button"
                  accessibilityLabel={
                    list.viewerIsFollowing ? "Unfollow list" : "Follow list"
                  }
                  className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 ${
                    list.viewerIsFollowing
                      ? "border border-dark-border bg-dark-card active:bg-dark-hover"
                      : "bg-brand-500 active:bg-brand-600"
                  }`}
                >
                  <Ionicons
                    name={list.viewerIsFollowing ? "checkmark" : "bookmark-outline"}
                    size={14}
                    color={list.viewerIsFollowing ? "#9BA1B0" : "#fff"}
                  />
                  <Text
                    className={`text-[13px] font-semibold ${
                      list.viewerIsFollowing ? "text-text-secondary" : "text-white"
                    }`}
                  >
                    {list.viewerIsFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowMenu(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="List options"
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-dark-hover"
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color="#9BA1B0" />
                </Pressable>
              </View>
            ) : null}
          </View>

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

          <View
            className="mt-8"
            onLayout={(event) => {
              commentsYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <CommentsSection
              thread={commentThread}
              enabled={commentsEnabled}
              isOwner={isOwner}
              onComposerFocus={handleComposerFocus}
            />
          </View>
            </>
          )}
        </View>
      </ScrollView>
      {/* ── Overflow menu (non-owner) ── */}
      <ActionSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        title={list?.title ?? "List"}
        options={[
          {
            label: "Report list",
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
              commentsEnabled={editCommentsEnabled}
              saving={savingEdit}
              submitLabel="Save"
              savingLabel="Saving..."
              onChangeTitle={setEditTitle}
              onChangeDescription={setEditDescription}
              onToggleVisibility={() => setEditIsPublic((prev) => !prev)}
              onToggleComments={() => setEditCommentsEnabled((prev) => !prev)}
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
