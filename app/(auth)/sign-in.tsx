import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { PlotlistApiError } from "../../lib/api/client";

function notifyError(title: string, message: string) {
  if (Platform.OS === "web") {
    return;
  }
  Alert.alert(title, message);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof PlotlistApiError && error.code === "internal_error") {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOutLeft,
  SlideInRight,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../../lib/plotlist/api";
import { formatPhoneNumber, normalizePhoneNumber } from "../../lib/phone";
import { useAuthActions } from "../../lib/plotlist/auth";
import { useAction, useAuth } from "../../lib/plotlist/react";

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
          }}
          pointerEvents="none"
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
          }}
          pointerEvents="none"
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
          }}
          pointerEvents="none"
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
          }}
          pointerEvents="none"
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ── CodeCells — split OTP digit input ─────────────────────────────
function CodeCells({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ width: "100%" }}>
      <View className="flex-row gap-2.5" style={{ width: "100%" }}>
        {Array.from({ length: CODE_LEN }).map((_, i) => {
          const ch = value[i];
          const active = value.length === i;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                height: 58,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                borderWidth: 2,
                borderColor: active ? "#38bdf8" : ch ? "rgba(14, 165, 233, 0.3)" : "#252A35",
                backgroundColor: active ? "rgba(14, 165, 233, 0.1)" : ch ? "#171B24" : "#11151D",
              }}
            >
              <Text
                className={`text-2xl font-bold ${ch ? "text-text-primary" : ""}`}
              >
                {ch ?? ""}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        accessibilityLabel="Verification code"
        testID="verification-code-input"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, CODE_LEN))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={CODE_LEN}
        style={{ position: "absolute", opacity: 0, height: 1, width: 1, left: 0, top: 0 }}
      />
    </Pressable>
  );
}

// ── SignInScreen ───────────────────────────────────────────────────
export default function SignInScreen() {
  const { signIn } = useAuthActions();
  const startVerification = useAction(api.phone.startVerification);
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const DismissContainer = Platform.OS === "web" ? View : Pressable;
  const dismissContainerProps =
    Platform.OS === "web" ? {} : { onPress: Keyboard.dismiss };

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/home");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const t = setInterval(
      () => setSecondsRemaining((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [secondsRemaining]);

  const handleSend = async () => {
    setErrorMessage(null);
    const n = normalizePhoneNumber(phone);
    if (!n) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage("Enter a valid phone number to continue.");
      notifyError("Invalid number", "Enter a valid phone number to continue.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await startVerification({ phone: n });
      setPhone(formatPhoneNumber(n));
      setStep("code");
      setSecondsRemaining(30);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = readErrorMessage(e);
      setErrorMessage(message);
      notifyError("Could not send code", message);
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
      notifyError("Missing code", "Enter the 6-digit code we sent you.");
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
        const message =
          "That code was invalid or expired. Request a new code and try again.";
        setErrorMessage(message);
        notifyError("Verification failed", message);
      } else {
        router.replace("/home");
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = readErrorMessage(e);
      setErrorMessage(message);
      notifyError("Verification failed", message);
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

  return (
    <View className="flex-1 bg-dark-bg">
      <PosterWall />

      <View className="flex-1" pointerEvents="box-none">
        <View
          className="flex-1 justify-end"
          pointerEvents="box-none"
        >
          <DismissContainer {...dismissContainerProps}>
            <View
              className="px-7"
              style={{ paddingBottom: insets.bottom + 20 }}
            >
              {/* ── Brand ── */}
              <Animated.View
                entering={FadeInDown.delay(100).duration(700).springify()}
              >
                <Text className="mt-2 text-[44px] font-black tracking-tighter text-text-primary">
                  Plotlist
                </Text>
              </Animated.View>

              <Animated.View
                entering={FadeIn.delay(350).duration(500)}
                className="my-3 h-[1.5px] w-14 rounded-full bg-brand-500"
              />

              <Animated.View entering={FadeInDown.delay(450).duration(600)}>
                <Text className="mb-5 text-[15px] leading-6 text-text-secondary">
                  Track every show you watch.{"\n"}Review, rate, and share with friends.
                </Text>
              </Animated.View>

              {errorMessage ? (
                <View
                  accessibilityRole="alert"
                  className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
                >
                  <Text className="text-[13px] font-semibold text-red-300">
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {/* ── Form ── */}
              {step === "phone" ? (
                <Animated.View
                  key="step-phone"
                  entering={FadeInUp.delay(550).duration(500).springify()}
                  exiting={FadeOutLeft.duration(200)}
                >
                  <Text className="mb-3 text-xs font-bold uppercase tracking-[3px] text-text-tertiary">
                    Sign in or create account
                  </Text>

                  <View className="overflow-hidden rounded-2xl border border-dark-border bg-dark-card">
                    <View className="flex-row items-center">
                      <View className="items-center justify-center border-r border-dark-border px-4 py-4">
                        <Text className="text-base font-semibold text-text-tertiary">
                          +1
                        </Text>
                      </View>
                      <TextInput
                        value={phone}
                        onChangeText={(t) => {
                          setPhone(formatPhoneNumber(t));
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder="(555) 123-4567"
                        placeholderTextColor="#3A3F4D"
                        keyboardType="phone-pad"
                        textContentType="telephoneNumber"
                        autoComplete="tel"
                        className="flex-1 px-4 py-4 text-[17px] text-text-primary"
                        onSubmitEditing={handleSend}
                      />
                    </View>
                  </View>

                  <Pressable
                    onPress={loading ? undefined : handleSend}
                    disabled={loading}
                    className={`mt-5 flex-row items-center justify-center rounded-2xl bg-brand-500 py-4 active:bg-brand-600 ${
                      loading ? "opacity-60" : ""
                    }`}
                    style={{
                      shadowColor: "#0ea5e9",
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.35,
                      shadowRadius: 20,
                    }}
                  >
                    {loading && (
                      <ActivityIndicator
                        color="#fff"
                        style={{ marginRight: 8 }}
                      />
                    )}
                    <Text className="text-base font-bold text-white">
                      {loading ? "Sending code…" : "Continue"}
                    </Text>
                  </Pressable>

                  <Animated.Text
                    entering={FadeIn.delay(850).duration(400)}
                    className="mt-5 text-center text-[13px] leading-5 text-text-tertiary"
                  >
                    We'll text you a one-time code.
                  </Animated.Text>
                </Animated.View>
              ) : (
                <Animated.View
                  key="step-code"
                  entering={SlideInRight.duration(350).springify()}
                >
                  <Text className="mb-1 text-xs font-bold uppercase tracking-[3px] text-text-tertiary">
                    Verification
                  </Text>
                  <Text className="mb-5 text-[15px] text-text-secondary">
                    Code sent to{" "}
                    <Text className="font-semibold text-text-primary">
                      +1 {phone}
                    </Text>
                  </Text>

                  <CodeCells value={code} onChange={onCodeChange} />

                  <Pressable
                    onPress={loading ? undefined : () => handleVerify()}
                    disabled={loading || code.length < CODE_LEN}
                    className={`mt-5 flex-row items-center justify-center rounded-2xl bg-brand-500 py-4 active:bg-brand-600 ${
                      loading || code.length < CODE_LEN ? "opacity-40" : ""
                    }`}
                    style={{
                      shadowColor: "#0ea5e9",
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: code.length === CODE_LEN ? 0.35 : 0,
                      shadowRadius: 20,
                    }}
                  >
                    {loading && (
                      <ActivityIndicator
                        color="#fff"
                        style={{ marginRight: 8 }}
                      />
                    )}
                    <Text className="text-base font-bold text-white">
                      {loading ? "Verifying…" : "Verify"}
                    </Text>
                  </Pressable>

                  <View className="mt-4 flex-row items-center justify-between">
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Light,
                        );
                        setStep("phone");
                        setCode("");
                        setErrorMessage(null);
                      }}
                      className="py-2 pr-4 active:opacity-70"
                    >
                      <Text className="text-sm font-semibold text-text-secondary">
                        ← Different number
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={
                        secondsRemaining > 0 ? undefined : handleSend
                      }
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

        <Animated.View style={keyboardSpacerStyle} pointerEvents="none" />
      </View>
    </View>
  );
}
