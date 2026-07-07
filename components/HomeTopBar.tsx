import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "./Avatar";
import { GlassPressable } from "./NativeGlass";

type HomeTopBarProps = {
  scrollY: SharedValue<number>;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  notificationCount?: number;
};

export const HOME_TOP_BAR_HEIGHT = 56;
export const HOME_TOP_BAR_SCROLL_GUARD_HEIGHT = 18;
export const HOME_TOP_BAR_TITLE_FADE_START = 24;
export const HOME_TOP_BAR_TITLE_FADE_END = 88;

function clampUnit(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function getHomeTopBarTitleChromeState(scrollOffset: number) {
  const fadeProgress = clampUnit(
    (scrollOffset - HOME_TOP_BAR_TITLE_FADE_START) /
      (HOME_TOP_BAR_TITLE_FADE_END - HOME_TOP_BAR_TITLE_FADE_START),
  );

  return {
    opacity: fadeProgress,
    translateY: 3 * (1 - fadeProgress),
  };
}

export function getHomeTopBarGreeting(now: Date) {
  const hour = now.getHours();
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Tonight";
}

export function getHomeTopBarFirstName(displayName?: string | null) {
  const source = displayName?.trim() || "";
  if (!source) return null;
  const normalized = source.toLowerCase();
  if (normalized === "plotlist" || normalized.startsWith("plotlist ")) return null;
  const first = source.split(/\s+/)[0];
  return first || null;
}

export function getHomeTopBarGreetingLine(
  now: Date,
  displayName?: string | null,
) {
  const greeting = getHomeTopBarGreeting(now);
  const firstName = getHomeTopBarFirstName(displayName);
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

export function getHomeTopBarNotificationsAccessibilityLabel(
  notificationCount = 0,
) {
  if (notificationCount <= 0) return "Notifications";
  return `Notifications, ${notificationCount} unread`;
}

export function getHomeTopBarNotificationsBadgeLabel(notificationCount = 0) {
  if (notificationCount <= 0) return null;
  return notificationCount > 99 ? "99+" : String(notificationCount);
}

export function HomeTopBar({
  scrollY,
  displayName,
  avatarUrl,
  notificationCount = 0,
}: HomeTopBarProps) {
  const insets = useSafeAreaInsets();
  const firstName = getHomeTopBarFirstName(displayName);

  // Blur opacity ramps in over the first 80px of scroll.
  const blurStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 80], [0, 1], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [HOME_TOP_BAR_TITLE_FADE_START, HOME_TOP_BAR_TITLE_FADE_END],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [HOME_TOP_BAR_TITLE_FADE_START, HOME_TOP_BAR_TITLE_FADE_END],
          [3, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View
      testID="home-topbar"
      style={[
        styles.container,
        styles.pointerBoxNone,
        {
          paddingTop: insets.top,
          height:
            insets.top +
            HOME_TOP_BAR_HEIGHT +
            HOME_TOP_BAR_SCROLL_GUARD_HEIGHT,
        },
      ]}
    >
      <Animated.View
        testID="home-topbar-scroll-scrim"
        style={[StyleSheet.absoluteFill, blurStyle, styles.pointerNone]}
      >
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.blurFloor} />
        <View style={styles.blurHairline} />
      </Animated.View>

      <View style={styles.row}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/profile");
          }}
          testID="home-topbar-profile"
          style={styles.profileButton}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          className="active:opacity-80"
        >
          <Avatar uri={avatarUrl} label={firstName ?? "Me"} size={36} />
        </Pressable>

        <View style={[styles.middle, styles.pointerNone]}>
          <Animated.View
            testID="home-topbar-title"
            style={titleStyle}
            pointerEvents="none"
            accessibilityElementsHidden
            aria-hidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              numberOfLines={1}
              style={styles.title}
              accessible={false}
            >
              Plotlist
            </Text>
          </Animated.View>
        </View>

        <View style={styles.actions}>
          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Fresh focus value per tap so the search screen re-focuses
              // (and opens the keyboard) every time, not just the first.
              router.push({
                pathname: "/search",
                params: { focus: String(Date.now()) },
              });
            }}
            testID="home-topbar-search"
            accessibilityRole="button"
            accessibilityLabel="Search"
            radius={8}
            style={styles.actionButton}
            surfaceStyle={styles.actionSurface}
            contentStyle={styles.actionButtonContent}
          >
            <Ionicons
              name="search"
              size={18}
              color="#F1F3F7"
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
          </GlassPressable>

          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/notifications");
            }}
            testID="home-topbar-notifications"
            accessibilityRole="button"
            accessibilityLabel={getHomeTopBarNotificationsAccessibilityLabel(notificationCount)}
            radius={8}
            style={styles.actionButton}
            surfaceStyle={styles.actionSurface}
            contentStyle={styles.actionButtonContent}
          >
            <Ionicons
              name="notifications-outline"
              size={18}
              color="#F1F3F7"
              accessible={false}
              accessibilityElementsHidden
              aria-hidden={true}
              importantForAccessibility="no"
            />
            {notificationCount > 0 ? (
              <View style={styles.badge} pointerEvents="none">
                <Text style={styles.badgeText} accessible={false}>
                  {getHomeTopBarNotificationsBadgeLabel(notificationCount)}
                </Text>
              </View>
            ) : null}
          </GlassPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 50,
  },
  blurFloor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13,15,20,0.88)",
  },
  blurHairline: {
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    height: HOME_TOP_BAR_HEIGHT,
    paddingHorizontal: 18,
  },
  middle: {
    flex: 1,
    height: HOME_TOP_BAR_HEIGHT,
    justifyContent: "center",
  },
  title: {
    color: "#F1F3F7",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  profileButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  actionButton: {
    height: 44,
    width: 44,
  },
  actionSurface: {
    height: 44,
    width: 44,
  },
  actionButtonContent: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  badge: {
    alignItems: "center",
    backgroundColor: "#38BDF8",
    borderRadius: 8,
    height: 16,
    justifyContent: "center",
    minWidth: 16,
    paddingHorizontal: 4,
    position: "absolute",
    right: 5,
    top: 5,
  },
  badgeText: {
    color: "#0B0D12",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  pointerBoxNone: {
    pointerEvents: "box-none",
  },
  pointerNone: {
    pointerEvents: "none",
  },
});
