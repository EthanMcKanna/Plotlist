import { Image } from "expo-image";
import { Text, View } from "react-native";

function initials(label?: string | null) {
  if (!label) return "";
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
  return (first + second).toUpperCase();
}

export function Avatar({
  uri,
  label,
  size = 40,
  glow = false,
}: {
  uri?: string | null;
  label?: string | null;
  size?: number;
  glow?: boolean;
}) {
  const avatar = uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
    />
  ) : (
    <View
      className="items-center justify-center rounded-full bg-dark-elevated"
      style={{ width: size, height: size }}
    >
      <Text className="text-xs font-semibold text-text-secondary">
        {initials(label)}
      </Text>
    </View>
  );

  if (glow) {
    return (
      <View
        style={{
          boxShadow: "0 0 20px rgba(14,165,233,0.25)",
          borderRadius: size / 2,
        }}
      >
        {avatar}
      </View>
    );
  }

  return avatar;
}
