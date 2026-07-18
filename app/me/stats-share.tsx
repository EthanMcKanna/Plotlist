import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import { exportCardToPngDataUri } from "../../lib/exportCardImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/EmptyState";
import { GlassPressable } from "../../components/NativeGlass";
import { Screen } from "../../components/Screen";
import {
  STORY_CARD_BASE_HEIGHT,
  STORY_CARD_BASE_WIDTH,
  TopGenreCard,
  TopShowCard,
  YearHeroCard,
} from "../../components/StatsShareCards";
import { api } from "../../lib/plotlist/api";
import { notifyError } from "../../lib/dialogs";
import { useAuth, useQuery } from "../../lib/plotlist/react";
import type { WatchInsights } from "../../lib/watchInsights";
import { SHOW_BACK_BUTTON, useIsDesktopWeb } from "../../lib/webLayout";

// Story exports are 1080×1920; the on-screen preview is the same drawing at a
// smaller width, so captures always match what the user saw.
const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const CAN_SHARE_IMAGE = Platform.OS !== "web";

// Desktop-web-only hover arrows: mice can't swipe the pager.
function PagerArrow({
  direction,
  onPress,
}: {
  direction: 1 | -1;
  onPress: () => void;
}) {
  const label = direction === 1 ? "Next card" : "Previous card";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(Platform.OS === "web" ? { title: label } : null)}
      className="opacity-85 hover:opacity-100"
      style={{
        alignItems: "center",
        backgroundColor: "rgba(13,15,20,0.85)",
        borderColor: "rgba(255,255,255,0.14)",
        borderRadius: 20,
        borderWidth: 1,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        height: 40,
        justifyContent: "center",
        position: "absolute",
        top: "50%",
        transform: [{ translateY: -20 }],
        width: 40,
        zIndex: 5,
        ...(direction === 1 ? { right: 16 } : { left: 16 }),
      }}
    >
      <Ionicons
        name={direction === 1 ? "chevron-forward" : "chevron-back"}
        size={20}
        color="#F1F3F7"
      />
    </Pressable>
  );
}

export default function StatsShareScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const utcOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);
  const insights = useQuery(
    api.watchStats.getInsights,
    isAuthenticated ? { utcOffsetMinutes } : "skip",
  ) as WatchInsights | undefined;
  const me = useQuery(api.users.me) as { username?: string | null } | undefined;

  const isDesktopWeb = useIsDesktopWeb();
  const [page, setPage] = useState(0);
  const [pagerSize, setPagerSize] = useState<{ width: number; height: number } | null>(null);
  const [pagerHovered, setPagerHovered] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const cardRefs = useRef<Record<string, View | null>>({});
  const pagerRef = useRef<ScrollView>(null);

  if (isLoading || (isAuthenticated && !insights)) {
    return (
      <Screen webMaxWidth={null}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38bdf8" />
        </View>
      </Screen>
    );
  }

  if (!isAuthenticated || !insights) {
    return (
      <Screen webMaxWidth={null}>
        <View className="flex-1 justify-center px-6">
          <EmptyState
            title="Sign in to share your stats"
            description="Your year-so-far cards are built from your watch history."
          />
        </View>
      </Screen>
    );
  }

  // A client can briefly run against a worker that predates yearToDate.
  const ytd = insights.yearToDate as WatchInsights["yearToDate"] | undefined;
  const username = me?.username ?? null;
  const cards = !ytd
    ? []
    : [
    ytd.episodes > 0
      ? {
          key: "year",
          render: (width: number) => (
            <YearHeroCard ytd={ytd} width={width} username={username} />
          ),
        }
      : null,
    ytd.topShows.length > 0
      ? {
          key: "show",
          render: (width: number) => (
            <TopShowCard ytd={ytd} width={width} username={username} />
          ),
        }
      : null,
    ytd.topGenres.length > 0
      ? {
          key: "genre",
          render: (width: number) => (
            <TopGenreCard ytd={ytd} width={width} username={username} />
          ),
        }
      : null,
  ].filter((card): card is NonNullable<typeof card> => card !== null);

  if (!ytd || cards.length === 0) {
    return (
      <Screen webMaxWidth={null}>
        <View className="flex-1 justify-center px-6">
          <EmptyState
            title="Nothing to share yet"
            description={`Mark episodes watched and your ${ytd?.year ?? new Date().getFullYear()} cards will build themselves.`}
          />
        </View>
      </Screen>
    );
  }

  const cardAspect = STORY_CARD_BASE_HEIGHT / STORY_CARD_BASE_WIDTH;
  const cardWidth = pagerSize
    ? Math.floor(Math.min(pagerSize.width - 56, (pagerSize.height - 16) / cardAspect))
    : 0;

  const goToPage = (index: number) => {
    if (!pagerSize) return;
    const next = Math.max(0, Math.min(cards.length - 1, index));
    pagerRef.current?.scrollTo({ x: next * pagerSize.width, animated: true });
    setPage(next);
  };

  const shareCard = async () => {
    const activeCard = cards[Math.min(page, cards.length - 1)];
    const node = cardRefs.current[activeCard.key];
    if (!node || isSharing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSharing(true);
    try {
      let uri: string;
      try {
        uri = await captureRef(node, {
          format: "png",
          quality: 1,
          result: "tmpfile",
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
        });
      } catch {
        Alert.alert("Couldn't create the image", "Please try again.");
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: "Share your Plotlist stats",
        }).catch(() => {
          // Dismissing the sheet is not an error.
        });
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Web can't hand the image to a share sheet, but it can download it.
  // exportCardToPngDataUri drives html2canvas with useCORS so the TMDB
  // posters actually render into the capture (react-native-view-shot's web
  // wrapper doesn't expose that option).
  const downloadCard = async () => {
    const activeCard = cards[Math.min(page, cards.length - 1)];
    const node = cardRefs.current[activeCard.key];
    if (!node || isSharing) return;
    setIsSharing(true);
    try {
      const dataUri = await exportCardToPngDataUri(node, {
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
      });
      const anchor = globalThis.document.createElement("a");
      anchor.href = dataUri;
      anchor.download = `plotlist-${ytd.year}-so-far.png`;
      anchor.click();
    } catch {
      notifyError("Couldn't create the image", "Please try again.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Screen webMaxWidth={null}>
      <View className="flex-1" style={{ paddingBottom: insets.bottom + 16 }}>
        {/* Header */}
        <View className="flex-row items-center gap-3 px-6 pt-2">
          {SHOW_BACK_BUTTON ? (
            <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              radius={20}
              variant="control"
              contentStyle={{
                alignItems: "center",
                height: 40,
                justifyContent: "center",
                width: 40,
              }}
            >
              <Ionicons name="chevron-back" size={20} color="#F1F3F7" />
            </GlassPressable>
          ) : null}
          <View>
            <Text className="text-2xl font-black text-text-primary">
              {ytd.year} so far
            </Text>
            <Text className="text-xs text-text-tertiary">
              {cards.length > 1
                ? Platform.OS === "web"
                  ? "Click through the cards · "
                  : "Swipe between cards · "
                : ""}
              made to post
            </Text>
          </View>
        </View>

        {/* Pager */}
        <View
          className="flex-1"
          style={{ marginTop: 12 }}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            if (width > 0 && height > 0) setPagerSize({ width, height });
          }}
          {...(isDesktopWeb
            ? ({
                onMouseEnter: () => setPagerHovered(true),
                onMouseLeave: () => setPagerHovered(false),
              } as Record<string, unknown>)
            : null)}
        >
          {pagerSize && cardWidth > 0 ? (
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const next = Math.round(
                  event.nativeEvent.contentOffset.x / pagerSize.width,
                );
                if (next !== page) {
                  setPage(next);
                  Haptics.selectionAsync();
                }
              }}
              // Web browsers don't emit momentum-scroll events, so the dots
              // track the live scroll position instead.
              onScroll={
                Platform.OS === "web"
                  ? (event) => {
                      const next = Math.round(
                        event.nativeEvent.contentOffset.x / pagerSize.width,
                      );
                      if (next !== page && next >= 0 && next < cards.length) {
                        setPage(next);
                      }
                    }
                  : undefined
              }
              scrollEventThrottle={Platform.OS === "web" ? 64 : undefined}
            >
              {cards.map((card) => (
                <View
                  key={card.key}
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    width: pagerSize.width,
                  }}
                >
                  {/* Rounded preview frame; the captured child stays full-bleed. */}
                  <View
                    style={{
                      borderColor: "rgba(255,255,255,0.1)",
                      borderCurve: "continuous",
                      borderRadius: 20,
                      borderWidth: 1,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      ref={(node) => {
                        cardRefs.current[card.key] = node;
                      }}
                      collapsable={false}
                    >
                      {card.render(cardWidth)}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {isDesktopWeb && pagerHovered && page > 0 ? (
            <PagerArrow direction={-1} onPress={() => goToPage(page - 1)} />
          ) : null}
          {isDesktopWeb && pagerHovered && page < cards.length - 1 ? (
            <PagerArrow direction={1} onPress={() => goToPage(page + 1)} />
          ) : null}
        </View>

        {/* Dots */}
        {cards.length > 1 ? (
          <View className="flex-row items-center justify-center gap-1.5 py-4">
            {cards.map((card, index) => {
              const dotStyle = {
                backgroundColor:
                  index === page ? "#38BDF8" : "rgba(255,255,255,0.18)",
                borderRadius: 3,
                height: 6,
                width: index === page ? 18 : 6,
              };
              // Dots double as page buttons on web; native keeps them inert.
              return Platform.OS === "web" ? (
                <Pressable
                  key={card.key}
                  onPress={() => goToPage(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to card ${index + 1}`}
                  hitSlop={6}
                  style={dotStyle}
                />
              ) : (
                <View key={card.key} style={dotStyle} />
              );
            })}
          </View>
        ) : (
          <View style={{ height: 16 }} />
        )}

        {/* Share */}
        {CAN_SHARE_IMAGE ? (
          <View className="px-6">
            <GlassPressable
              onPress={shareCard}
              disabled={isSharing}
              accessibilityRole="button"
              accessibilityLabel="Share this card"
              radius={14}
              variant="prominent"
              contentStyle={{
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                justifyContent: "center",
                paddingVertical: 15,
              }}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#E0F2FE" />
              ) : (
                <Ionicons name="share-outline" size={17} color="#E0F2FE" />
              )}
              <Text className="text-[15px] font-bold text-sky-100">
                {isSharing ? "Preparing…" : "Share card"}
              </Text>
            </GlassPressable>
          </View>
        ) : (
          <View className="px-6">
            <GlassPressable
              onPress={downloadCard}
              disabled={isSharing}
              accessibilityRole="button"
              accessibilityLabel="Download this card as an image"
              radius={14}
              variant="prominent"
              contentStyle={{
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                justifyContent: "center",
                paddingVertical: 15,
              }}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#E0F2FE" />
              ) : (
                <Ionicons name="download-outline" size={17} color="#E0F2FE" />
              )}
              <Text className="text-[15px] font-bold text-sky-100">
                {isSharing ? "Preparing…" : "Download image"}
              </Text>
            </GlassPressable>
          </View>
        )}
      </View>
    </Screen>
  );
}
