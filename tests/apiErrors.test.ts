import { describe, expect, it } from "@jest/globals";

import { ApiError, asApiError } from "../api/_lib/errors";

describe("API error serialization", () => {
  it("preserves intentional API errors", () => {
    const error = asApiError(new ApiError(429, "rate_limited", "Too many requests"));

    expect(error.status).toBe(429);
    expect(error.code).toBe("rate_limited");
    expect(error.message).toBe("Too many requests");
  });

  it("does not expose unexpected internal error messages to clients", () => {
    const error = asApiError(
      new Error('Failed query: select * from "rate_limits" where "key" = $1'),
    );

    expect(error.status).toBe(500);
    expect(error.code).toBe("internal_error");
    expect(error.message).toBe("Unexpected error");
  });
});
