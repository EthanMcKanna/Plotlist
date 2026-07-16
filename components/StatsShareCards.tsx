import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import type { WatchInsightsYearToDate } from "../lib/watchInsights";

// Story-format (9:16) share cards for the "Year so far" flow. Every card is
// designed in a 360×640 coordinate space and scaled by the rendered width, so
// the on-screen preview and the 1080×1920 capture are the same drawing.
export const STORY_CARD_BASE_WIDTH = 360;
export const STORY_CARD_BASE_HEIGHT = 640;

const TEXT_PRIMARY = "#F1F3F7";
const TEXT_SECONDARY = "#9AA3B5";
const TEXT_TERTIARY = "#6B7280";
const ACCENT = "#38BDF8";
const CARD_BG = "#0D0F14";

type CardProps = {
  ytd: WatchInsightsYearToDate;
  width: number;
  username?: string | null;
};

function hoursLabel(minutes: number) {
  return `${Math.max(1, Math.round(minutes / 60)).toLocaleString()}h`;
}

function CardShell({
  width,
  backdrop,
  children,
}: {
  width: number;
  backdrop?: ReactNode;
  children: ReactNode;
}) {
  const u = width / STORY_CARD_BASE_WIDTH;
  return (
    <View
      style={{
        width,
        height: STORY_CARD_BASE_HEIGHT * u,
        backgroundColor: CARD_BG,
        overflow: "hidden",
      }}
    >
      {backdrop}
      <View style={[StyleSheet.absoluteFill, { padding: 24 * u }]}>{children}</View>
    </View>
  );
}

function CardHeader({ u, eyebrow }: { u: number; eyebrow: string }) {
  return (
    <View style={{ alignItems: "center", gap: 10 * u, marginTop: 8 * u }}>
      <Image
        source={require("../assets/brand-logo.png")}
        style={{ width: 34 * u, height: 34 * u, borderRadius: 8 * u }}
        contentFit="cover"
        transition={0}
      />
      <Text
        style={{
          color: "rgba(125,211,252,0.9)",
          fontSize: 11 * u,
          fontWeight: "800",
          letterSpacing: 3 * u,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </Text>
    </View>
  );
}

function CardFooter({ u, username }: { u: number; username?: string | null }) {
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        gap: 6 * u,
      }}
    >
      {username ? (
        <>
          <Text style={{ color: TEXT_SECONDARY, fontSize: 12 * u, fontWeight: "600" }}>
            @{username}
          </Text>
          <Text style={{ color: TEXT_TERTIARY, fontSize: 12 * u }}>·</Text>
        </>
      ) : null}
      <Text style={{ color: TEXT_SECONDARY, fontSize: 12 * u, fontWeight: "700" }}>
        plotlist.app
      </Text>
    </View>
  );
}

function PosterArt({
  uri,
  width,
  u,
  style,
}: {
  uri: string | null;
  width: number;
  u: number;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width,
          height: width * 1.5,
          borderRadius: 12 * u,
          borderCurve: "continuous",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(255,255,255,0.14)",
          backgroundColor: "#1A1F29",
          overflow: "hidden",
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="film-outline" size={width * 0.24} color="#5E6575" />
        </View>
      )}
    </View>
  );
}

function StatBlock({ u, value, label }: { u: number; value: string; label: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1, gap: 2 * u }}>
      <Text
        style={{
          color: TEXT_PRIMARY,
          fontSize: 22 * u,
          fontWeight: "800",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text style={{ color: TEXT_TERTIARY, fontSize: 10.5 * u, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

// Card 1 — the year hero: tilted poster collage over a gradient, one giant
// episode count, and a compact stat row.
export function YearHeroCard({ ytd, width, username }: CardProps) {
  const u = width / STORY_CARD_BASE_WIDTH;
  const posters = ytd.topShows.slice(0, 3);
  const collage = [
    { rotate: "-10deg", translateX: -96 * u, translateY: 26 * u, poster: posters[1] },
    { rotate: "10deg", translateX: 96 * u, translateY: 26 * u, poster: posters[2] },
    { rotate: "0deg", translateX: 0, translateY: 0, poster: posters[0] },
  ].filter((entry) => entry.poster);

  return (
    <CardShell
      width={width}
      backdrop={
        <>
          <View style={{ alignItems: "center", marginTop: 108 * u }}>
            {collage.map((entry, index) => (
              <View
                key={entry.poster!.showId}
                style={{
                  position: index === collage.length - 1 ? "relative" : "absolute",
                  transform: [
                    { translateX: entry.translateX },
                    { translateY: entry.translateY },
                    { rotate: entry.rotate },
                  ],
                }}
              >
                <PosterArt uri={entry.poster!.posterUrl} width={128 * u} u={u} />
              </View>
            ))}
          </View>
          <LinearGradient
            colors={["rgba(13,15,20,0)", "rgba(13,15,20,0.55)", CARD_BG]}
            locations={[0.28, 0.48, 0.62]}
            style={StyleSheet.absoluteFill}
          />
        </>
      }
    >
      <CardHeader u={u} eyebrow={`${ytd.year} so far`} />
      <View style={{ flex: 1 }} />
      <View style={{ alignItems: "center" }}>
        <Text
          style={{
            color: TEXT_PRIMARY,
            fontSize: 88 * u,
            fontWeight: "900",
            fontVariant: ["tabular-nums"],
            letterSpacing: -2 * u,
          }}
        >
          {ytd.episodes.toLocaleString()}
        </Text>
        <Text
          style={{
            color: TEXT_SECONDARY,
            fontSize: 15 * u,
            fontWeight: "600",
            marginTop: -2 * u,
          }}
        >
          episodes watched
        </Text>
      </View>
      <View
        style={{
          borderColor: "rgba(255,255,255,0.1)",
          borderTopWidth: StyleSheet.hairlineWidth,
          flexDirection: "row",
          marginTop: 26 * u,
          paddingTop: 18 * u,
          marginBottom: 22 * u,
        }}
      >
        <StatBlock u={u} value={hoursLabel(ytd.minutes)} label="watched" />
        <StatBlock u={u} value={ytd.shows.toLocaleString()} label="shows" />
        <StatBlock u={u} value={ytd.activeDays.toLocaleString()} label="active days" />
      </View>
      <CardFooter u={u} username={username} />
    </CardShell>
  );
}

// Card 2 — the obsession: #1 show poster with its own blurred art behind it,
// plus the biggest binge as the brag line.
export function TopShowCard({ ytd, width, username }: CardProps) {
  const u = width / STORY_CARD_BASE_WIDTH;
  const show = ytd.topShows[0];
  if (!show) return null;
  const binge = ytd.biggestBinge;
  const bingeDays = binge ? (binge.days === 1 ? "one day" : `${binge.days} days`) : null;

  return (
    <CardShell
      width={width}
      backdrop={
        show.posterUrl ? (
          <>
            <Image
              source={{ uri: show.posterUrl }}
              style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              blurRadius={26}
              transition={0}
            />
            <LinearGradient
              colors={["rgba(13,15,20,0.35)", "rgba(13,15,20,0.75)", CARD_BG]}
              locations={[0, 0.55, 0.85]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : null
      }
    >
      <CardHeader u={u} eyebrow="Most watched" />
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <PosterArt
          uri={show.posterUrl}
          width={184 * u}
          u={u}
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 18 * u },
            shadowOpacity: 0.55,
            shadowRadius: 28 * u,
          }}
        />
        <Text
          numberOfLines={2}
          style={{
            color: TEXT_PRIMARY,
            fontSize: 27 * u,
            fontWeight: "900",
            letterSpacing: -0.5 * u,
            marginTop: 22 * u,
            textAlign: "center",
          }}
        >
          {show.title ?? "Unknown show"}
        </Text>
        <Text
          style={{
            color: ACCENT,
            fontSize: 14.5 * u,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
            marginTop: 6 * u,
          }}
        >
          {show.episodes.toLocaleString()} episodes · {hoursLabel(show.minutes)}
        </Text>
        {binge ? (
          <View
            style={{
              alignItems: "center",
              backgroundColor: "rgba(245,158,11,0.12)",
              borderColor: "rgba(245,158,11,0.3)",
              borderRadius: 999,
              borderWidth: StyleSheet.hairlineWidth,
              flexDirection: "row",
              gap: 6 * u,
              marginTop: 18 * u,
              paddingHorizontal: 14 * u,
              paddingVertical: 8 * u,
            }}
          >
            <Ionicons name="flame" size={13 * u} color="#F59E0B" />
            <Text style={{ color: "#FCD34D", fontSize: 12.5 * u, fontWeight: "700" }}>
              {binge.showId === show.showId
                ? `Biggest binge: ${binge.episodes} episodes in ${bingeDays}`
                : `Biggest binge: ${binge.episodes} episodes of ${binge.title ?? "one show"} in ${bingeDays}`}
            </Text>
          </View>
        ) : null}
      </View>
      <CardFooter u={u} username={username} />
    </CardShell>
  );
}

// Card 3 — the taste card: top genre in oversized type over a fan of that
// genre's most-watched posters, runner-up genres below.
export function TopGenreCard({ ytd, width, username }: CardProps) {
  const u = width / STORY_CARD_BASE_WIDTH;
  const genre = ytd.topGenres[0];
  if (!genre) return null;
  const runnersUp = ytd.topGenres.slice(1);
  const fan = [
    { rotate: "-12deg", translateX: -74 * u, translateY: 14 * u, uri: genre.posterUrls[1] ?? null },
    { rotate: "12deg", translateX: 74 * u, translateY: 14 * u, uri: genre.posterUrls[2] ?? null },
    { rotate: "0deg", translateX: 0, translateY: 0, uri: genre.posterUrls[0] ?? null },
  ].filter((entry) => entry.uri !== null || genre.posterUrls.length === 0);

  return (
    <CardShell width={width}>
      <CardHeader u={u} eyebrow="Top genre" />
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", height: 210 * u, justifyContent: "center" }}>
          {fan.map((entry, index) => (
            <View
              key={`${entry.uri ?? "empty"}-${index}`}
              style={{
                position: index === fan.length - 1 ? "relative" : "absolute",
                transform: [
                  { translateX: entry.translateX },
                  { translateY: entry.translateY },
                  { rotate: entry.rotate },
                ],
              }}
            >
              <PosterArt uri={entry.uri} width={118 * u} u={u} />
            </View>
          ))}
        </View>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          style={{
            color: TEXT_PRIMARY,
            fontSize: 40 * u,
            fontWeight: "900",
            letterSpacing: -1 * u,
            marginTop: 26 * u,
            maxWidth: 300 * u,
            textAlign: "center",
          }}
        >
          {genre.label}
        </Text>
        <Text
          style={{
            color: ACCENT,
            fontSize: 14.5 * u,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
            marginTop: 8 * u,
          }}
        >
          {hoursLabel(genre.minutes)} watched this year
        </Text>
        {runnersUp.length > 0 ? (
          <View style={{ gap: 8 * u, marginTop: 24 * u }}>
            {runnersUp.map((entry, index) => (
              <View
                key={entry.genreId}
                style={{ alignItems: "center", flexDirection: "row", gap: 8 * u }}
              >
                <Text
                  style={{
                    color: TEXT_TERTIARY,
                    fontSize: 12 * u,
                    fontVariant: ["tabular-nums"],
                    fontWeight: "800",
                    width: 14 * u,
                  }}
                >
                  {index + 2}
                </Text>
                <Text style={{ color: TEXT_SECONDARY, fontSize: 13 * u, fontWeight: "600" }}>
                  {entry.label}
                </Text>
                <Text
                  style={{
                    color: TEXT_TERTIARY,
                    fontSize: 12 * u,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {hoursLabel(entry.minutes)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <CardFooter u={u} username={username} />
    </CardShell>
  );
}
