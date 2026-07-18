import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { GlassSurface } from "../../components/NativeGlass";
import { Screen } from "../../components/Screen";
import { SegmentedControl } from "../../components/SegmentedControl";
import { api } from "../../lib/plotlist/api";
import { confirmAction, notifyError } from "../../lib/dialogs";
import {
  DEFAULT_PROFILE_VISIBILITY,
  resolveProfileVisibility,
  type ProfileSectionKey,
  type ProfileVisibilitySettings,
  type ProfileVisibilityValue,
} from "../../lib/profilePrivacy";
import { useMutation, useQuery } from "../../lib/plotlist/react";

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Everyone" },
  { value: "followers", label: "Followers" },
  { value: "private", label: "Only me" },
] satisfies { value: ProfileVisibilityValue; label: string }[];

const SECTION_COPY: Record<ProfileSectionKey, { title: string; description: string }> = {
  favorites: {
    title: "Favorite shows & genres",
    description: "The favorites shelf and genre chips on your profile.",
  },
  currentlyWatching: {
    title: "Currently watching",
    description: "The Now Watching shelf and your watching count.",
  },
  watchlist: {
    title: "Watchlist",
    description: "Your watchlist preview, full watchlist page, and watchlist count.",
  },
};

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-text-tertiary">
      {title}
    </Text>
  );
}

function VisibilityCard({
  section,
  value,
  disabled,
  onChange,
}: {
  section: ProfileSectionKey;
  value: ProfileVisibilityValue;
  disabled: boolean;
  onChange: (value: ProfileVisibilityValue) => void;
}) {
  const copy = SECTION_COPY[section];
  return (
    <GlassSurface radius={8} variant="surface" contentStyle={{ padding: 16 }}>
      <Text className="text-sm font-semibold text-text-primary">{copy.title}</Text>
      <Text className="mt-1 text-sm leading-5 text-text-tertiary">{copy.description}</Text>
      <View className={`mt-3 ${disabled ? "opacity-50" : ""}`} pointerEvents={disabled ? "none" : "auto"}>
        <SegmentedControl
          options={VISIBILITY_OPTIONS}
          value={value}
          onChange={(next) => onChange(next as ProfileVisibilityValue)}
        />
      </View>
    </GlassSurface>
  );
}

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const hasProfile = Boolean(me?._id);
  const incomingRequestCount = useQuery(
    api.followRequests.getIncomingCount,
    hasProfile ? {} : "skip",
  ) as number | undefined;
  const updatePrivacy = useMutation(api.users.updatePrivacy);

  const [loaded, setLoaded] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [visibility, setVisibility] = useState<ProfileVisibilitySettings>(
    DEFAULT_PROFILE_VISIBILITY,
  );
  const [savingPrivate, setSavingPrivate] = useState(false);

  useEffect(() => {
    if (me && !loaded) {
      setIsPrivate(Boolean(me.isPrivate));
      setVisibility(resolveProfileVisibility(me.profileVisibility));
      setLoaded(true);
    }
  }, [loaded, me]);

  const applyPrivateAccount = async (next: boolean) => {
    setSavingPrivate(true);
    setIsPrivate(next);
    try {
      await updatePrivacy({ isPrivate: next });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setIsPrivate(!next);
      notifyError("Could not update", String(error));
    } finally {
      setSavingPrivate(false);
    }
  };

  const handleTogglePrivate = (next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!next && (incomingRequestCount ?? 0) > 0) {
      confirmAction({
        title: "Switch to public?",
        message: `Your ${incomingRequestCount} pending follow request${
          incomingRequestCount === 1 ? "" : "s"
        } will be approved automatically.`,
        confirmLabel: "Switch to public",
        onConfirm: () => void applyPrivateAccount(false),
      });
      return;
    }
    void applyPrivateAccount(next);
  };

  const handleChangeVisibility = (section: ProfileSectionKey, value: ProfileVisibilityValue) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const previous = visibility;
    const next = { ...visibility, [section]: value };
    setVisibility(next);
    void updatePrivacy({ profileVisibility: { [section]: value } }).catch((error) => {
      setVisibility(previous);
      notifyError("Could not update", String(error));
    });
  };

  if (!loaded) {
    return (
      <Screen>
        <View className="mt-24 items-center">
          <ActivityIndicator color="#5A6070" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="px-6 pt-6 pb-12">
        <Text className="text-2xl font-semibold text-text-primary">Privacy</Text>
        <Text className="mt-1 text-sm leading-5 text-text-tertiary">
          Control who can follow you and what people see on your profile.
        </Text>

        {/* ── Private account ── */}
        <View className="mt-8">
          <SectionHeader title="Account" />
          <GlassSurface radius={8} variant="surface" contentStyle={{ padding: 16 }}>
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-dark-elevated">
                <Ionicons
                  name={isPrivate ? "lock-closed" : "lock-open-outline"}
                  size={17}
                  color={isPrivate ? "#38bdf8" : "#9BA1B0"}
                />
              </View>
              <View className="flex-1">
                <Text className="text-base font-medium text-text-primary">
                  Private account
                </Text>
                <Text className="mt-0.5 text-xs leading-4 text-text-tertiary">
                  New followers must be approved by you. Your shows, reviews, lists,
                  and followers are only visible to approved followers.
                </Text>
              </View>
              <Switch
                value={isPrivate}
                disabled={savingPrivate}
                onValueChange={handleTogglePrivate}
                trackColor={{ true: "#0EA5E9", false: "#2A2F3A" }}
                thumbColor="#F1F3F7"
              />
            </View>
          </GlassSurface>

          {isPrivate || (incomingRequestCount ?? 0) > 0 ? (
            <GlassSurface radius={8} variant="surface" style={{ marginTop: 10 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/follow-requests");
                }}
                className="flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:bg-dark-hover hover:bg-dark-hover web:transition-colors"
              >
                <Ionicons name="person-add-outline" size={20} color="#38bdf8" />
                <Text className="flex-1 text-base font-medium text-text-primary">
                  Follow requests
                </Text>
                {(incomingRequestCount ?? 0) > 0 ? (
                  <View className="min-w-[22px] items-center rounded-full bg-brand-500 px-1.5 py-0.5">
                    <Text className="text-xs font-bold text-white">
                      {incomingRequestCount}
                    </Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color="#5A6070" />
              </Pressable>
            </GlassSurface>
          ) : null}
        </View>

        {/* ── Profile sections ── */}
        <View className="mt-10">
          <SectionHeader title="Profile sections" />
          <Text className="mb-4 text-sm leading-5 text-text-tertiary">
            {isPrivate
              ? "Your account is private, so everything below is already limited to approved followers. These settings let you restrict sections even further."
              : "Choose who can see each section of your profile. Followers means only people who follow you."}
          </Text>
          <View className="gap-3">
            {(Object.keys(SECTION_COPY) as ProfileSectionKey[]).map((section) => (
              <VisibilityCard
                key={section}
                section={section}
                value={visibility[section]}
                disabled={false}
                onChange={(value) => handleChangeVisibility(section, value)}
              />
            ))}
          </View>
        </View>

        {/* ── Blocked accounts ── */}
        <View className="mt-10">
          <SectionHeader title="Moderation" />
          <GlassSurface radius={8} variant="surface">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/settings/blocked");
              }}
              className="flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:bg-dark-hover hover:bg-dark-hover web:transition-colors"
            >
              <Ionicons name="remove-circle-outline" size={20} color="#EF4444" />
              <Text className="flex-1 text-base font-medium text-text-primary">
                Blocked accounts
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#5A6070" />
            </Pressable>
          </GlassSurface>
          <Text className="mt-2 text-xs leading-4 text-text-tertiary">
            Blocked accounts can't follow you or interact with your content, and their
            activity is hidden from you.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
