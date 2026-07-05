# Sentry Crash Reporting & Performance

Plotlist reports crashes, errors, and performance traces to Sentry in the
`ethan-mckanna` org (https://ethan-mckanna.sentry.io):

| Project | What it covers | DSN location |
|---|---|---|
| `plotlist-app` | iOS/Android/web app (JS + native crashes) | `lib/sentry.ts` |
| `plotlist-worker` | Cloudflare Worker API + crons | `wrangler.jsonc` `vars.SENTRY_DSN` |

DSNs are public identifiers and safe to commit. The only secret is
`SENTRY_AUTH_TOKEN` (source-map uploads), which lives in `.env.local`
(gitignored) and as an EAS secret in all three environments — never in git.

## App (`@sentry/react-native`)

- `lib/sentry.ts` — `Sentry.init` plus helpers. Disabled in dev by default so
  local crashes don't burn the free-plan quota; set
  `EXPO_PUBLIC_SENTRY_IN_DEV=1` to opt in.
- `app/_layout.tsx` — calls `initSentry()` at module scope, registers the
  expo-router navigation container for screen tracing, and wraps the root
  layout in `Sentry.wrap`.
- `components/AuthGate.tsx` — sets the Sentry user (id + username) once the
  profile loads; cleared on sign-out. No phone numbers or PII.
- `components/AuthErrorBoundary.tsx` — captures non-auth render errors.
- `metro.config.js` — `getSentryExpoConfig` injects debug IDs into bundles and
  source maps. `includeWebReplay: false` keeps the web bundle inside the home
  preview bundle budget.
- `app.json` — the `@sentry/react-native/expo` plugin uploads native source
  maps/dSYMs during EAS builds using the `SENTRY_AUTH_TOKEN` EAS secret.
- Tracing: navigation + HTTP instrumentation, `tracesSampleRate` 0.25 in
  production. Failed HTTP requests (4xx/5xx from the API) are captured via
  `enableCaptureFailedRequests`.

Session/release health (crash-free rate per release) is on via auto session
tracking; releases are keyed to the app version automatically by the SDK.

### User feedback

Settings → Help → "Share feedback" opens Sentry's feedback form
(`showFeedbackForm()` in `lib/sentry.ts`), themed to match the app. Name and
email are optional (accounts are phone-based). Submissions land under
**User Feedback** in the `plotlist-app` project and are linked to the signed-in
user's Sentry context. On web the success confirmation is a browser alert
(react-native-web has no native Alert); iOS/Android use the native dialog.

## Worker (`@sentry/cloudflare`)

- `worker/index.ts` — the exported handler is wrapped in `Sentry.withSentry`,
  which captures unhandled exceptions and traces `fetch`/`scheduled`
  invocations at `tracesSampleRate` 0.1. Route errors that are caught and
  turned into 500 responses are reported with `Sentry.captureException`, and
  cron failures inside `waitUntil` are captured with a `cron` tag.
- Requires the `nodejs_compat` compatibility flag (already set).

## Testing

`tests/setup.ts` mocks `@sentry/react-native` globally (jest-expo has no
native Sentry module). `tests/wranglerConfig.test.ts` continues to validate
the worker config shape.

## Verifying / source maps

- Send a test event: `SENTRY_DSN=<dsn> npx sentry-cli send-event -m "test"`.
- Native source maps upload automatically in EAS builds. For the deployed web
  app, bundles carry Sentry debug IDs, but `expo export` does not emit `.map`
  files by default; to get readable web stack traces, export with
  `npx expo export --platform web --source-maps` and run
  `npx sentry-expo-upload-sourcemaps dist` (requires `SENTRY_AUTH_TOKEN`),
  then deploy. Uploaded maps stay private to Sentry either way.
