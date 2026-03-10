import { useCallback, useEffect, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

type FilterDropdownProps = {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
};

const DISMISS_THRESHOLD = 80;
const SCREEN_HEIGHT = Dimensions.get("window").height;

export function FilterDropdown({ options, value, onChange }: FilterDropdownProps) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const insets = useSafeAreaInsets();

  const selectedOption = options.find((o) => o.value === value) ?? options[0];

  const closeSheet = useCallback(() => {
    sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
    backdropOpacity.value = withTiming(0, { duration: 250 });
    setTimeout(() => setSheetVisible(false), 260);
  }, [sheetTranslateY, backdropOpacity]);

  useEffect(() => {
    if (sheetVisible) {
      sheetTranslateY.value = withTiming(0, { duration: 300 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [sheetVisible, sheetTranslateY, backdropOpacity]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        sheetTranslateY.value = e.translationY;
        backdropOpacity.value = Math.max(
          0,
          1 - e.translationY / (DISMISS_THRESHOLD * 3)
        );
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 500) {
        sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(setSheetVisible)(false);
      } else {
        sheetTranslateY.value = withTiming(0, { duration: 200 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetVisible(true);
  }, []);

  const handleSelect = useCallback(
    (option: FilterOption) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(option.value);
      closeSheet();
    },
    [onChange, closeSheet]
  );

  return (
    <>
      <Pressable
        onPress={handleOpen}
        className="flex-row items-center justify-between rounded-2xl px-4 py-3 active:opacity-80"
        style={{ backgroundColor: "#111318" }}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-text-primary">
            {selectedOption.label}
          </Text>
          {selectedOption.count !== undefined && (
            <View className="rounded-full bg-dark-elevated px-2 py-0.5">
              <Text className="text-xs font-medium text-text-tertiary">
                {selectedOption.count}
              </Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-down" size={18} color="#9BA1B0" />
      </Pressable>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          {/* Backdrop */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.6)",
              },
              backdropAnimStyle,
            ]}
          >
            <Pressable onPress={closeSheet} style={{ flex: 1 }} />
          </Animated.View>

          {/* Sheet */}
          <Animated.View style={sheetAnimStyle}>
            <GestureDetector gesture={panGesture}>
              <Animated.View>
                <View
                  style={{
                    backgroundColor: "#1C2028",
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    paddingTop: 12,
                    paddingBottom: insets.bottom + 20,
                  }}
                >
                  {/* Handle — swipe affordance */}
                  <View
                    style={{
                      alignItems: "center",
                      paddingVertical: 8,
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: "#3A3E48",
                      }}
                    />
                  </View>

                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: "#F1F3F7",
                      paddingHorizontal: 24,
                      marginBottom: 16,
                    }}
                  >
                    Filter by status
                  </Text>

                  {/* Options */}
                  <View style={{ paddingHorizontal: 16 }}>
                    {options.map((option) => {
                      const isSelected = option.value === value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => handleSelect(option)}
                          style={{
                            marginBottom: 4,
                            backgroundColor: isSelected
                              ? "rgba(42, 46, 56, 0.8)"
                              : "transparent",
                            borderRadius: 14,
                            paddingVertical: 14,
                            paddingHorizontal: 18,
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "600",
                              color: isSelected ? "#F1F3F7" : "#9BA1B0",
                              flex: 1,
                            }}
                          >
                            {option.label}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {option.count !== undefined && (
                              <Text
                                style={{
                                  fontSize: 14,
                                  color: "#5A6070",
                                }}
                              >
                                {option.count}
                              </Text>
                            )}
                            {isSelected && (
                              <View
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 13,
                                  backgroundColor: "rgba(155, 161, 176, 0.2)",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Ionicons
                                  name="checkmark"
                                  size={16}
                                  color="#9BA1B0"
                                />
                              </View>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </Animated.View>
            </GestureDetector>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
