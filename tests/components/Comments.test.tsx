import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockAdd = jest.fn(async () => ({})) as any;
mockAdd.withOptimisticUpdate = jest.fn(() => mockAdd);
const mockRemove = jest.fn(async () => ({ success: true })) as any;
mockRemove.withOptimisticUpdate = jest.fn(() => mockRemove);
const mockToggleLike = jest.fn(async () => true) as any;
mockToggleLike.withOptimisticUpdate = jest.fn(() => mockToggleLike);

let mockPaginated: {
  results: unknown[];
  status: string;
  loadMore: (n?: number) => void;
};
let mockMe: unknown;

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

const mockGuardedPush = jest.fn();
jest.mock("../../lib/navigation", () => ({
  guardedPush: (...args: unknown[]) => mockGuardedPush(...args),
}));

jest.mock("../../lib/plotlist/react", () => ({
  useAuth: () => ({ isAuthenticated: true }),
  useQuery: () => mockMe,
  useMutation: (ref: { __name?: string }) => {
    const name = String(ref?.__name ?? "");
    if (name.includes("delete")) return mockRemove;
    if (name.includes("likes")) return mockToggleLike;
    return mockAdd;
  },
  usePaginatedQuery: () => mockPaginated,
}));

jest.mock("../../components/ReportModal", () => ({
  ReportModal: () => null,
}));

import {
  CommentComposer,
  CommentsSection,
  CommentThreadList,
  useCommentThread,
} from "../../components/Comments";
import { commentAuthorLabel } from "../../lib/comments";

// Mirrors how app/comments.tsx composes the thread (list + composer).
function ThreadHarness() {
  const thread = useCommentThread("review", "review_1");
  return (
    <>
      <CommentThreadList thread={thread} onReport={jest.fn()} />
      <CommentComposer
        viewer={thread.me as any}
        isAuthenticated={thread.isAuthenticated}
        onSubmit={thread.submit}
        replyingToLabel={thread.replyTo ? commentAuthorLabel(thread.replyTo.author) : null}
        onCancelReply={() => thread.setReplyTo(null)}
      />
    </>
  );
}

const entry = (
  id: string,
  text: string,
  authorName: string,
  overrides: Record<string, unknown> = {},
  replies: unknown[] = [],
) => ({
  comment: {
    _id: id,
    authorId: `user_${id}`,
    targetType: "review",
    targetId: "review_1",
    parentId: null,
    text,
    createdAt: Date.now() - 60_000,
    likeCount: 0,
    viewerLiked: false,
    ...overrides,
  },
  author: {
    _id: `user_${id}`,
    displayName: authorName,
    username: authorName.toLowerCase(),
    avatarUrl: null,
  },
  replies,
});

describe("comment thread", () => {
  beforeEach(() => {
    mockMe = { _id: "user_me", displayName: "Me" };
    mockPaginated = {
      results: [entry("c1", "Loved this finale", "Avery"), entry("c2", "Same!", "Sam")],
      status: "Exhausted",
      loadMore: jest.fn(),
    };
    mockAdd.mockClear();
    mockToggleLike.mockClear();
    mockGuardedPush.mockClear();
  });

  it("renders comment text with author names from { comment, author } entries", () => {
    render(<ThreadHarness />);

    expect(screen.getByText("Loved this finale")).toBeTruthy();
    expect(screen.getByText("Same!")).toBeTruthy();
    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("renders nested replies beneath their parent", () => {
    mockPaginated = {
      results: [
        entry("c1", "Top comment", "Avery", {}, [
          entry("c2", "First reply", "Sam", { parentId: "c1" }),
        ]),
      ],
      status: "Exhausted",
      loadMore: jest.fn(),
    };
    render(<ThreadHarness />);

    expect(screen.getByText("Top comment")).toBeTruthy();
    expect(screen.getByText("First reply")).toBeTruthy();
  });

  it("shows like counts and toggles a comment like", () => {
    mockPaginated = {
      results: [entry("c1", "Hot take", "Avery", { likeCount: 4, viewerLiked: false })],
      status: "Exhausted",
      loadMore: jest.fn(),
    };
    render(<ThreadHarness />);

    const likeButton = screen.getByLabelText("Like comment. 4 likes");
    fireEvent.press(likeButton);
    expect(mockToggleLike).toHaveBeenCalledWith({
      targetType: "comment",
      targetId: "c1",
    });
  });

  it("shows a friendly empty state instead of blank rows", () => {
    mockPaginated = { results: [], status: "Exhausted", loadMore: jest.fn() };
    render(<ThreadHarness />);
    expect(screen.getByText("No comments yet. Start the conversation.")).toBeTruthy();
  });

  it("offers pagination when more comments exist", () => {
    mockPaginated = {
      results: [entry("c1", "First", "Avery")],
      status: "CanLoadMore",
      loadMore: jest.fn(),
    };
    render(<ThreadHarness />);

    fireEvent.press(screen.getByText("View more comments"));
    expect(mockPaginated.loadMore).toHaveBeenCalledWith(20);
  });

  it("posts trimmed comment text through the add mutation", async () => {
    render(<ThreadHarness />);

    fireEvent.changeText(screen.getByPlaceholderText("Add a comment…"), "  So good  ");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Post comment"));
    });

    expect(mockAdd).toHaveBeenCalledWith({
      targetType: "review",
      targetId: "review_1",
      text: "So good",
    });
  });

  it("replies through the composer with the parent id attached", async () => {
    render(<ThreadHarness />);

    fireEvent.press(screen.getByLabelText("Reply to Avery"));
    expect(screen.getByLabelText("Cancel reply")).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("Add a reply…"), "Totally agree");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Post comment"));
    });

    expect(mockAdd).toHaveBeenCalledWith({
      targetType: "review",
      targetId: "review_1",
      text: "Totally agree",
      parentId: "c1",
    });
  });

  it("cancels a pending reply back to a top-level comment", async () => {
    render(<ThreadHarness />);

    fireEvent.press(screen.getByLabelText("Reply to Avery"));
    fireEvent.press(screen.getByLabelText("Cancel reply"));

    fireEvent.changeText(screen.getByPlaceholderText("Add a comment…"), "Standalone");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Post comment"));
    });

    expect(mockAdd).toHaveBeenCalledWith({
      targetType: "review",
      targetId: "review_1",
      text: "Standalone",
    });
  });

  it("submits from the keyboard send key", async () => {
    render(<ThreadHarness />);

    const input = screen.getByPlaceholderText("Add a comment…");
    expect(input.props.returnKeyType).toBe("send");
    expect(input.props.submitBehavior).toBe("submit");

    fireEvent.changeText(input, "Sent from the keyboard");
    await act(async () => {
      fireEvent(input, "submitEditing");
    });

    expect(mockAdd).toHaveBeenCalledWith({
      targetType: "review",
      targetId: "review_1",
      text: "Sent from the keyboard",
    });
  });

  it("does not post when the composer is empty", () => {
    render(<ThreadHarness />);
    fireEvent.press(screen.getByLabelText("Post comment"));
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

// Mirrors how detail screens (lists, reviews) embed the inline section.
function SectionHarness({ enabled = true, isOwner = false }: { enabled?: boolean; isOwner?: boolean }) {
  const thread = useCommentThread("review", "review_1", { skip: !enabled });
  return <CommentsSection thread={thread} enabled={enabled} isOwner={isOwner} />;
}

describe("CommentsSection", () => {
  beforeEach(() => {
    mockMe = { _id: "user_me", displayName: "Me" };
    // Server order is best-first (most likes at the top).
    mockPaginated = {
      results: [
        entry("c1", "Top comment", "Avery", { likeCount: 9 }),
        entry("c2", "Second comment", "Sam", { likeCount: 4 }),
        entry("c3", "Third comment", "Kai", { likeCount: 1 }),
        entry("c4", "Bottom comment", "Rue"),
      ],
      status: "Exhausted",
      loadMore: jest.fn(),
    };
    mockAdd.mockClear();
    mockToggleLike.mockClear();
    mockGuardedPush.mockClear();
  });

  it("collapses to the top-ranked comments with a view-all affordance", () => {
    render(<SectionHarness />);

    expect(screen.getByText("Top comment")).toBeTruthy();
    expect(screen.getByText("Third comment")).toBeTruthy();
    expect(screen.queryByText("Bottom comment")).toBeNull();
    expect(screen.getByText("View all 4 comments")).toBeTruthy();
  });

  it("hides replies until expanded but counts them in the label", () => {
    mockPaginated = {
      results: [
        entry("c1", "Top comment", "Avery", { likeCount: 9 }, [
          entry("c5", "Buried reply", "Sam", { parentId: "c1" }),
        ]),
      ],
      status: "Exhausted",
      loadMore: jest.fn(),
    };
    render(<SectionHarness />);

    expect(screen.queryByText("Buried reply")).toBeNull();
    fireEvent.press(screen.getByText("View all 2 comments"));
    expect(screen.getByText("Buried reply")).toBeTruthy();
  });

  it("expands the full thread inline instead of navigating away", () => {
    render(<SectionHarness />);

    fireEvent.press(screen.getByText("View all 4 comments"));

    expect(screen.getByText("Bottom comment")).toBeTruthy();
    expect(screen.queryByText("View all 4 comments")).toBeNull();
    expect(mockGuardedPush).not.toHaveBeenCalled();
  });

  it("posts through the inline composer", async () => {
    render(<SectionHarness />);

    fireEvent.changeText(screen.getByPlaceholderText("Add a comment…"), "  So good  ");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Post comment"));
    });

    expect(mockAdd).toHaveBeenCalledWith({
      targetType: "review",
      targetId: "review_1",
      text: "So good",
    });
  });

  it("shows the owner hint instead of the thread when comments are off", () => {
    render(<SectionHarness enabled={false} isOwner />);

    expect(screen.getByText("Comments are off. Turn them on from Edit list.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Add a comment…")).toBeNull();
  });

  it("shows a quiet notice to non-owners when comments are off", () => {
    render(<SectionHarness enabled={false} />);

    expect(screen.getByText("Comments are turned off for this list.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Add a comment…")).toBeNull();
  });
});
