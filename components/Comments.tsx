import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "./Avatar";
import { CommentContextMenu } from "./CommentContextMenu";
import { LinkPressable } from "./LinkPressable";
import { ReportModal } from "./ReportModal";
import { api } from "../lib/plotlist/api";
import { useAuth, useMutation, usePaginatedQuery, useQuery } from "../lib/plotlist/react";
import { confirmAction, notify, notifyError, promptSignIn } from "../lib/dialogs";
import { guardedPush } from "../lib/navigation";
import { formatRelativeTime } from "../lib/format";
import { getUserFacingApiErrorMessage } from "../lib/api/client";
import {
  buildOptimisticCommentEntry,
  canDeleteComment,
  commentAuthorLabel,
  COMMENT_MAX_LENGTH,
  countCommentEntries,
  insertCommentEntry,
  isOptimisticCommentId,
  normalizeCommentEntries,
  normalizeCommentText,
  removeCommentEntry,
  toggleCommentLikeInEntries,
  type CommentEntry,
  type CommentTargetType,
} from "../lib/comments";

const LIKED_COLOR = "#F43F5E";
const IDLE_COLOR = "#9BA1B0";

// Data + mutations for one comment thread. Detail screens (lists, reviews)
// embed CommentsSection inline; watch logs still use the /comments screen.
// Entries arrive threaded (replies nested under parents) and ranked by likes.
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
  const totalCount = useMemo(() => countCommentEntries(entries), [entries]);

  // Reply state lives on the thread so the row that started the reply and
  // the composer that finishes it stay in sync.
  const [replyTo, setReplyTo] = useState<CommentEntry | null>(null);

  const updateEntries = useCallback(
    (
      localStore: any,
      update: (current: CommentEntry[]) => CommentEntry[],
    ) => {
      localStore.setPaginatedQuery(
        api.comments.listForTarget,
        { targetType, targetId },
        (current: any) => {
          if (!current) {
            return current;
          }
          const page = update(normalizeCommentEntries(current.page ?? current.results ?? []));
          return { ...current, page, results: page };
        },
      );
    },
    [targetId, targetType],
  );

  const add = useMutation(api.comments.add).withOptimisticUpdate((localStore, args) => {
    const entry = buildOptimisticCommentEntry({
      targetType: args.targetType,
      targetId: args.targetId,
      text: args.text,
      viewer: me,
      parentId: args.parentId,
    });
    updateEntries(localStore, (current) =>
      insertCommentEntry(current, entry, args.parentId),
    );
  });

  const remove = useMutation(api.comments.deleteComment).withOptimisticUpdate(
    (localStore, args) => {
      updateEntries(localStore, (current) => removeCommentEntry(current, args.commentId));
    },
  );

  const toggleLike = useMutation(api.likes.toggle).withOptimisticUpdate(
    (localStore, args) => {
      updateEntries(localStore, (current) =>
        toggleCommentLikeInEntries(current, args.targetId),
      );
    },
  );

  const submit = useCallback(
    async (text: string) => {
      const parentId =
        replyTo && !isOptimisticCommentId(replyTo.comment._id)
          ? replyTo.comment._id
          : undefined;
      await add({ targetType, targetId, text, ...(parentId ? { parentId } : {}) });
      setReplyTo(null);
    },
    [add, replyTo, targetId, targetType],
  );

  const removeComment = useCallback(
    (commentId: string) => {
      setReplyTo((current) => (current?.comment._id === commentId ? null : current));
      remove({ commentId }).catch(() => {
        notifyError("Couldn't delete comment", "Check your connection and try again.");
      });
    },
    [remove],
  );

  const likeComment = useCallback(
    (commentId: string) => {
      if (!isAuthenticated) {
        if (Platform.OS === "web") {
          promptSignIn("Sign in to like comments.");
        } else {
          Alert.alert("Sign in required", "Sign in to like comments.");
        }
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleLike({ targetType: "comment", targetId: commentId }).catch(() => {
        // The optimistic flip already rolled back; a like isn't worth an alert.
      });
    },
    [isAuthenticated, toggleLike],
  );

  return {
    isAuthenticated,
    me,
    entries,
    totalCount,
    status,
    loadMore,
    submit,
    removeComment,
    likeComment,
    replyTo,
    setReplyTo,
  };
}

type CommentThreadState = ReturnType<typeof useCommentThread>;

// Replies indent once under their top-level comment, then hold that indent —
// Reddit-deep chains stay readable on a phone instead of collapsing into a
// one-word-wide column.
const MAX_INDENT_DEPTH = 1;

function CommentRow({
  entry,
  depth,
  thread,
  onReport,
}: {
  entry: CommentEntry;
  depth: number;
  thread: CommentThreadState;
  onReport: (commentId: string) => void;
}) {
  const { comment, author, replies } = entry;
  const { me, removeComment, likeComment, replyTo, setReplyTo, isAuthenticated } = thread;
  const label = commentAuthorLabel(author);
  const pending = isOptimisticCommentId(comment._id);
  const deletable = !pending && canDeleteComment(comment, me);
  const reportable = !pending && Boolean(me) && author?._id !== me?._id;
  const liked = Boolean(comment.viewerLiked);
  const likeCount = comment.likeCount ?? 0;
  const isReplyTarget = replyTo?.comment._id === comment._id;

  const openProfile = useCallback(() => {
    if (author?._id) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      guardedPush(`/profile/${author._id}`);
    }
  }, [author?._id]);

  const confirmDelete = useCallback(() => {
    confirmAction({
      title: "Delete comment?",
      message:
        replies.length > 0 ? "Its replies will be deleted too. This can't be undone." : "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => removeComment(comment._id),
    });
  }, [comment._id, removeComment, replies.length]);

  const reportComment = useCallback(() => onReport(comment._id), [comment._id, onReport]);

  const startReply = useCallback(() => {
    if (!isAuthenticated) {
      if (Platform.OS === "web") {
        promptSignIn("Sign in to join the conversation.");
      } else {
        Alert.alert("Sign in required", "Sign in to join the conversation.");
      }
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReplyTo(entry);
  }, [entry, isAuthenticated, setReplyTo]);

  return (
    <View className={depth > 0 && depth <= MAX_INDENT_DEPTH ? "pl-10" : ""}>
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
          className={`flex-row gap-3 py-3 ${pending ? "opacity-60" : ""} ${
            isReplyTarget ? "rounded-xl bg-dark-card" : ""
          }`}
        >
          {author?._id ? (
            <LinkPressable
              href={`/profile/${author._id}`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className="web:transition-opacity active:opacity-80 hover:opacity-80"
            >
              <Avatar uri={author.avatarUrl} label={label} size={depth > 0 ? 26 : 32} />
            </LinkPressable>
          ) : (
            <Avatar uri={author?.avatarUrl} label={label} size={depth > 0 ? 26 : 32} />
          )}
          <View className="flex-1">
            <View className="flex-row items-baseline gap-1.5">
              {author?._id ? (
                <LinkPressable
                  href={`/profile/${author._id}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="shrink web:transition-opacity active:opacity-80 hover:opacity-80"
                >
                  <Text className="text-[13px] font-semibold text-text-primary" numberOfLines={1}>
                    {label}
                  </Text>
                </LinkPressable>
              ) : (
                <Text
                  className="shrink text-[13px] font-semibold text-text-primary"
                  numberOfLines={1}
                >
                  {label}
                </Text>
              )}
              <Text className="text-[11px] text-text-tertiary">
                {pending ? "Posting…" : formatRelativeTime(comment.createdAt)}
              </Text>
            </View>
            <Text className="mt-0.5 text-[15px] leading-5 text-text-primary">{comment.text}</Text>
            {!pending ? (
              <View className="mt-1.5 flex-row items-center gap-5">
                <Pressable
                  onPress={() => likeComment(comment._id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: liked }}
                  accessibilityLabel={
                    liked
                      ? `Unlike comment. ${likeCount} ${likeCount === 1 ? "like" : "likes"}`
                      : `Like comment. ${likeCount} ${likeCount === 1 ? "like" : "likes"}`
                  }
                  className="flex-row items-center gap-1 web:transition-opacity active:opacity-70 hover:opacity-70"
                >
                  <Ionicons
                    name={liked ? "heart" : "heart-outline"}
                    size={15}
                    color={liked ? LIKED_COLOR : IDLE_COLOR}
                  />
                  {likeCount > 0 ? (
                    <Text
                      className="text-[12px] font-semibold"
                      style={{ color: liked ? LIKED_COLOR : IDLE_COLOR }}
                    >
                      {likeCount}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={startReply}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Reply to ${label}`}
                  className="web:transition-opacity active:opacity-70 hover:opacity-70"
                >
                  <Text className="text-[12px] font-semibold text-text-tertiary">Reply</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </CommentContextMenu>

      {replies.length > 0 ? (
        <View>
          {replies.map((reply) => (
            <CommentRow
              key={reply.comment._id}
              entry={reply}
              depth={depth + 1}
              thread={thread}
              onReport={onReport}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// The scrolling half of the /comments screen: threaded rows + pagination, no
// composer.
export function CommentThreadList({
  thread,
  onReport,
}: {
  thread: CommentThreadState;
  onReport: (commentId: string) => void;
}) {
  const { entries, status, loadMore } = thread;
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
            depth={0}
            thread={thread}
            onReport={onReport}
          />
        ))
      ) : (
        <Text className="py-4 text-sm text-text-tertiary">
          No comments yet. Start the conversation.
        </Text>
      )}

      {status === "CanLoadMore" ? (
        <Pressable
          onPress={() => loadMore(20)}
          className="py-2 web:transition-opacity active:opacity-70 hover:opacity-70"
        >
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
  replyingToLabel,
  onCancelReply,
}: {
  viewer: { avatarUrl?: string | null; displayName?: string | null; username?: string | null } | null;
  isAuthenticated: boolean;
  onSubmit: (text: string) => Promise<void>;
  autoFocus?: boolean;
  onFocus?: () => void;
  replyingToLabel?: string | null;
  onCancelReply?: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);
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

  // Tapping Reply on a row pulls the keyboard up so the reply banner and the
  // cursor arrive together.
  useEffect(() => {
    if (replyingToLabel) {
      inputRef.current?.focus();
    }
  }, [replyingToLabel]);

  const handleSend = useCallback(async () => {
    if (!isAuthenticated) {
      if (Platform.OS === "web") {
        promptSignIn("Sign in to join the conversation.");
      } else {
        Alert.alert("Sign in required", "Sign in to join the conversation.");
      }
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
      notifyError(
        "Couldn't post comment",
        getUserFacingApiErrorMessage(error) ?? "Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }, [isAuthenticated, onSubmit, sending, trimmed]);

  // Web: Escape backs out of a pending reply without losing the draft.
  useEffect(() => {
    if (Platform.OS !== "web" || !replyingToLabel || !onCancelReply) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelReply();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancelReply, replyingToLabel]);

  return (
    <View>
      {replyingToLabel ? (
        <View className="mb-2 flex-row items-center gap-2 rounded-xl bg-dark-card px-3 py-2">
          <Ionicons name="return-down-forward-outline" size={14} color="#9BA1B0" />
          <Text className="flex-1 text-[13px] text-text-secondary" numberOfLines={1}>
            Replying to <Text className="font-semibold">{replyingToLabel}</Text>
          </Text>
          <Pressable
            onPress={onCancelReply}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            className="active:opacity-70"
          >
            <Ionicons name="close" size={16} color="#9BA1B0" />
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row items-end gap-2.5">
        <Avatar
          uri={viewer?.avatarUrl}
          label={viewer?.displayName ?? viewer?.username}
          size={32}
        />
        <View className="min-h-[40px] flex-1 flex-row items-end rounded-3xl border border-dark-border bg-dark-card pl-4 pr-1.5 py-1">
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={
              !isAuthenticated
                ? "Sign in to comment"
                : replyingToLabel
                  ? "Add a reply…"
                  : "Add a comment…"
            }
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
            // Web: Enter sends (RNW multiline inputs otherwise insert a
            // newline); Shift+Enter keeps the newline for multi-line comments.
            {...(Platform.OS === "web"
              ? ({
                  onKeyPress: (event: {
                    key?: string;
                    shiftKey?: boolean;
                    preventDefault: () => void;
                  }) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  },
                } as object)
              : null)}
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
    </View>
  );
}

const COLLAPSED_COUNT = 3;

export function formatCommentCount(thread: CommentThreadState): string | null {
  if (thread.status === "LoadingFirstPage" || thread.totalCount === 0) {
    return null;
  }
  return thread.status === "CanLoadMore"
    ? `${thread.totalCount}+`
    : String(thread.totalCount);
}

// Inline comments for detail screens: the top-ranked comments, a "view all"
// expander instead of a separate screen, and the composer right in the page.
// The host screen's ScrollView must set automaticallyAdjustKeyboardInsets and
// pass onComposerFocus so the input settles above the keyboard.
export function CommentsSection({
  thread,
  enabled = true,
  isOwner = false,
  onComposerFocus,
}: {
  thread: CommentThreadState;
  enabled?: boolean;
  isOwner?: boolean;
  onComposerFocus?: () => void;
}) {
  const { me, entries, status, loadMore, submit, isAuthenticated, replyTo, setReplyTo } =
    thread;
  const [expanded, setExpanded] = useState(false);
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);

  const report = useMutation(api.reports.create);
  const handleReportComment = useCallback(
    async (reason?: string) => {
      if (!reportCommentId) return;
      try {
        await report({ targetType: "comment", targetId: reportCommentId, reason });
        notify("Report submitted", "Thanks — we'll take a look.");
      } catch {
        notifyError("Couldn't submit report", "Check your connection and try again.");
      }
    },
    [report, reportCommentId],
  );

  // Replying to a hidden row makes no sense, so a pending reply target
  // force-expands the section (Reply buttons only exist on visible rows, but
  // an optimistic insert can land outside the collapsed preview).
  const showAll = expanded || replyTo !== null;
  const loading = status === "LoadingFirstPage";
  const countLabel = formatCommentCount(thread);
  // Server order is best-first, so the collapsed preview is the top of the
  // thread; replies stay tucked away until the thread is expanded.
  const visibleEntries = showAll ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hasHidden =
    !showAll &&
    (entries.length > COLLAPSED_COUNT ||
      status === "CanLoadMore" ||
      entries.some((entry) => entry.replies.length > 0));

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
          {entries.length === 0 ? (
            <Text className="py-3 text-sm text-text-tertiary">
              Be the first to comment.
            </Text>
          ) : (
            visibleEntries.map((entry) => (
              <CommentRow
                key={entry.comment._id}
                entry={showAll ? entry : { ...entry, replies: [] }}
                depth={0}
                thread={thread}
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
              className="py-2 web:transition-opacity active:opacity-70 hover:opacity-70"
            >
              <Text className="text-sm font-medium text-brand-400">
                View all {countLabel} comments
              </Text>
            </Pressable>
          ) : null}

          {showAll && status === "CanLoadMore" ? (
            <Pressable
              onPress={() => loadMore(20)}
              accessibilityRole="button"
              accessibilityLabel="View more comments"
              className="py-2 web:transition-opacity active:opacity-70 hover:opacity-70"
            >
              <Text className="text-sm font-medium text-text-tertiary">
                View more comments
              </Text>
            </Pressable>
          ) : null}
          {showAll && status === "LoadingMore" ? (
            <View className="items-center py-2">
              <ActivityIndicator size="small" color="#5A6070" />
            </View>
          ) : null}

          <View className="mt-2">
            <CommentComposer
              viewer={me}
              isAuthenticated={isAuthenticated}
              // Posting a reply pins the section open — collapsing here would
              // hide the reply that was just written.
              onSubmit={async (text) => {
                if (replyTo) {
                  setExpanded(true);
                }
                await submit(text);
              }}
              onFocus={onComposerFocus}
              replyingToLabel={replyTo ? commentAuthorLabel(replyTo.author) : null}
              onCancelReply={() => setReplyTo(null)}
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
