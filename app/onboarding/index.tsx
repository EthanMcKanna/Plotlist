import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";

import { LoadingScreen } from "../../components/LoadingScreen";
import { OnboardingProfileStep } from "../../components/OnboardingProfileStep";
import { OnboardingTour } from "../../components/OnboardingTour";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/plotlist/api";
import {
  cacheOnboardingStep,
  getCachedOnboardingStep,
  markOnboardingStep,
} from "../../lib/onboardingCache";
import { getWelcomeTourSeen, getWelcomeTourSeenCached } from "../../lib/preferences";
import { useMutation, useQuery } from "../../lib/plotlist/react";

type Stage = "tour" | "profile";

export default function OnboardingWizard() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const setOnboardingStep = useMutation(api.users.setOnboardingStep);

  const [stage, setStage] = useState<Stage | null>(null);

  const completeOnboarding = useCallback(async () => {
    const result = await setOnboardingStep({ step: "complete" });
    cacheOnboardingStep(result?.userId, "complete");
    markOnboardingStep("complete");
    router.replace("/home");
  }, [router, setOnboardingStep]);

  // Resolve the starting stage once `me` has loaded (null means the profile
  // record is still being created — treat it as a brand-new user).
  useEffect(() => {
    if (stage !== null || me === undefined) return;

    const step: string =
      getCachedOnboardingStep(me?._id ?? me?.id) ?? me?.onboardingStep ?? "profile";

    if (step === "complete") {
      router.replace("/home");
      return;
    }
    if (step === "follow" || step === "shows") {
      // Steps from the retired multi-step onboarding — profile is already
      // done, so just finish up. Fall back to the profile stage on failure.
      void completeOnboarding().catch(() => setStage("profile"));
      return;
    }

    // AuthGate warms this cache at startup, so the synchronous path is the
    // norm and the async read is only a cold-start fallback.
    const seen = getWelcomeTourSeenCached();
    if (seen !== null) {
      setStage(seen ? "profile" : "tour");
      return;
    }
    let cancelled = false;
    void getWelcomeTourSeen()
      .then((value) => {
        if (!cancelled) setStage(value ? "profile" : "tour");
      })
      .catch(() => {
        if (!cancelled) setStage("tour");
      });
    return () => {
      cancelled = true;
    };
  }, [completeOnboarding, me, router, stage]);

  if (!stage) {
    return <LoadingScreen />;
  }

  return (
    <Screen>
      {stage === "tour" ? (
        <OnboardingTour
          ctaLabel="Set up my profile"
          onDone={() => setStage("profile")}
        />
      ) : (
        <Animated.View entering={FadeInRight.duration(240)} style={styles.stage}>
          <OnboardingProfileStep
            onComplete={completeOnboarding}
            onSkip={completeOnboarding}
          />
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
});
