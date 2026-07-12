import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Pressable,
  Text,
  UIManager,
  Platform,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionSheet, type ActionSheetOption } from "../../components/ActionSheet";
import { FanPreviewCard } from "../../components/FanPreviewCard";
import { ListForm } from "../../components/ListForm";
import { EmptyState } from "../../components/EmptyState";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import { useAuth, useMutation, usePaginatedQuery, useQuery } from "../../lib/plotlist/react";
import { guardedPush } from "../../lib/navigation";
import { getUserFacingApiErrorMessage } from "../../lib/api/client";
import { SHOW_BACK_BUTTON, usePosterGridLayout, WEB_PAGE_MAX_WIDTH } from "../../lib/webLayout";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Match the genre explorer's card grid: two columns inside px-6 on phones,
// widening to more columns as the desktop web content column grows.
const LIST_CARD_HEIGHT = 200;

// Own lists lean brand-sky, private ones go quiet slate, followed lists get
// the people-green from the search scope actions.
const LIST_ACCENTS = {
  public: "#38BDF8",
  private: "#94A3B8",
  followed: "#34D399",
};

function formatListMeta(list: any) {
  const parts: string[] = [];
  const itemCount = typeof list.itemCount === "number" ? list.itemCount : null;
  if (itemCount !== null) {
    parts.push(`${itemCount} ${itemCount === 1 ? "show" : "shows"}`);
  }
  if (list.isPublic) {
    const followerCount = typeof list.followerCount === "number" ? list.followerCount : 0;
    if (followerCount > 0) {
      parts.push(`${followerCount} ${followerCount === 1 ? "follower" : "followers"}`);
    }
  } else {
    parts.push("Private");
  }
  return parts.join(" · ");
}

export default function ListsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { create } = useLocalSearchParams<{ create?: string }>();
  const canGoBack = router.canGoBack();
  const { isAuthenticated } = useAuth();
  const { itemWidth: listCardWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: 12,
    minColumns: 2,
    targetItemWidth: 280,
  });
  const me = useQuery(api.users.me);
  const meId = me?._id;
  const listArgs = isAuthenticated && meId ? { userId: meId } : "skip";
  const {
    results: lists,
    status,
    loadMore,
  } = usePaginatedQuery(api.lists.listForUser, listArgs, { initialNumItems: 20 });
  const {
    results: followedLists,
    status: followedStatus,
    loadMore: loadMoreFollowed,
  } = usePaginatedQuery(api.lists.listFollowedByUser, isAuthenticated ? {} : "skip", {
    initialNumItems: 20,
  });

  const createList = useMutation(api.lists.create).withOptimisticUpdate(
    (localStore, args) => {
      if (!meId) return;
      const now = Date.now();
      const optimisticDoc = {
        _id: `optimistic:list:${now}`,
        _creationTime: now,
        ownerId: meId,
        title: args.title,
        description: args.description ?? null,
        isPublic: args.isPublic ?? true,
        commentsEnabled: args.commentsEnabled ?? true,
        coverUrl: null,
        createdAt: now,
        updatedAt: now,
        itemCount: 0,
        followerCount: 0,
        viewerIsFollowing: false,
        isOwner: true,
        previewPosters: [],
      };
      localStore.setPaginatedQuery(api.lists.listForUser, { userId: meId }, (current) => {
        if (!current) return current;
        const page = current.page ?? current.results ?? [];
        return { ...current, page: [optimisticDoc, ...page], results: [optimisticDoc, ...page] };
      });
    },
  );
  const updateList = useMutation(api.lists.update).withOptimisticUpdate(
    (localStore, args) => {
      if (!meId) return;
      localStore.setPaginatedQuery(api.lists.listForUser, { userId: meId }, (current) => {
        if (!current) return current;
        const patch = (item: any) =>
          item._id === args.listId
            ? {
                ...item,
                ...(args.title !== undefined ? { title: args.title } : null),
                ...(args.description !== undefined ? { description: args.description } : null),
                ...(args.isPublic !== undefined ? { isPublic: args.isPublic } : null),
                ...(args.commentsEnabled !== undefined
                  ? { commentsEnabled: args.commentsEnabled }
                  : null),
                updatedAt: Date.now(),
              }
            : item;
        const page = (current.page ?? current.results ?? []).map(patch);
        return { ...current, page, results: page };
      });
    },
  );
  const deleteList = useMutation(api.lists.deleteList).withOptimisticUpdate(
    (localStore, args) => {
      if (!meId) return;
      localStore.setPaginatedQuery(api.lists.listForUser, { userId: meId }, (current) => {
        if (!current) return current;
        const page = (current.page ?? current.results ?? []).filter(
          (item: any) => item._id !== args.listId,
        );
        return { ...current, page, results: page };
      });
    },
  );
  const unfollowList = useMutation(api.lists.unfollow).withOptimisticUpdate(
    (localStore, args) => {
      localStore.setPaginatedQuery(api.lists.listFollowedByUser, {}, (current) => {
        if (!current) return current;
        const page = (current.page ?? current.results ?? []).filter(
          (item: any) => item._id !== args.listId,
        );
        return { ...current, page, results: page };
      });
    },
  );

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedList, setSelectedList] = useState<any | null>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [followedActionsList, setFollowedActionsList] = useState<any | null>(null);

  const [editingList, setEditingList] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editCommentsEnabled, setEditCommentsEnabled] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (create === "1") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowForm(true);
    }
  }, [create]);

  const toggleForm = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowForm((prev) => !prev);
    if (showForm) {
      setTitle("");
      setDescription("");
      Keyboard.dismiss();
    }
  };

  const handleCreate = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Create a list after signing in.");
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Missing title", "Give your list a name.");
      return;
    }
    setCreating(true);
    // Optimistic insert makes the list visible immediately; clear the form
    // right away so the screen feels instant even on slow connections.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTitle("");
    setDescription("");
    setShowForm(false);
    Keyboard.dismiss();
    try {
      await createList({
        title: trimmedTitle,
        description: description.trim() || undefined,
        isPublic,
        commentsEnabled,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Could not create list", getUserFacingApiErrorMessage(error) ?? String(error));
    } finally {
      setCreating(false);
    }
  }, [commentsEnabled, createList, description, isAuthenticated, isPublic, title]);

  const openEdit = useCallback((list: any) => {
    setEditingList(list);
    setEditTitle(list.title ?? "");
    setEditDescription(list.description ?? "");
    setEditIsPublic(Boolean(list.isPublic));
    setEditCommentsEnabled(list.commentsEnabled !== false);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingList) return;
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      Alert.alert("Missing title", "Give your list a name.");
      return;
    }
    setSavingEdit(true);
    try {
      await updateList({
        listId: editingList._id,
        title: trimmedTitle,
        description: editDescription.trim() || null,
        isPublic: editIsPublic,
        commentsEnabled: editCommentsEnabled,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingList(null);
    } catch (error) {
      Alert.alert("Could not save changes", getUserFacingApiErrorMessage(error) ?? String(error));
    } finally {
      setSavingEdit(false);
    }
  }, [editCommentsEnabled, editDescription, editIsPublic, editTitle, editingList, updateList]);

  const handleDelete = useCallback(
    (list: any) => {
      Alert.alert(
        "Delete list",
        `Are you sure you want to delete "${list.title}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              deleteList({ listId: list._id }).catch((error: unknown) => {
                Alert.alert("Could not delete list", String(error));
              });
            },
          },
        ],
      );
    },
    [deleteList],
  );

  const handleUnfollow = useCallback(
    (list: any) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      unfollowList({ listId: list._id }).catch((error: unknown) => {
        Alert.alert("Could not unfollow list", String(error));
      });
    },
    [unfollowList],
  );

  const openList = useCallback((list: any) => {
    if (typeof list._id !== "string" || list._id.startsWith("optimistic:")) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedPush(`/list/${list._id}`);
  }, []);

  const ownListActions: ActionSheetOption[] = useMemo(() => {
    if (!selectedList) return [];
    return [
      {
        label: "Edit list",
        icon: "pencil-outline",
        onPress: () => openEdit(selectedList),
      },
      {
        label: "Delete list",
        icon: "trash-outline",
        destructive: true,
        onPress: () => handleDelete(selectedList),
      },
    ];
  }, [handleDelete, openEdit, selectedList]);

  const followedListActions: ActionSheetOption[] = useMemo(() => {
    if (!followedActionsList) return [];
    const options: ActionSheetOption[] = [
      {
        label: "Unfollow list",
        icon: "bookmark-outline",
        destructive: true,
        onPress: () => handleUnfollow(followedActionsList),
      },
    ];
    if (followedActionsList.owner?._id) {
      options.unshift({
        label: "View creator",
        icon: "person-circle-outline",
        onPress: () => guardedPush(`/profile/${followedActionsList.owner._id}`),
      });
    }
    return options;
  }, [followedActionsList, handleUnfollow]);

  const renderOwnList = useCallback(
    (item: any) => (
      <FanPreviewCard
        key={item._id}
        title={item.title}
        accent={item.isPublic ? LIST_ACCENTS.public : LIST_ACCENTS.private}
        posters={Array.isArray(item.previewPosters) ? item.previewPosters : []}
        meta={formatListMeta(item)}
        cornerIcon={item.isPublic ? undefined : "lock-closed"}
        width={listCardWidth}
        height={LIST_CARD_HEIGHT}
        accessibilityLabel={`Open list ${item.title}`}
        onPress={() => openList(item)}
        onLongPress={() => {
          if (typeof item._id !== "string" || item._id.startsWith("optimistic:")) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setSelectedList(item);
          setActionsVisible(true);
        }}
      />
    ),
    [listCardWidth, openList],
  );

  const renderFollowedList = useCallback(
    (item: any) => (
      <FanPreviewCard
        key={item._id}
        title={item.title}
        accent={LIST_ACCENTS.followed}
        posters={Array.isArray(item.previewPosters) ? item.previewPosters : []}
        meta={[
          item.ownerName ? `by ${item.ownerName}` : null,
          formatListMeta(item) || null,
        ]
          .filter(Boolean)
          .join(" · ")}
        width={listCardWidth}
        height={LIST_CARD_HEIGHT}
        accessibilityLabel={`Open list ${item.title}${item.ownerName ? ` by ${item.ownerName}` : ""}`}
        onPress={() => openList(item)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setFollowedActionsList(item);
        }}
      />
    ),
    [listCardWidth, openList],
  );

  return (
    <Screen scroll webMaxWidth={WEB_PAGE_MAX_WIDTH}>
      <View className="px-6 pt-6 pb-8">
        {/* ── Header ── */}
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 flex-row items-center gap-3">
            {canGoBack && SHOW_BACK_BUTTON ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.back();
                }}
                className="h-10 w-10 items-center justify-center rounded-full bg-dark-elevated active:bg-dark-hover"
              >
                <Ionicons name="chevron-back" size={22} color="#E8EAED" />
              </Pressable>
            ) : null}
            <View className="flex-1">
              <Text className="text-2xl font-bold text-text-primary">Lists</Text>
              <Text className="mt-0.5 text-sm text-text-tertiary">
                Curate your favorite shows into shareable lists
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleForm();
            }}
            accessibilityRole="button"
            accessibilityLabel={showForm ? "Close create list form" : "Create a list"}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              showForm ? "bg-dark-elevated" : "bg-brand-500"
            }`}
            style={
              !showForm
                ? {
                    boxShadow: "0 0 8px rgba(14,165,233,0.3)",
                  }
                : undefined
            }
          >
            <Ionicons
              name={showForm ? "close" : "add"}
              size={22}
              color={showForm ? "#9BA1B0" : "#fff"}
            />
          </Pressable>
        </View>

        {/* ── Create form (collapsible) ── */}
        {showForm ? (
          <View className="mt-5 rounded-2xl border border-dark-border bg-dark-card p-4">
            <ListForm
              title={title}
              description={description}
              isPublic={isPublic}
              commentsEnabled={commentsEnabled}
              saving={creating}
              submitLabel="Create"
              savingLabel="Creating..."
              autoFocus
              onChangeTitle={setTitle}
              onChangeDescription={setDescription}
              onToggleVisibility={() => setIsPublic((prev) => !prev)}
              onToggleComments={() => setCommentsEnabled((prev) => !prev)}
              onSubmit={handleCreate}
            />
          </View>
        ) : null}

        {/* ── Your lists ── */}
        <View className="mt-6">
          <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-text-tertiary">
            Your Lists
          </Text>
          {lists.length > 0 ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {lists.map(renderOwnList)}
              </View>
              {status === "CanLoadMore" ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    loadMore(20);
                  }}
                  className="mt-3 self-center rounded-full border border-dark-border px-5 py-2.5 active:bg-dark-hover"
                >
                  <Text className="text-xs font-semibold text-text-secondary">
                    Load more
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : status === "LoadingFirstPage" && isAuthenticated ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {[0, 1, 2, 3].map((index) => (
                <View
                  key={index}
                  className="rounded-[20px] border border-dark-border bg-dark-card opacity-50"
                  style={{ height: LIST_CARD_HEIGHT, width: listCardWidth }}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              title="No lists yet"
              description="Tap + to create your first list and start curating shows."
            />
          )}
        </View>

        {/* ── Following ── */}
        {followedLists.length > 0 ? (
          <View className="mt-8">
            <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-text-tertiary">
              Following
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {followedLists.map(renderFollowedList)}
            </View>
            {followedStatus === "CanLoadMore" ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  loadMoreFollowed(20);
                }}
                className="mt-3 self-center rounded-full border border-dark-border px-5 py-2.5 active:bg-dark-hover"
              >
                <Text className="text-xs font-semibold text-text-secondary">
                  Load more
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ── Own list actions ── */}
      <ActionSheet
        visible={actionsVisible}
        onClose={() => setActionsVisible(false)}
        title={selectedList?.title}
        options={ownListActions}
      />

      {/* ── Followed list actions ── */}
      <ActionSheet
        visible={Boolean(followedActionsList)}
        onClose={() => setFollowedActionsList(null)}
        title={followedActionsList?.title}
        options={followedListActions}
      />

      {/* ── Edit sheet ── */}
      <Modal
        visible={Boolean(editingList)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingList(null)}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end bg-black/50"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              setEditingList(null);
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
