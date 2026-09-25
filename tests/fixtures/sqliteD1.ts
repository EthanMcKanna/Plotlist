// In-memory SQLite (node:sqlite) behind a minimal D1 binding shim, with the
// real drizzle migrations applied — enough for drizzle-orm/d1 selects,
// inserts, and updates, so api/_lib query code can run for real in jest.
// `available` is false on runtimes without node:sqlite; suites skip then.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

type SqliteStatement = {
  all: (...params: unknown[]) => Array<Record<string, unknown>>;
  run: (...params: unknown[]) => unknown;
  setReturnArrays: (enabled: boolean) => void;
};
export type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
};

function loadDatabaseSync(): (new (path: string, options?: object) => SqliteDatabase) | null {
  try {
    return require("node:sqlite").DatabaseSync;
  } catch {
    return null;
  }
}

const DatabaseSync = loadDatabaseSync();
export const sqliteAvailable = DatabaseSync !== null;

export function createMigratedSqlite(): SqliteDatabase {
  if (!DatabaseSync) throw new Error("node:sqlite is unavailable");
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(__dirname, "..", "..", "drizzle");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(dir, file), "utf8").replace(/--> statement-breakpoint/g, ""));
  }
  // Seeds insert child rows without every parent (shows, for one); FK
  // enforcement would only get in the way. Set after the migrations, whose
  // table rebuilds toggle the pragma themselves.
  sqlite.exec("PRAGMA foreign_keys = OFF");
  return sqlite;
}

export function createD1Binding(sqlite: SqliteDatabase, stats = { statements: 0 }) {
  const normalize = (value: unknown) => (typeof value === "boolean" ? (value ? 1 : 0) : value);
  const statement = (sql: string, params: unknown[] = []): any => ({
    bind: (...next: unknown[]) => statement(sql, next.map(normalize)),
    all: async () => {
      stats.statements += 1;
      return { results: sqlite.prepare(sql).all(...params), success: true, meta: {} };
    },
    raw: async () => {
      stats.statements += 1;
      const prepared = sqlite.prepare(sql);
      prepared.setReturnArrays(true);
      return prepared.all(...params);
    },
    first: async () => (await statement(sql, params).all()).results[0] ?? null,
    run: async () => {
      stats.statements += 1;
      sqlite.prepare(sql).run(...params);
      return { success: true, meta: {} };
    },
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: any[]) => Promise.all(statements.map((entry) => entry.all())),
  };
}
