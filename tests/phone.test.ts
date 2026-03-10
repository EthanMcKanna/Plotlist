import { describe, expect, it } from "@jest/globals";

import { formatPhoneNumber, normalizePhoneNumber } from "../lib/phone";

describe("phone helpers", () => {
  it("normalizes common US input", () => {
    expect(normalizePhoneNumber("(312) 555-0182")).toBe("+13125550182");
    expect(normalizePhoneNumber("1-312-555-0182")).toBe("+13125550182");
  });

  it("preserves valid international input", () => {
    expect(normalizePhoneNumber("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects invalid input", () => {
    expect(normalizePhoneNumber("abc")).toBeNull();
    expect(normalizePhoneNumber("555")).toBeNull();
  });

  it("formats US numbers while typing", () => {
    expect(formatPhoneNumber("312")).toBe("312");
    expect(formatPhoneNumber("312555")).toBe("(312) 555");
    expect(formatPhoneNumber("3125550182")).toBe("(312) 555-0182");
  });
});
