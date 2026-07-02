import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Poster } from "../../components/Poster";

describe("Poster", () => {
  it("shows a designed fallback when artwork is missing", () => {
    render(<Poster uri={null} width={80} />);

    expect(screen.getByTestId("poster-fallback")).toBeTruthy();
    expect(screen.queryByTestId("poster-image")).toBeNull();
  });

  it("falls back if the image request fails", () => {
    render(<Poster uri="https://img.example.com/poster.jpg" width={80} />);

    fireEvent(screen.getByTestId("poster-image"), "error", {
      nativeEvent: { error: "failed" },
    });

    expect(screen.getByTestId("poster-fallback")).toBeTruthy();
    expect(screen.queryByTestId("poster-image")).toBeNull();
  });
});
