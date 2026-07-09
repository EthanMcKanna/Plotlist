import { useMemo } from "react";
import { Redirect } from "expo-router";

import {
  CalendarSurface,
  type CalendarSurfaceData,
} from "../calendar";
import {
  buildReleaseCalendarData,
  getDateOnlyTimestamp,
  type ReleaseCalendarShowSource,
} from "../../lib/releaseCalendar";

const PREVIEW_TODAY = "2026-06-01";

const PREVIEW_SHOWS: ReleaseCalendarShowSource[] = [
  {
    _id: "show-tonight",
    title: "Late Night Signal",
    posterUrl: null,
    backdropUrl: null,
    providers: [{ name: "Netflix" }],
    isStale: true,
    events: [
      {
        showId: "show-tonight",
        airDate: PREVIEW_TODAY,
        airDateTs: getDateOnlyTimestamp(PREVIEW_TODAY),
        seasonNumber: 2,
        episodeNumber: 7,
        episodeTitle: "A Clean Drop",
        isPremiere: false,
        isReturningSeason: false,
        isSeasonFinale: false,
        isSeriesFinale: false,
      },
    ],
  },
  {
    _id: "show-premiere",
    title: "New Map",
    posterUrl: null,
    backdropUrl: null,
    providers: [{ name: "Apple TV" }],
    isStale: false,
    events: [
      {
        showId: "show-premiere",
        airDate: "2026-06-04",
        airDateTs: getDateOnlyTimestamp("2026-06-04"),
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: "Pilot",
        isPremiere: true,
        isReturningSeason: false,
        isSeasonFinale: false,
        isSeriesFinale: false,
      },
    ],
  },
  {
    _id: "show-returning",
    title: "Orbit Room",
    posterUrl: null,
    backdropUrl: null,
    providers: [{ name: "Hulu" }],
    isStale: false,
    events: [
      {
        showId: "show-returning",
        airDate: "2026-06-08",
        airDateTs: getDateOnlyTimestamp("2026-06-08"),
        seasonNumber: 3,
        episodeNumber: 1,
        episodeTitle: "Back Online",
        isPremiere: false,
        isReturningSeason: true,
        isSeasonFinale: false,
        isSeriesFinale: false,
      },
    ],
  },
  {
    _id: "show-finale",
    title: "Last Train Home",
    posterUrl: null,
    backdropUrl: null,
    providers: [{ name: "Max" }],
    isStale: false,
    events: [
      {
        showId: "show-finale",
        airDate: "2026-06-11",
        airDateTs: getDateOnlyTimestamp("2026-06-11"),
        seasonNumber: 4,
        episodeNumber: 10,
        episodeTitle: "End of the Line",
        isPremiere: false,
        isReturningSeason: false,
        isSeasonFinale: true,
        isSeriesFinale: true,
      },
    ],
  },
];

export default function DevCalendarPreviewScreen() {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return <Redirect href="/sign-in" />;
  }

  return <DevCalendarPreviewSurface />;
}

function DevCalendarPreviewSurface() {
  const data = useMemo<CalendarSurfaceData>(() => {
    return buildReleaseCalendarData({
      shows: PREVIEW_SHOWS,
      today: PREVIEW_TODAY,
      view: "upcoming",
      limit: 25,
    });
  }, []);

  return (
    <CalendarSurface data={data} isAuthenticated today={PREVIEW_TODAY} />
  );
}
