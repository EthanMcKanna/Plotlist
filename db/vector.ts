import { customType } from "drizzle-orm/sqlite-core";

// Embeddings are stored as JSON-encoded float arrays in SQLite/D1. Similarity
// math happens in application code (see lib/plotlist/embeddingUtils.ts), so no
// vector-native column type is required.
export const vector = customType<{
  data: number[];
  driverData: string;
}>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    if (typeof value !== "string" || !value.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((part) => Number(part)) : [];
    } catch {
      return [];
    }
  },
});
