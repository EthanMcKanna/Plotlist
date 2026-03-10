import { Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";

export function SecondaryButton({
  label,
  onPress,
  className,
}: {
  label: string;
  onPress: () => void;
  className?: string;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      className={`items-center justify-center rounded-full border border-dark-border px-5 py-3 active:bg-dark-hover ${
        className ?? ""
      }`}
    >
      <Text className="text-base font-semibold text-text-secondary">{label}</Text>
    </Pressable>
  );
}
