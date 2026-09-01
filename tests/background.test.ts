import { describe, expect, it, jest } from "@jest/globals";

import { deferBackgroundWork, runWithBackgroundScope } from "../api/_lib/background";

describe("deferBackgroundWork", () => {
  it("hands deferred tasks to the request scope's waitUntil", async () => {
    const waitUntil = jest.fn();
    await runWithBackgroundScope({ waitUntil }, async () => {
      // Scope survives an await boundary.
      await Promise.resolve();
      deferBackgroundWork(Promise.resolve("done"), "test");
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBe("done");
  });

  it("never lets a deferred failure escape, in or out of a scope", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const waitUntil = jest.fn();
    await runWithBackgroundScope({ waitUntil }, async () => {
      deferBackgroundWork(Promise.reject(new Error("boom")), "scoped");
    });
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();

    expect(() =>
      deferBackgroundWork(Promise.reject(new Error("boom")), "unscoped"),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
