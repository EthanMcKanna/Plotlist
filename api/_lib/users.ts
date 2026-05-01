import { eq } from "drizzle-orm";

import { users } from "../../db/schema";
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

export async function upsertPhoneUser(phone: string) {
  const phoneHash = hashPhoneNumber(phone);
  const existingRows = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  const existing = existingRows[0];
  const now = Date.now();

  if (existing) {
    await db
      .update(users)
      .set({
        phone,
        phoneHash,
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
    name: phone,
    image: null,
    email: null,
    emailVerificationTime: null,
    phone,
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
    releaseCalendarPreferences: {
      selectedProviders: [],
    },
    ...DEFAULT_COUNTS,
  });

  const createdRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return createdRows[0];
}
