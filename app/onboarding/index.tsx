import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeInLeft, FadeInRight } from "react-native-reanimated";

import { LoadingScreen } from "../../components/LoadingScreen";
import { OnboardingFollowStep } from "../../components/OnboardingFollowStep";
import { OnboardingProfileStep } from "../../components/OnboardingProfileStep";
import { OnboardingTasteStep } from "../../components/OnboardingTasteStep";
import { OnboardingTour } from "../../components/OnboardingTour";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import {
  cacheOnboardingStep,
  getCachedOnboardingStep,
  markOnboardingStep,
  type OnboardingStep,
} from "../../lib/onboardingCache";
import { getWelcomeTourSeen } from "../../lib/preferences";
import { useMutation, useQuery } from "../../lib/plotlist/react";

type Stage = "tour" | "profile" | "follow" | "taste";

const SETUP_STAGES = ["profile", "follow", "taste"] as const;

function SetupHeader({
  stage,
  onBack,
  onSkip,
  skipping,
}: {
  stage: (typeof SETUP_STAGES)[number];
  onBack: (() => void) | null;
  onSkip: () => void;
  skipping: boolean;
}) {
  const stageIndex = SETUP_STAGES.indexOf(stage);

  return (
    <View className="gap-3 px-6 pt-2">
      <View className="flex-row items-center justify-between">
        {onBack ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onBack();
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to the previous step"
            hitSlop={12}
            className="active:opacity-80"
          >
            <Ionicons name="chevron-back" size={22} color="#9BA1B0" />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <Text className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
          Step {stageIndex + 1} of {SETUP_STAGES.length}
        </Text>
        <Pressable
          onPress={onSkip}
          disabled={skipping}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding for now"
          hitSlop={12}
          className="active:opacity-80"
        >
          <Text className="text-sm font-semibold text-text-tertiary">
            {skipping ? "Skipping..." : "Skip for now"}
          </Text>
        </Pressable>
      </View>
      <View className="flex-row" style={{ gap: 6 }}>
        {SETUP_STAGES.map((key, index) => (
          <View
            key={key}
            className={`h-1 flex-1 rounded-full ${
              index <= stageIndex ? "bg-brand-500" : "bg-dark-border"
            }`}
          />
        ))}
      </View>
    </View>
  );
}

export default function OnboardingWizard() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const setOnboardingStep = useMutation(api.users.setOnboardingStep);

  const [stage, setStage] = useState<Stage | null>(null);
  const [skipping, setSkipping] = useState(false);
  const directionRef = useRef<"forward" | "back">("forward");

  // Resolve the starting stage once: resume mid-onboarding users at their
  // server-side step, and only show the tour to users at the very start who
  // haven't seen it on this device.
  useEffect(() => {
    if (stage !== null || !me) return;
    const step: string =
      getCachedOnboardingStep(me._id ?? me.id) ?? me.onboardingStep ?? "profile";

    if (step === "complete") {
      router.replace("/home");
      return;
    }
    if (step === "follow") {
      setStage("follow");
      return;
    }
    if (step === "shows") {
      setStage("taste");
      return;
    }
    let cancelled = false;
    void getWelcomeTourSeen()
      .then((seen) => {
        if (!cancelled) setStage(seen ? "profile" : "tour");
      })
      .catch(() => {
        if (!cancelled) setStage("tour");
      });
    return () => {
      cancelled = true;
    };
  }, [me, router, stage]);

  const goTo = useCallback((next: Stage, direction: "forward" | "back") => {
    directionRef.current = direction;
    setStage(next);
  }, []);

  const persistStep = useCallback(
    async (step: OnboardingStep) => {
      const result = await setOnboardingStep({ step });
      cacheOnboardingStep(result?.userId, step);
      markOnboardingStep(step);
    },
    [setOnboardingStep],
  );

  const advanceFromProfile = useCallback(async () => {
    await persistStep("follow");
    goTo("follow", "forward");
  }, [goTo, persistStep]);

  const advanceFromFollow = useCallback(async () => {
    try {
      await persistStep("shows");
      goTo("taste", "forward");
    } catch (error) {
      Alert.alert("Could not continue", String(error));
    }
  }, [goTo, persistStep]);

  const completeOnboarding = useCallback(async () => {
    await persistStep("complete");
    router.replace("/home");
  }, [persistStep, router]);

  const handleSkip = useCallback(async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      await completeOnboarding();
    } catch (error) {
      Alert.alert("Could not skip", String(error));
    } finally {
      setSkipping(false);
    }
  }, [completeOnboarding, skipping]);

  if (!stage) {
    return <LoadingScreen />;
  }

  if (stage === "tour") {
    return (
      <Screen>
        <OnboardingTour
          ctaLabel="Set up my profile"
          onDone={() => goTo("profile", "forward")}
        />
      </Screen>
    );
  }

  const entering =
    directionRef.current === "back"
      ? FadeInLeft.duration(240)
      : FadeInRight.duration(240);

  return (
    <Screen>
      <SetupHeader
        stage={stage}
        onBack={
          stage === "follow"
            ? () => goTo("profile", "back")
            : stage === "taste"
              ? () => goTo("follow", "back")
              : null
        }
        onSkip={handleSkip}
        skipping={skipping}
      />
      <Animated.View key={stage} entering={entering} style={styles.stage}>
        {stage === "profile" ? (
          <OnboardingProfileStep onAdvance={advanceFromProfile} />
        ) : stage === "follow" ? (
          <OnboardingFollowStep onAdvance={advanceFromFollow} />
        ) : (
          <OnboardingTasteStep onComplete={completeOnboarding} />
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backSpacer: {
    width: 22,
  },
  stage: {
    flex: 1,
  },
});
