import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { PrimaryButton } from "./PrimaryButton";
import { WELCOME_SLIDES, WelcomeSlideIllustration } from "./WelcomeTourSlides";
import { setWelcomeTourSeen } from "../lib/preferences";

const SLIDE_COUNT = WELCOME_SLIDES.length;
const DOT_SIZE = 8;
const DOT_GAP = 8;
const DOT_STRIDE = DOT_SIZE + DOT_GAP;

function SlideText({
  scrollX,
  index,
  width,
}: {
  scrollX: SharedValue<number>;
  index: number;
  width: number;
}) {
  const slide = WELCOME_SLIDES[index];
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, inputRange, [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(
            scrollX.value,
            inputRange,
            [width * 0.22, 0, -width * 0.22],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.slideText, animatedStyle]}>
      <Text className="text-center text-3xl font-bold tracking-tight text-text-primary">
        {slide.title}
      </Text>
      <Text className="text-center text-[15px] leading-6 text-text-secondary">
        {slide.description}
      </Text>
    </Animated.View>
  );
}

/**
 * The swipeable feature tour. Marks the device-level "seen" flag before
 * calling onDone, whether the user finished or skipped.
 */
export function OnboardingTour({
  ctaLabel,
  onDone,
}: {
  ctaLabel: string;
  onDone: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  // The pager can be narrower than the window (web renders the app in a
  // phone-width column), so pages size to the measured layout width.
  const [width, setWidth] = useState(windowWidth);
  const reduceMotion = useReducedMotion();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const float = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const finishingRef = useRef(false);
  const isLastSlide = activeIndex === SLIDE_COUNT - 1;

  useEffect(() => {
    if (reduceMotion) return;
    float.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [float, reduceMotion]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const handlePageChange = useCallback((page: number) => {
    setActiveIndex(Math.max(0, Math.min(SLIDE_COUNT - 1, page)));
    void Haptics.selectionAsync();
  }, []);

  useAnimatedReaction(
    () => Math.round(scrollX.value / width),
    (current, previous) => {
      if (previous !== null && current !== previous) {
        runOnJS(handlePageChange)(current);
      }
    },
    [width, handlePageChange],
  );

  const finish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    // The in-memory cache updates synchronously, so routing decisions see the
    // new value even before storage settles.
    void setWelcomeTourSeen(true);
    onDone();
  }, [onDone]);

  const handleNext = useCallback(() => {
    if (isLastSlide) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
  }, [activeIndex, finish, isLastSlide, scrollRef, width]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [-5, 5]) }],
  }));

  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(SLIDE_COUNT - 2) * width, (SLIDE_COUNT - 1) * width],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const dotIndicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          [0, (SLIDE_COUNT - 1) * width],
          [0, (SLIDE_COUNT - 1) * DOT_STRIDE],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={styles.root}>
      {/* Skip — fades out on the last slide */}
      <Animated.View
        style={[styles.skipRow, skipStyle]}
        pointerEvents={isLastSlide ? "none" : "auto"}
      >
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="Skip the welcome tour"
          hitSlop={12}
          className="rounded-full px-3 py-1.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-text-tertiary">Skip</Text>
        </Pressable>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        onLayout={(event) => {
          const layoutWidth = event.nativeEvent.layout.width;
          if (layoutWidth > 0) setWidth(layoutWidth);
        }}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        decelerationRate="fast"
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
      >
        {WELCOME_SLIDES.map((slide, index) => (
          <View key={slide.key} style={[styles.page, { width }]}>
            <Animated.View style={[styles.illustrationArea, floatStyle]}>
              <WelcomeSlideIllustration index={index} scrollX={scrollX} width={width} />
            </Animated.View>
            <View className="pb-4">
              <SlideText scrollX={scrollX} index={index} width={width} />
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Dots + CTA */}
      <View className="gap-8 px-6 pb-4 pt-2">
        <View
          className="items-center"
          accessibilityLabel={`Page ${activeIndex + 1} of ${SLIDE_COUNT}`}
        >
          <View
            style={{
              width: SLIDE_COUNT * DOT_SIZE + (SLIDE_COUNT - 1) * DOT_GAP,
              height: DOT_SIZE,
            }}
          >
            <View className="flex-row" style={{ gap: DOT_GAP }}>
              {WELCOME_SLIDES.map((slide) => (
                <View
                  key={slide.key}
                  className="rounded-full bg-dark-border"
                  style={{ width: DOT_SIZE, height: DOT_SIZE }}
                />
              ))}
            </View>
            <Animated.View style={[styles.dotIndicator, dotIndicatorStyle]} />
          </View>
        </View>
        <PrimaryButton
          label={isLastSlide ? ctaLabel : "Next"}
          onPress={handleNext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dotIndicator: {
    backgroundColor: "#0ea5e9",
    borderRadius: DOT_SIZE / 2,
    height: DOT_SIZE,
    left: 0,
    position: "absolute",
    top: 0,
    width: DOT_SIZE,
  },
  illustrationArea: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  page: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  pagerContent: {
    flexGrow: 1,
  },
  root: {
    flex: 1,
  },
  skipRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  slideText: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
});
