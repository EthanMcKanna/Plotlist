import { describe, expect, it } from "@jest/globals";

import {
  buildOptimisticCommentEntry,
  canDeleteComment,
  commentAuthorLabel,
  commentsHref,
  isOptimisticCommentId,
  normalizeCommentEntries,
  normalizeCommentText,
  COMMENT_MAX_LENGTH,
} from "../lib/comments";

const serverEntry = {
  comment: {
    _id: "comment_1",
    authorId: "user_1",
    targetType: "review" as const,
    targetId: "review_1",
    text: "Loved this finale",
    createdAt: 1750000000000,
  },
  author: {
    _id: "user_1",
    displayName: "Avery",
    username: "avery",
    avatarUrl: null,
  },
};

describe("normalizeCommentEntries", () => {
  it("keeps { comment, author } entries from the RPC", () => {
    const entries = normalizeCommentEntries([serverEntry]);
    expect(entries).toHaveLength(1);
    expect(entries[0].comment.text).toBe("Loved this finale");
    expect(entries[0].author?.displayName).toBe("Avery");
  });

  it("wraps legacy flat comment docs without an author", () => {
    const entries = normalizeCommentEntries([
      { _id: "comment_2", authorId: "user_2", text: "hi", createdAt: 1, targetType: "review", targetId: "r" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].comment._id).toBe("comment_2");
    expect(entries[0].author).toBeNull();
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
    const entry = buildOptimisticCommentEntry({
      targetType: "log",
      targetId: "log_1",
      text: " nice pick ",
      viewer: { _id: "user_9", displayName: "Me" },
      now: 123,
    });
    expect(isOptimisticCommentId(entry.comment._id)).toBe(true);
    expect(entry.comment.text).toBe("nice pick");
    expect(entry.comment.authorId).toBe("user_9");
    expect(entry.comment.createdAt).toBe(123);
    expect(entry.author?.displayName).toBe("Me");
  });
});

describe("commentsHref", () => {
  it("builds the standalone comments route", () => {
    expect(commentsHref("log", "log_1")).toBe("/comments?targetType=log&targetId=log_1");
  });
});
