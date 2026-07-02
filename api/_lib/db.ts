import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

let activeDb: DrizzleD1Database | null = null;

export function initDb(d1: unknown) {
  activeDb = drizzle(d1 as Parameters<typeof drizzle>[0]);
  return activeDb;
}

function requireDb() {
  if (!activeDb) {
    throw new Error("Database is not initialized. Call initDb(env.DB) first.");
  }
  return activeDb;
}

// Call-time proxy so modules can keep `import { db } from "./db"` while the
// underlying D1 binding is only available once the Worker receives a request.
export const db = new Proxy({} as DrizzleD1Database, {
  get(_target, prop) {
    const database = requireDb();
    const value = Reflect.get(database, prop, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
}) as DrizzleD1Database;
