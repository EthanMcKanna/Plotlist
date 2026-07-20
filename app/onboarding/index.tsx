import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";

import { LoadingScreen } from "../../components/LoadingScreen";
import { OnboardingImportStep } from "../../components/OnboardingImportStep";
import { OnboardingPhoneStep } from "../../components/OnboardingPhoneStep";
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
import { callQuery } from "../../lib/plotlist/rpc";
import { useMutation, useQuery } from "../../lib/plotlist/react";

type Stage = "tour" | "profile" | "phone" | "import";

export default function OnboardingWizard() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const setOnboardingStep = useMutation(api.users.setOnboardingStep);

  const [stage, setStage] = useState<Stage | null>(null);

  // Resolved in the background while the user fills earlier stages: the Trakt
  // import stage only appears when the server has it configured and this
  // account isn't already connected. Unresolved or errored reads as "no" —
  // onboarding never waits on it beyond a short grace.
  const traktAvailable = useRef<Promise<boolean> | null>(null);
  if (traktAvailable.current === null) {
    traktAvailable.current = callQuery(api.traktImport.getStatus, {})
      .then((status: any) => Boolean(status?.configured && !status?.account))
      .catch(() => false);
  }

  const completeOnboarding = useCallback(async () => {
    const result = await setOnboardingStep({ step: "complete" });
    cacheOnboardingStep(result?.userId, "complete");
    markOnboardingStep("complete");
    router.replace("/home");
  }, [router, setOnboardingStep]);

  const finishPhoneStage = useCallback(async () => {
    const available = await Promise.race([
      traktAvailable.current ?? Promise.resolve(false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_500)),
    ]);
    if (available) {
      setStage("import");
      return;
    }
    await completeOnboarding();
  }, [completeOnboarding]);

  // Completing via the import path lands on the import screen with home
  // beneath it, so back (or finishing the import) drops into the app.
  const completeOnboardingToImport = useCallback(async () => {
    const result = await setOnboardingStep({ step: "complete" });
    cacheOnboardingStep(result?.userId, "complete");
    markOnboardingStep("complete");
    router.replace("/home");
    router.push("/settings/import-trakt");
  }, [router, setOnboardingStep]);

  // Phone verification is the optional friend-discovery step — Apple sign-ups
  // have no phone hash yet, while phone-OTP accounts already verified one.
  const finishProfileStage = useCallback(async () => {
    if (me?.hasVerifiedPhone) {
      await finishPhoneStage();
      return;
    }
    setStage("phone");
  }, [finishPhoneStage, me?.hasVerifiedPhone]);

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
      ) : stage === "profile" ? (
        <Animated.View entering={FadeInRight.duration(240)} style={styles.stage}>
          <OnboardingProfileStep
            onComplete={finishProfileStage}
            onSkip={finishProfileStage}
          />
        </Animated.View>
      ) : stage === "phone" ? (
        <Animated.View entering={FadeInRight.duration(240)} style={styles.stage}>
          <OnboardingPhoneStep
            onDone={finishPhoneStage}
            onSkip={finishPhoneStage}
          />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInRight.duration(240)} style={styles.stage}>
          <OnboardingImportStep
            onImport={completeOnboardingToImport}
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
