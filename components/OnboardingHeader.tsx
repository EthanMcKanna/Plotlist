import { Pressable, Text, View } from "react-native";

export function OnboardingHeader({
  step,
  totalSteps,
  title,
  description,
  onSkip,
}: {
  step: number;
  totalSteps: number;
  title: string;
  description?: string;
  onSkip: () => void;
}) {
  return (
    <View className="gap-3 px-6 pt-6">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
          Step {step} of {totalSteps}
        </Text>
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          className="active:opacity-80"
        >
          <Text className="text-sm font-semibold text-text-tertiary">Skip for now</Text>
        </Pressable>
      </View>
      <Text className="text-3xl font-bold tracking-tight text-text-primary">
        {title}
      </Text>
      {description ? (
        <Text className="text-sm text-text-tertiary">{description}</Text>
      ) : null}
    </View>
  );
}
