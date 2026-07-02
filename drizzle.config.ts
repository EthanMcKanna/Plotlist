import { defineConfig } from "drizzle-kit";

// Migrations are applied to Cloudflare D1 via `wrangler d1 migrations apply`.
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  strict: true,
  verbose: true,
});
