import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "./PrimaryButton";

// Optional last onboarding stage, shown only when the server has Trakt
// import configured and the account isn't already connected: offer to bring
// an existing Trakt library over instead of starting from zero. Choosing
// import completes onboarding and lands on the full import screen; skipping
// just finishes onboarding — the same flow stays available in Settings.
export function OnboardingImportStep({
  onImport,
  onSkip,
}: {
  onImport: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [importing, setImporting] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const handleImport = async () => {
    if (importing || skipping) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setImporting(true);
    try {
      await onImport();
    } finally {
      setImporting(false);
    }
  };

  const handleSkip = async () => {
    if (importing || skipping) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkipping(true);
    try {
      await onSkip();
    } finally {
      setSkipping(false);
    }
  };

  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View className="flex-row justify-end px-6 pt-2">
        <Pressable
          onPress={handleSkip}
          disabled={skipping || importing}
          accessibilityRole="button"
          accessibilityLabel="Skip importing for now"
          hitSlop={12}
          className="rounded-full px-3 py-1.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-text-tertiary">
            {skipping ? "Skipping..." : "Skip for now"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-3 px-6 pt-2">
        <Text className="text-3xl font-bold tracking-tight text-text-primary">
          Already track your shows?
        </Text>
        <Text className="text-sm leading-5 text-text-tertiary">
          If you use Trakt, Plotlist can import your watched episodes, viewing
          diary, ratings, and watchlist in a couple of minutes — so you start
          with your history instead of a blank slate.
        </Text>
      </View>

      <View className="items-center pt-8">
        <View
          className="items-center justify-center rounded-full bg-dark-elevated"
          style={{ width: 72, height: 72 }}
        >
          <Ionicons name="swap-vertical" size={30} color="#38bdf8" />
        </View>
      </View>

      <View className="gap-4 px-6 pt-8">
        <PrimaryButton
          label={importing ? "One moment…" : "Import from Trakt"}
          onPress={handleImport}
          loading={importing}
        />
        <Text className="text-center text-xs leading-4 text-text-tertiary">
          You'll approve Plotlist on trakt.tv with a one-time code — no password
          shared. You can always import later from Settings.
        </Text>
      </View>
    </ScrollView>
  );
}
