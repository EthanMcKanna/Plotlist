import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockAdd = jest.fn(async () => ({})) as any;
mockAdd.withOptimisticUpdate = jest.fn(() => mockAdd);
const mockRemove = jest.fn(async () => ({ success: true })) as any;
mockRemove.withOptimisticUpdate = jest.fn(() => mockRemove);

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
  useMutation: (ref: { __name?: string }) =>
    String(ref?.__name ?? "").includes("delete") ? mockRemove : mockAdd,
  usePaginatedQuery: () => mockPaginated,
}));

import {
  CommentComposer,
  CommentThreadList,
  CommentsPreview,
  useCommentThread,
} from "../../components/Comments";

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
      />
    </>
  );
}

const entry = (id: string, text: string, authorName: string, authorId = `user_${id}`) => ({
  comment: {
    _id: id,
    authorId,
    targetType: "review",
    targetId: "review_1",
    text,
    createdAt: Date.now() - 60_000,
  },
  author: {
    _id: authorId,
    displayName: authorName,
    username: authorName.toLowerCase(),
    avatarUrl: null,
  },
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
    mockGuardedPush.mockClear();
  });

  it("renders comment text with author names from { comment, author } entries", () => {
    render(<ThreadHarness />);

    expect(screen.getByText("Loved this finale")).toBeTruthy();
    expect(screen.getByText("Same!")).toBeTruthy();
    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
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

describe("CommentsPreview", () => {
  beforeEach(() => {
    mockMe = { _id: "user_me", displayName: "Me" };
    mockPaginated = {
      results: [
        entry("c1", "Oldest comment", "Avery"),
        entry("c2", "Middle comment", "Sam"),
        entry("c3", "Newest comment", "Kai"),
      ],
      status: "Exhausted",
      loadMore: jest.fn(),
    };
    mockGuardedPush.mockClear();
  });

  it("shows the most recent comments and a view-all affordance", () => {
    render(<CommentsPreview targetType="review" targetId="review_1" />);

    expect(screen.queryByText(/Oldest comment/)).toBeNull();
    expect(screen.getByText(/Middle comment/)).toBeTruthy();
    expect(screen.getByText(/Newest comment/)).toBeTruthy();
    expect(screen.getByText("View all comments")).toBeTruthy();
  });

  it("opens the thread with composer focus from the add-a-comment row", () => {
    render(<CommentsPreview targetType="review" targetId="review_1" />);

    fireEvent.press(screen.getByLabelText("Add a comment"));
    expect(mockGuardedPush).toHaveBeenCalledWith(
      "/comments?targetType=review&targetId=review_1&focus=1",
    );
  });

  it("opens the thread without focus when tapping a comment", () => {
    render(<CommentsPreview targetType="review" targetId="review_1" />);

    fireEvent.press(screen.getByLabelText("View comment by Kai"));
    expect(mockGuardedPush).toHaveBeenCalledWith(
      "/comments?targetType=review&targetId=review_1",
    );
  });
});
