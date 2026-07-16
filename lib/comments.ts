export type CommentTargetType = "review" | "log" | "list";

export type CommentDoc = {
  _id: string;
  authorId: string;
  targetType: CommentTargetType;
  targetId: string;
  parentId?: string | null;
  text: string;
  createdAt: number;
  likeCount?: number;
  viewerLiked?: boolean;
};

export type CommentAuthor = {
  _id: string;
  displayName?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean | null;
} | null;

export type CommentEntry = {
  comment: CommentDoc;
  author: CommentAuthor;
  replies: CommentEntry[];
};

export const COMMENT_MAX_LENGTH = 1000;

// The RPC returns threaded { comment, author, replies } entries; older cached
// pages may still hold flat comment docs or reply-less pairs, so every shape
// normalizes to CommentEntry.
export function normalizeCommentEntries(rows: unknown[]): CommentEntry[] {
  const entries: CommentEntry[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const candidate = row as {
      comment?: unknown;
      author?: unknown;
      replies?: unknown;
      _id?: unknown;
      text?: unknown;
    };
    if (candidate.comment && typeof candidate.comment === "object") {
      const comment = candidate.comment as CommentDoc;
      if (typeof comment._id === "string" && typeof comment.text === "string") {
        entries.push({
          comment,
          author: (candidate.author as CommentAuthor) ?? null,
          replies: Array.isArray(candidate.replies)
            ? normalizeCommentEntries(candidate.replies)
            : [],
        });
      }
      continue;
    }
    if (typeof candidate._id === "string" && typeof candidate.text === "string") {
      entries.push({ comment: row as CommentDoc, author: null, replies: [] });
    }
  }
  return entries;
}

// Total comments across the thread, replies included — drives "View all N
// comments" and count badges.
export function countCommentEntries(entries: CommentEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    total += 1 + countCommentEntries(entry.replies ?? []);
  }
  return total;
}

export function findCommentEntry(
  entries: CommentEntry[],
  commentId: string,
): CommentEntry | null {
  for (const entry of entries) {
    if (entry.comment._id === commentId) {
      return entry;
    }
    const nested = findCommentEntry(entry.replies ?? [], commentId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

// Tree edits below return new arrays along the touched path (and reuse
// untouched branches) so React re-renders exactly what changed.

// Appends a new entry under its parent, or at top level for parentId null.
// Optimistic inserts land last among their siblings — a fresh comment has no
// likes yet, and the server sorts zero-like comments to the end too.
export function insertCommentEntry(
  entries: CommentEntry[],
  entry: CommentEntry,
  parentId?: string | null,
): CommentEntry[] {
  if (!parentId) {
    return [...entries, entry];
  }
  let changed = false;
  const next = entries.map((existing) => {
    if (existing.comment._id === parentId) {
      changed = true;
      return { ...existing, replies: [...(existing.replies ?? []), entry] };
    }
    const childReplies = existing.replies ?? [];
    const replies = insertCommentEntry(childReplies, entry, parentId);
    if (replies === childReplies) {
      return existing;
    }
    changed = true;
    return { ...existing, replies };
  });
  return changed ? next : entries;
}

// Removes an entry (and implicitly its subtree) wherever it sits in the tree.
export function removeCommentEntry(
  entries: CommentEntry[],
  commentId: string,
): CommentEntry[] {
  let changed = false;
  const next: CommentEntry[] = [];
  for (const entry of entries) {
    if (entry.comment._id === commentId) {
      changed = true;
      continue;
    }
    const childReplies = entry.replies ?? [];
    const replies = removeCommentEntry(childReplies, commentId);
    if (replies === childReplies) {
      next.push(entry);
    } else {
      changed = true;
      next.push({ ...entry, replies });
    }
  }
  return changed ? next : entries;
}

// Flips the viewer's like on one comment and adjusts its count in place.
export function toggleCommentLikeInEntries(
  entries: CommentEntry[],
  commentId: string,
): CommentEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.comment._id === commentId) {
      const liked = Boolean(entry.comment.viewerLiked);
      changed = true;
      return {
        ...entry,
        comment: {
          ...entry.comment,
          viewerLiked: !liked,
          likeCount: Math.max(0, (entry.comment.likeCount ?? 0) + (liked ? -1 : 1)),
        },
      };
    }
    const childReplies = entry.replies ?? [];
    const replies = toggleCommentLikeInEntries(childReplies, commentId);
    if (replies === childReplies) {
      return entry;
    }
    changed = true;
    return { ...entry, replies };
  });
  return changed ? next : entries;
}

export function commentAuthorLabel(author: CommentAuthor): string {
  return author?.displayName ?? author?.username ?? author?.name ?? "Someone";
}

export function canDeleteComment(
  comment: Pick<CommentDoc, "authorId">,
  viewer: { _id: string; isAdmin?: boolean | null } | null | undefined,
): boolean {
  if (!viewer) {
    return false;
  }
  return viewer._id === comment.authorId || Boolean(viewer.isAdmin);
}

export function normalizeCommentText(text: string): string {
  return text.trim().slice(0, COMMENT_MAX_LENGTH);
}

export function isOptimisticCommentId(id: string): boolean {
  return id.startsWith("optimistic:");
}

export function buildOptimisticCommentEntry(args: {
  targetType: CommentTargetType;
  targetId: string;
  text: string;
  viewer: NonNullable<CommentAuthor> | null;
  parentId?: string | null;
  now?: number;
}): CommentEntry {
  const createdAt = args.now ?? Date.now();
  return {
    comment: {
      _id: `optimistic:${args.targetType}:${args.targetId}:${createdAt}`,
      authorId: args.viewer?._id ?? "optimistic-viewer",
      targetType: args.targetType,
      targetId: args.targetId,
      parentId: args.parentId ?? null,
      text: normalizeCommentText(args.text),
      createdAt,
      likeCount: 0,
      viewerLiked: false,
    },
    author: args.viewer,
    replies: [],
  };
}
