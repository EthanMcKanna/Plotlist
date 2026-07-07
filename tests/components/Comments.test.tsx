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

jest.mock("../../lib/navigation", () => ({
  guardedPush: jest.fn(),
}));

jest.mock("../../lib/plotlist/react", () => ({
  useAuth: () => ({ isAuthenticated: true }),
  useQuery: () => mockMe,
  useMutation: (ref: { __name?: string }) =>
    String(ref?.__name ?? "").includes("delete") ? mockRemove : mockAdd,
  usePaginatedQuery: () => mockPaginated,
}));

import { Comments } from "../../components/Comments";

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

describe("Comments", () => {
  beforeEach(() => {
    mockMe = { _id: "user_me", displayName: "Me" };
    mockPaginated = {
      results: [entry("c1", "Loved this finale", "Avery"), entry("c2", "Same!", "Sam")],
      status: "Exhausted",
      loadMore: jest.fn(),
    };
    mockAdd.mockClear();
  });

  it("renders comment text with author names from { comment, author } entries", () => {
    render(<Comments targetType="review" targetId="review_1" />);

    expect(screen.getByText("Loved this finale")).toBeTruthy();
    expect(screen.getByText("Same!")).toBeTruthy();
    expect(screen.getByText("Avery")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("shows the comment count in the header", () => {
    render(<Comments targetType="review" targetId="review_1" />);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows a friendly empty state instead of blank rows", () => {
    mockPaginated = { results: [], status: "Exhausted", loadMore: jest.fn() };
    render(<Comments targetType="review" targetId="review_1" />);
    expect(screen.getByText("No comments yet. Start the conversation.")).toBeTruthy();
  });

  it("offers pagination when more comments exist", () => {
    mockPaginated = {
      results: [entry("c1", "First", "Avery")],
      status: "CanLoadMore",
      loadMore: jest.fn(),
    };
    render(<Comments targetType="review" targetId="review_1" />);

    fireEvent.press(screen.getByText("View more comments"));
    expect(mockPaginated.loadMore).toHaveBeenCalledWith(20);
  });

  it("posts trimmed comment text through the add mutation", async () => {
    render(<Comments targetType="review" targetId="review_1" />);

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

  it("does not post when the composer is empty", () => {
    render(<Comments targetType="review" targetId="review_1" />);
    fireEvent.press(screen.getByLabelText("Post comment"));
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
