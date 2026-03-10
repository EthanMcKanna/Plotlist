import { useCallback, useEffect, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type WatchStatus = "watchlist" | "watching" | "completed" | "dropped";

type StatusSelectorProps = {
  currentStatus: WatchStatus | undefined | null;
  onSelect: (status: WatchStatus) => void;
  onRemove?: () => void;
};

const STATUS_CONFIG = {
  watchlist: {
    label: "Watchlist",
    icon: "bookmark" as const,
    iconOutline: "bookmark-outline" as const,
    color: "#0ea5e9",
    bg: "rgba(14, 165, 233, 0.13)",
    borderColor: "rgba(14, 165, 233, 0.25)",
    description: "Save to watch later",
  },
  watching: {
    label: "Watching",
    icon: "play-circle" as const,
    iconOutline: "play-circle-outline" as const,
    color: "#A78BFA",
    bg: "rgba(167, 139, 250, 0.13)",
    borderColor: "rgba(167, 139, 250, 0.25)",
    description: "Currently watching",
  },
  completed: {
    label: "Completed",
    icon: "checkmark-circle" as const,
    iconOutline: "checkmark-circle-outline" as const,
    color: "#22C55E",
    bg: "rgba(34, 197, 94, 0.13)",
    borderColor: "rgba(34, 197, 94, 0.25)",
    description: "Finished watching",
  },
  dropped: {
    label: "Dropped",
    icon: "close-circle" as const,
    iconOutline: "close-circle-outline" as const,
    color: "#EF4444",
    bg: "rgba(239, 68, 68, 0.13)",
    borderColor: "rgba(239, 68, 68, 0.25)",
    description: "Stopped watching",
  },
} as const;

const STATUSES: WatchStatus[] = [
  "watchlist",
  "watching",
  "completed",
  "dropped",
];

const DISMISS_THRESHOLD = 80;
const SCREEN_HEIGHT = Dimensions.get("window").height;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function StatusSelector({
  currentStatus,
  onSelect,
  onRemove,
}: StatusSelectorProps) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const buttonScale = useSharedValue(1);
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const insets = useSafeAreaInsets();

  const hasStatus = currentStatus != null;
  const config = hasStatus ? STATUS_CONFIG[currentStatus] : null;

  const openSheet = useCallback(() => {
    setSheetVisible(true);
  }, []);

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

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openSheet();
  }, [openSheet]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openSheet();
  }, [openSheet]);

  const handleSelectStatus = useCallback(
    (status: WatchStatus) => {
      if (status === currentStatus) {
        onRemove?.();
      } else {
        onSelect(status);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      closeSheet();
    },
    [currentStatus, onSelect, onRemove, closeSheet]
  );

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <>
      {/* ─── Main CTA Button ─── */}
      <AnimatedPressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={() => {
          buttonScale.value = withSpring(0.98, { damping: 20, stiffness: 300 });
        }}
        onPressOut={() => {
          buttonScale.value = withSpring(1, { damping: 20, stiffness: 300 });
        }}
        style={[
          buttonAnimStyle,
          {
            backgroundColor: hasStatus ? config!.bg : "#161A22",
            borderWidth: 1,
            borderColor: hasStatus ? config!.borderColor : "#2A2E38",
            borderRadius: 16,
            height: 52,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          },
        ]}
      >
        <Ionicons
          name={hasStatus ? config!.icon : "add-circle-outline"}
          size={20}
          color={hasStatus ? config!.color : "#9BA1B0"}
        />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: hasStatus ? config!.color : "#F1F3F7",
            flex: 1,
          }}
        >
          {hasStatus ? config!.label : "Set Status"}
        </Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color={hasStatus ? config!.color : "#5A6070"}
        />
      </AnimatedPressable>

      {/* ─── Bottom Sheet ─── */}
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
            <Pressable
              onPress={closeSheet}
              style={{ flex: 1 }}
            />
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
                    Set Status
                  </Text>

                  {/* Status Options */}
                  <View style={{ paddingHorizontal: 16 }}>
                    {STATUSES.map((status) => {
                      const cfg = STATUS_CONFIG[status];
                      const isActive = status === currentStatus;
                      return (
                        <Pressable
                          key={status}
                          onPress={() => handleSelectStatus(status)}
                          style={{ marginBottom: 4 }}
                        >
                          <View
                            style={{
                              backgroundColor: isActive
                                ? cfg.bg
                                : "transparent",
                              borderRadius: 14,
                              paddingVertical: 14,
                              paddingHorizontal: 14,
                              flexDirection: "row",
                              alignItems: "center",
                              borderWidth: 1,
                              borderColor: isActive
                                ? cfg.borderColor
                                : "transparent",
                            }}
                          >
                            <View
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 12,
                                backgroundColor: isActive
                                  ? `${cfg.color}20`
                                  : "rgba(42, 46, 56, 0.6)",
                                alignItems: "center",
                                justifyContent: "center",
                                marginRight: 14,
                              }}
                            >
                              <Ionicons
                                name={isActive ? cfg.icon : cfg.iconOutline}
                                size={22}
                                color={isActive ? cfg.color : "#9BA1B0"}
                              />
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 16,
                                  fontWeight: "600",
                                  color: isActive ? cfg.color : "#F1F3F7",
                                }}
                              >
                                {cfg.label}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 13,
                                  color: isActive
                                    ? `${cfg.color}99`
                                    : "#5A6070",
                                  marginTop: 2,
                                }}
                              >
                                {cfg.description}
                              </Text>
                            </View>

                            {isActive && (
                              <View
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 13,
                                  backgroundColor: `${cfg.color}20`,
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Ionicons
                                  name="checkmark"
                                  size={16}
                                  color={cfg.color}
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
