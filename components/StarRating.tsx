import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
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
  // Web-only pointer preview: stars fill up to the hovered one. Never set on
  // native (no hover events), so native rendering is unchanged.
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const interactive = !readonly && Boolean(onChange);
  const displayValue =
    Platform.OS === "web" && interactive && hoveredStar !== null
      ? hoveredStar
      : value;

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
    if (displayValue >= star) return "star";
    if (displayValue >= star - 0.5) return "star-half";
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
            accessibilityRole="button"
            accessibilityLabel={`Rate ${star} of 5`}
            className="active:opacity-70"
            {...(Platform.OS === "web" && interactive
              ? {
                  onHoverIn: () => setHoveredStar(star),
                  onHoverOut: () =>
                    setHoveredStar((current) => (current === star ? null : current)),
                }
              : null)}
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
