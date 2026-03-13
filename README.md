# Plotlist

Plotlist is a TV-first tracking and discovery app built with Expo, React Native, and Convex. It is designed as a social companion for television: users can track what they are watching, log episodes, write reviews, build lists, follow friends, and get personalized recommendations based on actual taste signals.

## What the app does

Plotlist combines personal tracking, social discovery, and release planning for TV shows:

- Track shows across `watchlist`, `watching`, `completed`, and `dropped`
- Log watched episodes and full-show watches with optional notes
- Rate and review shows or individual episodes
- Follow other users and browse their public profiles, lists, and reviews
- Discover people you may know through privacy-preserving contact sync
- Get AI-assisted recommendations, similar-show suggestions, and taste-match social proof
- Browse upcoming episodes, premieres, returns, and finales in a release calendar
- Curate ranked public or private lists of shows
- Like, comment on, and report user-generated content

## Feature set

### Authentication and onboarding

- Phone-number sign-in powered by Convex Auth and Twilio Verify OTP
- First-run onboarding flow for profile setup, account discovery, and favorite-show selection
- Optional App Review bypass environment flags for test sign-in flows

### Home and discovery

- Personalized home feed for reviews and watch logs from followed users
- "Up next" rail based on episode progress
- Release calendar preview for upcoming episodes
- Contact match suggestions surfaced directly on the home screen
- Discovery rails for trending shows, most-reviewed shows, and TMDB-powered catalog slices
- Provider-specific rows for services like Netflix, Apple TV, Hulu, Disney+, Max, and Prime Video
- Taste-based recommendation rails generated from embeddings and user preference signals
- Similar-taste users and list recommendations derived from shared viewing patterns

### Search and catalog

- Search for shows from the local catalog and TMDB-backed remote discovery
- Search for people by username/display name
- Semantic/freeform TV search prompts such as "comfort comedy" or "slow-burn sci-fi"
- One-tap ingestion of catalog results into the local Convex dataset
- Contact-based invite suggestions from the people search flow

### Show pages

- Full show detail pages with poster, backdrop, metadata, cast, trailers, and overview
- Streaming/provider links sourced from TMDB and provider URL parsing
- Status management for watchlist / watching / completed / dropped
- Episode guide with progressive season loading and cached season data
- Episode-level progress tracking
- Episode-level rating and review support
- Similar-show recommendations
- Taste-social-proof UI that explains why a show may fit a user's preferences
- Add/remove shows from custom lists

### Social features

- Public profiles with follower/following counts, watch stats, reviews, top-rated shows, lists, and favorites
- Follow/unfollow with optimistic updates
- Visibility controls for favorites, currently watching, and watchlist sections
- Like and comment support for reviews, logs, and lists
- Contact sync with hashed phone numbers instead of raw phone storage
- SMS invite flow for contacts who are not already on the platform

### Logging, reviews, and lists

- Dedicated activity log screen with filters for entries, reviews, notes, and episodes
- Review detail screens with likes, comments, and reporting
- Public and private lists with cover images
- Drag-and-drop list reordering on the list detail screen

### Calendar and planning

- Release calendar built from tracked shows
- Views for upcoming episodes, tonight, premieres, returning seasons, and finales
- Provider filtering for calendar results
- Background refresh and caching for release data

### Account and moderation

- Editable profile with avatar upload/crop, bio, and username management
- JSON account export from settings
- Account deletion flow
- Contact sync reset and resync controls
- Admin-only report queue for dismissing or deleting reported content

## Product architecture

### Client

- Expo + React Native
- Expo Router for app structure and routing
- NativeWind for styling
- React Native Reanimated and Gesture Handler for motion and drag interactions
- FlashList for large, scroll-heavy feeds

### Backend

- Convex for database, realtime queries, mutations, actions, and cron jobs
- Convex Auth for auth/session management
- TMDB as the external show metadata source
- Twilio Verify for phone OTP delivery
- Gemini embeddings for personalized recommendations and semantic retrieval

### Core backend domains

- `users`: profiles, onboarding, visibility, export, and deletion
- `shows`: TMDB ingestion, catalog search, details caching, provider links, and season metadata
- `watchStates`, `watchLogs`, `episodeProgress`: tracking and completion state
- `reviews`, `likes`, `comments`: social content and engagement
- `lists`, `listItems`: user-curated collections
- `feed`, `follows`, `contacts`: social graph, activity, and contact discovery
- `releaseCalendar`: cached future episode data and user-specific calendar views
- `reports`: moderation workflow for user-generated content
- `embeddings`: taste profiles, recommendation rails, similar users, and semantic search

## Data model at a glance

The main tables defined in Convex include:

- `users`
- `shows`
- `watchStates`
- `watchLogs`
- `episodeProgress`
- `reviews`
- `follows`
- `contactSyncEntries`
- `likes`
- `comments`
- `lists`
- `listItems`
- `feedItems`
- TMDB cache tables for search, lists, and details
- release-calendar tables for sync state and release events
- embedding/taste-profile tables for recommendations
- moderation/report tables

## Local development

### Prerequisites

- Node.js and npm
- An Expo-compatible simulator/device environment
- A Convex project
- TMDB, Twilio, and Gemini credentials for the full feature set

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Required for normal development:

- `EXPO_PUBLIC_CONVEX_URL`: Convex deployment URL
- `TMDB_API_KEY`: TMDB API key for show metadata, search, details, and release data
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_VERIFY_SERVICE_SID`: Twilio Verify service SID used for OTP
- `CONTACT_HASH_SECRET`: secret used to hash normalized phone numbers before contact snapshots are stored

Used by recommendation and semantic-search features:

- `GEMINI_API_KEY`: Google Gemini API key for embeddings and taste-based recommendations

Optional App Review/testing flags:

- `ALLOW_APP_REVIEW_OTP_BYPASS`
- `APP_REVIEW_TEST_PHONE`
- `APP_REVIEW_TEST_CODE`

### 3. Start Convex

```bash
npx convex dev
```

This generates the typed Convex client APIs used by the app.

### 4. Run the app

```bash
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
- `npm run convex`: start Convex development mode
- `npm run convex:codegen`: regenerate Convex types
- `npm run typecheck`: run TypeScript without emitting files
- `npm run lint`: run ESLint
- `npm run test`: run Jest tests
- `npm run check`: run typecheck, lint, and tests together

## Repository layout

```text
app/          Expo Router screens and flows
components/   Reusable UI building blocks
convex/       Schema, queries, mutations, actions, auth, and background jobs
lib/          Client helpers for auth, formatting, contacts, preferences, and caching
```

## Notes

- The app is TV-only. The catalog and recommendation flows are designed around shows and episodes, not movies.
- `convex/_generated` ships with a minimal placeholder so TypeScript can compile before Convex is configured locally.
- Running `npx convex dev` will regenerate the full typed client.
- Some features degrade gracefully when a provider fails. For example, home rails or recommendation sections can fail independently without blocking the rest of the screen.

## License

This project is licensed under `PolyForm-Noncommercial-1.0.0`. Non-commercial use is allowed under the terms in [LICENSE](LICENSE).
