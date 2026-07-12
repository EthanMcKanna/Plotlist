import { useCallback, useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from "react-native";
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

const indicatorShadow =
  Platform.OS === "web"
    ? ({
        boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
      } as ViewStyle)
    : {
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 4,
      };

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
    <View style={styles.container} onLayout={handleLayout}>
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            indicatorStyle,
            styles.indicator,
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

const styles = {
  container: {
    backgroundColor: "rgba(17,19,24,0.92)",
    borderColor: "#2A2E38",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row" as const,
    padding: PADDING,
  },
  indicator: {
    backgroundColor: "rgba(241,243,247,0.10)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    position: "absolute" as const,
    top: 4,
    ...indicatorShadow,
  },
};
