import { Redirect } from "expo-router";

import { Screen } from "../../components/Screen";
import { LogSurface } from "../(tabs)/log";
import type { LogActivityItem } from "../../lib/logActivity";
import type { Id } from "../../lib/plotlist/types";

const PREVIEW_NOW = new Date("2026-06-02T20:30:00-07:00").getTime();

function show(
  id: string,
  title: string,
  posterUrl: string,
) {
  return {
    _id: id,
    id,
    title,
    posterUrl,
  };
}

const SHOWS = {
  signal: show(
    "show-signal",
    "The Signal",
    "https://image.tmdb.org/t/p/w500/cbODFqkcmRgrYH8NkG4Q4Hcg8Z1.jpg",
  ),
  studio: show(
    "show-studio",
    "Studio",
    "https://image.tmdb.org/t/p/w500/xsiecCxd8lkcAluw0wWwbW5CwSv.jpg",
  ),
  northline: show(
    "show-northline",
    "Northline",
    "https://image.tmdb.org/t/p/w500/5lcxWLVAEICkFpuAiV1aMy7ZZj3.jpg",
  ),
  afterparty: show(
    "show-afterparty",
    "Afterparty",
    "https://image.tmdb.org/t/p/w500/2ONhd2hXjZHm3ZouH4UsUWm7fPX.jpg",
  ),
};

function minutesAgo(minutes: number) {
  return PREVIEW_NOW - minutes * 60_000;
}

function daysAgo(days: number, hour = 21) {
  const date = new Date(PREVIEW_NOW);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 20, 0, 0);
  return date.getTime();
}

function watchLog(
  id: string,
  showItem: (typeof SHOWS)[keyof typeof SHOWS],
  timestamp: number,
  seasonNumber: number,
  episodeNumber: number,
  episodeTitle: string,
  note?: string,
): LogActivityItem {
  return {
    id: id as Id<"watchLogs">,
    type: "log",
    timestamp,
    show: showItem,
    log: {
      _id: id,
      id,
      showId: showItem._id,
      watchedAt: timestamp,
      seasonNumber,
      episodeNumber,
      episodeTitle,
      note: note ?? null,
    },
  };
}

function review(
  id: string,
  showItem: (typeof SHOWS)[keyof typeof SHOWS],
  timestamp: number,
  rating: number,
  reviewText: string,
  spoiler = false,
): LogActivityItem {
  return {
    id: id as Id<"reviews">,
    type: "review",
    timestamp,
    show: showItem,
    review: {
      _id: id,
      id,
      showId: showItem._id,
      createdAt: timestamp,
      rating,
      reviewText,
      spoiler,
    },
  };
}

const PREVIEW_ITEMS: LogActivityItem[] = [
  watchLog(
    "log-signal-6",
    SHOWS.signal,
    minutesAgo(42),
    2,
    6,
    "The Signal",
    "The final five minutes completely change how the season's mystery reads.",
  ),
  watchLog("log-studio-8", SHOWS.studio, minutesAgo(95), 1, 8, "Notes Session"),
  watchLog("log-studio-7", SHOWS.studio, minutesAgo(122), 1, 7, "Open Floor"),
  watchLog("log-studio-6", SHOWS.studio, minutesAgo(154), 1, 6, "Table Read"),
  review(
    "review-northline",
    SHOWS.northline,
    daysAgo(1, 22),
    4.5,
    "A restrained, icy season opener with a great sense of place.",
  ),
  watchLog("log-afterparty-3", SHOWS.afterparty, daysAgo(1, 20), 3, 3, "Guest List"),
  watchLog("log-afterparty-2", SHOWS.afterparty, daysAgo(1, 19), 3, 2, "Side Door"),
  review(
    "review-signal",
    SHOWS.signal,
    daysAgo(3, 23),
    5,
    "Dense, strange, and worth sitting with. The best episode so far.",
    true,
  ),
  watchLog("log-northline-2", SHOWS.northline, daysAgo(5, 21), 1, 2, "Whiteout"),
  watchLog(
    "log-northline-1",
    SHOWS.northline,
    daysAgo(5, 20),
    1,
    1,
    "Pilot",
    "Strong premiere. Keeping an eye on the sound design.",
  ),
];

export default function DevLogPreviewScreen() {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Screen hasTabBar>
      <LogSurface items={PREVIEW_ITEMS} hasMore now={PREVIEW_NOW} />
    </Screen>
  );
}
