// Date-formatting suites assert UTC-rendered output, so pin the timezone
// here as well as in the npm scripts — otherwise a bare `npx jest` (or an
// IDE runner) fails on any machine outside UTC.
process.env.TZ = "UTC";

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo/ios",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  clearMocks: true,
};
