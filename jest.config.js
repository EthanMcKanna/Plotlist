/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo/ios",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  clearMocks: true,
};
