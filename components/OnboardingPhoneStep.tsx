import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryButton } from "./PrimaryButton";
import { TextField } from "./TextField";
import { api } from "../lib/plotlist/api";
import { setStoredSignInPhone } from "../lib/authStorage";
import { formatPhoneNumber, normalizePhoneNumber } from "../lib/phone";
import { queryClient } from "../lib/queryClient";
import { useAction } from "../lib/plotlist/react";

const CODE_LEN = 6;

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}

// Optional, one-time phone verification so contact-based friend discovery
// keeps working now that Apple is the login method. Verifying stores only the
// server-side hash; skipping just means friends can't match you from their
// contacts until they verify later (Settings → Contacts). Rendered both as an
// onboarding stage (showSkip) and as the Settings re-entry screen.
export function OnboardingPhoneStep({
  onDone,
  onSkip,
  showSkip = true,
}: {
  onDone: () => Promise<void>;
  onSkip: () => Promise<void>;
  showSkip?: boolean;
}) {
  const startVerification = useAction(api.phone.startVerification);
  const attachVerified = useAction(api.phone.attachVerified);

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const t = setInterval(
      () => setSecondsRemaining((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [secondsRemaining]);

  const handleSkip = async () => {
    if (skipping || loading) return;
    setSkipping(true);
    try {
      await onSkip();
    } catch (error) {
      setErrorMessage(readErrorMessage(error));
    } finally {
      setSkipping(false);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await startVerification({ phone: n });
      setPhone(formatPhoneNumber(n));
      setStep("code");
      setCode("");
      setSecondsRemaining(30);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(readErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (submitted?: string) => {
    if (loading) return;
    setErrorMessage(null);
    const c = submitted ?? code;
    const n = normalizePhoneNumber(phone);
    if (!n || c.length < CODE_LEN) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage("Enter the 6-digit code we sent you.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await attachVerified({ phone: n, code: c });
      await setStoredSignInPhone(n);
      // attachVerified is an action, so refresh users:me (hasVerifiedPhone)
      // and anything else that keys off it.
      void queryClient.invalidateQueries({
        queryKey: ["plotlist-rpc"],
        refetchType: "active",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onDone();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(readErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const onCodeChange = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, CODE_LEN);
    setCode(next);
    if (errorMessage) setErrorMessage(null);
    if (next.length === CODE_LEN && step === "code") void handleVerify(next);
  };

  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {showSkip ? (
        <View className="flex-row justify-end px-6 pt-2">
          <Pressable
            onPress={handleSkip}
            disabled={skipping}
            accessibilityRole="button"
            accessibilityLabel="Skip phone verification for now"
            hitSlop={12}
            className="rounded-full px-3 py-1.5 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-text-tertiary">
              {skipping ? "Skipping..." : "Skip for now"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View className="gap-3 px-6 pt-2">
        <Text className="text-3xl font-bold tracking-tight text-text-primary">
          Find friends from your contacts
        </Text>
        <Text className="text-sm leading-5 text-text-tertiary">
          Verify your number once so friends who have you in their contacts can
          find you on Plotlist. We never store your number — only a scrambled
          code — and we'll never text you again after this.
        </Text>
      </View>

      <View className="items-center pt-8">
        <View
          className="items-center justify-center rounded-full bg-dark-elevated"
          style={{ width: 72, height: 72 }}
        >
          <Ionicons name="people" size={30} color="#38bdf8" />
        </View>
      </View>

      {errorMessage ? (
        <View
          accessibilityRole="alert"
          className="mx-6 mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
        >
          <Text className="text-[13px] font-semibold text-red-300">
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <View className="px-6 pt-6">
        {step === "phone" ? (
          <View className="gap-5">
            <TextField
              label="Phone number"
              value={phone}
              onChangeText={(raw: string) => {
                setPhone(formatPhoneNumber(raw));
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="(555) 123-4567"
              prefix="+1"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              // Web only: Enter sends. Native keyboards keep their previous
              // behavior (phone-pad has no return key; hardware keyboards
              // shouldn't gain a new submit path).
              onSubmitEditing={
                Platform.OS === "web" ? () => void handleSend() : undefined
              }
            />
            <PrimaryButton
              label={loading ? "Sending code…" : "Send verification code"}
              onPress={handleSend}
              loading={loading}
            />
          </View>
        ) : (
          <View className="gap-5">
            <TextField
              label={`Code sent to +1 ${phone}`}
              value={code}
              onChangeText={onCodeChange}
              placeholder="123456"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              // "sms-otp" is Android-only vocabulary; browsers expect the
              // standard one-time-code autocomplete token.
              autoComplete={Platform.OS === "web" ? "one-time-code" : "sms-otp"}
              maxLength={CODE_LEN}
              onSubmitEditing={
                Platform.OS === "web" ? () => void handleVerify() : undefined
              }
            />
            <PrimaryButton
              label={loading ? "Verifying…" : "Verify"}
              onPress={() => handleVerify()}
              loading={loading}
              disabled={code.length < CODE_LEN}
            />
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setStep("phone");
                  setCode("");
                  setErrorMessage(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Use a different phone number"
                className="py-2 pr-4 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-text-secondary">
                  ← Different number
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
                    secondsRemaining > 0 ? "text-text-tertiary" : "text-brand-400"
                  }`}
                >
                  {secondsRemaining > 0
                    ? `Resend in ${secondsRemaining}s`
                    : "Resend code"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
