import { View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { GlassPressable } from "../../components/NativeGlass";
import { OnboardingPhoneStep } from "../../components/OnboardingPhoneStep";
import { Screen } from "../../components/Screen";
import { SHOW_BACK_BUTTON } from "../../lib/webLayout";

// Settings re-entry point for the optional friend-discovery phone
// verification, for people who skipped it during onboarding.
export default function VerifyPhoneScreen() {
  const router = useRouter();

  const close = async () => {
    router.back();
  };

  return (
    <Screen>
      <View className="px-6 pt-2">
        {SHOW_BACK_BUTTON ? (
          <GlassPressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          radius={20}
          variant="control"
          contentStyle={{
            alignItems: "center",
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
        </GlassPressable>
        ) : null}
      </View>
      <OnboardingPhoneStep showSkip={false} onDone={close} onSkip={close} />
    </Screen>
  );
}
