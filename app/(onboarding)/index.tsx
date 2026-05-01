import { useEffect } from "react";
import { useQuery } from "../../lib/plotlist/react";
import { useRouter } from "expo-router";

import { api } from "../../lib/plotlist/api";
import { LoadingScreen } from "../../components/LoadingScreen";

export default function OnboardingIndex() {
  const router = useRouter();
  const me = useQuery(api.users.me);

  useEffect(() => {
    if (!me) return;

    const step = me.onboardingStep;

    if (!step || step === "complete") {
      router.replace("/home");
      return;
    }

    const nextRoute =
      step === "profile"
        ? "/profile"
        : step === "follow"
          ? "/follow"
          : "/shows";
    router.replace(nextRoute);
  }, [me, router]);

  return <LoadingScreen />;
}
