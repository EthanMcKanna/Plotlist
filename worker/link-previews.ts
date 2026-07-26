import { asc, eq } from "drizzle-orm";

import { listItems, lists, reviews, shows, users } from "../db/schema";
import { db } from "../api/_lib/db";

// Server-rendered Open Graph / Twitter Card tags for shareable pages, so
// links unfurl with the actual show/profile/list/review instead of the
// generic site card. The exported SPA shell ships default og:* tags (see
// scripts/postexport-web.mjs); this module swaps their values per entity
// before the worker serves the HTML.

const SITE_ORIGIN = "https://plotlist.app";
const DEFAULT_DESCRIPTION =
  "Track every show you watch. Review, rate, and share with friends.";
const MAX_DESCRIPTION_LENGTH = 260;

export type LinkPreview = {
  title: string;
  description: string;
  imageUrl: string | null;
  // Landscape art (backdrops, list covers) reads best as a large card;
  // portrait posters and square avatars fit the small summary card.
  card: "summary" | "summary_large_image";
  ogType: string;
  canonicalPath: string;
};

function truncate(value: string) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_DESCRIPTION_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

// 4.5 -> "★★★★½"
function formatStars(rating: number) {
  const clamped = Math.max(0, Math.min(5, rating));
  return "★".repeat(Math.floor(clamped)) + (clamped % 1 >= 0.5 ? "½" : "");
}

function displayNameFor(user: {
  displayName: string | null;
  name: string | null;
  username: string | null;
}) {
  return user.displayName ?? user.name ?? user.username ?? "Someone";
}

async function getShowPreview(showId: string): Promise<LinkPreview | null> {
  const rows = await db
    .select({
      title: shows.title,
      year: shows.year,
      overview: shows.overview,
      posterUrl: shows.posterUrl,
      backdropUrl: shows.backdropUrl,
    })
    .from(shows)
    .where(eq(shows.id, showId))
    .limit(1);
  const show = rows[0];
  if (!show) {
    return null;
  }
  return {
    title: show.year ? `${show.title} (${show.year})` : show.title,
    description: show.overview ? truncate(show.overview) : DEFAULT_DESCRIPTION,
    imageUrl: show.backdropUrl ?? show.posterUrl ?? null,
    card: show.backdropUrl ? "summary_large_image" : "summary",
    ogType: "video.tv_show",
    canonicalPath: `/show/${showId}`,
  };
}

async function getProfilePreview(userId: string): Promise<LinkPreview | null> {
  const rows = await db
    .select({
      displayName: users.displayName,
      name: users.name,
      username: users.username,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      image: users.image,
      countsFollowers: users.countsFollowers,
      countsTotalShows: users.countsTotalShows,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) {
    return null;
  }
  const name = displayNameFor(user);
  const stats = `${user.countsTotalShows} shows · ${user.countsFollowers} followers`;
  return {
    title: user.username && user.username !== name ? `${name} (@${user.username})` : name,
    description: truncate(user.bio ? `${user.bio} — ${stats} on Plotlist` : `${stats} on Plotlist`),
    imageUrl: user.avatarUrl ?? user.image ?? null,
    card: "summary",
    ogType: "profile",
    canonicalPath: `/profile/${userId}`,
  };
}

async function getListPreview(listId: string): Promise<LinkPreview | null> {
  const rows = await db
    .select({
      title: lists.title,
      description: lists.description,
      isPublic: lists.isPublic,
      coverUrl: lists.coverUrl,
      ownerDisplayName: users.displayName,
      ownerName: users.name,
      ownerUsername: users.username,
    })
    .from(lists)
    .innerJoin(users, eq(users.id, lists.ownerId))
    .where(eq(lists.id, listId))
    .limit(1);
  const list = rows[0];
  // Private lists keep the generic site card — the page itself would refuse
  // to load for anyone but the owner.
  if (!list || !list.isPublic) {
    return null;
  }

  let imageUrl = list.coverUrl;
  let card: LinkPreview["card"] = "summary_large_image";
  if (!imageUrl) {
    const firstItem = await db
      .select({ backdropUrl: shows.backdropUrl, posterUrl: shows.posterUrl })
      .from(listItems)
      .innerJoin(shows, eq(shows.id, listItems.showId))
      .where(eq(listItems.listId, listId))
      .orderBy(asc(listItems.position))
      .limit(1);
    imageUrl = firstItem[0]?.backdropUrl ?? firstItem[0]?.posterUrl ?? null;
    card = firstItem[0]?.backdropUrl ? "summary_large_image" : "summary";
  }

  const owner = displayNameFor({
    displayName: list.ownerDisplayName,
    name: list.ownerName,
    username: list.ownerUsername,
  });
  return {
    title: list.title,
    description: truncate(list.description ?? `A list by ${owner} on Plotlist`),
    imageUrl,
    card,
    ogType: "website",
    canonicalPath: `/list/${listId}`,
  };
}

async function getReviewPreview(reviewId: string): Promise<LinkPreview | null> {
  const rows = await db
    .select({
      rating: reviews.rating,
      reviewText: reviews.reviewText,
      spoiler: reviews.spoiler,
      showTitle: shows.title,
      backdropUrl: shows.backdropUrl,
      posterUrl: shows.posterUrl,
      authorDisplayName: users.displayName,
      authorName: users.name,
      authorUsername: users.username,
      authorIsPrivate: users.isPrivate,
    })
    .from(reviews)
    .innerJoin(shows, eq(shows.id, reviews.showId))
    .innerJoin(users, eq(users.id, reviews.authorId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  const review = rows[0];
  if (!review) {
    return null;
  }
  const author = displayNameFor({
    displayName: review.authorDisplayName,
    name: review.authorName,
    username: review.authorUsername,
  });
  const stars = formatStars(review.rating);
  // Spoiler-flagged text stays out of previews — a link unfurl can't be
  // blurred the way the in-app review card is.
  const body = !review.spoiler && review.reviewText ? review.reviewText : null;
  return {
    title: `${author}'s review of ${review.showTitle}`,
    description: truncate(body ? `${stars} — ${body}` : `Rated ${stars} on Plotlist`),
    imageUrl: review.backdropUrl ?? review.posterUrl ?? null,
    card: review.backdropUrl ? "summary_large_image" : "summary",
    ogType: "article",
    canonicalPath: `/review/${reviewId}`,
  };
}

// Path segments come straight off the URL; entity ids are createId() slugs
// (letters, digits, underscores) so anything else can skip the DB round trip.
const PREVIEW_ROUTE = /^\/(show|profile|list|review)\/([A-Za-z0-9_-]+)\/?$/;

export function isPreviewablePath(pathname: string) {
  return PREVIEW_ROUTE.test(pathname);
}

export async function getLinkPreview(pathname: string): Promise<LinkPreview | null> {
  const match = PREVIEW_ROUTE.exec(pathname);
  if (!match) {
    return null;
  }
  const [, kind, id] = match;
  switch (kind) {
    case "show":
      return await getShowPreview(id);
    case "profile":
      return await getProfilePreview(id);
    case "list":
      return await getListPreview(id);
    case "review":
      return await getReviewPreview(id);
    default:
      return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function replaceMeta(html: string, attr: "property" | "name", key: string, content: string) {
  const pattern = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(pattern, `$1${escapeHtml(content)}$2`);
}

// Swaps the default head tags (injected by scripts/postexport-web.mjs, which
// guarantees every one of these tags exists) for entity-specific values.
export function applyLinkPreview(html: string, preview: LinkPreview) {
  const canonicalUrl = `${SITE_ORIGIN}${preview.canonicalPath}`;
  let out = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(preview.title)} — Plotlist</title>`,
  );
  out = replaceMeta(out, "name", "description", preview.description);
  out = replaceMeta(out, "property", "og:title", preview.title);
  out = replaceMeta(out, "property", "og:description", preview.description);
  out = replaceMeta(out, "property", "og:url", canonicalUrl);
  out = replaceMeta(out, "property", "og:type", preview.ogType);
  out = replaceMeta(out, "name", "twitter:title", preview.title);
  out = replaceMeta(out, "name", "twitter:description", preview.description);
  if (preview.imageUrl) {
    out = replaceMeta(out, "property", "og:image", preview.imageUrl);
    out = replaceMeta(out, "name", "twitter:image", preview.imageUrl);
    out = replaceMeta(out, "name", "twitter:card", preview.card);
  }
  return out;
}
