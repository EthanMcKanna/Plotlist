import { useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ContactsSyncCard } from "../../components/ContactsSyncCard";
import { Screen } from "../../components/Screen";
import { EmptyState } from "../../components/EmptyState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { UserRow } from "../../components/UserRow";
import { OnboardingHeader } from "../../components/OnboardingHeader";
import { api } from "../../lib/plotlist/api";
import { getContactSyncAlertCopy } from "../../lib/contactSync";
import { loadDeviceContacts } from "../../lib/deviceContacts";
import { useAction, useMutation, useQuery } from "../../lib/plotlist/react";
import { setContactsSyncDismissed } from "../../lib/preferences";
import { cacheOnboardingStep, markOnboardingStep } from "../../lib/onboardingCache";

export default function OnboardingFollow() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const hasProfile = Boolean(me?._id);
  const setOnboardingStep = useMutation(api.users.setOnboardingStep);
  const syncContacts = useAction(api.contacts.syncSnapshot);
  const contactStatus = useQuery(api.contacts.getStatus, hasProfile ? {} : "skip") ?? null;
  const contactMatches =
    useQuery(
      api.contacts.getMatches,
      hasProfile && contactStatus?.hasSynced ? { limit: 6 } : "skip",
    ) ?? [];
  const suggested = useQuery(api.users.suggested, hasProfile ? { limit: 10 } : "skip") ?? [];
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const isWeb = Platform.OS === "web";

  const handleContinue = async () => {
    const result = await setOnboardingStep({ step: "shows" });
    cacheOnboardingStep(result?.userId, "shows");
    markOnboardingStep("shows");
    router.replace("/onboarding/shows");
  };

  const handleSkip = async () => {
    const result = await setOnboardingStep({ step: "complete" });
    cacheOnboardingStep(result?.userId, "complete");
    markOnboardingStep("complete");
    router.replace("/home");
  };

  const handleSyncContacts = async () => {
    try {
      setIsSyncingContacts(true);
      const entries = await loadDeviceContacts();
      const result = await syncContacts({ entries });
      await setContactsSyncDismissed(false);
      const copy = getContactSyncAlertCopy(result);
      Alert.alert(copy.title, copy.message);
    } catch (error) {
      Alert.alert("Could not sync contacts", String(error));
    } finally {
      setIsSyncingContacts(false);
    }
  };

  return (
    <Screen scroll>
      <OnboardingHeader
        step={2}
        totalSteps={3}
        title="Find your people"
        description={
          isWeb
            ? "Follow a few people so your feed feels alive right away. You can sync contacts later from the mobile app."
            : "Sync contacts first, then follow a few people so your feed feels alive right away."
        }
        onSkip={handleSkip}
      />

      {!isWeb ? (
        <View className="px-6 pt-6">
          <ContactsSyncCard
            title={contactStatus?.hasSynced ? "Contacts already synced" : "Sync your contacts"}
            description="Plotlist uses your address book to surface people you already know. Raw numbers are never stored."
            buttonLabel={contactStatus?.hasSynced ? "Resync contacts" : "Sync contacts"}
            onPress={handleSyncContacts}
            loading={isSyncingContacts}
            meta={
              contactStatus?.hasSynced
                ? `${contactStatus.matchedCount} matches · ${contactStatus.inviteCount} invite-ready`
                : null
            }
          />
        </View>
      ) : null}

      <View className="px-6 pb-10">
        {contactMatches.length > 0 ? (
          <View className="mt-8">
            <Text className="text-sm font-semibold text-text-primary">From your contacts</Text>
            <View className="mt-4 gap-3">
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
        ) : null}

        <View className="mt-8">
          <Text className="text-sm font-semibold text-text-primary">People you may know</Text>
          {suggested.length > 0 ? (
            <View className="mt-4 gap-3">
              {suggested.map((item: any) => (
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
            <View className="mt-4">
              <EmptyState
                title="No suggestions yet"
                description="You can always search and sync contacts later."
              />
            </View>
          )}
        </View>

        <View className="mt-8">
          <PrimaryButton label="Continue" onPress={handleContinue} />
        </View>
      </View>
    </Screen>
  );
}
