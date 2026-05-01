import { customType } from "drizzle-orm/pg-core";

export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    const normalized = value.replace(/^\[|\]$/g, "");
    if (!normalized.trim()) {
      return [];
    }

    return normalized.split(",").map((part) => Number(part.trim()));
  },
});
