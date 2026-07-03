import { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

export type WelcomeSlide = {
  key: string;
  title: string;
  description: string;
};

export const WELCOME_SLIDES: WelcomeSlide[] = [
  {
    key: "welcome",
    title: "Welcome to Plotlist",
    description:
      "Every show you watch, love, and can't wait for — all in one place.",
  },
  {
    key: "track",
    title: "Track every episode",
    description:
      "Check off episodes as you watch and rate them while the credits roll.",
  },
  {
    key: "up-next",
    title: "Always know what's next",
    description:
      "Plotlist keeps your place in every series and lines up tonight's episode for you.",
  },
  {
    key: "discover",
    title: "Find your next obsession",
    description:
      "Search the full catalog or browse curated picks tuned to your taste.",
  },
  {
    key: "friends",
    title: "Watch together",
    description:
      "Follow friends, compare ratings, and see what everyone's bingeing.",
  },
];

type SlideAnimationProps = {
  scrollX: SharedValue<number>;
  index: number;
  width: number;
};

/**
 * Fades/slides a decorative element in as its page scrolls toward center.
 * Higher `order` values land later, creating a stagger. Transform and
 * opacity only, so everything stays on the GPU.
 */
function StaggerIn({
  scrollX,
  index,
  width,
  order = 0,
  style,
  children,
}: SlideAnimationProps & {
  order?: number;
  style?: ViewStyle | ViewStyle[];
  children: ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    const t = interpolate(
      progress,
      [0.35 + order * 0.13, 0.85 + order * 0.03],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: t,
      transform: [
        { translateY: (1 - t) * 18 },
        { scale: 0.92 + t * 0.08 },
      ],
    };
  });

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

function Halo({ color = "rgba(14,165,233,0.10)" }: { color?: string }) {
  return (
    <View pointerEvents="none" style={styles.haloWrap}>
      <View style={[styles.haloOuter, { backgroundColor: color }]} />
      <View style={[styles.haloInner, { backgroundColor: color }]} />
    </View>
  );
}

function MockCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.mockCard, style]}>{children}</View>;
}

function StarRow({ count = 5, size = 14 }: { count?: number; size?: number }) {
  return (
    <View className="flex-row" style={{ gap: 3 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Ionicons
          key={i}
          name={i < count ? "star" : "star-outline"}
          size={size}
          color={i < count ? "#F59E0B" : "#5A6070"}
        />
      ))}
    </View>
  );
}

function AvatarDot({
  initial,
  color,
  size = 34,
  style,
}: {
  initial: string;
  color: string;
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.avatarDot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    >
      <Text className="text-sm font-bold text-white">{initial}</Text>
    </View>
  );
}

// ── Slide 1: brand — fanned poster cards ──

const POSTER_GRADIENTS: [string, string][] = [
  ["#0B3B54", "#0ea5e9"],
  ["#3A2A08", "#F59E0B"],
  ["#0B3B2B", "#22C55E"],
];

const POSTER_ICONS = ["tv-outline", "play", "heart"] as const;

function BrandSlide(props: SlideAnimationProps) {
  return (
    <View style={styles.stage}>
      <Halo />
      <View style={styles.posterFan}>
        {[-1, 1, 0].map((slot, i) => {
          const fanIndex = slot === -1 ? 0 : slot === 1 ? 2 : 1;
          return (
            <View
              key={fanIndex}
              style={[
                styles.posterSlot,
                slot === 0
                  ? styles.posterCenter
                  : {
                      transform: [
                        { rotate: `${slot * 12}deg` },
                        { translateX: slot * 58 },
                        { translateY: 14 },
                      ],
                    },
              ]}
            >
              <StaggerIn {...props} order={i} style={styles.posterCard}>
                <LinearGradient
                  colors={POSTER_GRADIENTS[fanIndex]}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.posterFill}
                >
                  <Ionicons
                    name={POSTER_ICONS[fanIndex]}
                    size={30}
                    color="rgba(255,255,255,0.85)"
                  />
                </LinearGradient>
              </StaggerIn>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Slide 2: episode tracking ──

const TRACK_EPISODES = [
  { code: "E7", title: "Chikhai Bardo" },
  { code: "E8", title: "Sweet Vitriol" },
  { code: "E9", title: "The After Hours" },
];

function TrackSlide(props: SlideAnimationProps) {
  return (
    <View style={styles.stage}>
      <Halo color="rgba(34,197,94,0.08)" />
      <StaggerIn {...props} order={0}>
        <MockCard style={{ width: 268 }}>
          <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
            Severance · Season 2
          </Text>
          <View className="mt-3" style={{ gap: 10 }}>
            {TRACK_EPISODES.map((episode, i) => (
              <View key={episode.code} className="flex-row items-center" style={{ gap: 10 }}>
                <Text className="w-7 text-xs font-semibold text-text-tertiary">
                  {episode.code}
                </Text>
                <Text className="flex-1 text-sm font-medium text-text-primary">
                  {episode.title}
                </Text>
                <StaggerIn {...props} order={i + 1}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                  </View>
                </StaggerIn>
              </View>
            ))}
          </View>
          <View className="mt-4 flex-row items-center justify-between border-t border-dark-border pt-3">
            <Text className="text-xs text-text-tertiary">Your rating</Text>
            <StaggerIn {...props} order={4}>
              <StarRow />
            </StaggerIn>
          </View>
        </MockCard>
      </StaggerIn>
    </View>
  );
}

// ── Slide 3: up next ──

const UP_NEXT = [
  { show: "The Bear", episode: "S3 E1 · Tomorrow", progress: 0.72, colors: POSTER_GRADIENTS[1] },
  { show: "Fallout", episode: "S1 E5 · The Past", progress: 0.4, colors: POSTER_GRADIENTS[0] },
];

function UpNextSlide(props: SlideAnimationProps) {
  return (
    <View style={styles.stage}>
      <Halo />
      <View style={{ gap: 12 }}>
        {UP_NEXT.map((item, i) => (
          <StaggerIn key={item.show} {...props} order={i}>
            <MockCard style={styles.upNextCard}>
              <LinearGradient
                colors={item.colors}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={styles.upNextThumb}
              >
                <Ionicons name="play" size={16} color="rgba(255,255,255,0.9)" />
              </LinearGradient>
              <View className="flex-1" style={{ gap: 4 }}>
                <Text className="text-[10px] font-bold uppercase tracking-widest text-brand-400">
                  Up next
                </Text>
                <Text className="text-sm font-semibold text-text-primary">
                  {item.show}
                </Text>
                <Text className="text-xs text-text-tertiary">{item.episode}</Text>
                <View style={styles.progressTrack}>
                  <StaggerIn
                    {...props}
                    order={i + 1.4}
                    style={[styles.progressFill, { width: `${item.progress * 100}%` }]}
                  >
                    <View style={styles.progressFillInner} />
                  </StaggerIn>
                </View>
              </View>
            </MockCard>
          </StaggerIn>
        ))}
      </View>
    </View>
  );
}

// ── Slide 4: discover ──

const DISCOVER_CHIPS = ["Comfort comedy", "Crime thrillers", "Prestige drama"];

function DiscoverSlide(props: SlideAnimationProps) {
  return (
    <View style={styles.stage}>
      <Halo color="rgba(245,158,11,0.08)" />
      <View style={{ gap: 14, alignItems: "center" }}>
        <StaggerIn {...props} order={0}>
          <View style={styles.searchPill}>
            <Ionicons name="search" size={16} color="#9BA1B0" />
            <Text className="text-sm text-text-secondary">slow-burn sci-fi</Text>
            <View style={styles.searchCursor} />
          </View>
        </StaggerIn>
        <View className="flex-row flex-wrap justify-center" style={{ gap: 8 }}>
          {DISCOVER_CHIPS.map((chip, i) => (
            <StaggerIn key={chip} {...props} order={i + 1}>
              <View style={styles.chip}>
                <Ionicons name="sparkles-outline" size={12} color="#F59E0B" />
                <Text className="text-xs font-medium text-text-secondary">{chip}</Text>
              </View>
            </StaggerIn>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Slide 5: friends ──

function FriendsSlide(props: SlideAnimationProps) {
  return (
    <View style={styles.stage}>
      <Halo color="rgba(34,197,94,0.08)" />
      <View style={{ gap: 12, alignItems: "center" }}>
        <StaggerIn {...props} order={0}>
          <View className="flex-row items-center">
            <AvatarDot initial="M" color="#B45309" />
            <AvatarDot initial="J" color="#15803D" style={styles.avatarOverlap} />
            <AvatarDot initial="S" color="#0284c7" style={styles.avatarOverlap} />
          </View>
        </StaggerIn>
        <StaggerIn {...props} order={1}>
          <MockCard style={styles.activityCard}>
            <AvatarDot initial="M" color="#B45309" size={30} />
            <View className="flex-1" style={{ gap: 3 }}>
              <Text className="text-sm text-text-primary">
                <Text className="font-semibold">Maya</Text> finished Severance
              </Text>
              <StarRow size={12} />
            </View>
          </MockCard>
        </StaggerIn>
        <StaggerIn {...props} order={2}>
          <MockCard style={styles.activityCard}>
            <AvatarDot initial="J" color="#15803D" size={30} />
            <View className="flex-1">
              <Text className="text-sm leading-5 text-text-primary">
                <Text className="font-semibold">Jordan</Text> added Fallout to their
                watchlist
              </Text>
            </View>
          </MockCard>
        </StaggerIn>
      </View>
    </View>
  );
}

const SLIDE_ILLUSTRATIONS = [
  BrandSlide,
  TrackSlide,
  UpNextSlide,
  DiscoverSlide,
  FriendsSlide,
];

export function WelcomeSlideIllustration(props: SlideAnimationProps) {
  const Illustration = SLIDE_ILLUSTRATIONS[props.index] ?? BrandSlide;
  return <Illustration {...props} />;
}

const styles = StyleSheet.create({
  activityCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: 264,
  },
  avatarDot: {
    alignItems: "center",
    borderColor: "#0D0F14",
    borderWidth: 2,
    justifyContent: "center",
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  checkCircle: {
    alignItems: "center",
    backgroundColor: "#22C55E",
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  chip: {
    alignItems: "center",
    backgroundColor: "rgba(28,32,40,0.9)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  haloInner: {
    borderRadius: 110,
    height: 220,
    position: "absolute",
    width: 220,
  },
  haloOuter: {
    borderRadius: 150,
    height: 300,
    position: "absolute",
    width: 300,
  },
  haloWrap: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  mockCard: {
    backgroundColor: "rgba(22,26,34,0.92)",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  posterCard: {
    borderRadius: 14,
    height: 128,
    overflow: "hidden",
    width: 90,
  },
  posterCenter: {
    transform: [{ translateY: -8 }],
    zIndex: 2,
  },
  posterSlot: {
    position: "absolute",
  },
  posterFan: {
    alignItems: "center",
    height: 170,
    justifyContent: "center",
    width: 240,
  },
  posterFill: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  progressFill: {
    height: 4,
  },
  progressFillInner: {
    backgroundColor: "#0ea5e9",
    borderRadius: 2,
    flex: 1,
  },
  progressTrack: {
    backgroundColor: "#2A2E38",
    borderRadius: 2,
    height: 4,
    marginTop: 4,
    overflow: "hidden",
    width: "100%",
  },
  searchCursor: {
    backgroundColor: "#0ea5e9",
    borderRadius: 1,
    height: 16,
    width: 2,
  },
  searchPill: {
    alignItems: "center",
    backgroundColor: "rgba(28,32,40,0.95)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    width: 240,
  },
  stage: {
    alignItems: "center",
    height: 300,
    justifyContent: "center",
    width: "100%",
  },
  upNextCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    padding: 12,
    width: 264,
  },
  upNextThumb: {
    alignItems: "center",
    borderRadius: 10,
    height: 64,
    justifyContent: "center",
    width: 46,
  },
});
