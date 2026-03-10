import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

type ContactsSyncCardProps = {
  title: string;
  description: string;
  buttonLabel: string;
  onPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  onDismiss?: () => void;
  loading?: boolean;
  meta?: string | null;
};

export function ContactsSyncCard({
  title,
  description,
  buttonLabel,
  onPress,
  secondaryLabel,
  onSecondaryPress,
  onDismiss,
  loading = false,
  meta,
}: ContactsSyncCardProps) {
  return (
    <View className="rounded-3xl border border-dark-border bg-dark-card px-5 py-5">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-lg font-semibold text-text-primary">{title}</Text>
        {onDismiss ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDismiss();
            }}
            hitSlop={12}
            className="rounded-full p-1 active:opacity-70"
          >
            <Ionicons name="close" size={20} color="#71717a" />
          </Pressable>
        ) : null}
      </View>
      <Text className="mt-2 text-sm leading-6 text-text-tertiary">
        {description}
      </Text>
      {meta ? (
        <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-400">
          {meta}
        </Text>
      ) : null}
      <View className="mt-4 gap-3">
        <PrimaryButton label={buttonLabel} onPress={onPress} loading={loading} />
        {secondaryLabel && onSecondaryPress ? (
          <SecondaryButton label={secondaryLabel} onPress={onSecondaryPress} />
        ) : null}
      </View>
    </View>
  );
}
