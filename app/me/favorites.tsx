import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "../../lib/plotlist/react";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { HorizontalRail } from "../../components/HorizontalRail";
import { Screen } from "../../components/Screen";
import { Poster } from "../../components/Poster";
import { api } from "../../lib/plotlist/api";
import { notifyError } from "../../lib/dialogs";
import type { Id } from "../../lib/plotlist/types";

const MAX_SHOWS = 4;
const ITEM_WIDTH = 96;

type ShowInfo = { _id: Id<"shows">; title: string; posterUrl: string | null };

function DraggableFavoriteShow({
  show,
  index,
  totalCount,
  onRemove,
  onDragEnd,
}: {
  show: ShowInfo;
  index: number;
  totalCount: number;
  onRemove: (id: Id<"shows">) => void;
  onDragEnd: (from: number, to: number) => void;
}) {
  const translateX = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const pan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.08);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const movedSlots = Math.round(e.translationX / ITEM_WIDTH);
      const toIndex = Math.max(0, Math.min(totalCount - 1, index + movedSlots));
      if (toIndex !== index) {
        runOnJS(onDragEnd)(index, toIndex);
      }
      translateX.value = withSpring(0);
      scale.value = withSpring(1);
      isDragging.value = false;
    })
    .onFinalize(() => {
      translateX.value = withSpring(0);
      scale.value = withSpring(1);
      isDragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    zIndex: isDragging.value ? 100 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        // marginRight lives in style, not className — NativeWind classes are
        // dropped from Reanimated components in release web builds.
        style={[animatedStyle, { marginRight: 16, paddingTop: 6, paddingRight: 6 }]}
      >
        <Pressable
          onPress={() => onRemove(show._id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${show.title} from favorites`}
          {...(Platform.OS === "web"
            ? { title: `Remove ${show.title} from favorites` }
            : null)}
        >
          <View>
            <Poster uri={show.posterUrl} width={80} alt={show.title} />
            <View
              className="absolute items-center justify-center rounded-full bg-status-danger"
              style={{ width: 24, height: 24, top: -6, right: -6 }}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </View>
          </View>
        </Pressable>
        <Text
          className="mt-1 w-[80px] text-[11px] font-medium text-text-secondary"
          numberOfLines={1}
        >
          {show.title}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

export default function FavoritesScreen() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);

  const [selectedShowIds, setSelectedShowIds] = useState<Id<"shows">[]>([]);
  const [searchText, setSearchText] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (me && !initialized) {
      setSelectedShowIds(me.favoriteShowIds ?? []);
      setInitialized(true);
    }
  }, [me, initialized]);

  const searchResults = useQuery(
    api.shows.search,
    searchText.length >= 2 ? { text: searchText, limit: 12 } : "skip",
  );

  const completedShows = useQuery(
    api.watchStates.listForUser,
    me ? { status: "completed", limit: 50 } : "skip",
  );

  const watchingShows = useQuery(
    api.watchStates.listForUser,
    me ? { status: "watching", limit: 50 } : "skip",
  );

  const watchedShowIds = useMemo(
    () => [
      ...(completedShows ?? []).map((s: { showId: Id<"shows"> }) => s.showId),
      ...(watchingShows ?? []).map((s: { showId: Id<"shows"> }) => s.showId),
    ],
    [completedShows, watchingShows],
  );

  const libraryShows = useQuery(
    api.users.getShowsById,
    watchedShowIds.length > 0 ? { showIds: watchedShowIds.slice(0, 30) } : "skip",
  );

  const selectedShowDetails = useQuery(
    api.users.getShowsById,
    selectedShowIds.length > 0 ? { showIds: selectedShowIds } : "skip",
  );

  const showsToDisplay = useMemo(() => {
    if (searchText.length >= 2 && searchResults) return searchResults;
    return libraryShows ?? [];
  }, [searchText, searchResults, libraryShows]);

  const showCacheRef = useRef(
    new Map<string, { _id: Id<"shows">; title: string; posterUrl: string | null }>(),
  );

  if (selectedShowDetails) {
    for (const show of selectedShowDetails) {
      showCacheRef.current.set(String(show._id), show);
    }
  }
  for (const show of showsToDisplay) {
    showCacheRef.current.set(String(show._id), show as any);
  }

  const selectedShowsForDisplay = useMemo(() => {
    return selectedShowIds
      .map((id) => showCacheRef.current.get(String(id)))
      .filter(
        (s): s is { _id: Id<"shows">; title: string; posterUrl: string | null } =>
          !!s,
      );
    // Re-derive when query data or local IDs change
  }, [selectedShowIds, selectedShowDetails, showsToDisplay]);

  const selectedShowIdSet = useMemo(
    () => new Set(selectedShowIds.map(String)),
    [selectedShowIds],
  );

  const toggleShow = useCallback(
    (showId: Id<"shows">) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedShowIds((prev) => {
        if (prev.some((id) => String(id) === String(showId))) {
          return prev.filter((id) => String(id) !== String(showId));
        }
        if (prev.length >= MAX_SHOWS) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return prev;
        }
        return [...prev, showId];
      });
    },
    [],
  );

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setSelectedShowIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const isDirty = useMemo(() => {
    if (!me) return false;
    const origShows = (me.favoriteShowIds ?? []).map(String).join(",");
    const currShows = selectedShowIds.map(String).join(",");
    return origShows !== currShows;
  }, [me, selectedShowIds]);

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      await updateProfile({
        favoriteShowIds: selectedShowIds,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      notifyError("Could not save", String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View className="px-6 pt-6 pb-24">
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-text-primary">
              Edit Favorites
            </Text>
            <Text className="mt-1 text-sm text-text-tertiary">
              Show off what you love on your profile
            </Text>
          </View>
        </View>

        {/* ── Selected Shows ── */}
        <View className="mt-8">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-text-primary">
              Favorite Shows
            </Text>
            <Text className="text-xs text-text-tertiary">
              {selectedShowIds.length}/{MAX_SHOWS}
            </Text>
          </View>

          {selectedShowsForDisplay.length > 0 ? (
            <View style={{ paddingTop: 8, marginTop: -2 }}>
              <View className="mt-3 flex-row">
                {selectedShowsForDisplay.map((show, i) => (
                  <DraggableFavoriteShow
                    key={show._id}
                    show={show}
                    index={i}
                    totalCount={selectedShowsForDisplay.length}
                    onRemove={toggleShow}
                    onDragEnd={handleReorder}
                  />
                ))}
              </View>
              {selectedShowsForDisplay.length > 1 ? (
                <Text className="mt-2 text-[10px] text-text-tertiary">
                  Hold and drag to reorder
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="mt-3 items-center rounded-2xl border border-dashed border-dark-border py-6">
              <Text className="text-sm text-text-tertiary">
                Pick up to {MAX_SHOWS} shows below
              </Text>
            </View>
          )}
        </View>

        {/* ── Show Search ── */}
        <View className="mt-5">
          <View className="flex-row items-center gap-2 rounded-xl border border-dark-border bg-dark-card px-3 py-2.5">
            <Ionicons name="search" size={18} color="#5A6070" />
            <TextInput
              className="flex-1 text-[16px] text-text-primary"
              placeholder="Search shows..."
              placeholderTextColor="#5A6070"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchText.length > 0 ? (
              <Pressable onPress={() => setSearchText("")}>
                <Ionicons name="close-circle" size={18} color="#5A6070" />
              </Pressable>
            ) : null}
          </View>

          <View className="mt-3">
            <HorizontalRail accessibilityLabel="Shows to pick from">
            {showsToDisplay.map((show: any) => {
              const isSelected = selectedShowIdSet.has(String(show._id));
              return (
                <Pressable
                  key={show._id}
                  onPress={() => toggleShow(show._id)}
                  className="mr-3 active:opacity-80"
                >
                  <View className="relative">
                    <Poster uri={show.posterUrl} width={72} />
                    {isSelected ? (
                      <View className="absolute inset-0 items-center justify-center rounded-xl bg-brand-500/40">
                        <View className="h-7 w-7 items-center justify-center rounded-full bg-brand-500">
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </View>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    className="mt-1 w-[72px] text-[10px] text-text-tertiary"
                    numberOfLines={2}
                  >
                    {show.title}
                  </Text>
                </Pressable>
              );
            })}
            </HorizontalRail>
          </View>

          {searchText.length >= 2 && (!searchResults || searchResults.length === 0) ? (
            <Text className="mt-3 text-center text-xs text-text-tertiary">
              No shows found
            </Text>
          ) : null}

          {searchText.length < 2 && (!libraryShows || libraryShows.length === 0) ? (
            <Text className="mt-3 text-center text-xs text-text-tertiary">
              Mark shows as watching or completed to pick favorites
            </Text>
          ) : null}
        </View>

        {/* ── Save Button ── */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleSave();
          }}
          disabled={!isDirty || saving}
          className={`mt-10 items-center justify-center rounded-full py-3.5 ${
            isDirty ? "bg-brand-500 active:bg-brand-600" : "bg-dark-elevated"
          }`}
          style={
            isDirty
              ? {
                  boxShadow: "0 0 12px rgba(14,165,233,0.3)",
                }
              : undefined
          }
        >
          <Text
            className={`text-base font-semibold ${
              isDirty ? "text-white" : "text-text-tertiary"
            }`}
          >
            {saving ? "Saving..." : isDirty ? "Save Favorites" : "No changes"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
