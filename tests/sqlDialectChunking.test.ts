import { describe, expect, it, jest } from "@jest/globals";

import { chunkForSqlParams, queryInChunks } from "../api/_lib/sql-dialect";

describe("chunkForSqlParams", () => {
  it("returns no chunks for no rows", () => {
    expect(chunkForSqlParams([], 1)).toEqual([]);
  });

  it("keeps a list under the cap in a single chunk", () => {
    const rows = Array.from({ length: 90 }, (_, index) => index);
    expect(chunkForSqlParams(rows, 1)).toHaveLength(1);
  });

  it("splits at exactly the cap plus one", () => {
    const rows = Array.from({ length: 91 }, (_, index) => index);
    const chunks = chunkForSqlParams(rows, 1);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(90);
    expect(chunks[1]).toEqual([90]);
  });

  it("accounts for multiple params per row", () => {
    const rows = Array.from({ length: 100 }, (_, index) => index);
    const chunks = chunkForSqlParams(rows, 4);
    // floor(90 / 4) = 22 rows per statement.
    expect(chunks.every((chunk) => chunk.length <= 22)).toBe(true);
    expect(chunks.flat()).toEqual(rows);
  });

  it("never produces an empty chunk when params per row exceed the cap", () => {
    const chunks = chunkForSqlParams([1, 2, 3], 200, 90);
    expect(chunks).toEqual([[1], [2], [3]]);
  });
});

describe("queryInChunks", () => {
  it("skips the database entirely for an empty id list", async () => {
    const run = jest.fn(async (chunk: string[]) => chunk);
    await expect(queryInChunks([], run)).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("de-duplicates ids and concatenates chunk results in order", async () => {
    const ids = Array.from({ length: 200 }, (_, index) => `show-${index % 100}`);
    const seen: string[][] = [];
    const rows = await queryInChunks(ids, async (chunk) => {
      seen.push(chunk);
      return chunk.map((id) => ({ id }));
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toHaveLength(90);
    expect(seen[1]).toHaveLength(10);
    expect(rows.map((row) => row.id)).toEqual(
      Array.from({ length: 100 }, (_, index) => `show-${index}`),
    );
  });

  it("leaves room for the statement's other bound parameters", async () => {
    const ids = Array.from({ length: 90 }, (_, index) => index);
    const seen: number[][] = [];
    await queryInChunks(
      ids,
      async (chunk) => {
        seen.push(chunk);
        return chunk;
      },
      2,
    );
    // 90 - 2 reserved = 88 ids per statement, so 90 ids need two.
    expect(seen.map((chunk) => chunk.length)).toEqual([88, 2]);
  });
});
