import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { PlotlistApiError } from "../../lib/api/client";

function readErrorMessage(error: unknown): string {
  if (error instanceof PlotlistApiError && error.code === "internal_error") {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  runOnJS,
  type EntryAnimationsValues,
  type EntryExitAnimationFunction,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "../../components/NativeGlass";
import { PrimaryButton } from "../../components/PrimaryButton";
import { api } from "../../lib/plotlist/api";
import {
  getAppleButtonComponent,
  getAppleButtonProps,
  isAppleSignInAvailable,
  signInWithApple,
} from "../../lib/appleAuth";
import { formatPhoneNumber, normalizePhoneNumber } from "../../lib/phone";
import { useAuthActions } from "../../lib/plotlist/auth";
import { useAction } from "../../lib/plotlist/react";

const { width: SCREEN_W } = Dimensions.get("window");

// ── Image bases & constants ───────────────────────────────────────
const TMDB_P = "https://image.tmdb.org/t/p/w342";
const TMDB_B = "https://image.tmdb.org/t/p/w780";
const PW = 88;
const PH = 132;
const GAP = 10;
const CODE_LEN = 6;

// ── Curated shows (poster + widescreen backdrop) ─────────────────
const SHOWS = [
  { id: "bb", t: "Breaking Bad", p: `${TMDB_P}/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg`, b: `${TMDB_B}/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg` },
  { id: "sev", t: "Severance", p: `${TMDB_P}/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg`, b: `${TMDB_B}/ixgFmf1X59PUZam2qbAfskx2gQr.jpg` },
  { id: "plur", t: "Pluribus", p: `${TMDB_P}/z7Nga7Q9IGFWs5OEduY2gGFxnX3.jpg`, b: `${TMDB_B}/ulm1ex4JFYJByyaPyqTr47MFyEQ.jpg` },
  { id: "and", t: "Andor", p: `${TMDB_P}/khZqmwHQicTYoS7Flreb9EddFZC.jpg`, b: `${TMDB_B}/kCGwvjpqM1owt9kI4pkYPJWJLvc.jpg` },
  { id: "succ", t: "Succession", p: `${TMDB_P}/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg`, b: `${TMDB_B}/bcdUYUFk8GdpZJPiSAas9UeocLH.jpg` },
  { id: "bear", t: "The Bear", p: `${TMDB_P}/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg`, b: `${TMDB_B}/wHNwlE6ftEpgjVbdhLXOtv1hLs0.jpg` },
  { id: "st", t: "Stranger Things", p: `${TMDB_P}/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg`, b: `${TMDB_B}/8zbAoryWbtH0DKdev8abFAjdufy.jpg` },
  { id: "got", t: "Game of Thrones", p: `${TMDB_P}/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg`, b: `${TMDB_B}/zZqpAXxVSBtxV9qPBcscfXBcL2w.jpg` },
  { id: "bcs", t: "Better Call Saul", p: `${TMDB_P}/fC2HDm5t0kHl7mTm7jxMR31b7by.jpg`, b: `${TMDB_B}/t15KHp3iNfHVQBNIaqUGW12xQA4.jpg` },
  { id: "tlou", t: "The Last of Us", p: `${TMDB_P}/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg`, b: `${TMDB_B}/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg` },
  { id: "sho", t: "Shōgun", p: `${TMDB_P}/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg`, b: `${TMDB_B}/bwSmgmd90hCWwqOKQYTEraeOZhJ.jpg` },
  { id: "arc", t: "Arcane", p: `${TMDB_P}/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg`, b: `${TMDB_B}/q8eejQcg1bAqImEV8jh8RtBD4uH.jpg` },
  { id: "sop", t: "The Sopranos", p: `${TMDB_P}/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg`, b: `${TMDB_B}/lNpkvX2s8LGB0mjGODMT4o6Up7j.jpg` },
  { id: "td", t: "True Detective", p: `${TMDB_P}/cuV2O5ZyDLHSOWzg3nLVljp1ubw.jpg`, b: `${TMDB_B}/bPLRjO2pcBx0WL73WUPzuNzQ3YN.jpg` },
  { id: "pb", t: "Peaky Blinders", p: `${TMDB_P}/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg`, b: `${TMDB_B}/dzq83RHwQcnP6WGJ6YkenIqeaa5.jpg` },
  { id: "euph", t: "Euphoria", p: `${TMDB_P}/3Q0hd3heuWwDWpwcDkhQOA6TYWI.jpg`, b: `${TMDB_B}/9KnIzPCv9XpWA0MqmwiKBZvV1Sj.jpg` },
  { id: "sg", t: "Squid Game", p: `${TMDB_P}/1QdXdRYfktUSONkl1oD5gc6Be0s.jpg`, b: `${TMDB_B}/2meX1nMdScFOoV4370rqHWKmXhY.jpg` },
  { id: "wire", t: "The Wire", p: `${TMDB_P}/4lbclFySvugI51fwsyxBTOm4DqK.jpg`, b: `${TMDB_B}/layPSOJGckJv3PXZDIVluMq69mn.jpg` },
  { id: "loki", t: "Loki", p: `${TMDB_P}/kEl2t3OhXc3Zb9FBh1AuYzRTgZp.jpg`, b: `${TMDB_B}/N1hWzVPpZ8lIQvQskgdQogxdsc.jpg` },
];

const R1 = [SHOWS[0], SHOWS[1], SHOWS[2], SHOWS[3], SHOWS[4], SHOWS[5], SHOWS[12]];
const R2 = [SHOWS[6], SHOWS[7], SHOWS[8], SHOWS[9], SHOWS[10], SHOWS[13], SHOWS[14]];
const R3 = [SHOWS[11], SHOWS[15], SHOWS[16], SHOWS[17], SHOWS[18], SHOWS[3], SHOWS[1]];
const WALL_H = 8 + 3 * PH + 2 * GAP;
const HAPTIC_TICK = 40;

function brandGlow(opacity: number, radius: number): ViewStyle {
  if (Platform.OS === "web") {
    return {
      boxShadow: `0 0 ${radius}px rgba(56,189,248,${opacity})`,
    } as ViewStyle;
  }
  return {
    shadowColor: "#38BDF8",
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
  };
}

// ── PosterRow — seamless marquee with drag parallax ───────────────
function PosterRow({
  shows,
  dir = "left",
  ms = 25000,
  dragX,
  rowIndex,
}: {
  shows: typeof SHOWS;
  dir?: "left" | "right";
  ms?: number;
  dragX: SharedValue<number>;
  rowIndex: number;
}) {
  const ROW_W = shows.length * (PW + GAP);
  const start = dir === "left" ? -ROW_W : -2 * ROW_W;
  const end = dir === "left" ? -2 * ROW_W : -ROW_W;
  const tx = useSharedValue(start);

  useEffect(() => {
    tx.value = withRepeat(
      withSequence(
        withTiming(start, { duration: 0 }),
        withTiming(end, { duration: ms, easing: Easing.linear }),
      ),
      -1,
      false,
    );
  }, [start, end, ms, tx]);

  const depthFactor = rowIndex === 0 ? 0.6 : rowIndex === 1 ? 1.0 : 1.4;

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value + dragX.value * depthFactor }],
  }));

  const tripled = [...shows, ...shows, ...shows];

  return (
    <View style={{ height: PH, overflow: "hidden", marginBottom: GAP }}>
      <Animated.View style={[{ flexDirection: "row" }, style]}>
        {tripled.map((s, i) => (
          <View
            key={`${s.id}-${i}`}
            style={{
              width: PW,
              height: PH,
              marginRight: GAP,
              borderRadius: 10,
              overflow: "hidden",
              backgroundColor: "#1C2028",
            }}
          >
            <Image
              source={{ uri: s.p }}
              style={{ width: PW, height: PH }}
              contentFit="cover"
              transition={200}
            />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// ── PosterWall — interactive 3D poster grid ─────────────────────
function PosterWall() {
  const insets = useSafeAreaInsets();
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lastTickX = useSharedValue(0);

  const hapticLight = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const hapticSoft = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }, []);

  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onStart(() => {
      "worklet";
      lastTickX.value = 0;
      runOnJS(hapticLight)();
    })
    .onUpdate((e) => {
      "worklet";
      dragX.value = e.translationX * 0.8;
      dragY.value = e.translationY * 0.5;
      const delta = Math.abs(e.translationX - lastTickX.value);
      if (delta >= HAPTIC_TICK) {
        lastTickX.value = e.translationX;
        runOnJS(hapticSoft)();
      }
    })
    .onEnd(() => {
      "worklet";
      dragX.value = withSpring(0, { damping: 12, stiffness: 120, mass: 0.8 });
      dragY.value = withSpring(0, { damping: 12, stiffness: 120, mass: 0.8 });
      runOnJS(hapticLight)();
    });

  const wallStyle = useAnimatedStyle(() => {
    const shiftX = interpolate(
      dragX.value,
      [-200, 0, 200],
      [-15, 0, 15],
      Extrapolation.CLAMP,
    );
    const shiftY = interpolate(
      dragY.value,
      [-150, 0, 150],
      [-8, 0, 8],
      Extrapolation.CLAMP,
    );
    const tilt = interpolate(
      dragX.value,
      [-200, 0, 200],
      [1.5, 0, -1.5],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: shiftX },
        { translateY: shiftY },
        { rotateZ: `${tilt}deg` },
      ],
    };
  });

  const brightnessStyle = useAnimatedStyle(() => {
    const mag = Math.abs(dragX.value) + Math.abs(dragY.value);
    return {
      opacity: interpolate(mag, [0, 120], [0.3, 0.55], Extrapolation.CLAMP),
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: insets.top,
            left: 0,
            right: 0,
            height: WALL_H + 100,
          },
          wallStyle,
        ]}
      >
        <Animated.View style={[{ paddingTop: 8 }, brightnessStyle]}>
          <PosterRow
            shows={R1}
            dir="left"
            ms={60000}
            dragX={dragX}
            rowIndex={0}
          />
          <PosterRow
            shows={R2}
            dir="right"
            ms={50000}
            dragX={dragX}
            rowIndex={1}
          />
          <PosterRow
            shows={R3}
            dir="left"
            ms={70000}
            dragX={dragX}
            rowIndex={2}
          />
        </Animated.View>

        {/* Vignette: top */}
        <LinearGradient
          colors={["#0D0F14", "transparent"]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 50,
            pointerEvents: "none",
          }}
        />
        {/* Vignette: bottom */}
        <LinearGradient
          colors={["transparent", "#0D0F14"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 140,
            pointerEvents: "none",
          }}
        />
        {/* Vignette: left */}
        <LinearGradient
          colors={["#0D0F14", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0.25, y: 0.5 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: SCREEN_W * 0.2,
            pointerEvents: "none",
          }}
        />
        {/* Vignette: right */}
        <LinearGradient
          colors={["transparent", "#0D0F14"]}
          start={{ x: 0.75, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: SCREEN_W * 0.2,
            pointerEvents: "none",
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ── Entrance animations ───────────────────────────────────────────
// Panes hold Liquid Glass controls, so every pane transition is
// translation-only — opacity must never animate on glass or its parents
// (docs/ios-native-surface-audit.md).
const formRise: EntryExitAnimationFunction = (values: EntryAnimationsValues) => {
  "worklet";
  return {
    initialValues: {
      originY: values.targetOriginY + 26,
    },
    animations: {
      originY: withSpring(values.targetOriginY, {
        damping: 22,
        stiffness: 160,
        mass: 0.9,
      }),
    },
  };
};

const slideForward: EntryExitAnimationFunction = (values: EntryAnimationsValues) => {
  "worklet";
  return {
    initialValues: {
      originX: values.targetOriginX + values.windowWidth,
    },
    animations: {
      originX: withSpring(values.targetOriginX, {
        damping: 24,
        stiffness: 220,
        mass: 0.9,
      }),
    },
  };
};

const slideBack: EntryExitAnimationFunction = (values: EntryAnimationsValues) => {
  "worklet";
  return {
    initialValues: {
      originX: values.targetOriginX - values.windowWidth,
    },
    animations: {
      originX: withSpring(values.targetOriginX, {
        damping: 24,
        stiffness: 220,
        mass: 0.9,
      }),
    },
  };
};

const digitPop: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.55 }] },
    animations: {
      opacity: withTiming(1, { duration: 90 }),
      transform: [{ scale: withSpring(1, { damping: 15, stiffness: 320 }) }],
    },
  };
};

const DIGIT_ENTER = Platform.OS === "web" ? undefined : digitPop;

function Kicker({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-3 text-xs font-bold uppercase tracking-[3px] text-text-tertiary">
      {children}
    </Text>
  );
}

// ── BlinkingCaret — insertion point inside the active code cell ──
function BlinkingCaret() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 420, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.05, { duration: 420, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.caret, style]} />;
}

// ── CodeCells — split OTP digit input ─────────────────────────────
export type CodeCellsHandle = {
  focus: () => void;
  shake: () => void;
};

const CodeCells = forwardRef<
  CodeCellsHandle,
  { value: string; onChange: (code: string) => void }
>(function CodeCells({ value, onChange }, ref) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shakeX = useSharedValue(0);

  // autoFocus can land before React's focus listener attaches (notably on
  // web), so reconcile the focus state once after mount.
  useEffect(() => {
    if (inputRef.current?.isFocused()) setFocused(true);
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    shake: () => {
      shakeX.value = withSequence(
        withTiming(-9, { duration: 45 }),
        withTiming(9, { duration: 45 }),
        withTiming(-6, { duration: 45 }),
        withTiming(6, { duration: 45 }),
        withTiming(0, { duration: 45 }),
      );
    },
  }));

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={{ width: "100%" }}
      accessible={false}
    >
      <Animated.View style={[styles.codeRow, shakeStyle]}>
        {Array.from({ length: CODE_LEN }).map((_, i) => {
          const ch = value[i];
          const active = focused && value.length === i;
          return (
            <View
              key={i}
              style={[
                styles.codeCell,
                ch ? styles.codeCellFilled : null,
                active ? styles.codeCellActive : null,
              ]}
            >
              {ch ? (
                <Animated.View key={`${i}-${ch}`} entering={DIGIT_ENTER}>
                  <Text style={styles.codeDigit}>{ch}</Text>
                </Animated.View>
              ) : active ? (
                <BlinkingCaret />
              ) : null}
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={inputRef}
        // Auto-focus on mount so the keyboard carries over seamlessly from
        // the phone field instead of dismissing between steps.
        autoFocus
        accessibilityLabel="Verification code"
        testID="verification-code-input"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, CODE_LEN))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={CODE_LEN}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
});

// ── SignInScreen ───────────────────────────────────────────────────
export default function SignInScreen() {
  const { signIn } = useAuthActions();
  const startVerification = useAction(api.phone.startVerification);
  const insets = useSafeAreaInsets();
  const DismissContainer = Platform.OS === "web" ? View : Pressable;
  const dismissContainerProps =
    Platform.OS === "web" ? {} : { onPress: Keyboard.dismiss };
  const animateOnMount = Platform.OS !== "web";

  // Apple is the primary sign-in; phone OTP stays as the fallback for
  // existing accounts (and App Review) behind a text link.
  const [method, setMethod] = useState<"apple" | "phone">(
    Platform.OS === "ios" ? "apple" : "phone",
  );
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === "ios");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const verifyingRef = useRef(false);
  const phoneInputRef = useRef<TextInput>(null);
  const codeCellsRef = useRef<CodeCellsHandle>(null);
  // Focus the phone field only when the user navigated to it deliberately —
  // never on cold launch, where a surprise keyboard would cover the wall.
  const phoneWantsFocusRef = useRef(false);
  const navDirRef = useRef<"fwd" | "back" | null>(null);

  const AppleButton = getAppleButtonComponent();
  const appleButtonProps = getAppleButtonProps();
  const phoneValid = normalizePhoneNumber(phone) !== null;

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let cancelled = false;
    void isAppleSignInAvailable().then((available) => {
      if (cancelled) return;
      setAppleAvailable(available);
      if (!available) setMethod("phone");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const t = setInterval(
      () => setSecondsRemaining((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [secondsRemaining]);

  const handleAppleSignIn = async () => {
    if (loading) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const credential = await signInWithApple();
      if (!credential) {
        // User dismissed the Apple sheet — nothing to report.
        return;
      }
      await signIn("apple", credential);
      // On success AuthGate routes to onboarding or home once the profile
      // loads, so we stay put instead of flashing an intermediate screen.
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(readErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (loading) return;
    setErrorMessage(null);
    const n = normalizePhoneNumber(phone);
    if (!n) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage("Enter a valid phone number to continue.");
      return;
    }
    setLoading(true);
    try {
      await startVerification({ phone: n });
      setPhone(formatPhoneNumber(n));
      setSecondsRemaining(30);
      if (step === "code") {
        // Resend from the code step: clear stale digits, keep typing.
        setCode("");
        codeCellsRef.current?.focus();
      } else {
        navDirRef.current = "fwd";
        setStep("code");
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(readErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (submitted?: string) => {
    setErrorMessage(null);
    const c = submitted ?? code;
    const n = normalizePhoneNumber(phone);
    if (!n || c.length < CODE_LEN) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage("Enter the 6-digit code we sent you.");
      return;
    }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const result = await signIn("phone", { phone: n, code: c });
      if (!result.signingIn) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMessage(
          "That code was invalid or expired. Request a new code and try again.",
        );
        setCode("");
        codeCellsRef.current?.shake();
        codeCellsRef.current?.focus();
      }
      // On success AuthGate routes to onboarding or home once the profile
      // loads, so we stay put instead of flashing an intermediate screen.
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(readErrorMessage(e));
      codeCellsRef.current?.shake();
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  };

  const onCodeChange = (v: string) => {
    setCode(v);
    if (errorMessage) setErrorMessage(null);
    if (v.length === CODE_LEN && step === "code") handleVerify(v);
  };

  const goToPhone = (from: "apple" | "code") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    phoneWantsFocusRef.current = true;
    navDirRef.current = from === "apple" ? "fwd" : "back";
    if (from === "apple") setMethod("phone");
    setStep("phone");
    setCode("");
    setErrorMessage(null);
  };

  const goToApple = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navDirRef.current = "back";
    setMethod("apple");
    setCode("");
    setErrorMessage(null);
  };

  const keyboardHeight = useSharedValue(0);
  useEffect(() => {
    const showEvent =
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvent =
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardHeight.value = withTiming(Math.max(event.endCoordinates.height, 0), {
        duration: event.duration ?? 250,
      });
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      keyboardHeight.value = withTiming(0, {
        duration: event.duration ?? 250,
      });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [keyboardHeight]);
  const keyboardSpacerStyle = useAnimatedStyle(
    () => ({ height: keyboardHeight.value }),
    [keyboardHeight],
  );
  // Quiet the poster wall while typing so the form owns the screen.
  const keyboardScrimStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        keyboardHeight.value,
        [0, 300],
        [0, 0.5],
        Extrapolation.CLAMP,
      ),
    }),
    [keyboardHeight],
  );

  const paneEntering = !animateOnMount
    ? undefined
    : navDirRef.current === "fwd"
      ? slideForward
      : navDirRef.current === "back"
        ? slideBack
        : formRise;

  return (
    <View className="flex-1 bg-dark-bg">
      <PosterWall />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, styles.keyboardScrim, keyboardScrimStyle]}
      />

      <View className="flex-1" style={{ pointerEvents: "box-none" }}>
        <View
          className="flex-1 justify-end"
          style={{ pointerEvents: "box-none" }}
        >
          <DismissContainer {...dismissContainerProps}>
            <View
              className="px-7"
              style={{ paddingBottom: insets.bottom + 20 }}
            >
              {/* ── Brand ── */}
              <Animated.View
                entering={
                  animateOnMount
                    ? FadeInDown.delay(100).duration(700).springify()
                    : undefined
                }
              >
                <Text className="mt-2 text-[44px] font-black tracking-tighter text-text-primary">
                  Plotlist
                </Text>
              </Animated.View>

              <Animated.View
                entering={animateOnMount ? FadeIn.delay(350).duration(500) : undefined}
                className="my-3 h-[1.5px] w-14 rounded-full bg-brand-500"
              />

              <Animated.View
                entering={animateOnMount ? FadeInDown.delay(450).duration(600) : undefined}
              >
                <Text className="mb-5 text-[15px] leading-6 text-text-secondary">
                  Track every show you watch.{"\n"}Review, rate, and share with friends.
                </Text>
              </Animated.View>

              {errorMessage ? (
                <Animated.View
                  entering={
                    animateOnMount ? FadeInDown.duration(220) : undefined
                  }
                  accessibilityRole="alert"
                  className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
                >
                  <Text className="text-[13px] font-semibold leading-5 text-red-300">
                    {errorMessage}
                  </Text>
                </Animated.View>
              ) : null}

              {/* ── Form ── */}
              {method === "apple" ? (
                <Animated.View key="method-apple" entering={paneEntering}>
                  <Kicker>Sign in or create account</Kicker>

                  {AppleButton && appleButtonProps ? (
                    <View style={{ opacity: loading ? 0.6 : 1 }}>
                      <AppleButton
                        {...appleButtonProps}
                        cornerRadius={26}
                        onPress={loading ? () => {} : handleAppleSignIn}
                        style={{ width: "100%", height: 52 }}
                      />
                    </View>
                  ) : null}

                  <Animated.Text
                    entering={animateOnMount ? FadeIn.delay(700).duration(400) : undefined}
                    className="mt-5 text-center text-[13px] leading-5 text-text-tertiary"
                  >
                    {loading
                      ? "Signing you in…"
                      : "One tap with your Apple ID. No passwords, no codes."}
                  </Animated.Text>

                  <Pressable
                    onPress={() => goToPhone("apple")}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in with phone number instead"
                    className="mt-3 self-center py-2 active:opacity-70"
                  >
                    <Text className="text-sm font-semibold text-text-secondary">
                      Use phone number instead
                    </Text>
                  </Pressable>
                </Animated.View>
              ) : step === "phone" ? (
                <Animated.View key="step-phone" entering={paneEntering}>
                  <Kicker>Sign in or create account</Kicker>

                  <GlassSurface
                    radius={16}
                    variant="surface"
                    borderColor={
                      phoneFocused
                        ? "rgba(56,189,248,0.55)"
                        : "rgba(255,255,255,0.12)"
                    }
                    fallbackColor="rgba(18,22,30,0.92)"
                    style={[
                      styles.phoneField,
                      phoneFocused ? styles.phoneFieldFocused : null,
                    ]}
                    contentStyle={styles.phoneFieldContent}
                  >
                    <View style={styles.dialChip}>
                      <Text className="text-[17px] font-semibold text-text-secondary">
                        +1
                      </Text>
                    </View>
                    <TextInput
                      ref={phoneInputRef}
                      autoFocus={phoneWantsFocusRef.current}
                      value={phone}
                      onChangeText={(t) => {
                        setPhone(formatPhoneNumber(t));
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                      accessibilityLabel="Phone number"
                      placeholder="(555) 123-4567"
                      placeholderTextColor="#414757"
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      selectionColor="#38bdf8"
                      style={styles.phoneInput}
                      onSubmitEditing={handleSend}
                    />
                  </GlassSurface>

                  <View className="mt-4">
                    <PrimaryButton
                      label={loading ? "Sending code…" : "Continue"}
                      accessibilityLabel="Continue with phone number"
                      onPress={handleSend}
                      disabled={!phoneValid}
                      loading={loading}
                    />
                  </View>

                  <Animated.Text
                    entering={animateOnMount ? FadeIn.delay(250).duration(400) : undefined}
                    className="mt-4 text-center text-[13px] leading-5 text-text-tertiary"
                  >
                    We&apos;ll text you a one-time code.
                  </Animated.Text>

                  {appleAvailable ? (
                    <Pressable
                      onPress={goToApple}
                      accessibilityRole="button"
                      accessibilityLabel="Sign in with Apple instead"
                      className="mt-3 self-center py-2 active:opacity-70"
                    >
                      <Text className="text-sm font-semibold text-brand-400">
                         Sign in with Apple instead
                      </Text>
                    </Pressable>
                  ) : null}

                  <Animated.Text
                    entering={animateOnMount ? FadeIn.delay(300).duration(400) : undefined}
                    className="mt-4 text-center text-[12px] leading-4 text-text-tertiary"
                  >
                    By continuing you agree to Plotlist&apos;s{" "}
                    <Text
                      className="text-[12px] font-semibold text-text-secondary"
                      onPress={() => router.push("/legal/terms")}
                      suppressHighlighting
                    >
                      Terms
                    </Text>
                    {" and "}
                    <Text
                      className="text-[12px] font-semibold text-text-secondary"
                      onPress={() => router.push("/legal/privacy")}
                      suppressHighlighting
                    >
                      Privacy Policy
                    </Text>
                    .
                  </Animated.Text>
                </Animated.View>
              ) : (
                <Animated.View key="step-code" entering={paneEntering}>
                  <Kicker>Enter your code</Kicker>
                  <Text className="mb-5 text-[15px] leading-5 text-text-secondary">
                    Sent to{" "}
                    <Text className="font-semibold text-text-primary">
                      +1 {phone}
                    </Text>
                  </Text>

                  <CodeCells
                    ref={codeCellsRef}
                    value={code}
                    onChange={onCodeChange}
                  />

                  <View className="mt-5">
                    <PrimaryButton
                      label={loading ? "Verifying…" : "Verify"}
                      accessibilityLabel="Verify phone number"
                      onPress={() => handleVerify()}
                      disabled={code.length < CODE_LEN}
                      loading={loading}
                    />
                  </View>

                  <View className="mt-4 flex-row items-center justify-between">
                    <Pressable
                      onPress={() => goToPhone("code")}
                      accessibilityRole="button"
                      accessibilityLabel="Use a different phone number"
                      className="py-2 pr-4 active:opacity-70"
                    >
                      <Text className="text-sm font-semibold text-text-secondary">
                        Different number
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={secondsRemaining > 0 ? undefined : handleSend}
                      disabled={secondsRemaining > 0}
                      accessibilityRole="button"
                      accessibilityLabel={
                        secondsRemaining > 0
                          ? `Resend code available in ${secondsRemaining} seconds`
                          : "Resend verification code"
                      }
                      accessibilityState={{ disabled: secondsRemaining > 0 }}
                      className="py-2 pl-4 active:opacity-70"
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          secondsRemaining > 0
                            ? "text-text-tertiary"
                            : "text-brand-400"
                        }`}
                      >
                        {secondsRemaining > 0
                          ? `Resend in ${secondsRemaining}s`
                          : "Resend code"}
                      </Text>
                    </Pressable>
                  </View>
                </Animated.View>
              )}
            </View>
          </DismissContainer>
        </View>

        <Animated.View
          style={[keyboardSpacerStyle, { pointerEvents: "none" }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caret: {
    backgroundColor: "#38bdf8",
    borderRadius: 1,
    height: 22,
    width: 2,
  },
  codeCell: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(255,255,255,0.09)",
    borderCurve: "continuous",
    borderRadius: 14,
    borderWidth: 1.5,
    flex: 1,
    height: 56,
    justifyContent: "center",
    minWidth: 0,
  },
  codeCellActive: {
    backgroundColor: "rgba(14,165,233,0.09)",
    borderColor: "#38bdf8",
    ...brandGlow(0.3, 10),
  },
  codeCellFilled: {
    backgroundColor: "rgba(22,26,34,0.92)",
    borderColor: "rgba(125,211,252,0.3)",
  },
  codeDigit: {
    color: "#F1F3F7",
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  codeRow: {
    flexDirection: "row",
    gap: 9,
    width: "100%",
  },
  dialChip: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRightColor: "rgba(255,255,255,0.12)",
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  hiddenInput: {
    height: 1,
    left: 0,
    opacity: 0,
    position: "absolute",
    top: 0,
    width: 1,
  },
  keyboardScrim: {
    backgroundColor: "#0D0F14",
    opacity: 0,
  },
  phoneField: {
    borderWidth: 1,
  },
  phoneFieldFocused: {
    ...brandGlow(0.25, 12),
  },
  phoneFieldContent: {
    alignItems: "center",
    flexDirection: "row",
  },
  phoneInput: {
    color: "#F1F3F7",
    flex: 1,
    fontSize: 17,
    height: 56,
    letterSpacing: 0.3,
    paddingHorizontal: 16,
  },
});
