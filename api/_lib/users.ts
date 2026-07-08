import { eq } from "drizzle-orm";

import { users } from "../../db/schema";
import { findUserByAppleSub } from "./auth";
import { db } from "./db";
import { createId } from "./ids";
import { hashPhoneNumber } from "./phone";

const DEFAULT_COUNTS = {
  countsFollowers: 0,
  countsFollowing: 0,
  countsReviews: 0,
  countsLogs: 0,
  countsLists: 0,
  countsWatchlist: 0,
  countsWatching: 0,
  countsCompleted: 0,
  countsDropped: 0,
  countsTotalShows: 0,
} as const;

function sanitizeUsername(raw: string) {
  const normalized = raw.toLowerCase().replace(/[^a-z0-9_]+/g, "");
  return normalized.slice(0, 16) || `user${Math.floor(Math.random() * 10000)}`;
}

// The raw phone number is only used in flight to derive the HMAC hash; the
// users row never stores it.
export async function upsertPhoneUser(phone: string) {
  const phoneHash = hashPhoneNumber(phone);
  const existingRows = await db
    .select()
    .from(users)
    .where(eq(users.phoneHash, phoneHash))
    .limit(1);
  const existing = existingRows[0];
  const now = Date.now();

  if (existing) {
    await db
      .update(users)
      .set({
        phoneVerificationTime: now,
        lastSeenAt: now,
      })
      .where(eq(users.id, existing.id));

    const updatedRows = await db.select().from(users).where(eq(users.id, existing.id)).limit(1);
    return updatedRows[0];
  }

  const username = sanitizeUsername(phone.slice(-4));
  const id = createId("user");
  await db.insert(users).values({
    id,
    name: username,
    image: null,
    email: null,
    emailVerificationTime: null,
    phoneVerificationTime: now,
    phoneHash,
    isAnonymous: false,
    isAdmin: false,
    username,
    displayName: username,
    bio: null,
    avatarUrl: null,
    searchText: username,
    createdAt: now,
    lastSeenAt: now,
    onboardingStep: "profile",
    onboardingCompletedAt: null,
    favoriteShowIds: [],
    favoriteGenres: [],
    profileVisibility: {
      favorites: "public",
      currentlyWatching: "public",
      watchlist: "public",
    },
    isPrivate: false,
    releaseCalendarPreferences: {
      selectedProviders: [],
    },
    ...DEFAULT_COUNTS,
  });

  const createdRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return createdRows[0];
}

// Apple users are keyed by the identity table (provider "apple" + Apple's
// stable sub), never by phoneHash — that stays null until the user verifies
// a number for friend discovery.
export async function upsertAppleUser(
  appleSub: string,
  profile: {
    email?: string | null;
    emailIsPrivateRelay?: boolean;
    suggestedName?: string | null;
  },
) {
  const existing = await findUserByAppleSub(appleSub);
  const now = Date.now();

  if (existing) {
    await db
      .update(users)
      .set({ lastSeenAt: now })
      .where(eq(users.id, existing.id));

    const updatedRows = await db.select().from(users).where(eq(users.id, existing.id)).limit(1);
    return updatedRows[0];
  }

  const suggestedName = profile.suggestedName?.trim() || null;
  const email = profile.email ?? null;

  // Apple only shares email on the first authorization, and the relay
  // domain still has to respect the users_email_idx unique constraint.
  let availableEmail: string | null = null;
  if (email) {
    const emailRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    availableEmail = emailRows[0] ? null : email;
  }

  // Relay addresses have a random local part, so they make useless usernames;
  // only a real email is worth mining when Apple didn't share a name.
  const emailBase = profile.emailIsPrivateRelay ? null : email?.split("@")[0] ?? null;
  const usernameBase =
    sanitizeUsername(suggestedName ?? emailBase ?? "").slice(0, 12) || "viewer";

  // Prefer the clean name-derived username; usernames are unique, so fall
  // back to fresh random suffixes on collision.
  const candidates = [
    ...(usernameBase !== "viewer" && usernameBase.length >= 3 ? [usernameBase] : []),
    ...Array.from(
      { length: 5 },
      () => `${usernameBase}${Math.floor(1000 + Math.random() * 9000)}`,
    ),
  ];

  let lastError: unknown = null;
  for (const username of candidates) {
    const id = createId("user");
    try {
      await db.insert(users).values({
        id,
        name: suggestedName ?? username,
        image: null,
        email: availableEmail,
        emailVerificationTime: availableEmail ? now : null,
        phoneVerificationTime: null,
        phoneHash: null,
        isAnonymous: false,
        isAdmin: false,
        username,
        displayName: suggestedName ?? username,
        bio: null,
        avatarUrl: null,
        searchText: suggestedName ?? username,
        createdAt: now,
        lastSeenAt: now,
        onboardingStep: "profile",
        onboardingCompletedAt: null,
        favoriteShowIds: [],
        favoriteGenres: [],
        profileVisibility: {
          favorites: "public",
          currentlyWatching: "public",
          watchlist: "public",
        },
        isPrivate: false,
        releaseCalendarPreferences: {
          selectedProviders: [],
        },
        ...DEFAULT_COUNTS,
      });

      const createdRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return createdRows[0];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not create user");
}
