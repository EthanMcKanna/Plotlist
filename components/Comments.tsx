import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "./Avatar";
import { ReportModal } from "./ReportModal";
import { api } from "../lib/plotlist/api";
import { useAuth, useMutation, usePaginatedQuery, useQuery } from "../lib/plotlist/react";
import { guardedPush } from "../lib/navigation";
import { formatRelativeTime } from "../lib/format";
import { getUserFacingApiErrorMessage } from "../lib/api/client";
import {
  buildOptimisticCommentEntry,
  canDeleteComment,
  commentAuthorLabel,
  COMMENT_MAX_LENGTH,
  isOptimisticCommentId,
  normalizeCommentEntries,
  normalizeCommentText,
  type CommentEntry,
  type CommentTargetType,
} from "../lib/comments";

function CommentRow({
  entry,
  viewer,
  onDelete,
  onReport,
}: {
  entry: CommentEntry;
  viewer: { _id: string; isAdmin?: boolean | null } | null;
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => void;
}) {
  const { comment, author } = entry;
  const label = commentAuthorLabel(author);
  const pending = isOptimisticCommentId(comment._id);
  const deletable = !pending && canDeleteComment(comment, viewer);
  const reportable = !pending && Boolean(viewer) && author?._id !== viewer?._id;

  const openProfile = useCallback(() => {
    if (author?._id) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      guardedPush(`/profile/${author._id}`);
    }
  }, [author?._id]);

  const showOptions = useCallback(() => {
    if (!deletable && !reportable) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (deletable) {
      Alert.alert("Delete comment?", "This can't be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(comment._id) },
      ]);
      return;
    }
    Alert.alert("Comment options", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Report comment", style: "destructive", onPress: () => onReport(comment._id) },
    ]);
  }, [comment._id, deletable, onDelete, onReport, reportable]);

  return (
    <Pressable
      onLongPress={showOptions}
      delayLongPress={350}
      accessibilityHint={
        deletable ? "Long press to delete" : reportable ? "Long press to report" : undefined
      }
      className={`flex-row gap-3 py-3 ${pending ? "opacity-60" : ""}`}
    >
      <Pressable onPress={openProfile} disabled={!author?._id} className="active:opacity-80">
        <Avatar uri={author?.avatarUrl} label={label} size={32} />
      </Pressable>
      <View className="flex-1">
        <View className="flex-row items-baseline gap-1.5">
          <Pressable onPress={openProfile} disabled={!author?._id} className="shrink active:opacity-80">
            <Text className="text-[13px] font-semibold text-text-primary" numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
          <Text className="text-[11px] text-text-tertiary">
            {pending ? "Posting…" : formatRelativeTime(comment.createdAt)}
          </Text>
        </View>
        <Text className="mt-0.5 text-[15px] leading-5 text-text-primary">{comment.text}</Text>
      </View>
    </Pressable>
  );
}

function CommentComposer({
  viewer,
  isAuthenticated,
  onSubmit,
}: {
  viewer: { avatarUrl?: string | null; displayName?: string | null; username?: string | null } | null;
  isAuthenticated: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const trimmed = normalizeCommentText(text);
  const canSend = isAuthenticated && trimmed.length > 0 && !sending;

  const handleSend = useCallback(async () => {
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Sign in to join the conversation.");
      return;
    }
    if (!trimmed || sending) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } catch (error) {
      Alert.alert(
        "Couldn't post comment",
        getUserFacingApiErrorMessage(error) ?? "Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }, [isAuthenticated, onSubmit, sending, trimmed]);

  return (
    <View className="flex-row items-end gap-2.5">
      <Avatar
        uri={viewer?.avatarUrl}
        label={viewer?.displayName ?? viewer?.username}
        size={32}
      />
      <View className="min-h-[40px] flex-1 flex-row items-end rounded-3xl border border-dark-border bg-dark-card pl-4 pr-1.5 py-1">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={isAuthenticated ? "Add a comment…" : "Sign in to comment"}
          editable={isAuthenticated && !sending}
          multiline
          maxLength={COMMENT_MAX_LENGTH}
          placeholderTextColor="#5A6070"
          className="max-h-24 flex-1 py-1.5 text-[15px] leading-5 text-text-primary"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
          className={`mb-0.5 h-8 w-8 items-center justify-center rounded-full ${
            canSend ? "bg-brand-500" : "bg-dark-elevated"
          }`}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#F1F3F7" />
          ) : (
            <Ionicons name="arrow-up" size={16} color={canSend ? "#FFFFFF" : "#5A6070"} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function Comments({
  targetType,
  targetId,
  showHeader = true,
}: {
  targetType: CommentTargetType;
  targetId: string;
  showHeader?: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip") ?? null;
  const { results, status, loadMore } = usePaginatedQuery(
    api.comments.listForTarget,
    { targetType, targetId },
    { initialNumItems: 20 },
  );

  const entries = useMemo(() => normalizeCommentEntries(results), [results]);

  const add = useMutation(api.comments.add).withOptimisticUpdate((localStore, args) => {
    const entry = buildOptimisticCommentEntry({
      targetType: args.targetType,
      targetId: args.targetId,
      text: args.text,
      viewer: me,
    });
    localStore.setPaginatedQuery(
      api.comments.listForTarget,
      { targetType: args.targetType, targetId: args.targetId },
      (current) =>
        current && {
          ...current,
          page: [...(current.page ?? []), entry],
          results: [...(current.results ?? current.page ?? []), entry],
        },
    );
  });

  const remove = useMutation(api.comments.deleteComment).withOptimisticUpdate(
    (localStore, args) => {
      const keep = (row: any) => (row?.comment?._id ?? row?._id) !== args.commentId;
      localStore.setPaginatedQuery(
        api.comments.listForTarget,
        { targetType, targetId },
        (current) =>
          current && {
            ...current,
            page: (current.page ?? []).filter(keep),
            results: (current.results ?? []).filter(keep),
          },
      );
    },
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      await add({ targetType, targetId, text });
    },
    [add, targetId, targetType],
  );

  const handleDelete = useCallback(
    (commentId: string) => {
      remove({ commentId }).catch(() => {
        Alert.alert("Couldn't delete comment", "Check your connection and try again.");
      });
    },
    [remove],
  );

  const report = useMutation(api.reports.create);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const handleReport = useCallback(
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

  const loading = status === "LoadingFirstPage";

  return (
    <View>
      {showHeader ? (
        <View className="flex-row items-baseline gap-2">
          <Text className="text-base font-semibold text-text-primary">Comments</Text>
          {!loading && entries.length > 0 ? (
            <Text className="text-sm text-text-tertiary">{entries.length}</Text>
          ) : null}
        </View>
      ) : null}

      <View className={showHeader ? "mt-1" : ""}>
        {loading ? (
          <View className="items-center py-6">
            <ActivityIndicator color="#5A6070" />
          </View>
        ) : entries.length > 0 ? (
          entries.map((entry) => (
            <CommentRow
              key={entry.comment._id}
              entry={entry}
              viewer={me}
              onDelete={handleDelete}
              onReport={setReportCommentId}
            />
          ))
        ) : (
          <Text className="py-4 text-sm text-text-tertiary">
            No comments yet. Start the conversation.
          </Text>
        )}

        {status === "CanLoadMore" ? (
          <Pressable onPress={() => loadMore(20)} className="py-2 active:opacity-70">
            <Text className="text-sm font-medium text-brand-400">View more comments</Text>
          </Pressable>
        ) : null}
        {status === "LoadingMore" ? (
          <View className="items-center py-2">
            <ActivityIndicator size="small" color="#5A6070" />
          </View>
        ) : null}
      </View>

      <View className="mt-2">
        <CommentComposer
          viewer={me}
          isAuthenticated={isAuthenticated}
          onSubmit={handleSubmit}
        />
      </View>

      <ReportModal
        visible={reportCommentId !== null}
        onClose={() => setReportCommentId(null)}
        onSubmit={handleReport}
      />
    </View>
  );
}
