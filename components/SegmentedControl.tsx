import { useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

type SegmentedControlProps = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

const PADDING = 4;

export function SegmentedControl({
  options,
  value,
  onChange,
}: SegmentedControlProps) {
  const selectedIndex = options.findIndex((o) => o.value === value);
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useSharedValue(0);
  const segmentWidth =
    containerWidth > 0 ? (containerWidth - PADDING * 2) / options.length : 0;

  useEffect(() => {
    if (segmentWidth > 0) {
      translateX.value = withSpring(selectedIndex * segmentWidth, {
        damping: 20,
        stiffness: 250,
        mass: 0.7,
      });
    }
  }, [selectedIndex, segmentWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: segmentWidth,
  }));

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View
      className="flex-row rounded-2xl p-1"
      style={{ backgroundColor: "#111318" }}
      onLayout={handleLayout}
    >
      {segmentWidth > 0 && (
        <Animated.View
          className="absolute top-1 bottom-1 left-1 rounded-xl bg-dark-card"
          style={[
            indicatorStyle,
            {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 4,
              elevation: 4,
            },
          ]}
        />
      )}
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(option.value);
            }}
            className="z-10 flex-1 items-center justify-center py-2.5"
          >
            <Text
              className={`text-sm font-semibold ${
                isActive ? "text-text-primary" : "text-text-tertiary"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
