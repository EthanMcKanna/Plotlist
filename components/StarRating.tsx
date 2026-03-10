import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  readonly?: boolean;
};

export function StarRating({
  value,
  onChange,
  size = 28,
  readonly = false,
}: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];

  const handlePress = (star: number) => {
    if (readonly || !onChange) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Allow half-star ratings by tapping the same star again
    if (value === star) {
      onChange(star - 0.5);
    } else if (value === star - 0.5) {
      onChange(0);
    } else {
      onChange(star);
    }
  };

  const getStarType = (star: number): "star" | "star-half" | "star-outline" => {
    if (value >= star) return "star";
    if (value >= star - 0.5) return "star-half";
    return "star-outline";
  };

  return (
    <View className="flex-row gap-1">
      {stars.map((star) => {
        const starType = getStarType(star);
        return (
          <Pressable
            key={star}
            onPress={() => handlePress(star)}
            disabled={readonly}
            className="active:opacity-70"
          >
            <Ionicons
              name={starType}
              size={size}
              color={starType === "star-outline" ? "#5A6070" : "#FBBF24"}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
