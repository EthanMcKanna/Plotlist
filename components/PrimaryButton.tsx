import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  className,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const handlePress = () => {
    if (!disabled && !loading) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={`items-center justify-center rounded-full bg-brand-500 px-5 py-3.5 active:bg-brand-600 ${
        disabled || loading ? "opacity-50" : ""
      } ${className ?? ""}`}
      style={{
        shadowColor: "#0ea5e9",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      }}
    >
      <View className="flex-row items-center gap-2">
        {loading ? <ActivityIndicator color="#fff" /> : null}
        <Text className="text-base font-semibold text-white">{label}</Text>
      </View>
    </Pressable>
  );
}
