import { sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

// SQLite has no ILIKE operator; LIKE ... COLLATE NOCASE gives the same
// case-insensitive match semantics the Postgres backend relied on.
export function ilike(column: AnySQLiteColumn, value: string): SQL {
  return sql`${column} like ${value} collate nocase`;
}

// User-typed search text goes into LIKE patterns; without escaping, a "%"
// or "_" in the query matches everything instead of the literal character.
export function escapeLikePattern(value: string) {
  return value.replace(/([\\%_])/g, "\\$1");
}

export function ilikeContains(column: AnySQLiteColumn, value: string): SQL {
  return sql`${column} like ${`%${escapeLikePattern(value)}%`} escape '\\' collate nocase`;
}

// D1 caps bound parameters at 100 per statement, so large IN () lists and
// multi-row inserts must be split.
export function chunkForSqlParams<T>(rows: T[], paramsPerRow: number, maxParams = 90) {
  const rowsPerChunk = Math.max(1, Math.floor(maxParams / Math.max(1, paramsPerRow)));
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += rowsPerChunk) {
    chunks.push(rows.slice(index, index + rowsPerChunk));
  }
  return chunks;
}

// Fans an `IN (...)` lookup over that cap: `run` receives one id chunk at a
// time (all chunks in flight concurrently) and the per-chunk rows come back
// concatenated in chunk order. `reservedParams` counts the statement's other
// bound values (a user id, a timestamp cutoff) so chunk + extras stay under
// the limit. Ids are de-duplicated first; an empty input never hits the db.
export async function queryInChunks<Id, Row>(
  ids: Iterable<Id>,
  run: (chunk: Id[]) => Promise<Row[]>,
  reservedParams = 0,
): Promise<Row[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) {
    return [];
  }
  const chunks = chunkForSqlParams(uniqueIds, 1, Math.max(1, 90 - reservedParams));
  const results = await Promise.all(chunks.map((chunk) => run(chunk)));
  return results.flat();
}
