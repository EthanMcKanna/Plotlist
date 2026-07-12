export type CommentTargetType = "review" | "log" | "list";

export type CommentDoc = {
  _id: string;
  authorId: string;
  targetType: CommentTargetType;
  targetId: string;
  text: string;
  createdAt: number;
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
};

export const COMMENT_MAX_LENGTH = 1000;

// The RPC returns { comment, author } pairs; very old cached pages may still
// hold flat comment docs, so both shapes normalize to CommentEntry.
export function normalizeCommentEntries(rows: unknown[]): CommentEntry[] {
  const entries: CommentEntry[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const candidate = row as { comment?: unknown; author?: unknown; _id?: unknown; text?: unknown };
    if (candidate.comment && typeof candidate.comment === "object") {
      const comment = candidate.comment as CommentDoc;
      if (typeof comment._id === "string" && typeof comment.text === "string") {
        entries.push({ comment, author: (candidate.author as CommentAuthor) ?? null });
      }
      continue;
    }
    if (typeof candidate._id === "string" && typeof candidate.text === "string") {
      entries.push({ comment: row as CommentDoc, author: null });
    }
  }
  return entries;
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
  now?: number;
}): CommentEntry {
  const createdAt = args.now ?? Date.now();
  return {
    comment: {
      _id: `optimistic:${args.targetType}:${args.targetId}:${createdAt}`,
      authorId: args.viewer?._id ?? "optimistic-viewer",
      targetType: args.targetType,
      targetId: args.targetId,
      text: normalizeCommentText(args.text),
      createdAt,
    },
    author: args.viewer,
  };
}
