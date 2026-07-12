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
import { CommentContextMenu } from "./CommentContextMenu";
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

// Data + mutations for one comment thread. Detail screens (lists, reviews)
// embed CommentsSection inline; watch logs still use the /comments screen.
export function useCommentThread(
  targetType: CommentTargetType,
  targetId: string,
  options?: { skip?: boolean },
) {
  const skip = options?.skip ?? false;
  const { isAuthenticated } = useAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip") ?? null;
  const { results, status, loadMore } = usePaginatedQuery(
    api.comments.listForTarget,
    skip ? "skip" : { targetType, targetId },
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

  const submit = useCallback(
    async (text: string) => {
      await add({ targetType, targetId, text });
    },
    [add, targetId, targetType],
  );

  const removeComment = useCallback(
    (commentId: string) => {
      remove({ commentId }).catch(() => {
        Alert.alert("Couldn't delete comment", "Check your connection and try again.");
      });
    },
    [remove],
  );

  return { isAuthenticated, me, entries, status, loadMore, submit, removeComment };
}

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

  const confirmDelete = useCallback(() => {
    Alert.alert("Delete comment?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(comment._id) },
    ]);
  }, [comment._id, onDelete]);

  const reportComment = useCallback(() => onReport(comment._id), [comment._id, onReport]);

  return (
    <CommentContextMenu
      deletable={deletable}
      reportable={reportable}
      onViewProfile={author?._id ? openProfile : undefined}
      onDelete={confirmDelete}
      onReport={reportComment}
    >
      <View
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
      </View>
    </CommentContextMenu>
  );
}

// The scrolling half of the /comments screen: rows + pagination, no composer.
export function CommentThreadList({
  thread,
  onReport,
}: {
  thread: ReturnType<typeof useCommentThread>;
  onReport: (commentId: string) => void;
}) {
  const { me, entries, status, loadMore, removeComment } = thread;
  const loading = status === "LoadingFirstPage";

  return (
    <View>
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
            onDelete={removeComment}
            onReport={onReport}
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
  );
}

export function CommentComposer({
  viewer,
  isAuthenticated,
  onSubmit,
  autoFocus,
  onFocus,
}: {
  viewer: { avatarUrl?: string | null; displayName?: string | null; username?: string | null } | null;
  isAuthenticated: boolean;
  onSubmit: (text: string) => Promise<void>;
  autoFocus?: boolean;
  onFocus?: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Content-driven height so the field renders one line tall and grows as
  // the comment wraps (RN-web textareas otherwise default to several rows).
  const [contentHeight, setContentHeight] = useState(0);
  const trimmed = normalizeCommentText(text);
  const canSend = isAuthenticated && trimmed.length > 0 && !sending;
  const LINE_HEIGHT = 20;
  // Empty fields ignore the measurement: web reports a stale multi-row
  // content size on mount, and an empty comment is always one line anyway.
  const inputHeight =
    text.length > 0
      ? Math.min(Math.max(contentHeight, LINE_HEIGHT), LINE_HEIGHT * 4)
      : LINE_HEIGHT;

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
          autoFocus={autoFocus}
          onFocus={onFocus}
          maxLength={COMMENT_MAX_LENGTH}
          placeholderTextColor="#5A6070"
          // Comments are chat-like: return sends (submitBehavior keeps the
          // multiline field from inserting a newline and keeps focus).
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={handleSend}
          onContentSizeChange={(event) =>
            setContentHeight(event.nativeEvent.contentSize.height)
          }
          // text-[16px] keeps iOS from zooming the page on focus and matches
          // the app-wide input convention.
          className="flex-1 text-[16px] leading-5 text-text-primary"
          style={{ height: inputHeight, marginVertical: 6, paddingVertical: 0 }}
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

const COLLAPSED_COUNT = 3;

export function formatCommentCount(thread: ReturnType<typeof useCommentThread>): string | null {
  if (thread.status === "LoadingFirstPage" || thread.entries.length === 0) {
    return null;
  }
  return thread.status === "CanLoadMore"
    ? `${thread.entries.length}+`
    : String(thread.entries.length);
}

// Inline comments for detail screens: the newest few comments, a "view all"
// expander instead of a separate screen, and the composer right in the page.
// The host screen's ScrollView must set automaticallyAdjustKeyboardInsets and
// pass onComposerFocus so the input settles above the keyboard.
export function CommentsSection({
  thread,
  enabled = true,
  isOwner = false,
  onComposerFocus,
}: {
  thread: ReturnType<typeof useCommentThread>;
  enabled?: boolean;
  isOwner?: boolean;
  onComposerFocus?: () => void;
}) {
  const { me, entries, status, loadMore, removeComment, submit, isAuthenticated } = thread;
  const [expanded, setExpanded] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);

  const report = useMutation(api.reports.create);
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

  const loading = status === "LoadingFirstPage";
  const countLabel = formatCommentCount(thread);
  const visibleEntries = expanded ? entries : entries.slice(-COLLAPSED_COUNT);
  const hasHidden =
    !expanded && (entries.length > COLLAPSED_COUNT || status === "CanLoadMore");

  if (!enabled) {
    return (
      <View>
        <Text className="text-base font-semibold text-text-primary">Comments</Text>
        <View className="mt-3 flex-row items-center gap-2.5 rounded-2xl border border-dark-border bg-dark-card px-4 py-3.5">
          <Ionicons name="chatbubble-outline" size={16} color="#5A6070" />
          <Text className="flex-1 text-sm text-text-tertiary">
            {isOwner
              ? "Comments are off. Turn them on from Edit list."
              : "Comments are turned off for this list."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row items-baseline gap-2">
        <Text className="text-base font-semibold text-text-primary">Comments</Text>
        {countLabel ? (
          <Text className="text-sm text-text-tertiary">{countLabel}</Text>
        ) : null}
      </View>

      {loading ? (
        <View className="items-center py-5">
          <ActivityIndicator size="small" color="#5A6070" />
        </View>
      ) : (
        <View className="mt-1">
          {expanded && status === "CanLoadMore" ? (
            <Pressable
              onPress={() => loadMore(20)}
              accessibilityRole="button"
              accessibilityLabel="View earlier comments"
              className="py-2 active:opacity-70"
            >
              <Text className="text-sm font-medium text-text-tertiary">
                View earlier comments
              </Text>
            </Pressable>
          ) : null}
          {expanded && status === "LoadingMore" ? (
            <View className="items-center py-2">
              <ActivityIndicator size="small" color="#5A6070" />
            </View>
          ) : null}

          {entries.length === 0 ? (
            <Text className="py-3 text-sm text-text-tertiary">
              Be the first to comment.
            </Text>
          ) : (
            visibleEntries.map((entry) => (
              <CommentRow
                key={entry.comment._id}
                entry={entry}
                viewer={me}
                onDelete={removeComment}
                onReport={setReportCommentId}
              />
            ))
          )}

          {hasHidden ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpanded(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="View all comments"
              className="py-2 active:opacity-70"
            >
              <Text className="text-sm font-medium text-brand-400">
                View all {countLabel} comments
              </Text>
            </Pressable>
          ) : null}

          <View className="mt-2">
            <CommentComposer
              viewer={me}
              isAuthenticated={isAuthenticated}
              onSubmit={submit}
              onFocus={onComposerFocus}
            />
          </View>
        </View>
      )}

      <ReportModal
        visible={reportCommentId !== null}
        onClose={() => setReportCommentId(null)}
        onSubmit={handleReportComment}
      />
    </View>
  );
}
