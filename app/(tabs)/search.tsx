import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import { Image } from "expo-image";

import { ContactInviteRow } from "../../components/ContactInviteRow";
import { ContactsSyncCard } from "../../components/ContactsSyncCard";
import { EmptyState } from "../../components/EmptyState";
import { Poster } from "../../components/Poster";
import { Screen } from "../../components/Screen";
import { SearchResultRow } from "../../components/SearchResultRow";
import { SegmentedControl } from "../../components/SegmentedControl";
import { UserRow } from "../../components/UserRow";
import { api } from "../../convex/_generated/api";
import { loadDeviceContacts } from "../../lib/deviceContacts";

type SearchMode = "shows" | "people";

const modeOptions = [
  { value: "shows", label: "Shows" },
  { value: "people", label: "People" },
];

/* ─── Section Header ───────────────────────────────────────────────── */

function SectionLine({
  label,
  count,
  icon,
}: {
  label: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="flex-row items-center gap-3 mb-4">
      <View className="flex-row items-center gap-2">
        {icon && <Ionicons name={icon} size={14} color="#5A6070" />}
        <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
          {label}
        </Text>
      </View>
      {count !== undefined && count > 0 && (
        <View className="rounded-full bg-dark-elevated px-2 py-0.5">
          <Text className="text-xs font-medium text-text-tertiary">
            {count}
          </Text>
        </View>
      )}
      <View className="flex-1 h-px bg-dark-border" />
    </View>
  );
}

/* ─── Main Screen ──────────────────────────────────────────────────── */

export default function SearchScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const hasProfile = Boolean(me?._id);
  const params = useLocalSearchParams();
  const inputRef = useRef<TextInput>(null);

  const [mode, setMode] = useState<SearchMode>("shows");
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<any[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [invitingContactId, setInvitingContactId] = useState<string | null>(
    null,
  );
  const [devicePhoneLookup, setDevicePhoneLookup] = useState<
    Record<string, string>
  >({});
  const [isFocused, setIsFocused] = useState(false);

  const isSearching = trimmedQuery.length >= 3;
  const searchReady = trimmedQuery.length >= 3 && debouncedQuery.length >= 3;
  const hasSearchResults = catalogResults.length > 0 || !isSearchingCatalog;
  const showDiscover =
    mode === "shows" &&
    (trimmedQuery.length < 3 ||
      debouncedQuery.length < 3 ||
      (searchReady && isSearchingCatalog && !hasSearchResults));

  /* ── URL param sync ────────────────────────────────────────── */

  const modeParam = useMemo(() => {
    if (typeof params.mode === "string") return params.mode;
    if (Array.isArray(params.mode)) return params.mode[0];
    return undefined;
  }, [params.mode]);

  useEffect(() => {
    if (modeParam === "people") setMode("people");
    else if (modeParam === "shows") setMode("shows");
  }, [modeParam]);

  /* ── Queries ───────────────────────────────────────────────── */

  const peopleResults =
    useQuery(
      api.users.search,
      hasProfile && mode === "people" && trimmedQuery.length >= 2
        ? { text: trimmedQuery, limit: 12 }
        : "skip",
    ) ?? [];

  const contactStatus =
    useQuery(
      api.contacts.getStatus,
      hasProfile && mode === "people" ? {} : "skip",
    ) ?? null;

  const contactMatches =
    useQuery(
      api.contacts.getMatches,
      hasProfile &&
        mode === "people" &&
        trimmedQuery.length < 2 &&
        contactStatus?.hasSynced
        ? { limit: 6 }
        : "skip",
    ) ?? [];

  const inviteCandidates =
    useQuery(
      api.contacts.getInviteCandidates,
      hasProfile &&
        mode === "people" &&
        trimmedQuery.length < 2 &&
        contactStatus?.hasSynced
        ? { limit: 10 }
        : "skip",
    ) ?? [];

  const searchContactCandidates =
    useQuery(
      api.contacts.searchInviteCandidates,
      hasProfile &&
        mode === "people" &&
        trimmedQuery.length >= 2 &&
        contactStatus?.hasSynced
        ? { text: trimmedQuery, limit: 10 }
        : "skip",
    ) ?? [];

  const suggestedPeople =
    useQuery(
      api.users.suggested,
      hasProfile && mode === "people" && trimmedQuery.length < 2
        ? { limit: 6 }
        : "skip",
    ) ?? [];

  /* ── Actions / Mutations ───────────────────────────────────── */

  const searchCatalog = useAction(api.shows.searchCatalog);
  const getTmdbList = useAction(api.shows.getTmdbList);
  const ingestFromCatalog = useAction(api.shows.ingestFromCatalog);
  const syncContacts = useAction(api.contacts.syncSnapshot);
  const sendInvite = useMutation(api.contacts.sendInvite);

  const [discoverSections, setDiscoverSections] = useState<
    Record<string, { label: string; icon?: keyof typeof Ionicons.glyphMap; logoUrl?: string; items: any[] }>
  >({});
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(false);

  /* ── Effects ───────────────────────────────────────────────── */

  useEffect(() => {
    let active = true;

    if (mode !== "shows" || !isAuthenticated || debouncedQuery.length < 3) {
      setCatalogResults([]);
      setIsSearchingCatalog(false);
      return;
    }

    setIsSearchingCatalog(true);
    searchCatalog({ text: debouncedQuery })
      .then((results) => {
        if (active) setCatalogResults(results);
      })
      .catch(() => {
        if (active) setCatalogResults([]);
      })
      .finally(() => {
        if (active) setIsSearchingCatalog(false);
      });

    return () => {
      active = false;
    };
  }, [mode, searchCatalog, debouncedQuery, isAuthenticated]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(trimmedQuery), 400);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  /* ── Fetch TMDB discover sections when idle ─────────────────── */

  useEffect(() => {
    if (!showDiscover) {
      setDiscoverSections({});
      return;
    }
    let cancelled = false;
    setIsLoadingDiscover(true);
    const TMDB_LOGO = (path: string) => `https://image.tmdb.org/t/p/w92${path}`;
    const sections: Array<{
      key: string;
      category: Parameters<typeof getTmdbList>[0]["category"];
      label: string;
      icon?: keyof typeof Ionicons.glyphMap;
      logoUrl?: string;
    }> = [
      { key: "popular", category: "popular", label: "Popular Now", icon: "flame" },
      { key: "top_rated", category: "top_rated", label: "Top Rated", icon: "star" },
      { key: "on_the_air", category: "on_the_air", label: "Airing Now", icon: "tv" },
      { key: "netflix", category: "netflix", label: "Netflix", logoUrl: TMDB_LOGO("/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg") },
      { key: "apple_tv", category: "apple_tv", label: "Apple TV", logoUrl: TMDB_LOGO("/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg") },
      { key: "max", category: "max", label: "HBO Max", logoUrl: TMDB_LOGO("/jbe4gVSfRlbPTdESXhEKpornsfu.jpg") },
      { key: "disney_plus", category: "disney_plus", label: "Disney+", logoUrl: TMDB_LOGO("/97yvRBw1GzX7fXprcF80er19ot.jpg") },
      { key: "hulu", category: "hulu", label: "Hulu", logoUrl: TMDB_LOGO("/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg") },
      { key: "prime_video", category: "prime_video", label: "Prime Video", logoUrl: TMDB_LOGO("/pvske1MyAoymrs5bguRfVqYiM9a.jpg") },
      { key: "genre_drama", category: "genre_drama", label: "Drama", icon: "film" },
      { key: "genre_comedy", category: "genre_comedy", label: "Comedy", icon: "happy" },
      { key: "genre_sci_fi", category: "genre_sci_fi", label: "Sci-Fi & Fantasy", icon: "rocket" },
    ];
    Promise.all(
      sections.map((s) => getTmdbList({ category: s.category, limit: 12 })),
    )
      .then((results) => {
        if (cancelled) return;
        const next: Record<
          string,
          { label: string; icon?: keyof typeof Ionicons.glyphMap; logoUrl?: string; items: any[] }
        > = {};
        sections.forEach((s, i) => {
          next[s.key] = {
            label: s.label,
            icon: s.icon,
            logoUrl: s.logoUrl,
            items: results[i] ?? [],
          };
        });
        setDiscoverSections(next);
      })
      .catch(() => {
        if (!cancelled) setDiscoverSections({});
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDiscover(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showDiscover, getTmdbList]);

  /* ── Handlers ──────────────────────────────────────────────── */

  const handleAddFromCatalog = useCallback(
    async (item: any) => {
      if (!isAuthenticated) {
        Alert.alert(
          "Sign in to add shows",
          "Create an account to add shows and track what you watch.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Sign in", onPress: () => router.push("/(auth)/sign-in") },
          ],
        );
        return;
      }
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const showId = await ingestFromCatalog({
          externalSource: item.externalSource,
          externalId: item.externalId,
          title: item.title,
          year: item.year,
          overview: item.overview,
          posterUrl: item.posterUrl,
        });
        router.push(`/show/${showId}`);
      } catch (error) {
        Alert.alert("Could not add show", String(error));
      }
    },
    [ingestFromCatalog, isAuthenticated, router],
  );

  const handleSyncContacts = useCallback(async () => {
    try {
      setIsSyncingContacts(true);
      const entries = await loadDeviceContacts();
      setDevicePhoneLookup(
        Object.fromEntries(entries.map((e) => [e.sourceRecordId, e.phone])),
      );
      const result = await syncContacts({ entries });
      Alert.alert(
        "Contacts synced",
        result.matchedCount > 0
          ? `We found ${result.matchedCount} people already on Plotlist.`
          : "No current matches, but you can still invite people.",
      );
    } catch (error) {
      Alert.alert("Could not sync contacts", String(error));
    } finally {
      setIsSyncingContacts(false);
    }
  }, [syncContacts]);

  const handleInvite = useCallback(
    async (candidate: {
      entryId: string;
      sourceRecordId: string | null;
      displayName: string;
    }) => {
      try {
        let phone = candidate.sourceRecordId
          ? devicePhoneLookup[candidate.sourceRecordId]
          : undefined;
        if (!phone) {
          const entries = await loadDeviceContacts();
          const nextLookup = Object.fromEntries(
            entries.map((e) => [e.sourceRecordId, e.phone]),
          );
          setDevicePhoneLookup(nextLookup);
          phone = candidate.sourceRecordId
            ? nextLookup[candidate.sourceRecordId]
            : undefined;
        }
        if (!phone) {
          throw new Error("Resync contacts before inviting this person");
        }
        setInvitingContactId(
          candidate.sourceRecordId ?? candidate.displayName,
        );
        const inviteMessage =
          "Join me on Plotlist. Track shows, find friends, and share what you're watching.";
        const sep = Platform.OS === "ios" ? "&" : "?";
        const smsUrl = `sms:${phone}${sep}body=${encodeURIComponent(inviteMessage)}`;
        if (!(await Linking.canOpenURL(smsUrl))) {
          throw new Error("SMS is not available on this device");
        }
        await Linking.openURL(smsUrl);
        await sendInvite({ entryId: candidate.entryId as any });
      } catch (error) {
        Alert.alert("Invite failed", String(error));
      } finally {
        setInvitingContactId(null);
      }
    },
    [devicePhoneLookup, sendInvite],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    inputRef.current?.focus();
  }, []);

  /* ── List renderers ────────────────────────────────────────── */

  const listContentStyle = useMemo(() => ({ paddingVertical: 12 }), []);

  const renderCatalogItem = useCallback(
    ({ item }: { item: any }) => (
      <View className="mb-3">
        <SearchResultRow
          title={item.title}
          year={item.year}
          overview={item.overview}
          posterUrl={item.posterUrl}
          actionLabel="Add to Plotlist"
          onPress={() => handleAddFromCatalog(item)}
        />
      </View>
    ),
    [handleAddFromCatalog],
  );

  const renderUserItem = useCallback(
    ({ item }: { item: any }) => (
      <View className="mb-3">
        <UserRow
          userId={item.user._id}
          displayName={item.user.displayName ?? item.user.name}
          username={item.user.username}
          avatarUrl={item.avatarUrl}
          isFollowing={item.isFollowing}
          followsYou={item.followsYou}
          isMutualFollow={item.isMutualFollow}
          mutualCount={item.mutualCount}
          inContacts={item.inContacts}
        />
      </View>
    ),
    [],
  );

  /* ── JSX ───────────────────────────────────────────────────── */

  return (
    <Screen scroll hasTabBar keyboardShouldPersistTaps="always">
      <View style={{ paddingBottom: 100 }}>
        {/* ── Header ─────────────────────────────────────────── */}
        <View className="px-5 pt-4">
          <Text className="text-3xl font-bold tracking-tight text-text-primary">
            Explore
          </Text>
          <Text className="mt-1 text-sm text-text-tertiary">
            {mode === "shows"
              ? "Find any TV series and add it to your watchlist."
              : "Search by name or @username, or sync your contacts."}
          </Text>
        </View>

        {/* ── Search Bar ─────────────────────────────────────── */}
        <View className="px-5 mt-4">
          <View
            className="flex-row items-center rounded-2xl bg-dark-card px-4"
            style={{
              borderWidth: 1,
              borderColor: isFocused
                ? "rgba(14, 165, 233, 0.35)"
                : "rgba(42, 46, 56, 1)",
            }}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={isFocused ? "#38bdf8" : "#5A6070"}
            />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={
                mode === "shows"
                  ? "Search for a show\u2026"
                  : "Search people or @username\u2026"
              }
              placeholderTextColor="#5A6070"
              className="flex-1 ml-3 py-3.5 text-[16px] text-text-primary"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable onPress={handleClear} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="#5A6070" />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Mode Toggle ────────────────────────────────────── */}
        <View className="px-5 mt-4">
          <SegmentedControl
            options={modeOptions}
            value={mode}
            onChange={(v) => {
              setMode(v as SearchMode);
              setQuery("");
            }}
          />
        </View>

        {/* ── Shows: Discover (before 3-char search) ───────────── */}
        {showDiscover && (
          <View className="mt-8 gap-10">
            {isLoadingDiscover ? (
              <View className="items-center justify-center py-16">
                <ActivityIndicator size="small" color="#0ea5e9" />
                <Text className="mt-3 text-sm text-text-tertiary">
                  Loading discover…
                </Text>
              </View>
            ) : Object.keys(discoverSections).length > 0 ? (
              (["popular", "top_rated", "on_the_air", "netflix", "apple_tv", "max", "disney_plus", "hulu", "prime_video", "genre_drama", "genre_comedy", "genre_sci_fi"] as const)
                .filter((key) => (discoverSections[key]?.items?.length ?? 0) > 0)
                .map((key, sectionIndex) => {
                  const section = discoverSections[key];
                  if (!section) return null;
                  return (
                    <View key={key}>
                      <View className="px-5">
                        {section.logoUrl ? (
                          <View className="flex-row items-center gap-3 mb-4">
                            <Image
                              source={{ uri: section.logoUrl }}
                              style={{ width: 22, height: 22, borderRadius: 5 }}
                              contentFit="cover"
                            />
                            <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex-1">
                              {section.label}
                            </Text>
                            <Pressable
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                router.push(`/provider/${key}`);
                              }}
                              className="active:opacity-80"
                            >
                              <Text className="text-xs font-semibold text-text-tertiary">See all</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <SectionLine
                            label={section.label}
                            icon={section.icon}
                            count={section.items.length}
                          />
                        )}
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{
                          paddingHorizontal: 20,
                          gap: 14,
                        }}
                      >
                        {section.items.map((item: any, index: number) => (
                          <Animated.View
                            key={item.externalId}
                            entering={FadeInRight.delay(
                              sectionIndex * 80 + index * 40,
                            ).springify()}
                          >
                            <Pressable
                              onPress={() => handleAddFromCatalog(item)}
                              className="w-28 active:opacity-80"
                            >
                              <Poster uri={item.posterUrl} size="md" />
                              <Text
                                className="mt-2 text-sm font-semibold text-text-primary"
                                numberOfLines={2}
                              >
                                {item.title ?? "Unknown"}
                              </Text>
                              {item.year ? (
                                <Text className="text-xs text-text-tertiary">
                                  {item.year}
                                </Text>
                              ) : null}
                            </Pressable>
                          </Animated.View>
                        ))}
                      </ScrollView>
                    </View>
                  );
                })
            ) : (
              <View className="px-5">
                <EmptyState
                  title="Discover something new"
                  description="Start typing to search your library or the full catalog."
                />
              </View>
            )}
          </View>
        )}

        {/* ── Shows: Search results ───────────────────────────── */}
        {mode === "shows" && searchReady && hasSearchResults && (
          <View className="mt-6 px-5">
            <SectionLine
              label="Results"
              count={
                catalogResults.length > 0
                  ? catalogResults.length
                  : undefined
              }
            />

              {!isAuthenticated ? (
                <EmptyState
                  title="Sign in to search the catalog"
                  description="Create an account to search every TV series."
                />
              ) : catalogResults.length > 0 ? (
                <Animated.View entering={FadeInDown.duration(300)}>
                  <FlashList
                    data={catalogResults}
                    renderItem={renderCatalogItem}
                    keyExtractor={(item: any) => item.externalId}
                    estimatedItemSize={132}
                    contentContainerStyle={listContentStyle}
                    keyboardShouldPersistTaps="always"
                    scrollEnabled={false}
                  />
                </Animated.View>
              ) : (
                <EmptyState
                  title="No catalog results"
                  description="Try a different search term."
                />
              )}
          </View>
        )}

        {/* ── People: Searching ──────────────────────────────── */}
        {mode === "people" && trimmedQuery.length >= 2 && (
          <View className="mt-6 px-5 gap-8">
            <View>
              <SectionLine
                label="People"
                count={
                  peopleResults.length > 0 ? peopleResults.length : undefined
                }
              />

              {peopleResults.length > 0 ? (
                <Animated.View entering={FadeInDown.duration(300)}>
                  <FlashList
                    data={peopleResults}
                    renderItem={renderUserItem}
                    keyExtractor={(item: any) => item.user._id}
                    estimatedItemSize={104}
                    contentContainerStyle={listContentStyle}
                    keyboardShouldPersistTaps="always"
                    scrollEnabled={false}
                  />
                </Animated.View>
              ) : searchContactCandidates.length === 0 ? (
                <EmptyState
                  title="No people found"
                  description="Try searching a different name or username."
                />
              ) : null}
            </View>

            {searchContactCandidates.length > 0 && (
              <Animated.View entering={FadeInDown.delay(100).duration(300)}>
                <SectionLine
                  label="Invite from Contacts"
                  icon="paper-plane-outline"
                  count={searchContactCandidates.length}
                />
                <View className="gap-3">
                  {searchContactCandidates.map((candidate: any) => (
                    <ContactInviteRow
                      key={candidate.entryId}
                      displayName={candidate.displayName}
                      invitedAt={candidate.invitedAt}
                      disabled={
                        invitingContactId ===
                        (candidate.sourceRecordId ?? candidate.displayName)
                      }
                      onInvite={() => handleInvite(candidate)}
                    />
                  ))}
                </View>
              </Animated.View>
            )}
          </View>
        )}

        {/* ── People: Idle ───────────────────────────────────── */}
        {mode === "people" && trimmedQuery.length < 2 && (
          <View className="mt-6 px-5 gap-8">
            <ContactsSyncCard
              title={
                contactStatus?.hasSynced
                  ? "Contacts connected"
                  : "Find your friends"
              }
              description="Use your address book to surface existing Plotlist users and invite people who aren't here yet."
              buttonLabel={
                contactStatus?.hasSynced ? "Resync contacts" : "Sync contacts"
              }
              onPress={handleSyncContacts}
              loading={isSyncingContacts}
              meta={
                contactStatus?.hasSynced
                  ? `${contactStatus.matchedCount} matches \u00b7 ${contactStatus.inviteCount} invite-ready`
                  : null
              }
            />

            {contactMatches.length > 0 && (
              <View>
                <SectionLine label="From Your Contacts" icon="people" />
                <View className="gap-3">
                  {contactMatches.map((item: any) => (
                    <UserRow
                      key={item.user._id}
                      userId={item.user._id}
                      displayName={item.user.displayName ?? item.user.name}
                      username={item.user.username}
                      avatarUrl={item.avatarUrl}
                      isFollowing={item.isFollowing}
                      followsYou={item.followsYou}
                      isMutualFollow={item.isMutualFollow}
                      mutualCount={item.mutualCount}
                      inContacts={item.inContacts}
                    />
                  ))}
                </View>
              </View>
            )}

            {inviteCandidates.length > 0 && (
              <View>
                <SectionLine
                  label="Invite Contacts"
                  icon="paper-plane-outline"
                />
                <View className="gap-3">
                  {inviteCandidates.map((candidate: any) => (
                    <ContactInviteRow
                      key={candidate.entryId}
                      displayName={candidate.displayName}
                      invitedAt={candidate.invitedAt}
                      disabled={
                        invitingContactId ===
                        (candidate.sourceRecordId ?? candidate.displayName)
                      }
                      onInvite={() => handleInvite(candidate)}
                    />
                  ))}
                </View>
              </View>
            )}

            <View>
              <SectionLine label="People You May Know" icon="sparkles" />
              {suggestedPeople.length > 0 ? (
                <View className="gap-3">
                  {suggestedPeople.map((item: any) => (
                    <UserRow
                      key={item.user._id}
                      userId={item.user._id}
                      displayName={item.user.displayName ?? item.user.name}
                      username={item.user.username}
                      avatarUrl={item.avatarUrl}
                      isFollowing={item.isFollowing}
                      followsYou={item.followsYou}
                      isMutualFollow={item.isMutualFollow}
                      mutualCount={item.mutualCount}
                      inContacts={item.inContacts}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  title="No suggestions yet"
                  description="Sync contacts or type at least 2 characters to search."
                />
              )}
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}
