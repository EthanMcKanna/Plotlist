#!/usr/bin/env node
// Seed show_ingest_state from a TMDB daily TV id export
// (https://files.tmdb.org/p/exports/tv_series_ids_MM_DD_YYYY.json.gz, gunzipped).
//
// Runs against the remote D1 database over the Cloudflare HTTP API because
// `wrangler d1 execute --remote` fails with undici errors on this machine.
//
// Usage:
//   export CLOUDFLARE_API_TOKEN=$(jq -r .oauth_token ~/Library/Preferences/.cf/auth.jsonc)
//   node scripts/seed-show-ingest.mjs /path/to/tv_ids.json

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const ACCOUNT_ID = "81f9092cf8df87e41d0c4d5ac9cc7244";
const DATABASE_ID = "8864a293-ae24-4153-9d76-71c228d40207";
const ROWS_PER_STATEMENT = 500;

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("CLOUDFLARE_API_TOKEN is required");
  process.exit(1);
}
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/seed-show-ingest.mjs <tv_ids.json>");
  process.exit(1);
}

function createId(prefix) {
  const random = Math.random().toString(36).slice(2, 12);
  const now = Date.now().toString(36);
  return `${prefix}_${now}${random}`;
}

async function runSql(sql, attempt = 1) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    if (attempt < 5) {
      const backoff = 1000 * attempt;
      console.warn(`request failed (attempt ${attempt}), retrying in ${backoff}ms`, payload?.errors ?? response.status);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return runSql(sql, attempt + 1);
    }
    throw new Error(`D1 query failed: ${JSON.stringify(payload?.errors ?? response.status)}`);
  }
  return payload;
}

const now = Date.now();
let batch = [];
let inserted = 0;
let requests = 0;

async function flush() {
  if (batch.length === 0) return;
  const values = batch
    .map(
      (row) =>
        `('${createId("ingest")}', ${row.id}, ${Number.isFinite(row.popularity) ? row.popularity : "NULL"}, 'pending', 0, NULL, 0, NULL, ${now})`,
    )
    .join(",\n");
  const sql = `INSERT INTO show_ingest_state (id, tmdb_id, popularity, status, next_refresh_at, last_ingested_at, fail_count, last_error, updated_at)\nVALUES ${values}\nON CONFLICT (tmdb_id) DO NOTHING;`;
  await runSql(sql);
  inserted += batch.length;
  requests += 1;
  if (requests % 20 === 0) {
    console.log(`${inserted} rows seeded...`);
  }
  batch = [];
}

const rl = createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity });
for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    continue;
  }
  if (typeof parsed.id !== "number") continue;
  batch.push({ id: parsed.id, popularity: parsed.popularity });
  if (batch.length >= ROWS_PER_STATEMENT) {
    await flush();
  }
}
await flush();
console.log(`Done: ${inserted} rows seeded across ${requests} requests.`);
