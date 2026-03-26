import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const FAKE_USERS = [
  { displayName: "Mia Chen", username: "miachen", bio: "TV obsessed. Period dramas & prestige thrillers." },
  { displayName: "Jake Morrison", username: "jakemorrison", bio: "If it's on HBO, I've watched it twice." },
  { displayName: "Priya Sharma", username: "priyasharma", bio: "K-drama convert. Anime enthusiast. Sci-fi nerd." },
  { displayName: "Carlos Reyes", username: "carlosreyes", bio: "Comedy first, drama second. Always binging." },
  { displayName: "Emma Larsen", username: "emmalarsen", bio: "Scandi noir & true crime. Don't judge me." },
  { displayName: "David Kim", username: "davidkim", bio: "Cinematography nerd. If it looks good, I'm in." },
  { displayName: "Olivia Brooks", username: "oliviabrooks", bio: "Reality TV guilty pleasure. Also love a good miniseries." },
  { displayName: "Noah Patel", username: "noahpatel", bio: "Fantasy & sci-fi deep cuts. Hate spoilers." },
  { displayName: "Aisha Johnson", username: "aishajohnson", bio: "Documentary junkie. Also here for the dramas." },
  { displayName: "Liam O'Brien", username: "liamobrien", bio: "Classic TV rewatch club. Also tracking new stuff." },
  { displayName: "Sofia Martinez", username: "sofiamartinez", bio: "Telenovela roots, prestige TV present." },
  { displayName: "Ryan Tanaka", username: "ryantanaka", bio: "Animation isn't just for kids. Fight me." },
  { displayName: "Zoe Williams", username: "zoewilliams", bio: "British TV evangelist. Fleabag changed my life." },
  { displayName: "Marcus Lee", username: "marcuslee", bio: "Slow burns and character studies. Patient viewer." },
  { displayName: "Hannah Fischer", username: "hannahfischer", bio: "Horror & thriller lover. Sleep is optional." },
  { displayName: "Alex Rivera", username: "alexrivera", bio: "Watching everything so you don't have to." },
  { displayName: "Nadia Hassan", username: "nadiahassan", bio: "International TV explorer. Subtitles don't scare me." },
  { displayName: "Ben Cooper", username: "bencooper", bio: "Sports docs and limited series. That's the tweet." },
  { displayName: "Iris Chang", username: "irischang", bio: "Comfort rewatches & new discoveries." },
  { displayName: "Tyler Jackson", username: "tylerjackson", bio: "If IMDB says 8+, I'm watching it." },
];

const STATUSES = ["watchlist", "watching", "completed", "completed", "completed", "watching"] as const;

const REVIEW_TEXTS = [
  "Absolutely phenomenal. Every episode was gripping.",
  "Started slow but the payoff was worth it.",
  "Great performances all around, especially the lead.",
  "Not for everyone but I was hooked from episode one.",
  "Solid show. Nothing groundbreaking but very entertaining.",
  "The writing is sharp and the pacing is perfect.",
  "Binged this in two days. No regrets.",
  "A masterclass in storytelling.",
  "Good but the ending felt rushed.",
  "One of the best things I've watched this year.",
  "Underrated gem. More people need to see this.",
  "The cinematography alone makes it worth watching.",
  "Kept me guessing until the very end.",
  "Heartfelt and genuine. Really moved me.",
  "Funny, smart, and surprisingly deep.",
];

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export const fixRatings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const reviews = await ctx.db.query("reviews").collect();
    let fixed = 0;
    for (const review of reviews) {
      if (review.rating > 5) {
        await ctx.db.patch(review._id, { rating: Math.round((review.rating / 2) * 2) / 2 });
        fixed++;
      }
    }
    return { total: reviews.length, fixed };
  },
});

export const seedUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all existing shows
    const shows = await ctx.db.query("shows").take(200);
    if (shows.length === 0) {
      throw new Error("No shows in the database. Add some shows first.");
    }

    // Find the real user (first user with a username)
    const allUsers = await ctx.db.query("users").take(100);
    const realUser = allUsers.find((u) => u.username);
    if (!realUser) {
      throw new Error("No real user found with a username.");
    }

    console.log(`Found real user: ${realUser.username} (${realUser._id})`);
    console.log(`Found ${shows.length} shows to work with`);

    const createdUserIds: Id<"users">[] = [];

    for (const fakeUser of FAKE_USERS) {
      // Check if user already exists
      const existing = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", fakeUser.username))
        .unique();
      if (existing) {
        console.log(`Skipping ${fakeUser.username} (already exists)`);
        createdUserIds.push(existing._id);
        continue;
      }

      const createdAt = daysAgo(randomInt(7, 90));
      const userId = await ctx.db.insert("users", {
        name: fakeUser.displayName,
        displayName: fakeUser.displayName,
        username: fakeUser.username,
        bio: fakeUser.bio,
        searchText: `${fakeUser.displayName} ${fakeUser.username}`.toLowerCase(),
        createdAt,
        lastSeenAt: daysAgo(randomInt(0, 3)),
        onboardingStep: "complete",
        onboardingCompletedAt: createdAt + 300_000,
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
      });

      createdUserIds.push(userId);
      console.log(`Created user: ${fakeUser.username}`);

      // Give each user 5–15 shows with watch states
      const numShows = randomInt(5, 15);
      const shuffled = [...shows].sort(() => Math.random() - 0.5);
      const userShows = shuffled.slice(0, numShows);

      let watchlistCount = 0;
      let watchingCount = 0;
      let completedCount = 0;

      for (const show of userShows) {
        const status = randomPick(STATUSES);
        await ctx.db.insert("watchStates", {
          userId,
          showId: show._id,
          status,
          updatedAt: daysAgo(randomInt(0, 60)),
        });

        if (status === "watchlist") watchlistCount++;
        else if (status === "watching") watchingCount++;
        else if (status === "completed") completedCount++;
      }

      // Have some users write reviews (3–8 reviews each)
      const numReviews = randomInt(3, 8);
      const reviewShows = userShows
        .filter((_, i) => i < numReviews)
        .filter(() => Math.random() > 0.3);

      for (const show of reviewShows) {
        const rating = randomPick([2, 2.5, 3, 3, 3.5, 3.5, 4, 4, 4, 4.5, 4.5, 5]);
        const createdReviewAt = daysAgo(randomInt(0, 30));
        await ctx.db.insert("reviews", {
          authorId: userId,
          showId: show._id,
          rating,
          reviewText: Math.random() > 0.3 ? randomPick(REVIEW_TEXTS) : undefined,
          spoiler: Math.random() > 0.9,
          createdAt: createdReviewAt,
        });
      }

      // Update user counts
      await ctx.db.patch(userId, {
        countsWatchlist: watchlistCount,
        countsWatching: watchingCount,
        countsCompleted: completedCount,
        countsTotalShows: numShows,
        countsReviews: reviewShows.length,
      });
    }

    // Have 12–16 users follow the real user
    const followersCount = randomInt(12, 16);
    const shuffledUsers = [...createdUserIds].sort(() => Math.random() - 0.5);
    const followers = shuffledUsers.slice(0, Math.min(followersCount, shuffledUsers.length));

    let newFollowers = 0;
    for (const followerId of followers) {
      const existing = await ctx.db
        .query("follows")
        .withIndex("by_pair", (q) =>
          q.eq("followerId", followerId).eq("followeeId", realUser._id),
        )
        .unique();
      if (existing) continue;

      await ctx.db.insert("follows", {
        followerId,
        followeeId: realUser._id,
        createdAt: daysAgo(randomInt(1, 30)),
      });
      newFollowers++;
    }

    // Have the real user follow 8–12 of the fake users back
    const followBackCount = randomInt(8, 12);
    const followBacks = shuffledUsers.slice(0, Math.min(followBackCount, shuffledUsers.length));

    let newFollowing = 0;
    for (const followeeId of followBacks) {
      const existing = await ctx.db
        .query("follows")
        .withIndex("by_pair", (q) =>
          q.eq("followerId", realUser._id).eq("followeeId", followeeId),
        )
        .unique();
      if (existing) continue;

      await ctx.db.insert("follows", {
        followerId: realUser._id,
        followeeId: followeeId,
        createdAt: daysAgo(randomInt(1, 30)),
      });
      newFollowing++;
    }

    // Update follow counts on the real user
    const realFollowerCount = (await ctx.db
      .query("follows")
      .withIndex("by_followee_createdAt", (q) => q.eq("followeeId", realUser._id))
      .collect()).length;
    const realFollowingCount = (await ctx.db
      .query("follows")
      .withIndex("by_follower_createdAt", (q) => q.eq("followerId", realUser._id))
      .collect()).length;

    await ctx.db.patch(realUser._id, {
      countsFollowers: realFollowerCount,
      countsFollowing: realFollowingCount,
    });

    // Update follow counts on fake users
    for (const fakeUserId of createdUserIds) {
      const fFollowers = (await ctx.db
        .query("follows")
        .withIndex("by_followee_createdAt", (q) => q.eq("followeeId", fakeUserId))
        .collect()).length;
      const fFollowing = (await ctx.db
        .query("follows")
        .withIndex("by_follower_createdAt", (q) => q.eq("followerId", fakeUserId))
        .collect()).length;
      await ctx.db.patch(fakeUserId, {
        countsFollowers: fFollowers,
        countsFollowing: fFollowing,
      });
    }

    // Generate feed items for the real user from fake users' reviews
    const realUserFollowees = followBacks;
    for (const actorId of realUserFollowees) {
      const actorReviews = await ctx.db
        .query("reviews")
        .withIndex("by_author_createdAt", (q) => q.eq("authorId", actorId))
        .order("desc")
        .take(5);

      for (const review of actorReviews) {
        const existing = await ctx.db
          .query("feedItems")
          .withIndex("by_target", (q) =>
            q.eq("type", "review").eq("targetId", review._id as string),
          )
          .unique();
        if (existing) continue;

        await ctx.db.insert("feedItems", {
          ownerId: realUser._id,
          actorId,
          type: "review",
          targetId: review._id as string,
          showId: review.showId,
          timestamp: review.createdAt,
          createdAt: review.createdAt,
        });
      }
    }

    // Generate "started" and "completed" feed items from watch states
    for (const actorId of realUserFollowees) {
      const actorStates = await ctx.db
        .query("watchStates")
        .withIndex("by_user_updatedAt", (q) => q.eq("userId", actorId))
        .order("desc")
        .take(10);

      for (const state of actorStates) {
        if (state.status !== "watching" && state.status !== "completed") continue;
        const feedType = state.status === "watching" ? "started" as const : "completed" as const;

        // Check if feed item already exists
        const existing = await ctx.db
          .query("feedItems")
          .withIndex("by_target", (q) =>
            q.eq("type", feedType).eq("targetId", state._id as string),
          )
          .unique();
        if (existing) continue;

        await ctx.db.insert("feedItems", {
          ownerId: realUser._id,
          actorId,
          type: feedType,
          targetId: state._id as string,
          showId: state.showId,
          timestamp: state.updatedAt,
          createdAt: state.updatedAt,
        });
      }
    }

    // Also have fake users follow each other (social graph)
    for (let i = 0; i < createdUserIds.length; i++) {
      const numToFollow = randomInt(2, 6);
      const others = createdUserIds.filter((_, j) => j !== i);
      const toFollow = others.sort(() => Math.random() - 0.5).slice(0, numToFollow);
      for (const targetId of toFollow) {
        const existing = await ctx.db
          .query("follows")
          .withIndex("by_pair", (q) =>
            q.eq("followerId", createdUserIds[i]).eq("followeeId", targetId),
          )
          .unique();
        if (!existing) {
          await ctx.db.insert("follows", {
            followerId: createdUserIds[i],
            followeeId: targetId,
            createdAt: daysAgo(randomInt(1, 60)),
          });
        }
      }
    }

    // Recount all fake user follows
    for (const fakeUserId of createdUserIds) {
      const fFollowers = (await ctx.db
        .query("follows")
        .withIndex("by_followee_createdAt", (q) => q.eq("followeeId", fakeUserId))
        .collect()).length;
      const fFollowing = (await ctx.db
        .query("follows")
        .withIndex("by_follower_createdAt", (q) => q.eq("followerId", fakeUserId))
        .collect()).length;
      await ctx.db.patch(fakeUserId, {
        countsFollowers: fFollowers,
        countsFollowing: fFollowing,
      });
    }

    return {
      usersCreated: createdUserIds.length,
      newFollowersOfRealUser: newFollowers,
      realUserNowFollowing: newFollowing,
      showsInDB: shows.length,
    };
  },
});
