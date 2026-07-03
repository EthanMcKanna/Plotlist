# Plotlist

Plotlist is a TV-first tracking and discovery app built with Expo, React Native, Cloudflare Workers, D1 (SQLite), R2, and Drizzle. It is designed as a social companion for television: users can track what they are watching, log episodes, write reviews, build lists, follow friends, and get personalized recommendations based on actual taste signals.

## What The App Does

Plotlist combines personal tracking, social discovery, and release planning for TV shows:

- Track shows across `watchlist`, `watching`, `completed`, and `dropped`
- Log watched episodes and full-show watches with optional notes
- Rate and review shows or individual episodes
- Follow other users and browse their public profiles, lists, and reviews
- Discover people you may know through privacy-preserving contact sync
- Browse upcoming episodes, premieres, returns, and finales in a release calendar
- Curate ranked public or private lists of shows
- Like, comment on, and report user-generated content

## Product Architecture

### Client

- Expo + React Native
- Expo Router for app structure and routing
- NativeWind for styling
- React Query for API-backed data fetching
- React Native Reanimated and Gesture Handler for motion and drag interactions
- FlashList for large, scroll-heavy feeds

### Backend (Cloudflare)

- A single Cloudflare Worker (`worker/`) serving the JSON API, the exported Expo web app (Workers Static Assets), and scheduled maintenance
- Route handlers in `api/` (shared with the Worker through a small Node-compat shim in `worker/shim.ts`)
- Cloudflare D1 (SQLite) as the application database, accessed through Drizzle (`db/`, migrations in `drizzle/`)
- Cloudflare R2 for avatar/list-cover uploads, served from the Worker at `/files/*`
- Cloudflare Cron Triggers (three consolidated schedules in `worker/scheduled.ts`) for catalog refresh, release-calendar refresh, and TTL cleanup
- JWT access tokens plus refresh-token sessions stored in D1
- TMDB as the external show metadata source
- Twilio Verify for phone OTP delivery
- Gemini configuration for recommendation and semantic-search features

### Core Backend Domains

- `users`: profiles, onboarding, visibility, export, and deletion
- `shows`: TMDB ingestion, catalog search, details caching, provider links, and season metadata
- `watchStates`, `watchLogs`, `episodeProgress`: tracking and completion state
- `reviews`, `likes`, `comments`: social content and engagement
- `lists`, `listItems`: user-curated collections
- `feed`, `follows`, `contacts`: social graph, activity, and contact discovery
- `releaseCalendar`: cached future episode data and user-specific calendar views
- `reports`: moderation workflow for user-generated content
- `embeddings`: taste profiles, recommendation rails, similar users, and semantic search

## Local Development

### Prerequisites

- Node.js and npm
- An Expo-compatible simulator/device environment
- A Cloudflare account (Workers, D1, R2) — `wrangler` is a dev dependency
- TMDB, Twilio, and Gemini credentials for the full feature set

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .dev.vars
```

`wrangler dev` reads server secrets from `.dev.vars` (gitignored). Required for normal development:

- `EXPO_PUBLIC_API_URL`: base URL of the Worker API (client-side, set in your shell or eas.json)
- `JWT_SECRET`: signing secret for API access tokens
- `REFRESH_TOKEN_SECRET`: signing secret for API refresh tokens
- `CRON_SECRET`: bearer token expected by the internal cron endpoints
- `TMDB_API_KEY`: TMDB API key for show metadata, search, details, and release data
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_VERIFY_SERVICE_SID`: Twilio Verify service SID used for OTP
- `CONTACT_HASH_SECRET`: secret used to hash normalized phone numbers before contact snapshots are stored

Used by recommendation and semantic-search features:

- `GEMINI_API_KEY`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_VERSION`

Optional ratings integration:

- `OMDB_API_KEY`: OMDb API key (free tier at omdbapi.com/apikey.aspx) used to show IMDb ratings for shows, seasons, and episodes; the feature stays hidden when unset

Optional App Review/testing flags:

- `ALLOW_APP_REVIEW_OTP_BYPASS`
- `APP_REVIEW_TEST_PHONE`
- `APP_REVIEW_TEST_CODE`

### 3. Set Up The Local Database

```bash
npm run db:migrate:local
```

### 4. Run The API And App

```bash
npm run api:dev   # wrangler dev (Worker + D1 + R2, local Miniflare)
npm start
```

Platform shortcuts:

```bash
npm run ios
npm run android
npm run web
```

## Scripts

- `npm start`: run Expo
- `npm run ios`: launch the iOS app
- `npm run android`: launch the Android app
- `npm run web`: run the web build through Expo
- `npm run api:dev`: start the Worker locally with `wrangler dev`
- `npm run deploy`: export the web build and deploy the Worker to Cloudflare
- `npm run db:migrate:local`: apply D1 migrations to the local dev database
- `npm run db:migrate:remote`: apply D1 migrations to the production database
- `npm run db:generate`: generate SQL migrations from the Drizzle schema
- `npm run typecheck`: run TypeScript without emitting files
- `npm run lint`: run ESLint
- `npm run test`: run Jest tests
- `npm run check`: run typecheck, lint, and tests together
- `npm run audit:prod`: audit production dependencies before release
- `npm run check:homepage`: export the web build, verify dev-preview code is absent from the bundle, audit the homepage freshness summary, and audit the live homepage current-demand chart
- `npm run check:release`: run the app checks, production dependency audit, and homepage release gate together

## Repository Layout

```text
api/          API route handlers and shared server helpers
worker/       Cloudflare Worker entrypoint, Node shims, and cron dispatch
app/          Expo Router screens and flows
components/   Reusable UI building blocks
db/           Drizzle schema
drizzle/      Generated SQL migrations
lib/          Client helpers for auth, API calls, formatting, contacts, preferences, and caching
```

## Deployment

The backend runs on Cloudflare:

- **Worker**: `plotlist` at `https://plotlist.ethanmckanna.workers.dev` (API + web + files + crons)
- **D1**: database `plotlist` (migrations applied with `npm run db:migrate:remote`)
- **R2**: bucket `plotlist-uploads`
- **Secrets**: managed with `npx wrangler secret put <NAME>` (see `.env.example` for the full list)

Deploy with:

```bash
npm run deploy
```

## Notes

- The app is TV-only. The catalog and recommendation flows are designed around shows and episodes, not movies.
- Some features degrade gracefully when a provider fails. For example, home rails or recommendation sections can fail independently without blocking the rest of the screen.
- Browser QA screenshots and console captures are local-only artifacts under `.playwright-cli/`.

## License

This project is licensed under `PolyForm-Noncommercial-1.0.0`. Non-commercial use is allowed under the terms in [LICENSE](LICENSE).
