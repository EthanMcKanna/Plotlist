import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { FlashList } from "../../components/FlashList";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPressable } from "../../components/NativeGlass";
import { PageTitle } from "../../components/PageTitle";
import { Poster } from "../../components/Poster";
import { guardedPush } from "../../lib/navigation";
import { api } from "../../lib/plotlist/api";
import { useAction } from "../../lib/plotlist/react";
import {
  SHOW_BACK_BUTTON,
  usePosterGridLayout,
  useWebPageStyle,
  WEB_PAGE_MAX_WIDTH,
} from "../../lib/webLayout";

const GAP = 12;
const BIO_PREVIEW_LINES = 5;

type PersonCredit = {
  showId: string | null;
  externalId: string;
  title: string;
  posterUrl: string | null;
  year: number | null;
  voteAverage: number | null;
  episodeCount: number;
  roles: string[];
};

type PersonDetails = {
  id: number;
  name: string;
  profilePath: string | null;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownForDepartment: string | null;
  castCredits: PersonCredit[];
  crewCredits: PersonCredit[];
};

function formatLifeline(person: PersonDetails): string | null {
  const parts: string[] = [];
  if (person.birthday) {
    const born = person.birthday.slice(0, 4);
    parts.push(person.deathday ? `${born}–${person.deathday.slice(0, 4)}` : `Born ${born}`);
  }
  if (person.placeOfBirth) {
    parts.push(person.placeOfBirth);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function GridSkeleton({
  numColumns,
  itemWidth,
}: {
  numColumns: number;
  itemWidth: number;
}) {
  return (
    <View className="flex-row flex-wrap px-6 pt-6">
      {Array.from({ length: 6 }, (_, index) => (
        <View
          key={index}
          style={{
            width: itemWidth,
            marginRight: index % numColumns === numColumns - 1 ? 0 : GAP,
            marginBottom: GAP + 8,
          }}
        >
          <View
            className="rounded-xl bg-dark-elevated"
            style={{ height: itemWidth * 1.5 }}
          />
          <View className="mt-2 h-3 w-4/5 rounded bg-dark-elevated" />
        </View>
      ))}
    </View>
  );
}

export default function PersonScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pageStyle = useWebPageStyle(WEB_PAGE_MAX_WIDTH);
  const { numColumns, itemWidth } = usePosterGridLayout({
    horizontalPadding: 48,
    gap: GAP,
    minColumns: 3,
    targetItemWidth: 150,
  });

  const personId = Number(typeof params.id === "string" ? params.id : "");
  // Passed along from the cast rail so the header paints before the fetch.
  const seedName = typeof params.name === "string" ? params.name : "";
  const seedProfilePath =
    typeof params.profilePath === "string" && params.profilePath.length > 0
      ? params.profilePath
      : null;

  const getPersonDetails = useAction(api.people.getDetails);
  const ingestShow = useAction(api.shows.ingestFromCatalog);

  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [section, setSection] = useState<"cast" | "crew" | null>(null);

  useEffect(() => {
    if (!Number.isFinite(personId) || personId <= 0) {
      setIsLoading(false);
      setLoadFailed(true);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setLoadFailed(false);
    setPerson(null);
    getPersonDetails({ personId })
      .then((result: any) => {
        if (cancelled) return;
        setPerson(result ?? null);
        setLoadFailed(!result);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getPersonDetails, personId]);

  const castCredits = person?.castCredits ?? [];
  const crewCredits = person?.crewCredits ?? [];
  // Default to whichever side of the filmography this person is known for.
  const activeSection =
    section ??
    (castCredits.length === 0
      ? "crew"
      : crewCredits.length === 0
        ? "cast"
        : person?.knownForDepartment && person.knownForDepartment !== "Acting"
          ? "crew"
          : "cast");
  const credits = activeSection === "crew" ? crewCredits : castCredits;

  const handleCreditPress = useCallback(
    async (credit: PersonCredit) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        if (credit.showId) {
          guardedPush({ pathname: "/show/[id]", params: { id: credit.showId } });
          return;
        }
        // Not in the local catalog yet — ingest from TMDB, then navigate.
        const nextShowId = await ingestShow({
          externalSource: "tmdb",
          externalId: credit.externalId,
          title: credit.title,
          posterUrl: credit.posterUrl ?? undefined,
        });
        guardedPush(`/show/${nextShowId}`);
      } catch (error) {
        console.error("Failed to open show from person page:", error);
        Alert.alert("Error", "Failed to load show details. Please try again.");
      }
    },
    [ingestShow],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: PersonCredit; index: number }) => {
      const isLastInRow = index % numColumns === numColumns - 1;
      const roleLine = item.roles.join(", ");
      const metaParts: string[] = [];
      if (item.year) metaParts.push(String(item.year));
      if (item.episodeCount > 0) {
        metaParts.push(`${item.episodeCount} ep${item.episodeCount === 1 ? "" : "s"}`);
      }
      return (
        <View
          style={{
            width: itemWidth,
            marginRight: isLastInRow ? 0 : GAP,
            marginBottom: GAP,
          }}
        >
          <Pressable
            onPress={() => handleCreditPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            className="active:opacity-80"
          >
            <Poster uri={item.posterUrl ?? undefined} width={itemWidth} />
            <Text
              className="mt-2 text-xs font-medium text-text-primary"
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {roleLine ? (
              <Text className="mt-0.5 text-xs text-brand-400" numberOfLines={1}>
                {roleLine}
              </Text>
            ) : null}
            {metaParts.length > 0 ? (
              <Text className="mt-0.5 text-xs text-text-tertiary" numberOfLines={1}>
                {metaParts.join(" · ")}
              </Text>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [handleCreditPress, itemWidth, numColumns],
  );

  const displayName = person?.name || seedName || "Person";
  const displayProfilePath = person?.profilePath ?? seedProfilePath;
  const lifeline = person ? formatLifeline(person) : null;
  const biography = person?.biography?.trim() ?? "";

  const listHeader = useMemo(
    () => (
      <View className="pb-4 pt-6">
        <View className="flex-row items-center gap-5">
          {displayProfilePath ? (
            <Image
              source={{ uri: displayProfilePath }}
              style={{ width: 112, height: 112, borderRadius: 56 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={220}
            />
          ) : (
            <View
              className="items-center justify-center bg-dark-elevated"
              style={{ width: 112, height: 112, borderRadius: 56 }}
            >
              <Ionicons
                name="person"
                size={48}
                color="#5E6575"
                accessible={false}
                accessibilityElementsHidden
                aria-hidden={true}
                importantForAccessibility="no"
              />
            </View>
          )}
          <View className="flex-1">
            <Text className="text-2xl font-black text-text-primary">
              {displayName}
            </Text>
            {person?.knownForDepartment ? (
              <Text className="mt-1 text-[13px] font-semibold text-brand-400">
                {person.knownForDepartment}
              </Text>
            ) : null}
            {lifeline ? (
              <Text className="mt-1 text-xs text-text-tertiary">{lifeline}</Text>
            ) : null}
          </View>
        </View>

        {biography ? (
          <View className="mt-5">
            <Text
              className="text-[13px] leading-5 text-text-secondary"
              numberOfLines={bioExpanded ? undefined : BIO_PREVIEW_LINES}
            >
              {biography}
            </Text>
            <Pressable
              onPress={() => setBioExpanded((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={bioExpanded ? "Show less" : "Read more"}
              className="mt-1 active:opacity-70"
            >
              <Text className="text-[13px] font-semibold text-brand-400">
                {bioExpanded ? "Show less" : "Read more"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mt-6 mb-1 flex-row items-center gap-2">
          {castCredits.length > 0 && crewCredits.length > 0 ? (
            <View className="flex-row gap-2">
              {(["cast", "crew"] as const).map((key) => {
                const selected = activeSection === key;
                const label =
                  key === "cast"
                    ? `Acting (${castCredits.length})`
                    : `Crew (${crewCredits.length})`;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSection(key);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`rounded-full border px-3 py-1.5 ${
                      selected
                        ? "border-brand-400 bg-brand-400/15"
                        : "border-dark-border bg-dark-elevated"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-bold uppercase ${
                        selected ? "text-brand-400" : "text-text-tertiary"
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="text-[11px] font-bold uppercase text-text-tertiary">
              Shows
            </Text>
          )}
          <View className="h-px flex-1 bg-dark-border" />
        </View>
      </View>
    ),
    [
      activeSection,
      bioExpanded,
      biography,
      castCredits.length,
      crewCredits.length,
      displayName,
      displayProfilePath,
      lifeline,
      person?.knownForDepartment,
    ],
  );

  return (
    <View className="flex-1 bg-dark-bg">
      <PageTitle title={displayName} />
      {/* Header (band is full-bleed; inner content tracks the page column) */}
      <View
        className="pb-4 border-b border-dark-border"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="px-6" style={pageStyle}>
          <View className="flex-row items-center gap-3">
            {SHOW_BACK_BUTTON ? (
              <GlassPressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.back();
                }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                radius={20}
                variant="control"
                contentStyle={{
                  alignItems: "center",
                  height: 40,
                  justifyContent: "center",
                  width: 40,
                }}
              >
                <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
              </GlassPressable>
            ) : null}
            <Text
              className="flex-1 text-xl font-black text-text-primary"
              numberOfLines={1}
            >
              {displayName}
            </Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={pageStyle}>
          <GridSkeleton numColumns={numColumns} itemWidth={itemWidth} />
        </View>
      ) : loadFailed ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="person-circle-outline" size={32} color="#6B7280" />
          <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
            Couldn't load this person
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
            Check your connection and try again.
          </Text>
        </View>
      ) : (
        <View className="flex-1 px-6" style={pageStyle}>
          <FlashList
            key={`grid-${activeSection}-${numColumns}`}
            data={credits}
            renderItem={renderItem}
            numColumns={numColumns}
            estimatedItemSize={itemWidth * 1.5 + 56}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            keyExtractor={(item: PersonCredit) => item.externalId}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <View className="items-center justify-center px-4 py-16">
                <Ionicons name="tv-outline" size={28} color="#6B7280" />
                <Text className="mt-4 text-center text-[16px] font-bold text-text-primary">
                  No TV credits
                </Text>
                <Text className="mt-2 text-center text-[13px] leading-5 text-text-tertiary">
                  We couldn't find any shows for {displayName}.
                </Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}
