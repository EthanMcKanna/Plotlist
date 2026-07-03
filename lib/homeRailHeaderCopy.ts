import type { DiscoveryHomeSectionKind } from "./homeSectionPlan";

// Daypart-aware kickers for the discovery rails. Titles stay fixed — they are
// the rails' identity — while the small eyebrow line shifts with the time of
// day so the surface reads as freshly assembled rather than templated.

export type HomeRailHeaderCopy = {
  kicker: string;
  title: string;
};

function toDate(now: Date | string | number | undefined) {
  if (now instanceof Date) return now;
  if (typeof now === "number") return new Date(now);
  if (typeof now === "string") {
    const parsed = new Date(now);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function getHomeDiscoveryRailHeaderCopy(
  kind: DiscoveryHomeSectionKind,
  options: { now?: Date | string | number } = {},
): HomeRailHeaderCopy {
  const date = toDate(options.now);
  const hour = date.getHours();
  const day = date.getDay();
  const weekend = day === 0 || day === 6;
  const morning = hour >= 6 && hour < 14;
  const evening = hour >= 17 && hour < 23;
  const lateNight = hour >= 23 || hour < 5;

  switch (kind) {
    case "heat":
      return {
        kicker: evening ? "Tonight" : morning ? "Today" : "Now",
        title: "Trending",
      };
    case "fresh":
      return {
        kicker: morning ? "Just in" : "Fresh",
        title: "New",
      };
    case "critics":
      return {
        kicker: weekend ? "Weekend" : "Quality",
        title: "Acclaimed",
      };
    case "quick":
      return {
        kicker: lateNight || evening ? "Nightcap" : "Short",
        title: "Quick",
      };
    case "rooms":
      return {
        kicker: weekend ? "Settle in" : "Watch",
        title: "Streaming",
      };
  }
}
