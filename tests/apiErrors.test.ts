import { describe, expect, it, jest } from "@jest/globals";

import { ApiError, asApiError } from "../api/_lib/errors";

describe("API error serialization", () => {
  it("preserves intentional API errors", () => {
    const error = asApiError(new ApiError(429, "rate_limited", "Too many requests"));

    expect(error.status).toBe(429);
    expect(error.code).toBe("rate_limited");
    expect(error.message).toBe("Too many requests");
  });

  it("does not expose unexpected internal error messages to clients", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const internalError = new Error('Failed query: select * from "rate_limits" where "key" = $1');
    const error = asApiError(internalError);

    expect(error.status).toBe(500);
    expect(error.code).toBe("internal_error");
    expect(error.message).toBe("Unexpected error");
    expect(error.details).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[api] Unexpected error Error: Failed query"),
    );
    errorSpy.mockRestore();
  });

  it("exposes error details only when DEBUG_ERRORS is enabled", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const previous = process.env.DEBUG_ERRORS;
    process.env.DEBUG_ERRORS = "true";

    const error = asApiError(new Error("boom"));
    expect(error.details).toEqual(expect.stringContaining("boom"));

    if (previous === undefined) {
      delete process.env.DEBUG_ERRORS;
    } else {
      process.env.DEBUG_ERRORS = previous;
    }
    errorSpy.mockRestore();
  });
});
