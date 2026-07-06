import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

jest.mock("expo-image", () => ({
  Image: "Image",
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children?: ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

import { router } from "expo-router";
import {
  getRoomFeaturedItem,
  getRoomSupportItems,
  getStreamingRoomAccessibilityLabel,
  getStreamingRoomVisibleItemLabel,
  getStreamingRoomVisibleSignal,
  StreamingRooms,
  type ProviderRoom,
} from "../../components/StreamingRooms";

const room: ProviderRoom = {
  key: "netflix",
  label: "Netflix",
  logoUrl: "https://img.example.com/netflix.png",
  tint: "#E50914",
  items: [
    {
      externalId: "girl-guide",
      title: "A Good Girl's Guide to Murder",
      backdropUrl: "https://img.example.com/girl-guide-backdrop.jpg",
      posterUrl: "https://img.example.com/girl-guide-poster.jpg",
      homeSignal: "S2 May 27",
    },
    { title: "Nemesis" },
    { title: "The Four Seasons" },
    { title: "Lord of the Flies" },
  ],
};

describe("StreamingRooms", () => {
  it("keeps provider room cards compact while preserving the featured show", () => {
    render(<StreamingRooms rooms={[room]} index={8} cardWidth={320} />);

    expect(screen.getByText("Streaming")).toBeTruthy();
    expect(screen.getByLabelText("Streaming rail")).toBeTruthy();
    expect(screen.queryByText("Streaming rooms")).toBeNull();
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.queryByText("4 picks")).toBeNull();
    expect(screen.queryByText(/Featuring/)).toBeNull();
    expect(screen.queryByText("Featured")).toBeNull();
    expect(screen.queryByText("arrow-forward")).toBeNull();
    expect(
      StyleSheet.flatten(screen.getByTestId("provider-room-card-netflix").props.style)
        .height,
    ).toBe(148);
    expect(screen.getByTestId("provider-room-copy-netflix")).toBeTruthy();
    expect(screen.getByText("A Good Girl's Guide to Murder").props.numberOfLines).toBe(2);
    expect(screen.getByText("S2 · May 27")).toBeTruthy();
    // The card is a door into the provider catalog, and says so.
    expect(screen.getByText("Browse all")).toBeTruthy();
  });

  it("keeps provider identity visible even when a logo is unavailable", () => {
    render(
      <StreamingRooms
        rooms={[{ ...room, logoUrl: "" }]}
        index={8}
        cardWidth={320}
      />,
    );

    expect(screen.getByText("Netflix")).toBeTruthy();
  });

  it("removes repeated provider names from visible room signals", () => {
    const appleRoom = {
      ...room,
      key: "apple-tv",
      label: "Apple TV+",
      items: [
        { title: "Cape Fear", homeSignal: "Apple TV+ Jun 5" },
        {
          title: "Maximum Pleasure Guaranteed",
          homeSignal: "Apple TV+ May 20",
        },
      ],
    };
    const primeRoom = {
      ...room,
      key: "prime-video",
      label: "Prime Video",
    };
    const huluRoom = {
      ...room,
      key: "hulu",
      label: "Hulu",
    };

    expect(getStreamingRoomVisibleSignal(appleRoom, appleRoom.items[0])).toBe(
      "Jun 5",
    );
    expect(getStreamingRoomVisibleItemLabel(appleRoom, appleRoom.items[1])).toBe(
      "Maximum Pleasure Guaranteed · May 20",
    );
    expect(
      getStreamingRoomVisibleSignal(primeRoom, {
        title: "Spider-Noir",
        homeSignal: "Prime May 27",
      }),
    ).toBe("May 27");
    expect(
      getStreamingRoomVisibleSignal(huluRoom, {
        title: "The Bear",
        homeSignal: "FX/Hulu Jun 25",
      }),
    ).toBe("Jun 25");
  });

  it("keeps provider cards actionable", () => {
    render(<StreamingRooms rooms={[room]} index={8} cardWidth={320} />);

    fireEvent.press(
      screen.getByLabelText(
        "Browse Netflix. 4 titles. A Good Girl's Guide to Murder · S2 · May 27. Also Nemesis, The Four Seasons",
      ),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/provider/[id]",
      params: {
        id: "netflix",
        featuredTitle: "A Good Girl's Guide to Murder",
      },
    });
  });

  it("keeps a fresh provider lead featured instead of over-deduping to filler", () => {
    render(
      <StreamingRooms
        rooms={[
          {
            ...room,
            key: "hulu",
            label: "Hulu",
            items: [
              { title: "Deli Boys", homeSignal: "S2 May 28" },
              { title: "The Bear", homeSignal: "FX/Hulu Jun 25" },
              { title: "Tracker" },
              { title: "Abbott Elementary" },
            ],
          },
        ]}
        index={8}
        cardWidth={320}
        mutedHeroTitleKeys={
          new Set([
            "title:deli boys",
            "title:the bear",
            "title:abbott elementary",
          ])
        }
        softMutedSupportTitleKeys={
          new Set([
            "title:deli boys",
            "title:the bear",
            "title:abbott elementary",
          ])
        }
      />,
    );

    expect(screen.getByText("Deli Boys")).toBeTruthy();
    expect(screen.getByText("S2 · May 28")).toBeTruthy();
    expect(screen.queryByText("The Bear · Jun 25")).toBeNull();
    expect(screen.queryByText("Tracker")).toBeNull();

    fireEvent.press(
      screen.getByLabelText(
        "Browse Hulu. 4 titles. Deli Boys · S2 · May 28. Also The Bear · FX/Hulu · Jun 25, Tracker",
      ),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/provider/[id]",
      params: {
        id: "hulu",
        featuredTitle: "Deli Boys",
      },
    });
  });

  it("does not feature a signal-less catalog filler over a muted current anchor", () => {
    render(
      <StreamingRooms
        rooms={[
          {
            ...room,
            key: "max",
            label: "Max",
            items: [
              { title: "House of the Dragon", homeSignal: "Returns Jun 21" },
              { title: "The Cleaning Lady" },
              { title: "The Pitt" },
              { title: "Hacks" },
            ],
          },
        ]}
        index={8}
        cardWidth={320}
        mutedHeroTitleKeys={new Set(["title:house of the dragon"])}
      />,
    );

    expect(screen.getByText("House of the Dragon")).toBeTruthy();
    expect(screen.getByText("Returns · Jun 21")).toBeTruthy();
    expect(screen.queryByText("The Cleaning Lady")).toBeNull();
  });

  it("can strictly keep muted hero titles out of the featured room slot", () => {
    render(
      <StreamingRooms
        rooms={[
          {
            ...room,
            key: "prime-video",
            label: "Prime Video",
            items: [
              { title: "Spider-Noir", homeSignal: "Prime May 27" },
              { title: "Invincible" },
              { title: "The Boys", homeSignal: "S5 airing now" },
            ],
          },
        ]}
        index={8}
        cardWidth={320}
        mutedHeroTitleKeys={
          new Set(["title:spider-noir", "title:the boys"])
        }
        allowMutedFeaturedFallback={false}
      />,
    );

    fireEvent.press(
      screen.getByLabelText(
        "Browse Prime Video. 3 titles. Invincible. Also Spider-Noir · Prime · May 27, The Boys · S5 airing now",
      ),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/provider/[id]",
      params: {
        id: "prime-video",
        featuredTitle: "Invincible",
      },
    });
  });

  it("moves recently shown titles behind fresher support labels", () => {
    const items = [
      room.items[0],
      { title: "The Boroughs" },
      { title: "Lord of the Flies" },
      { title: "Adolescence" },
      { title: "Nemesis" },
    ];
    const supportItems = getRoomSupportItems({
      items,
      featured: items[0],
      mutedSupportTitleKeys: new Set(["title:the boroughs"]),
      softMutedSupportTitleKeys: new Set(),
    });

    expect(supportItems.map((item) => item.title)).toEqual([
      "Lord of the Flies",
      "Adolescence",
      "Nemesis",
    ]);
  });

  it("does not refill support labels with hard-muted repeats", () => {
    const items = [
      room.items[0],
      { title: "The Boroughs" },
      { title: "Lord of the Flies" },
      { title: "Adolescence" },
    ];
    const supportItems = getRoomSupportItems({
      items,
      featured: items[0],
      mutedSupportTitleKeys: new Set([
        "title:the boroughs",
        "title:lord of the flies",
      ]),
      softMutedSupportTitleKeys: new Set(),
    });

    expect(supportItems.map((item) => item.title)).toEqual(["Adolescence"]);
  });

  it("prefers unseen support labels before marquee repeats", () => {
    const items = [
      { title: "Widow's Bay" },
      { title: "Star City" },
      { title: "Slow Horses" },
      { title: "The Studio" },
      { title: "Your Friends & Neighbors" },
    ];
    const supportItems = getRoomSupportItems({
      items,
      featured: items[0],
      mutedSupportTitleKeys: new Set(),
      softMutedSupportTitleKeys: new Set([
        "title:star city",
        "title:slow horses",
        "title:your friends & neighbors",
      ]),
    });

    expect(supportItems.map((item) => item.title)).toEqual([
      "The Studio",
      "Star City",
      "Slow Horses",
    ]);
  });

  it("keeps fresh support labels ahead of generic fillers even when softly repeated", () => {
    const huluRoom = {
      ...room,
      key: "hulu",
      label: "Hulu",
      items: [
        { title: "Deli Boys", homeSignal: "S2 May 28" },
        { title: "The Bear", homeSignal: "FX/Hulu Jun 25" },
        { title: "Tracker" },
        { title: "Abbott Elementary" },
      ],
    };
    const supportItems = getRoomSupportItems({
      items: huluRoom.items,
      featured: huluRoom.items[0],
      mutedSupportTitleKeys: new Set(),
      softMutedSupportTitleKeys: new Set(["title:the bear"]),
    });

    expect(
      supportItems.map((item) =>
        getStreamingRoomVisibleItemLabel(huluRoom, item),
      ),
    ).toEqual(["The Bear · Jun 25", "Tracker", "Abbott Elementary"]);
  });

  it("features an unshown provider signal instead of echoing the rail above it", () => {
    render(
      <StreamingRooms
        rooms={[
          {
            ...room,
            key: "hulu",
            label: "Hulu",
            items: [
              { title: "Deli Boys", homeSignal: "S2 May 28" },
              { title: "The Testaments", homeSignal: "Finale May 27" },
              { title: "Not Suitable for Work", homeSignal: "Hulu Jun 2" },
              { title: "Abbott Elementary" },
            ],
          },
        ]}
        index={8}
        cardWidth={320}
        mutedHeroTitleKeys={
          new Set(["title:deli boys", "title:the testaments"])
        }
        mutedSupportTitleKeys={
          new Set(["title:deli boys", "title:the testaments"])
        }
      />,
    );

    expect(screen.getByText("Not Suitable for Work")).toBeTruthy();
    expect(screen.getByText("Jun 2")).toBeTruthy();
    expect(screen.queryByText("Abbott Elementary")).toBeNull();
    expect(screen.queryByText("Deli Boys")).toBeNull();
    expect(screen.queryByText("The Testaments · Finale May 27")).toBeNull();

    fireEvent.press(
      screen.getByLabelText(
        "Browse Hulu. 4 titles. Not Suitable for Work · Hulu · Jun 2. Also Abbott Elementary",
      ),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/provider/[id]",
      params: {
        id: "hulu",
        featuredTitle: "Not Suitable for Work",
      },
    });
  });

  it("hides provider rooms that would only repeat already-previewed titles", () => {
    const primeRoom: ProviderRoom = {
      ...room,
      key: "prime-video",
      label: "Prime Video",
      items: [
        { title: "Spider-Noir", homeSignal: "Prime May 27" },
        { title: "The Boys", homeSignal: "S5 airing now" },
      ],
    };
    const huluRoom: ProviderRoom = {
      ...room,
      key: "hulu",
      label: "Hulu",
      items: [
        { title: "Deli Boys", homeSignal: "S2 May 28" },
        { title: "Abbott Elementary" },
      ],
    };

    render(
      <StreamingRooms
        rooms={[primeRoom, huluRoom]}
        index={8}
        cardWidth={320}
        mutedHeroTitleKeys={
          new Set(["title:spider-noir", "title:the boys"])
        }
        allowMutedFeaturedFallback={false}
      />,
    );

    expect(
      getRoomFeaturedItem(
        primeRoom.items,
        new Set(["title:spider-noir", "title:the boys"]),
        false,
      ),
    ).toBeUndefined();
    expect(screen.queryByTestId("provider-room-card-prime-video")).toBeNull();
    expect(screen.queryByText("Spider-Noir")).toBeNull();
    expect(screen.getByTestId("provider-room-card-hulu")).toBeTruthy();
    expect(screen.getByText("Deli Boys")).toBeTruthy();
  });

  it("exposes the same provider-room items that the homepage planner should score", () => {
    const huluRoom: ProviderRoom = {
      ...room,
      key: "hulu",
      label: "Hulu",
      items: [
        { title: "Deli Boys", homeSignal: "S2 May 28" },
        { title: "The Testaments", homeSignal: "Finale May 27" },
        { title: "Not Suitable for Work", homeSignal: "Hulu Jun 2" },
        { title: "Abbott Elementary" },
      ],
    };
    const previewedKeys = new Set(["title:deli boys", "title:the testaments"]);
    const featured = getRoomFeaturedItem(huluRoom.items, previewedKeys, false);
    const supportItems = getRoomSupportItems({
      items: huluRoom.items,
      featured,
      mutedSupportTitleKeys: previewedKeys,
      softMutedSupportTitleKeys: previewedKeys,
    });

    expect(featured?.title).toBe("Not Suitable for Work");
    expect(supportItems.map((item) => item.title)).toEqual(["Abbott Elementary"]);
  });

  it("describes the provider room decision context in the tap target", () => {
    expect(
      getStreamingRoomAccessibilityLabel({
        room,
        featured: room.items[0],
        supportItems: room.items.slice(1, 3),
      }),
    ).toBe(
      "Browse Netflix. 4 titles. A Good Girl's Guide to Murder · S2 · May 27. Also Nemesis, The Four Seasons",
    );
  });
});
