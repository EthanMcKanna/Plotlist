import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { FlashList } from "../../components/FlashList";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "../../lib/plotlist/react";
import { useRouter } from "expo-router";

import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SectionHeader } from "../../components/SectionHeader";
import { SearchResultRow } from "../../components/SearchResultRow";
import { OnboardingHeader } from "../../components/OnboardingHeader";
import { api } from "../../lib/plotlist/api";

const STARTER_THEMES = [
  "slow-burn sci-fi",
  "comfort comedy",
  "dark crime",
  "smart funny mystery",
  "prestige drama",
  "workplace thriller",
  "good with parents",
  "mind-bending",
];

type SelectedShow = {
  showId: string;
  title: string;
  year?: number;
  posterUrl?: string;
};

type ListItem =
  | { type: "section"; title: string }
  | { type: "local"; item: any }
  | { type: "catalog"; item: any }
  | { type: "empty"; title: string; description?: string }
  | { type: "loading"; label: string };

export default function OnboardingShows() {
  const router = useRouter();
  const searchCatalog = useAction(api.shows.searchCatalog);
  const ingestFromCatalog = useAction(api.shows.ingestFromCatalog);
  const saveViewerTastePreferences = useAction(api.embeddings.saveViewerTastePreferences);
  const setOnboardingStep = useMutation(api.users.setOnboardingStep);
  const trending = useQuery(api.trending.shows, { windowHours: 96, limit: 10 }) ?? [];
  const savedPreferences = useQuery(api.embeddings.getViewerTastePreferences, {}) ?? {
    favoriteShowIds: [],
    favoriteThemes: [],
  };

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<any[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [selectedShows, setSelectedShows] = useState<SelectedShow[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [customTheme, setCustomTheme] = useState("");
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const trimmedQuery = query.trim();
  const localResults =
    useQuery(
      api.shows.search,
      trimmedQuery.length > 0 ? { text: trimmedQuery, limit: 10 } : "skip",
    ) ?? [];

  useEffect(() => {
    if (selectedThemes.length === 0 && savedPreferences.favoriteThemes.length > 0) {
      setSelectedThemes(savedPreferences.favoriteThemes);
    }
  }, [savedPreferences.favoriteThemes, selectedThemes.length]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, 300);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  useEffect(() => {
    let active = true;

    if (debouncedQuery.length < 3) {
      setCatalogResults([]);
      setIsSearchingCatalog(false);
      return;
    }

    setIsSearchingCatalog(true);
    searchCatalog({ text: debouncedQuery })
      .then((results) => {
        if (!active) return;
        setCatalogResults(results);
      })
      .catch(() => {
        if (!active) return;
        setCatalogResults([]);
      })
      .finally(() => {
        if (!active) return;
        setIsSearchingCatalog(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, searchCatalog]);

  const selectedShowIds = useMemo(
    () => new Set(selectedShows.map((show) => show.showId)),
    [selectedShows],
  );

  const isPending = useCallback(
    (key: string) => pendingKeys.includes(key),
    [pendingKeys],
  );

  const markPending = useCallback((key: string) => {
    setPendingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const clearPending = useCallback((key: string) => {
    setPendingKeys((prev) => prev.filter((item) => item !== key));
  }, []);

  const toggleTheme = useCallback((theme: string) => {
    setSelectedThemes((prev) =>
      prev.includes(theme)
        ? prev.filter((item) => item !== theme)
        : [...prev, theme].slice(0, 5),
    );
  }, []);

  const addSelectedShow = useCallback((show: SelectedShow) => {
    setSelectedShows((prev) => {
      if (prev.some((item) => item.showId === show.showId)) {
        return prev;
      }
      return [...prev, show].slice(0, 5);
    });
  }, []);

  const removeSelectedShow = useCallback((showId: string) => {
    setSelectedShows((prev) => prev.filter((show) => show.showId !== showId));
  }, []);

  const handleSelectLocal = useCallback(
    async (show: any) => {
      if (selectedShowIds.has(String(show._id))) {
        removeSelectedShow(String(show._id));
        return;
      }
      addSelectedShow({
        showId: String(show._id),
        title: show.title,
        year: show.year,
        posterUrl: show.posterUrl,
      });
    },
    [addSelectedShow, removeSelectedShow, selectedShowIds],
  );

  const handleSelectCatalog = useCallback(
    async (item: any) => {
      const key = `${item.externalSource}:${item.externalId}`;
      if (isPending(key)) return;

      const existingSelected = selectedShows.find(
        (show) => show.title === item.title && show.year === item.year,
      );
      if (existingSelected) {
        removeSelectedShow(existingSelected.showId);
        return;
      }

      markPending(key);
      try {
        const showId = await ingestFromCatalog({
          externalSource: item.externalSource,
          externalId: item.externalId,
          title: item.title,
          year: item.year,
          overview: item.overview,
          posterUrl: item.posterUrl,
        });
        addSelectedShow({
          showId: String(showId),
          title: item.title,
          year: item.year,
          posterUrl: item.posterUrl,
        });
      } catch (error) {
        Alert.alert("Could not add show", String(error));
      } finally {
        clearPending(key);
      }
    },
    [
      addSelectedShow,
      clearPending,
      ingestFromCatalog,
      isPending,
      markPending,
      removeSelectedShow,
      selectedShows,
    ],
  );

  const handleAddCustomTheme = useCallback(() => {
    const nextTheme = customTheme.trim().toLowerCase();
    if (!nextTheme) return;
    if (selectedThemes.includes(nextTheme)) {
      setCustomTheme("");
      return;
    }
    setSelectedThemes((prev) => [...prev, nextTheme].slice(0, 5));
    setCustomTheme("");
  }, [customTheme, selectedThemes]);

  const canFinish =
    selectedShows.length >= 3 || (selectedShows.length >= 2 && selectedThemes.length >= 1);

  const handleFinish = useCallback(async () => {
    if (!canFinish) {
      Alert.alert(
        "Pick a little more",
        "Choose 3 favorites, or pick 2 favorites and at least 1 theme.",
      );
      return;
    }

    setIsSaving(true);
    try {
      await saveViewerTastePreferences({
        favoriteShowIds: selectedShows.map((show) => show.showId as any),
        favoriteThemes: selectedThemes,
      });
      await setOnboardingStep({ step: "complete" });
      router.replace("/home");
    } catch (error) {
      Alert.alert("Could not save your taste", String(error));
    } finally {
      setIsSaving(false);
    }
  }, [canFinish, router, saveViewerTastePreferences, selectedShows, selectedThemes, setOnboardingStep]);

  const handleSkip = useCallback(async () => {
    await setOnboardingStep({ step: "complete" });
    router.replace("/home");
  }, [router, setOnboardingStep]);

  const data: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];

    if (trimmedQuery.length > 0) {
      items.push({ type: "section", title: "Already on Plotlist" });
      if (localResults.length > 0) {
        localResults.forEach((item: any) => items.push({ type: "local", item }));
      } else {
        items.push({
          type: "empty",
          title: "No local matches yet",
          description: "Try another title or look in the wider catalog.",
        });
      }

      items.push({ type: "section", title: "From the wider catalog" });
      if (catalogResults.length > 0) {
        catalogResults.forEach((item: any) => items.push({ type: "catalog", item }));
      } else if (isSearchingCatalog) {
        items.push({ type: "loading", label: "Searching the full catalog..." });
      } else if (debouncedQuery.length >= 3) {
        items.push({
          type: "empty",
          title: "No matches",
          description: "Try another title or a broader phrase.",
        });
      }
    } else {
      items.push({
        type: "empty",
        title: "Search for favorites",
        description: "Pick 3 to 5 shows so Plotlist can personalize your feed immediately.",
      });
    }

    return items;
  }, [
    catalogResults,
    debouncedQuery.length,
    isSearchingCatalog,
    localResults,
    trimmedQuery.length,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      switch (item.type) {
        case "section":
          return (
            <View className="px-6 pt-6">
              <Text className="text-sm font-semibold text-text-primary">
                {item.title}
              </Text>
            </View>
          );
        case "local": {
          const isSelected = selectedShowIds.has(String(item.item._id));
          return (
            <View className="px-6 pt-3">
              <SearchResultRow
                title={item.item.title}
                year={item.item.year}
                overview={item.item.overview}
                posterUrl={item.item.posterUrl}
                actionLabel={isSelected ? "Selected favorite" : "Add as favorite"}
                onPress={() => handleSelectLocal(item.item)}
              />
            </View>
          );
        }
        case "catalog": {
          const existingSelected = selectedShows.some(
            (show) => show.title === item.item.title && show.year === item.item.year,
          );
          return (
            <View className="px-6 pt-3">
              <SearchResultRow
                title={item.item.title}
                year={item.item.year}
                overview={item.item.overview}
                posterUrl={item.item.posterUrl}
                actionLabel={existingSelected ? "Selected favorite" : item.item.matchLabel ?? "Add as favorite"}
                onPress={() => handleSelectCatalog(item.item)}
              />
            </View>
          );
        }
        case "loading":
          return (
            <View className="px-6 pt-4">
              <Text className="text-sm text-text-tertiary">{item.label}</Text>
            </View>
          );
        case "empty":
          return (
            <View className="px-6 pt-4">
              <EmptyState title={item.title} description={item.description} />
            </View>
          );
        default:
          return null;
      }
    },
    [handleSelectCatalog, handleSelectLocal, selectedShowIds, selectedShows],
  );

  return (
    <Screen>
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item: ListItem, index: number) => `${item.type}-${index}`}
        estimatedItemSize={120}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            <OnboardingHeader
              step={3}
              totalSteps={3}
              title="Teach Plotlist your taste"
              description="Pick 3 to 5 favorite shows and a few themes so your Home feed starts strong."
              onSkip={handleSkip}
            />

            <View className="px-6 pt-6">
              <View className="rounded-3xl border border-dark-border bg-dark-card p-4">
                <Text className="text-sm font-semibold text-text-primary">
                  Favorite seeds
                </Text>
                <Text className="mt-1 text-sm text-text-tertiary">
                  {selectedShows.length}/5 selected. Choose at least 3, or pick 2 shows and 1 theme.
                </Text>
                {selectedShows.length > 0 ? (
                  <View className="mt-4 gap-2">
                    {selectedShows.map((show) => (
                      <View
                        key={show.showId}
                        className="flex-row items-center justify-between rounded-2xl border border-dark-border bg-dark-elevated px-3 py-3"
                      >
                        <View className="flex-1 pr-3">
                          <Text className="text-sm font-semibold text-text-primary">
                            {show.title}
                          </Text>
                          {show.year ? (
                            <Text className="mt-1 text-xs text-text-tertiary">
                              {show.year}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable onPress={() => removeSelectedShow(show.showId)}>
                          <Ionicons name="close-circle" size={20} color="#94a3b8" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>

            <View className="px-6 pt-6">
              <Text className="text-sm font-semibold text-text-primary">
                Themes and vibes
              </Text>
              <Text className="mt-1 text-sm text-text-tertiary">
                Choose a few shortcuts for the kinds of shows you want more of.
              </Text>
              <View className="mt-4 flex-row flex-wrap gap-2">
                {STARTER_THEMES.map((theme) => {
                  const isSelected = selectedThemes.includes(theme);
                  return (
                    <Pressable
                      key={theme}
                      onPress={() => toggleTheme(theme)}
                      className={`rounded-full px-3 py-2 ${
                        isSelected ? "bg-brand-500" : "border border-dark-border bg-dark-card"
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${isSelected ? "text-white" : "text-text-secondary"}`}>
                        {theme}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 flex-row items-center gap-3">
                <TextInput
                  value={customTheme}
                  onChangeText={setCustomTheme}
                  placeholder="Add your own theme"
                  className="flex-1 rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-[16px] text-text-primary"
                  placeholderTextColor="#5A6070"
                  onSubmitEditing={handleAddCustomTheme}
                />
                <Pressable
                  onPress={handleAddCustomTheme}
                  className="rounded-2xl bg-dark-elevated px-4 py-3"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-text-primary">
                    Add
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="px-6 pt-6">
              <Text className="text-sm font-semibold text-text-primary">
                Search for favorites
              </Text>
              <View className="mt-3">
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by title or describe what you like"
                  className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-[16px] text-text-primary"
                  placeholderTextColor="#5A6070"
                />
              </View>
            </View>

            {trending.length > 0 ? (
              <View className="px-6 pt-6">
                <SectionHeader title="Easy starters" />
                <View className="mt-4 gap-3">
                  {trending.map((item: any) => {
                    const show = item.show;
                    if (!show) return null;
                    const isSelected = selectedShowIds.has(String(show._id));
                    return (
                      <SearchResultRow
                        key={String(show._id)}
                        title={show.title}
                        year={show.year}
                        overview={show.overview}
                        posterUrl={show.posterUrl}
                        actionLabel={isSelected ? "Selected favorite" : "Add as favorite"}
                        onPress={() => handleSelectLocal(show)}
                      />
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        }
        ListFooterComponent={
          <View className="px-6 pt-8">
            <PrimaryButton
              label="Finish taste setup"
              onPress={handleFinish}
              loading={isSaving}
              disabled={!canFinish}
            />
          </View>
        }
      />
    </Screen>
  );
}
