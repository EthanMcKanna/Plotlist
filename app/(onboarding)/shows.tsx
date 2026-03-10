import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";

import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SectionHeader } from "../../components/SectionHeader";
import { SearchResultRow } from "../../components/SearchResultRow";
import { OnboardingHeader } from "../../components/OnboardingHeader";
import { api } from "../../convex/_generated/api";

type ListItem =
  | { type: "section"; title: string }
  | { type: "local"; item: any }
  | { type: "catalog"; item: any }
  | { type: "empty"; title: string; description?: string }
  | { type: "loading"; label: string };

export default function OnboardingShows() {
  const router = useRouter();
  const setOnboardingStep = useMutation(api.users.setOnboardingStep);
  const setStatus = useMutation(api.watchStates.setStatus);
  const trending = useQuery(api.trending.shows, { windowHours: 96, limit: 10 }) ?? [];
  const searchCatalog = useAction(api.shows.searchCatalog);
  const ingestFromCatalog = useAction(api.shows.ingestFromCatalog);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<any[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [addedShowIds, setAddedShowIds] = useState<string[]>([]);
  const [addedCatalogKeys, setAddedCatalogKeys] = useState<string[]>([]);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);

  const trimmedQuery = query.trim();
  const localResults =
    useQuery(
      api.shows.search,
      trimmedQuery.length > 0 ? { text: trimmedQuery, limit: 10 } : "skip",
    ) ?? [];

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

  const listContentStyle = useMemo(
    () => ({ paddingBottom: 40 }),
    [],
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

  const markAddedShow = useCallback((showId: string) => {
    setAddedShowIds((prev) => (prev.includes(showId) ? prev : [...prev, showId]));
  }, []);

  const markAddedCatalog = useCallback((key: string) => {
    setAddedCatalogKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const handleAddLocal = useCallback(
    async (show: any) => {
      const key = String(show._id);
      if (isPending(key)) return;

      if (addedShowIds.includes(key)) {
        router.push(`/show/${show._id}`);
        return;
      }

      markPending(key);
      try {
        await setStatus({ showId: show._id, status: "watchlist" });
        markAddedShow(key);
      } catch (error) {
        Alert.alert("Could not add show", String(error));
      } finally {
        clearPending(key);
      }
    },
    [
      addedShowIds,
      clearPending,
      isPending,
      markAddedShow,
      markPending,
      router,
      setStatus,
    ],
  );

  const handleAddCatalog = useCallback(
    async (item: any) => {
      const key = `${item.externalSource}:${item.externalId}`;
      if (isPending(key)) return;

      if (addedCatalogKeys.includes(key)) {
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
        await setStatus({ showId, status: "watchlist" });
        markAddedShow(String(showId));
        markAddedCatalog(key);
      } catch (error) {
        Alert.alert("Could not add show", String(error));
      } finally {
        clearPending(key);
      }
    },
    [
      addedCatalogKeys,
      clearPending,
      ingestFromCatalog,
      isPending,
      markAddedCatalog,
      markAddedShow,
      markPending,
      setStatus,
    ],
  );

  const handleFinish = async () => {
    await setOnboardingStep({ step: "complete" });
    router.replace("/home");
  };

  const handleSkip = async () => {
    await setOnboardingStep({ step: "complete" });
    router.replace("/home");
  };

  const data: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];

    if (trimmedQuery.length > 0) {
      items.push({ type: "section", title: "In your catalog" });
      if (localResults.length > 0) {
        localResults.forEach((item: any) => items.push({ type: "local", item }));
      } else {
        items.push({
          type: "empty",
          title: "No local matches yet",
          description: "Try searching a different title.",
        });
      }

      items.push({ type: "section", title: "From the wider catalog" });
      if (catalogResults.length > 0) {
        catalogResults.forEach((item: any) => items.push({ type: "catalog", item }));
      } else if (isSearchingCatalog) {
        items.push({ type: "loading", label: "Searching the catalog..." });
      } else if (debouncedQuery.length >= 3) {
        items.push({
          type: "empty",
          title: "No external matches",
          description: "Try another search or check your spelling.",
        });
      }
    } else {
      items.push({
        type: "empty",
        title: "Search for a show",
        description: "Type a title to add it to your watchlist.",
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
          const isAdded = addedShowIds.includes(String(item.item._id));
          return (
            <View className="px-6 pt-3">
              <SearchResultRow
                title={item.item.title}
                year={item.item.year}
                overview={item.item.overview}
                posterUrl={item.item.posterUrl}
                actionLabel={isAdded ? "Added" : "Add to watchlist"}
                onPress={() => handleAddLocal(item.item)}
              />
            </View>
          );
        }
        case "catalog": {
          const key = `${item.item.externalSource}:${item.item.externalId}`;
          const isAdded = addedCatalogKeys.includes(key);
          return (
            <View className="px-6 pt-3">
              <SearchResultRow
                title={item.item.title}
                year={item.item.year}
                overview={item.item.overview}
                posterUrl={item.item.posterUrl}
                actionLabel={isAdded ? "Added" : "Add to watchlist"}
                onPress={() => handleAddCatalog(item.item)}
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
    [addedCatalogKeys, addedShowIds, handleAddCatalog, handleAddLocal],
  );

  return (
    <Screen>
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item: ListItem, index: number) => `${item.type}-${index}`}
        estimatedItemSize={120}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={
          <>
            <OnboardingHeader
              step={3}
              totalSteps={3}
              title="Add your first show"
              description="Build your watchlist and get tailored recommendations."
              onSkip={handleSkip}
            />
            <View className="px-6 pt-6">
              <Text className="text-sm font-semibold text-text-primary">
                Search for a show
              </Text>
              <View className="mt-3">
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by title"
                  className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-[16px] text-text-primary"
                  placeholderTextColor="#5A6070"
                />
              </View>
            </View>
            {trending.length > 0 ? (
              <View className="px-6 pt-6">
                <SectionHeader title="Trending now" />
                <View className="mt-4 gap-3">
                  {trending.map((item: any) => {
                    const show = item.show;
                    if (!show) return null;
                    const isAdded = addedShowIds.includes(String(show._id));
                    return (
                      <SearchResultRow
                        key={String(show._id)}
                        title={show.title}
                        year={show.year}
                        overview={show.overview}
                        posterUrl={show.posterUrl}
                        actionLabel={isAdded ? "Added" : "Add to watchlist"}
                        onPress={() => handleAddLocal(show)}
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
            <PrimaryButton label="Finish" onPress={handleFinish} />
          </View>
        }
      />
    </Screen>
  );
}
