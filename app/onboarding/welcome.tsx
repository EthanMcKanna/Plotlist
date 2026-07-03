import { useRouter } from "expo-router";

import { OnboardingTour } from "../../components/OnboardingTour";
import { Screen } from "../../components/Screen";

/**
 * Replay-only entry point for the feature tour (Settings → Help). First-run
 * users get the tour inside the onboarding wizard at /onboarding instead.
 */
export default function WelcomeTourReplayScreen() {
  const router = useRouter();

  return (
    <Screen>
      <OnboardingTour
        ctaLabel="Done"
        onDone={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/home");
          }
        }}
      />
    </Screen>
  );
}
