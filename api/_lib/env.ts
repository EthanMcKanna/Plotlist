import { z } from "zod";

const serverEnvSchema = z.object({
  PLANETSCALE_DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(1),
  TMDB_API_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1),
  CONTACT_HASH_SECRET: z.string().min(1),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  VERCEL_BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-2-preview"),
  GEMINI_EMBEDDING_VERSION: z.string().default("shows-v1"),
  ALLOW_APP_REVIEW_OTP_BYPASS: z.enum(["true", "false"]).optional(),
  APP_REVIEW_TEST_PHONE: z.string().optional(),
  APP_REVIEW_TEST_CODE: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
});

let cachedEnv: z.infer<typeof serverEnvSchema> | null = null;

export function getServerEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = serverEnvSchema.parse(process.env);
  return cachedEnv;
}
