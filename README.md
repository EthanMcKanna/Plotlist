# Plotlist

A TV-first Letterboxd-style tracker built with Expo + React Native + Convex.

## License

This project is licensed under `PolyForm-Noncommercial-1.0.0`. Non-commercial use is allowed under the terms in [LICENSE](LICENSE).

## Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

Fill in:

- `EXPO_PUBLIC_CONVEX_URL` – your Convex deployment URL (from `npx convex dev`)
- `TMDB_API_KEY` – API key for The Movie Database (TMDB)
- `TWILIO_ACCOUNT_SID` – Twilio account SID
- `TWILIO_AUTH_TOKEN` – Twilio auth token
- `TWILIO_VERIFY_SERVICE_SID` – Twilio Verify service used to send one-time sign-in codes
- `CONTACT_HASH_SECRET` – secret key used to hash normalized contact phone numbers before storing sync snapshots

3. Start Convex (generates typed APIs)

```bash
npx convex dev
```

4. Run the app

```bash
npm start
```

## Notes

- This repo includes a minimal placeholder `convex/_generated` folder so TypeScript compiles before Convex is configured. Running `npx convex dev` will regenerate it with full types.
- The app uses Convex Auth with phone-only OTP sign-in. User profiles are created on first login, then completed through onboarding.

## Scripts

- `npm start` – run Expo
- `npm run convex` – run Convex dev server
- `npm run convex:codegen` – regenerate Convex types
