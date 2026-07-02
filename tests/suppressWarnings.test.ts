import { describe, expect, it } from "@jest/globals";

import {
  getWarningText,
  shouldSuppressConsoleWarning,
} from "../lib/suppressWarnings";

describe("warning suppressions", () => {
  it("suppresses only known upstream warning noise", () => {
    expect(
      shouldSuppressConsoleWarning([
        "props.pointerEvents is deprecated. Use style.pointerEvents",
      ]),
    ).toBe(true);
    expect(
      shouldSuppressConsoleWarning(["SafeAreaView has been deprecated"]),
    ).toBe(true);
    expect(shouldSuppressConsoleWarning(["Failed to load resource"])).toBe(
      false,
    );
    expect(
      shouldSuppressConsoleWarning([new Error("Unexpected home rail failure")]),
    ).toBe(false);
  });

  it("extracts warning text from strings, errors, and objects", () => {
    expect(getWarningText(["A", new Error("B"), { code: "C" }])).toBe(
      'A B {"code":"C"}',
    );
  });
});
