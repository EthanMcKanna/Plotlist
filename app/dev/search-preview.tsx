import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { Screen } from "../../components/Screen";
import {
  SearchCommandCenter,
  type SearchMode,
} from "../../components/SearchCommandCenter";
import { SearchDiscoveryRail } from "../../components/SearchDiscoveryRail";
import { SearchResultRow } from "../../components/SearchResultRow";
import type { SearchDiscoverSection } from "../../lib/searchDiscover";

const previewSections: SearchDiscoverSection[] = [
  {
    key: "trending_day",
    category: "trending_day",
    label: "Trending Today",
    icon: "flame",
    items: [
      {
        externalSource: "tmdb",
        externalId: "preview-1",
        title: "The Agency",
        year: 2026,
        posterUrl: "https://image.tmdb.org/t/p/w342/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg",
      },
      {
        externalSource: "tmdb",
        externalId: "preview-2",
        title: "Severance",
        year: 2025,
        posterUrl: "https://image.tmdb.org/t/p/w342/lFf6LLrQjYldcZItzOkGmMMigP7.jpg",
      },
      {
        externalSource: "tmdb",
        externalId: "preview-3",
        title: "The Pitt",
        year: 2025,
        posterUrl: "https://image.tmdb.org/t/p/w342/aeD3J6S8fUV5uYlQez9C1N7hXcE.jpg",
      },
    ],
  },
  {
    key: "fresh_premieres",
    category: "fresh_premieres",
    label: "Fresh Premieres",
    icon: "sparkles",
    items: [
      {
        externalSource: "tmdb",
        externalId: "preview-4",
        title: "Pluribus",
        year: 2025,
        posterUrl: "https://image.tmdb.org/t/p/w342/7QMsOTMUswlwxJP0rTTZfmz2tX2.jpg",
      },
      {
        externalSource: "tmdb",
        externalId: "preview-5",
        title: "Alien: Earth",
        year: 2025,
        posterUrl: "https://image.tmdb.org/t/p/w342/2zaT2q8XgD8uKkLCtQpq5BmBb7x.jpg",
      },
      {
        externalSource: "tmdb",
        externalId: "preview-6",
        title: "Long Bright River",
        year: 2025,
        posterUrl: "https://image.tmdb.org/t/p/w342/z87YtUoFaGf0U4mNQKMjH6iCx6F.jpg",
      },
    ],
  },
];

const previewResults = [
  {
    title: "The Last of Us",
    year: 2025,
    overview:
      "A grounded, character-first survival drama with high-intensity stakes.",
    posterUrl: "https://image.tmdb.org/t/p/w342/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg",
  },
  {
    title: "The Bear",
    year: 2026,
    overview:
      "Precision, pressure, and family chaos inside a restaurant trying to become something better.",
    posterUrl: "https://image.tmdb.org/t/p/w342/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg",
  },
];

export default function SearchPreviewScreen() {
  const params = useLocalSearchParams();
  const initialQuery = typeof params.q === "string" ? params.q : "";
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<SearchMode>("shows");
  const [query, setQuery] = useState(initialQuery);
  const [isFocused, setIsFocused] = useState(false);
  const showResults = mode === "shows" && query.trim().length >= 3;

  return (
    <Screen scroll keyboardShouldPersistTaps="always">
      <View style={{ paddingBottom: 80 }}>
        <View className="px-5 pt-2">
          <SearchCommandCenter
            mode={mode}
            query={query}
            inputRef={inputRef}
            isFocused={isFocused}
            onModeChange={(nextMode) => {
              setMode(nextMode);
              setQuery("");
            }}
            onQueryChange={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onClear={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          />
        </View>

        {showResults ? (
          <View className="mt-4 px-5">
            <Text className="text-xs font-bold uppercase text-text-tertiary">
              Best Matches
            </Text>
            <View className="mt-2">
              {previewResults.map((item) => (
                <SearchResultRow
                  key={item.title}
                  title={item.title}
                  year={item.year}
                  overview={item.overview}
                  posterUrl={item.posterUrl}
                  actionLabel="Add to Plotlist"
                  onPress={() => undefined}
                />
              ))}
            </View>
          </View>
        ) : (
          previewSections.map((section, index) => (
            <SearchDiscoveryRail
              key={section.key}
              index={index + 1}
              section={section}
              accent={index === 0 ? "#F59E0B" : "#38BDF8"}
              onPressItem={() => undefined}
            />
          ))
        )}
      </View>
    </Screen>
  );
}
