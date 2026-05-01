import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.PLANETSCALE_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/plotlist";

function getPostgresJsUrl(value: string) {
  const url = new URL(value);
  url.searchParams.delete("sslrootcert");
  return url.toString();
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getPostgresJsUrl(databaseUrl),
  },
  strict: true,
  verbose: true,
});
