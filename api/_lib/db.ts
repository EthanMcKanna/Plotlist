import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getServerEnv } from "./env";

const env = getServerEnv();

function getPostgresJsUrl(value: string) {
  const url = new URL(value);
  url.searchParams.delete("sslrootcert");
  return url.toString();
}

const queryClient = postgres(getPostgresJsUrl(env.PLANETSCALE_DATABASE_URL), {
  max: env.NODE_ENV === "development" ? 5 : 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(queryClient);
export { queryClient };
