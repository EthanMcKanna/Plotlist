import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { ActionSheet, type ActionSheetOption } from "../components/ActionSheet";
import {
  CommentComposer,
  CommentThreadList,
  useCommentThread,
} from "../components/Comments";
import { LikeButton } from "../components/LikeButton";
import { GlassPressable } from "../components/NativeGlass";
import { ReportModal } from "../components/ReportModal";
import { Screen } from "../components/Screen";
import { api } from "../lib/plotlist/api";
import { useAuth, useMutation } from "../lib/plotlist/react";
import type { CommentTargetType } from "../lib/comments";

const TARGET_TYPES: CommentTargetType[] = ["review", "log", "list"];

function CommentsThread({
  targetType,
  targetId,
  autoFocusComposer,
}: {
  targetType: CommentTargetType;
  targetId: string;
  autoFocusComposer: boolean;
}) {
  const thread = useCommentThread(targetType, targetId);

  const report = useMutation(api.reports.create);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const handleReportComment = useCallback(
    async (reason?: string) => {
      if (!reportCommentId) return;
      try {
        await report({ targetType: "comment", targetId: reportCommentId, reason });
        Alert.alert("Report submitted", "Thanks — we'll take a look.");
      } catch {
        Alert.alert("Couldn't submit report", "Check your connection and try again.");
      }
    },
    [report, reportCommentId],
  );

  return (
    <>
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}
      >
        <CommentThreadList thread={thread} onReport={setReportCommentId} />
      </ScrollView>

      {/* Pinned composer: the KeyboardAvoidingView above lifts it with the
          keyboard, chat-style; its own padding keeps a breathing gap. */}
      <View className="border-t border-dark-border bg-dark-bg px-5 pb-3 pt-3">
        <CommentComposer
          viewer={thread.me}
          isAuthenticated={thread.isAuthenticated}
          onSubmit={thread.submit}
          autoFocus={autoFocusComposer}
        />
      </View>

      <ReportModal
        visible={reportCommentId !== null}
        onClose={() => setReportCommentId(null)}
        onSubmit={handleReportComment}
      />
    </>
  );
}

// Standalone comments thread: the composer's home for every commentable
// target, plus the like/report surface for watch logs (which have no detail
// screen of their own).
export default function CommentsScreen() {
  const params = useLocalSearchParams();
  const targetType = TARGET_TYPES.find((type) => type === params.targetType) ?? null;
  const targetId = typeof params.targetId === "string" ? params.targetId : "";
  const autoFocusComposer = params.focus === "1";
  const { isAuthenticated } = useAuth();

  const report = useMutation(api.reports.create);
  const [showReport, setShowReport] = useState(false);
  const [showLogMenu, setShowLogMenu] = useState(false);
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
  const logMenuOptions: ActionSheetOption[] = useMemo(
    () => [
      {
        label: "Report watch log",
        icon: "flag-outline",
        destructive: true,
        onPress: () => setShowReport(true),
      },
    ],
    [],
  );

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center px-4 pt-2 pb-1">
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
          <Text className="ml-3 flex-1 text-lg font-bold text-text-primary">Comments</Text>
          {showLogActions ? (
            <View className="flex-row items-center gap-2">
              <LikeButton targetType="log" targetId={targetId} />
              {isAuthenticated ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowLogMenu(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Watch log options"
                  className="h-9 w-9 items-center justify-center rounded-full bg-dark-elevated active:bg-dark-hover"
                >
                  <Ionicons name="ellipsis-horizontal" size={16} color="#9BA1B0" />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {targetType && targetId ? (
          <CommentsThread
            targetType={targetType}
            targetId={targetId}
            autoFocusComposer={autoFocusComposer}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-base text-text-tertiary">
              This conversation is no longer available.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <ActionSheet
        visible={showLogMenu}
        onClose={() => setShowLogMenu(false)}
        title="Watch log"
        options={logMenuOptions}
      />
      <ReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={handleReport}
      />
    </Screen>
  );
}
