import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? "http://localhost:3210";

if (!process.env.EXPO_PUBLIC_CONVEX_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    "EXPO_PUBLIC_CONVEX_URL is not set. Falling back to http://localhost:3210.",
  );
}

export const convex = new ConvexReactClient(convexUrl);
