import { useCallback, useState } from "react";
import {
  Alert,
  Keyboard,
  LayoutAnimation,
  Pressable,
  Text,
  TextInput,
  UIManager,
  Platform,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "../../components/FlashList";
import { useAuth, useMutation, usePaginatedQuery, useQuery } from "../../lib/plotlist/react";
import { useRouter } from "expo-router";

import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { api } from "../../lib/plotlist/api";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ListsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me);
  const {
    results: lists,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.lists.listForUser,
    isAuthenticated && me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 20 },
  );

  const createList = useMutation(api.lists.create);
  const deleteList = useMutation(api.lists.deleteList);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

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
    if (!title.trim()) {
      Alert.alert("Missing title", "Give your list a name.");
      return;
    }
    setCreating(true);
    try {
      await createList({
        title: title.trim(),
        description: description.trim() || undefined,
        isPublic,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTitle("");
      setDescription("");
      setShowForm(false);
      Keyboard.dismiss();
    } catch (error) {
      Alert.alert("Could not create list", String(error));
    } finally {
      setCreating(false);
    }
  }, [createList, description, isAuthenticated, isPublic, title]);

  const handleDelete = useCallback(
    (listId: string, listTitle: string) => {
      Alert.alert(
        "Delete list",
        `Are you sure you want to delete "${listTitle}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              deleteList({ listId: listId as any });
            },
          },
        ],
      );
    },
    [deleteList],
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/list/${item._id}`);
        }}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          handleDelete(item._id, item.title);
        }}
        className="flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card p-4 active:bg-dark-hover"
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-xl ${
            item.isPublic ? "bg-brand-500/15" : "bg-dark-elevated"
          }`}
        >
          <Ionicons
            name={item.isPublic ? "globe-outline" : "lock-closed-outline"}
            size={18}
            color={item.isPublic ? "#0ea5e9" : "#9BA1B0"}
          />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-text-primary">
            {item.title}
          </Text>
          {item.description ? (
            <Text className="mt-0.5 text-sm text-text-tertiary" numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#5A6070" />
      </Pressable>
    ),
    [handleDelete, router],
  );

  return (
    <Screen scroll>
      <View className="px-6 pt-6 pb-8">
        {/* ── Header ── */}
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-text-primary">Lists</Text>
            <Text className="mt-0.5 text-sm text-text-tertiary">
              Curate your favorite shows into shareable lists
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleForm();
            }}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              showForm ? "bg-dark-elevated" : "bg-brand-500"
            }`}
            style={
              !showForm
                ? {
                    shadowColor: "#0ea5e9",
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
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
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="List name"
              placeholderTextColor="#5A6070"
              autoFocus
              maxLength={60}
              className="rounded-xl border border-dark-border bg-dark-bg px-4 py-3 text-base text-text-primary"
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor="#5A6070"
              multiline
              maxLength={200}
              className="mt-3 min-h-[72px] rounded-xl border border-dark-border bg-dark-bg px-4 py-3 text-base text-text-primary"
              style={{ textAlignVertical: "top" }}
            />
            <View className="mt-4 flex-row items-center justify-between">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsPublic((prev) => !prev);
                }}
                className={`flex-row items-center gap-2 rounded-full border px-3.5 py-2 ${
                  isPublic
                    ? "border-green-600/40 bg-green-500/10"
                    : "border-dark-border bg-dark-bg"
                }`}
              >
                <Ionicons
                  name={isPublic ? "globe-outline" : "lock-closed-outline"}
                  size={14}
                  color={isPublic ? "#22C55E" : "#9BA1B0"}
                />
                <Text
                  className={`text-xs font-semibold ${
                    isPublic ? "text-green-500" : "text-text-secondary"
                  }`}
                >
                  {isPublic ? "Public" : "Private"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleCreate();
                }}
                disabled={!title.trim() || creating}
                className={`rounded-full px-5 py-2.5 ${
                  title.trim() && !creating
                    ? "bg-brand-500 active:bg-brand-600"
                    : "bg-dark-elevated"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    title.trim() && !creating ? "text-white" : "text-text-tertiary"
                  }`}
                >
                  {creating ? "Creating..." : "Create"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* spacer when form is hidden */}

        {/* ── Lists ── */}
        <View className="mt-6">
          {lists.length > 0 ? (
            <>
              <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Your Lists
              </Text>
              <FlashList
                data={lists}
                renderItem={renderItem}
                keyExtractor={(item: any) => item._id}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                estimatedItemSize={76}
                contentContainerStyle={{ paddingBottom: 16 }}
                scrollEnabled={false}
              />
              {status === "CanLoadMore" ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    loadMore(20);
                  }}
                  className="mt-2 self-center rounded-full border border-dark-border px-5 py-2.5 active:bg-dark-hover"
                >
                  <Text className="text-xs font-semibold text-text-secondary">
                    Load more
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No lists yet"
              description="Tap + to create your first list and start curating shows."
            />
          )}
        </View>
      </View>
    </Screen>
  );
}
