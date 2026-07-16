import { describe, expect, it } from "@jest/globals";

import {
  buildOptimisticCommentEntry,
  canDeleteComment,
  commentAuthorLabel,
  countCommentEntries,
  findCommentEntry,
  insertCommentEntry,
  isOptimisticCommentId,
  normalizeCommentEntries,
  normalizeCommentText,
  removeCommentEntry,
  toggleCommentLikeInEntries,
  COMMENT_MAX_LENGTH,
  type CommentEntry,
} from "../lib/comments";

const doc = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  authorId: `user_${id}`,
  targetType: "review" as const,
  targetId: "review_1",
  parentId: null,
  text: `text ${id}`,
  createdAt: 1750000000000,
  likeCount: 0,
  viewerLiked: false,
  ...overrides,
});

const entry = (id: string, overrides: Record<string, unknown> = {}, replies: CommentEntry[] = []): CommentEntry => ({
  comment: doc(id, overrides) as CommentEntry["comment"],
  author: {
    _id: `user_${id}`,
    displayName: `Author ${id}`,
    username: `author_${id}`,
    avatarUrl: null,
  },
  replies,
});

const serverEntry = {
  comment: {
    _id: "comment_1",
    authorId: "user_1",
    targetType: "review" as const,
    targetId: "review_1",
    text: "Loved this finale",
    createdAt: 1750000000000,
    likeCount: 2,
    viewerLiked: true,
  },
  author: {
    _id: "user_1",
    displayName: "Avery",
    username: "avery",
    avatarUrl: null,
  },
  replies: [
    {
      comment: {
        _id: "comment_2",
        authorId: "user_2",
        targetType: "review" as const,
        targetId: "review_1",
        parentId: "comment_1",
        text: "Same!",
        createdAt: 1750000001000,
        likeCount: 0,
        viewerLiked: false,
      },
      author: { _id: "user_2", displayName: "Sam", username: "sam", avatarUrl: null },
      replies: [],
    },
  ],
};

describe("normalizeCommentEntries", () => {
  it("keeps threaded { comment, author, replies } entries from the RPC", () => {
    const entries = normalizeCommentEntries([serverEntry]);
    expect(entries).toHaveLength(1);
    expect(entries[0].comment.text).toBe("Loved this finale");
    expect(entries[0].comment.likeCount).toBe(2);
    expect(entries[0].comment.viewerLiked).toBe(true);
    expect(entries[0].replies).toHaveLength(1);
    expect(entries[0].replies[0].comment.parentId).toBe("comment_1");
    expect(entries[0].replies[0].author?.displayName).toBe("Sam");
  });

  it("defaults replies to an empty list for pre-threading entries", () => {
    const { replies: _dropped, ...flatPair } = serverEntry;
    const entries = normalizeCommentEntries([flatPair]);
    expect(entries).toHaveLength(1);
    expect(entries[0].replies).toEqual([]);
  });

  it("wraps legacy flat comment docs without an author", () => {
    const entries = normalizeCommentEntries([
      { _id: "comment_2", authorId: "user_2", text: "hi", createdAt: 1, targetType: "review", targetId: "r" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].comment._id).toBe("comment_2");
    expect(entries[0].author).toBeNull();
    expect(entries[0].replies).toEqual([]);
  });

  it("drops malformed rows instead of rendering blank comments", () => {
    const entries = normalizeCommentEntries([
      null,
      undefined,
      {},
      { comment: { _id: "x" } },
      serverEntry,
    ] as unknown[]);
    expect(entries).toHaveLength(1);
  });
});

describe("countCommentEntries", () => {
  it("counts replies at every depth", () => {
    const entries = [
      entry("a", {}, [entry("a1", {}, [entry("a1a")]), entry("a2")]),
      entry("b"),
    ];
    expect(countCommentEntries(entries)).toBe(5);
    expect(countCommentEntries([])).toBe(0);
  });
});

describe("findCommentEntry", () => {
  it("finds entries nested inside reply chains", () => {
    const entries = [entry("a", {}, [entry("a1", {}, [entry("a1a")])])];
    expect(findCommentEntry(entries, "a1a")?.comment._id).toBe("a1a");
    expect(findCommentEntry(entries, "missing")).toBeNull();
  });
});

describe("insertCommentEntry", () => {
  it("appends top-level comments at the end", () => {
    const result = insertCommentEntry([entry("a")], entry("b"));
    expect(result.map((row) => row.comment._id)).toEqual(["a", "b"]);
  });

  it("nests replies under their parent, even deep in the tree", () => {
    const tree = [entry("a", {}, [entry("a1")])];
    const result = insertCommentEntry(tree, entry("a1a"), "a1");
    expect(result[0].replies[0].replies[0].comment._id).toBe("a1a");
  });

  it("keeps untouched branches identical for cheap re-renders", () => {
    const untouched = entry("y");
    const result = insertCommentEntry([entry("x"), untouched], entry("z"), "x");
    expect(result[1]).toBe(untouched);
  });
});

describe("removeCommentEntry", () => {
  it("removes an entry and its whole subtree", () => {
    const tree = [entry("a", {}, [entry("a1", {}, [entry("a1a")])]), entry("b")];
    const result = removeCommentEntry(tree, "a1");
    expect(countCommentEntries(result)).toBe(2);
    expect(findCommentEntry(result, "a1a")).toBeNull();
  });

  it("removes nested replies without touching siblings", () => {
    const tree = [entry("a", {}, [entry("a1"), entry("a2")])];
    const result = removeCommentEntry(tree, "a2");
    expect(result[0].replies.map((row) => row.comment._id)).toEqual(["a1"]);
  });
});

describe("toggleCommentLikeInEntries", () => {
  it("likes and unlikes a nested comment, adjusting the count", () => {
    const tree = [entry("a", {}, [entry("a1", { likeCount: 3, viewerLiked: false })])];
    const liked = toggleCommentLikeInEntries(tree, "a1");
    expect(liked[0].replies[0].comment.viewerLiked).toBe(true);
    expect(liked[0].replies[0].comment.likeCount).toBe(4);

    const unliked = toggleCommentLikeInEntries(liked, "a1");
    expect(unliked[0].replies[0].comment.viewerLiked).toBe(false);
    expect(unliked[0].replies[0].comment.likeCount).toBe(3);
  });

  it("never drives a count below zero", () => {
    const tree = [entry("a", { likeCount: 0, viewerLiked: true })];
    const result = toggleCommentLikeInEntries(tree, "a");
    expect(result[0].comment.likeCount).toBe(0);
    expect(result[0].comment.viewerLiked).toBe(false);
  });
});

describe("commentAuthorLabel", () => {
  it("prefers display name, then username, then name", () => {
    expect(commentAuthorLabel({ _id: "u", displayName: "Avery", username: "a" })).toBe("Avery");
    expect(commentAuthorLabel({ _id: "u", username: "avery" })).toBe("avery");
    expect(commentAuthorLabel({ _id: "u", name: "Avery L" })).toBe("Avery L");
    expect(commentAuthorLabel(null)).toBe("Someone");
  });
});

describe("canDeleteComment", () => {
  it("allows the author and admins only", () => {
    const comment = { authorId: "user_1" };
    expect(canDeleteComment(comment, { _id: "user_1" })).toBe(true);
    expect(canDeleteComment(comment, { _id: "user_2" })).toBe(false);
    expect(canDeleteComment(comment, { _id: "user_2", isAdmin: true })).toBe(true);
    expect(canDeleteComment(comment, null)).toBe(false);
  });
});

describe("normalizeCommentText", () => {
  it("trims whitespace and enforces the max length", () => {
    expect(normalizeCommentText("  hello  ")).toBe("hello");
    expect(normalizeCommentText("x".repeat(COMMENT_MAX_LENGTH + 50))).toHaveLength(
      COMMENT_MAX_LENGTH,
    );
  });
});

describe("buildOptimisticCommentEntry", () => {
  it("builds a pending entry attributed to the viewer", () => {
    const built = buildOptimisticCommentEntry({
      targetType: "log",
      targetId: "log_1",
      text: " nice pick ",
      viewer: { _id: "user_9", displayName: "Me" },
      now: 123,
    });
    expect(isOptimisticCommentId(built.comment._id)).toBe(true);
    expect(built.comment.text).toBe("nice pick");
    expect(built.comment.authorId).toBe("user_9");
    expect(built.comment.createdAt).toBe(123);
    expect(built.comment.parentId).toBeNull();
    expect(built.replies).toEqual([]);
    expect(built.author?.displayName).toBe("Me");
  });

  it("carries the parent id for optimistic replies", () => {
    const built = buildOptimisticCommentEntry({
      targetType: "review",
      targetId: "review_1",
      text: "totally",
      viewer: { _id: "user_9" },
      parentId: "comment_1",
      now: 123,
    });
    expect(built.comment.parentId).toBe("comment_1");
  });
});
