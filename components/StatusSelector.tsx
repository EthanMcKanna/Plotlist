import { useCallback, useEffect, useState } from "react";
import { Dimensions, Modal, Platform, Pressable, Text, View } from "react-native";
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

import {
  useIsDesktopWeb,
  useIsWideLayout,
  useWebSheetStyle,
} from "../lib/webLayout";
import { GlassSurface } from "./NativeGlass";

type WatchStatus =
  | "watchlist"
  | "watching"
  | "caught_up"
  | "finished"
  | "paused"
  | "dropped";

type StatusSelectorProps = {
  currentStatus: WatchStatus | "completed" | undefined | null;
  onSelect: (status: WatchStatus) => void;
  onRemove?: () => void;
};

// Every displayable status, including the auto-managed tiers the server sets
// (caught_up/finished) — the button surface renders whichever the show holds.
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
  caught_up: {
    label: "Caught Up",
    icon: "checkmark-done-circle" as const,
    iconOutline: "checkmark-done-circle-outline" as const,
    color: "#34D399",
    bg: "rgba(52, 211, 153, 0.13)",
    borderColor: "rgba(52, 211, 153, 0.25)",
    description: "Watched everything out so far",
  },
  finished: {
    label: "Finished",
    icon: "checkmark-circle" as const,
    iconOutline: "checkmark-circle-outline" as const,
    color: "#22C55E",
    bg: "rgba(34, 197, 94, 0.13)",
    borderColor: "rgba(34, 197, 94, 0.25)",
    description: "Watched the whole series",
  },
  paused: {
    label: "Paused",
    icon: "pause-circle" as const,
    iconOutline: "pause-circle-outline" as const,
    color: "#FBBF24",
    bg: "rgba(251, 191, 36, 0.13)",
    borderColor: "rgba(251, 191, 36, 0.25)",
    description: "Taking a break — pick it up later",
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

// The sheet offers one "Watched" choice instead of caught-up vs finished —
// the server marks every released episode watched and lands on the right
// tier for the show's air status (caught_up while it's returning, finished
// once it has ended). Which option reads as active is mapped below.
const STATUSES: WatchStatus[] = [
  "watchlist",
  "watching",
  "finished",
  "paused",
  "dropped",
];

// currentStatus → the sheet option that should light up. Legacy "completed"
// rows may still be cached client-side pre-migration.
function toSheetStatus(
  status: WatchStatus | "completed" | null | undefined,
): WatchStatus | null {
  if (!status) return null;
  if (status === "completed" || status === "caught_up") return "finished";
  return status;
}

const DISMISS_THRESHOLD = 80;
const SCREEN_HEIGHT = Dimensions.get("window").height;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function StatusSelector({
  currentStatus,
  onSelect,
  onRemove,
}: StatusSelectorProps) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<
    WatchStatus | "completed" | null | undefined
  >(currentStatus);
  const buttonScale = useSharedValue(1);
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const isDesktopWeb = useIsDesktopWeb();
  const isWideLayout = useIsWideLayout();
  const sheetStyle = useWebSheetStyle(440);

  useEffect(() => {
    setSelectedStatus(currentStatus);
  }, [currentStatus]);

  const displayStatus =
    selectedStatus === "completed" ? "finished" : selectedStatus;
  const hasStatus = displayStatus != null;
  const config = hasStatus ? STATUS_CONFIG[displayStatus] : null;
  const activeSheetStatus = toSheetStatus(selectedStatus);

  const openSheet = useCallback(() => {
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    if (!isDesktopWeb) {
      sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
    }
    backdropOpacity.value = withTiming(0, { duration: 250 });
    setTimeout(() => setSheetVisible(false), 260);
  }, [isDesktopWeb, sheetTranslateY, backdropOpacity]);

  useEffect(() => {
    if (sheetVisible) {
      // Desktop web shows a centered dialog that fades in; phones and iPad
      // keep the slide-from-bottom sheet.
      sheetTranslateY.value = isDesktopWeb ? 0 : withTiming(0, { duration: 300 });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [sheetVisible, isDesktopWeb, sheetTranslateY, backdropOpacity]);

  const panGesture = Gesture.Pan()
    // Mouse drags on desktop web must not drag the dialog around; touch
    // drag-dismiss stays on phones and iPad.
    .enabled(!isDesktopWeb)
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
    opacity: isDesktopWeb ? backdropOpacity.value : 1,
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
      const isReselect = status === toSheetStatus(selectedStatus);
      setSelectedStatus(isReselect ? null : status);
      sheetTranslateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
      setSheetVisible(false);
      if (isReselect) {
        onRemove?.();
      } else {
        onSelect(status);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [backdropOpacity, onSelect, onRemove, selectedStatus, sheetTranslateY]
  );

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <>
      {/* ─── Main CTA Button ─── */}
      <AnimatedPressable
        accessibilityRole="button"
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
            borderRadius: 16,
            height: 52,
          },
        ]}
      >
        <GlassSurface
          radius={16}
          variant={hasStatus ? "prominent" : "control"}
          borderColor={hasStatus ? config!.borderColor : undefined}
          fallbackColor={hasStatus ? config!.bg : "#161A22"}
          tintColor={hasStatus ? `${config!.color}26` : undefined}
          interactive
          contentStyle={{
            alignItems: "center",
            flexDirection: "row",
            gap: 10,
            height: 52,
            paddingHorizontal: 16,
          }}
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
        </GlassSurface>
      </AnimatedPressable>

      {/* ─── Bottom Sheet ─── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <View
          style={{
            flex: 1,
            justifyContent: isDesktopWeb ? "center" : "flex-end",
          }}
        >
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
          <Animated.View
            style={[
              sheetAnimStyle,
              sheetStyle,
              // Wide iPad keeps its floating bottom sheet (pre-dialog look);
              // desktop web is centered so no bottom float.
              isWideLayout && !isDesktopWeb ? { marginBottom: 24 } : null,
            ]}
          >
            <GestureDetector gesture={panGesture}>
              <Animated.View>
                <GlassSurface
                  radius={28}
                  variant="sheet"
                  style={{
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    borderBottomLeftRadius: isWideLayout ? 24 : 0,
                    borderBottomRightRadius: isWideLayout ? 24 : 0,
                  }}
                  contentStyle={{
                    paddingTop: 12,
                    paddingBottom: isWideLayout ? 20 : insets.bottom + 20,
                  }}
                >
                  {/* Handle — swipe affordance; the sheet stays
                      drag-dismissable on iPad, so only desktop web hides it */}
                  {isDesktopWeb ? null : (
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
                  )}

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
                      // The "finished" slot renders whatever tier the show
                      // actually holds (Caught Up for returning series), so
                      // the sheet mirrors the button.
                      const cfg =
                        status === "finished" && displayStatus === "caught_up"
                          ? STATUS_CONFIG.caught_up
                          : STATUS_CONFIG[status];
                      const isActive = status === activeSheetStatus;
                      return (
                        <Pressable
                          key={status}
                          onPress={() => handleSelectStatus(status)}
                          style={(state) => [
                            { marginBottom: 4 },
                            Platform.OS === "web" &&
                            (state as { hovered?: boolean }).hovered &&
                            !isActive
                              ? {
                                  backgroundColor: "rgba(42, 46, 56, 0.5)",
                                  borderRadius: 14,
                                }
                              : null,
                          ]}
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
                </GlassSurface>
              </Animated.View>
            </GestureDetector>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
