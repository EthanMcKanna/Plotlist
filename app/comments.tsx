import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { Comments } from "../components/Comments";
import { LikeButton } from "../components/LikeButton";
import { GlassPressable } from "../components/NativeGlass";
import { ReportModal } from "../components/ReportModal";
import { Screen } from "../components/Screen";
import { api } from "../lib/plotlist/api";
import { useAuth, useMutation } from "../lib/plotlist/react";
import type { CommentTargetType } from "../lib/comments";

const TARGET_TYPES: CommentTargetType[] = ["review", "log", "list"];

// Standalone comments thread for targets without their own detail screen
// (watch logs) and for notification deep links.
export default function CommentsScreen() {
  const params = useLocalSearchParams();
  const targetType = TARGET_TYPES.find((type) => type === params.targetType) ?? null;
  const targetId = typeof params.targetId === "string" ? params.targetId : "";
  const { isAuthenticated } = useAuth();

  const report = useMutation(api.reports.create);
  const [showReport, setShowReport] = useState(false);
  const handleReport = useCallback(
    async (reason?: string) => {
      if (!targetType || !targetId) return;
      try {
        await report({ targetType, targetId, reason });
        Alert.alert("Report submitted", "Thanks — we'll take a look.");
      } catch {
        Alert.alert("Couldn't submit report", "Check your connection and try again.");
      }
    },
    [report, targetId, targetType],
  );

  // Watch logs have no detail screen, so this thread doubles as the place to
  // like or report one; reviews and lists keep those actions on their own
  // screens.
  const showLogActions = targetType === "log" && Boolean(targetId);

  return (
    <Screen>
      <View className="flex-1">
        <View className="flex-row items-center px-4 pt-2">
          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            radius={20}
            variant="control"
            contentStyle={{
              alignItems: "center",
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
          </GlassPressable>
          <Text className="ml-3 text-lg font-bold text-text-primary">Comments</Text>
        </View>
        {targetType && targetId ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            // Keeps the composer visible above the iOS keyboard; the old
            // KeyboardAvoidingView shrank the scroll area without scrolling
            // the focused input into view.
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            bounces={false}
            overScrollMode="never"
          >
            <View className="px-6 pb-10 pt-4">
              {showLogActions ? (
                <View className="mb-4 flex-row items-center gap-3">
                  <LikeButton targetType="log" targetId={targetId} />
                  {isAuthenticated ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowReport(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Report this watch log"
                      className="rounded-full border border-dark-border bg-dark-card px-4 py-2 active:opacity-70"
                    >
                      <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        Report
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              <Comments targetType={targetType} targetId={targetId} showHeader={false} />
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-base text-text-tertiary">
              This conversation is no longer available.
            </Text>
          </View>
        )}
      </View>

      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={handleReport}
      />
    </Screen>
  );
}
