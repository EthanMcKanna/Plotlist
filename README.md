# Plotlist

Plotlist is a TV-first tracking and discovery app built with Expo, React Native, PlanetScale Postgres, Drizzle, and Vercel API routes. It is designed as a social companion for television: users can track what they are watching, log episodes, write reviews, build lists, follow friends, and get personalized recommendations based on actual taste signals.

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

### Backend

- Vercel-compatible Node API routes in `api/`
- PlanetScale Postgres as the application database
- Drizzle schema and SQL migrations in `db/` and `drizzle/`
- JWT access tokens plus refresh-token sessions stored in Postgres
- TMDB as the external show metadata source
- Twilio Verify for phone OTP delivery
- Vercel Blob for avatar/list-cover uploads
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
- A PlanetScale Postgres database
- TMDB, Twilio, and Gemini credentials for the full feature set

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Required for normal development:

- `EXPO_PUBLIC_API_URL`: base URL for the Vercel-hosted API
- `PLANETSCALE_DATABASE_URL`: PlanetScale Postgres connection string
- `JWT_SECRET`: signing secret for API access tokens
- `REFRESH_TOKEN_SECRET`: signing secret for API refresh tokens
- `CRON_SECRET`: bearer token expected by Vercel cron endpoints
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token for avatar/list-cover uploads
- `TMDB_API_KEY`: TMDB API key for show metadata, search, details, and release data
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_VERIFY_SERVICE_SID`: Twilio Verify service SID used for OTP
- `CONTACT_HASH_SECRET`: secret used to hash normalized phone numbers before contact snapshots are stored

Used by recommendation and semantic-search features:

- `GEMINI_API_KEY`
- `GEMINI_EMBEDDING_MODEL`
- `GEMINI_EMBEDDING_VERSION`

Optional App Review/testing flags:

- `ALLOW_APP_REVIEW_OTP_BYPASS`
- `APP_REVIEW_TEST_PHONE`
- `APP_REVIEW_TEST_CODE`

### 3. Run The API And App

```bash
npm run api:dev
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
- `npm run api:dev`: start the Vercel API locally
- `npm run db:generate`: generate SQL migrations from the Drizzle schema
- `npm run typecheck`: run TypeScript without emitting files
- `npm run lint`: run ESLint
- `npm run test`: run Jest tests
- `npm run check`: run typecheck, lint, and tests together

## Repository Layout

```text
api/          Vercel API routes and shared server helpers
app/          Expo Router screens and flows
components/   Reusable UI building blocks
db/           Drizzle schema
drizzle/      Generated SQL migrations
lib/          Client helpers for auth, API calls, formatting, contacts, preferences, and caching
```

## Notes

- The app is TV-only. The catalog and recommendation flows are designed around shows and episodes, not movies.
- Some features degrade gracefully when a provider fails. For example, home rails or recommendation sections can fail independently without blocking the rest of the screen.

## License

This project is licensed under `PolyForm-Noncommercial-1.0.0`. Non-commercial use is allowed under the terms in [LICENSE](LICENSE).
