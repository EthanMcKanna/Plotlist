import { inArray } from "drizzle-orm";

import { users } from "../../db/schema";
import { db } from "./db";
import { chunkForSqlParams } from "./sql-dialect";

export async function getUsersByIdsChunked(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds));
  const rows: Array<typeof users.$inferSelect> = [];
  for (const chunk of chunkForSqlParams(uniqueIds, 1, 80)) {
    rows.push(...(await db.select().from(users).where(inArray(users.id, chunk))));
  }
  return rows;
}
