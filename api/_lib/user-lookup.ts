import { inArray } from "drizzle-orm";

import { users } from "../../db/schema";
import { db } from "./db";
import { chunkForSqlParams } from "./sql-dialect";

// Chunks are independent reads, so they go out in one wave; rows come back
// concatenated in chunk order, exactly as the old serial loop produced them.
export async function getUsersByIdsChunked(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds));
  const batches = await Promise.all(
    chunkForSqlParams(uniqueIds, 1, 80).map((chunk) =>
      db.select().from(users).where(inArray(users.id, chunk)),
    ),
  );
  return batches.flat();
}
