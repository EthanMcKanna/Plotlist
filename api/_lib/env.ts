import { z } from "zod";

const serverEnvSchema = z.object({
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(1),
  TMDB_API_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1),
  CONTACT_HASH_SECRET: z.string().min(1),
  APPLE_BUNDLE_ID: z.string().min(1).default("com.emckanna.Plotlist"),
  // Services ID accepted as a token audience for web Sign in with Apple.
  APPLE_WEB_CLIENT_ID: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OMDB_API_KEY: z.string().min(1).optional(),
  // Trakt API app credentials (https://trakt.tv/oauth/applications). Both
  // optional: without them the Trakt import feature reports itself
  // unavailable instead of failing.
  TRAKT_CLIENT_ID: z.string().min(1).optional(),
  TRAKT_CLIENT_SECRET: z.string().min(1).optional(),
  OPENAI_MODERATION_API_KEY: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-2"),
  GEMINI_EMBEDDING_VERSION: z.string().default("shows-v2-ge2-1536"),
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

// The Worker entrypoint feeds bindings into process.env before any request
// touches getServerEnv; this reset hook keeps tests hermetic.
export function resetServerEnvCache() {
  cachedEnv = null;
}
