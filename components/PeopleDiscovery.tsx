import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "../lib/plotlist/api";
import { useQuery } from "../lib/plotlist/react";
import { useContactSync } from "../lib/useContactSync";
import { ContactInviteRow } from "./ContactInviteRow";
import { ContactsSyncCard } from "./ContactsSyncCard";
import { EmptyState } from "./EmptyState";
import { ShimmerBlock } from "./ShowDetailSkeleton";
import { UserRow } from "./UserRow";

export const PEOPLE_QUERY_MIN_LENGTH = 2;

const CONTACT_MATCH_LIMIT = 12;
const INVITE_CANDIDATE_LIMIT = 10;
const SUGGESTED_LIMIT = 8;

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
    <View className="mb-2 flex-row items-center gap-2">
      <View className="flex-row items-center gap-1.5">
        {icon && <Ionicons name={icon} size={14} color="#5A6070" />}
        <Text className="text-[11px] font-bold uppercase text-text-tertiary">
          {label}
        </Text>
      </View>
      {count !== undefined && count > 0 && (
        <View className="rounded-full bg-dark-elevated px-1.5 py-0.5">
          <Text className="text-[11px] font-medium text-text-tertiary">{count}</Text>
        </View>
      )}
      <View className="h-px flex-1 bg-dark-border" />
    </View>
  );
}

function PersonRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card px-4 py-3">
      <ShimmerBlock width={44} height={44} radius={22} />
      <View className="flex-1 gap-2">
        <ShimmerBlock width="55%" height={14} radius={7} />
        <ShimmerBlock width="35%" height={11} radius={6} />
      </View>
      <ShimmerBlock width={72} height={30} radius={15} />
    </View>
  );
}

function PeopleLoadingRows({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }, (_, index) => (
        <PersonRowSkeleton key={index} />
      ))}
    </View>
  );
}

function PersonPreviewRow({ item }: { item: any }) {
  return (
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
      sharedShowCount={item.sharedShowCount}
    />
  );
}

function ShareInviteCard({ onShare }: { onShare: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onShare();
      }}
      accessibilityRole="button"
      accessibilityLabel="Share a Plotlist invite link"
      className="flex-row items-center gap-3 rounded-2xl border border-dark-border bg-dark-card px-4 py-3.5 active:bg-dark-hover"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-500/15">
        <Ionicons name="share-outline" size={20} color="#38BDF8" />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-text-primary">
          Share Plotlist with friends
        </Text>
        <Text className="mt-0.5 text-xs text-text-tertiary">
          Send an invite link anywhere — Plotlist is better with friends.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#5A6070" />
    </Pressable>
  );
}

// The whole find-friends surface: contact sync entry point, contact matches,
// SMS invites, suggestions, and people search. Shared by the Search tab's
// People mode; keeping it in one component keeps sync/invite behavior
// identical everywhere it appears.
export function PeopleDiscovery({
  query,
  hasProfile,
}: {
  query: string;
  hasProfile: boolean;
}) {
  const isSearching = query.length >= PEOPLE_QUERY_MIN_LENGTH;

  const contactStatus =
    useQuery(api.contacts.getStatus, hasProfile ? {} : "skip") ?? null;
  const hasSynced = Boolean(contactStatus?.hasSynced);

  const { isSyncing, invitingId, syncNow, invite, shareInvite } = useContactSync({
    enabled: hasProfile,
    hasSyncedBefore: hasSynced,
  });

  const peopleResults = useQuery(
    api.users.search,
    hasProfile && isSearching ? { text: query, limit: 12 } : "skip",
  );

  const contactMatches =
    useQuery(
      api.contacts.getMatches,
      hasProfile && !isSearching && hasSynced ? { limit: CONTACT_MATCH_LIMIT } : "skip",
    ) ?? [];

  const inviteCandidates =
    useQuery(
      api.contacts.getInviteCandidates,
      hasProfile && !isSearching && hasSynced ? { limit: INVITE_CANDIDATE_LIMIT } : "skip",
    ) ?? [];

  const searchContactCandidates =
    useQuery(
      api.contacts.searchInviteCandidates,
      hasProfile && isSearching && hasSynced ? { text: query, limit: 10 } : "skip",
    ) ?? [];

  const suggestedPeopleRaw =
    useQuery(
      api.users.suggested,
      hasProfile && !isSearching ? { limit: SUGGESTED_LIMIT } : "skip",
    ) ?? [];
  // Suggestions deliberately boost contact matches server-side, but on this
  // screen those people already have their own section right above.
  const suggestedPeople = useMemo(() => {
    const shownIds = new Set(contactMatches.map((item: any) => item.user._id));
    return suggestedPeopleRaw.filter((item: any) => !shownIds.has(item.user._id));
  }, [suggestedPeopleRaw, contactMatches]);

  const isLoadingPeople = isSearching && peopleResults === undefined;
  const visiblePeople = useMemo(() => peopleResults ?? [], [peopleResults]);

  if (isSearching) {
    return (
      <View className="mt-4 gap-6 px-5">
        <View>
          <SectionLine
            label="People"
            count={visiblePeople.length > 0 ? visiblePeople.length : undefined}
          />
          {isLoadingPeople ? (
            <PeopleLoadingRows />
          ) : visiblePeople.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(300)}>
              <View className="gap-3">
                {visiblePeople.map((item: any) => (
                  <PersonPreviewRow key={item.user._id} item={item} />
                ))}
              </View>
            </Animated.View>
          ) : searchContactCandidates.length === 0 ? (
            <EmptyState
              title="No people found"
              description="Try a different name or username, or invite them below."
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
                  disabled={invitingId === (candidate.sourceRecordId ?? candidate.entryId)}
                  onInvite={() => invite(candidate)}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {!isLoadingPeople && (
          <ShareInviteCard onShare={shareInvite} />
        )}
      </View>
    );
  }

  return (
    <View className="mt-4 gap-6 px-5">
      <ContactsSyncCard
        title={hasSynced ? "Contacts connected" : "Find your friends"}
        description={
          hasSynced
            ? "Matches refresh automatically as friends join. Resync any time to pick up new contacts."
            : "See which of your contacts are already on Plotlist and invite the ones who aren't. Numbers never leave your phone unhashed."
        }
        buttonLabel={hasSynced ? "Resync contacts" : "Sync contacts"}
        onPress={() => void syncNow()}
        loading={isSyncing}
        meta={
          hasSynced && contactStatus
            ? `${contactStatus.matchedCount} ${
                contactStatus.matchedCount === 1 ? "match" : "matches"
              } · ${contactStatus.inviteCount} invite-ready`
            : null
        }
      />

      {contactMatches.length > 0 && (
        <View>
          <SectionLine
            label="From Your Contacts"
            icon="people"
            count={contactMatches.length}
          />
          <View className="gap-3">
            {contactMatches.map((item: any) => (
              <PersonPreviewRow key={item.user._id} item={item} />
            ))}
          </View>
        </View>
      )}

      {inviteCandidates.length > 0 && (
        <View>
          <SectionLine label="Invite Contacts" icon="paper-plane-outline" />
          <View className="gap-3">
            {inviteCandidates.map((candidate: any) => (
              <ContactInviteRow
                key={candidate.entryId}
                displayName={candidate.displayName}
                invitedAt={candidate.invitedAt}
                disabled={invitingId === (candidate.sourceRecordId ?? candidate.entryId)}
                onInvite={() => invite(candidate)}
              />
            ))}
          </View>
        </View>
      )}

      <ShareInviteCard onShare={shareInvite} />

      <View>
        <SectionLine label="People You May Know" icon="sparkles" />
        {suggestedPeople.length > 0 ? (
          <View className="gap-3">
            {suggestedPeople.map((item: any) => (
              <PersonPreviewRow key={item.user._id} item={item} />
            ))}
          </View>
        ) : (
          <EmptyState
            title="No suggestions yet"
            description="Sync contacts or search by name or username."
          />
        )}
      </View>
    </View>
  );
}
