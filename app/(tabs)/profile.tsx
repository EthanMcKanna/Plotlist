import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useConvex, useQuery } from "convex/react";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "../../convex/_generated/api";
import { Screen } from "../../components/Screen";
import { Avatar } from "../../components/Avatar";

type MenuItemDef = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  route: string;
  count?: number;
};

function StatButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress?: () => void;
}) {
  const content = (
    <View className="items-center">
      <Text className="text-lg font-semibold text-text-primary">{value}</Text>
      <Text className="mt-0.5 text-xs uppercase tracking-wide text-text-tertiary">
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        className="flex-1 items-center py-2 active:opacity-70"
      >
        {content}
      </Pressable>
    );
  }

  return <View className="flex-1 items-center py-2">{content}</View>;
}

function ActivityPill({
  color,
  label,
  value,
  onPress,
}: {
  color: string;
  label: string;
  value: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-row items-center gap-2 active:opacity-70"
    >
      <View
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="text-sm text-text-secondary">{label}</Text>
      <Text className="text-sm font-semibold text-text-primary">{value}</Text>
    </Pressable>
  );
}

export default function ProfileTab() {
  const convex = useConvex();
  const isScreenFocused = useIsFocused();
  const router = useRouter();
  const [episodeStats, setEpisodeStats] = useState<{
    totalEpisodes: number;
    showsWithProgress: number;
    totalMinutes: number;
  } | null>(null);
  const me = useQuery(api.users.me, isScreenFocused ? {} : "skip");
  const avatarUrl = useQuery(
    api.storage.getUrl,
    isScreenFocused && me?.avatarStorageId ? { storageId: me.avatarStorageId } : "skip",
  );
  const counts = useQuery(api.watchStates.getCounts, isScreenFocused && me ? {} : "skip");

  useEffect(() => {
    let cancelled = false;

    if (!isScreenFocused || !me) {
      setEpisodeStats(null);
      return;
    }

    void convex
      .query(api.episodeProgress.getStats, {})
      .then((stats) => {
        if (!cancelled) {
          setEpisodeStats(stats);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEpisodeStats(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [convex, isScreenFocused, me]);

  const followers = me?.countsFollowers ?? 0;
  const following = me?.countsFollowing ?? 0;
  const reviews = me?.countsReviews ?? 0;

  const libraryItems: MenuItemDef[] = [
    {
      icon: "tv",
      iconBg: "bg-green-500/15",
      iconColor: "#22C55E",
      label: "My Shows",
      route: "/me/watchlist",
      count: counts?.total,
    },
    {
      icon: "bookmark",
      iconBg: "bg-brand-500/15",
      iconColor: "#0ea5e9",
      label: "Watchlist",
      route: "/me/watchlist?filter=watchlist",
      count: counts?.watchlist,
    },
    {
      icon: "list",
      iconBg: "bg-amber-500/15",
      iconColor: "#f59e0b",
      label: "Lists",
      route: "/me/lists",
    },
  ];

  // ── Watch stats formatting ──
  let timeLabel: string | null = null;
  if (episodeStats && episodeStats.totalEpisodes > 0) {
    const hrs = Math.floor(episodeStats.totalMinutes / 60);
    const mins = episodeStats.totalMinutes % 60;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    timeLabel =
      days > 0
        ? `${days}d ${remHrs}h`
        : hrs > 0
          ? `${hrs}h ${mins}m`
          : `${mins}m`;
  }

  return (
    <Screen scroll hasTabBar>
      <View className="px-6 pt-8 pb-24">
        {/* ── Profile header ── */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/profile/${me?._id ?? ""}`);
          }}
          disabled={!me}
          className="items-center active:opacity-80"
        >
          <Avatar
            uri={avatarUrl}
            label={me?.displayName ?? me?.name}
            size={96}
            glow
          />
          <Text className="mt-4 text-2xl font-bold text-text-primary">
            {me?.displayName ?? me?.name ?? "Loading..."}
          </Text>
          <Text className="mt-1 text-sm text-text-tertiary">
            @{me?.username ?? "user"}
          </Text>
        </Pressable>

        {me?.bio ? (
          <Text
            className="mt-3 text-center text-sm leading-5 text-text-secondary"
            numberOfLines={3}
          >
            {me.bio}
          </Text>
        ) : null}

        {/* ── Stats row ── */}
        <View className="mt-8 flex-row items-center">
          <StatButton
            label="Followers"
            value={followers}
            onPress={() => router.push(`/followers/${me?._id ?? ""}`)}
          />
          <StatButton
            label="Following"
            value={following}
            onPress={() => router.push(`/following/${me?._id ?? ""}`)}
          />
          <StatButton
            label="Shows"
            value={counts?.total ?? 0}
          />
          <StatButton
            label="Reviews"
            value={reviews}
          />
        </View>

        {/* ── Activity & Watch Stats ── */}
        <View className="mt-10 rounded-2xl bg-dark-card/60 px-5 py-4">
          <View className="flex-row items-center justify-between">
            <ActivityPill
              color="#22C55E"
              label="Watching"
              value={counts?.watching ?? 0}
              onPress={() =>
                router.push({ pathname: "/me/watchlist", params: { filter: "watching" } })
              }
            />
            <ActivityPill
              color="#0ea5e9"
              label="Completed"
              value={counts?.completed ?? 0}
              onPress={() =>
                router.push({ pathname: "/me/watchlist", params: { filter: "completed" } })
              }
            />
            <ActivityPill
              color="#F59E0B"
              label="Dropped"
              value={counts?.dropped ?? 0}
              onPress={() =>
                router.push({ pathname: "/me/watchlist", params: { filter: "dropped" } })
              }
            />
          </View>

          {episodeStats && episodeStats.totalEpisodes > 0 && (
            <>
              <View className="my-3 h-px bg-dark-border/40" />
              <View className="flex-row items-center justify-between px-1">
                <View className="items-center">
                  <Text className="text-base font-semibold text-brand-400">
                    {episodeStats.totalEpisodes.toLocaleString()}
                  </Text>
                  <Text className="text-xs text-text-tertiary">Episodes</Text>
                </View>
                <View className="items-center">
                  <Text className="text-base font-semibold text-purple-400">
                    {timeLabel}
                  </Text>
                  <Text className="text-xs text-text-tertiary">Watched</Text>
                </View>
                <View className="items-center">
                  <Text className="text-base font-semibold text-green-400">
                    {episodeStats.showsWithProgress}
                  </Text>
                  <Text className="text-xs text-text-tertiary">Tracked</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Library ── */}
        <View className="mt-12 gap-1">
          {libraryItems.map((item) => (
            <Pressable
              key={item.route}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(item.route as any);
              }}
              className="flex-row items-center gap-3 rounded-2xl px-4 py-4 active:bg-dark-card"
            >
              <View
                className={`h-9 w-9 items-center justify-center rounded-xl ${item.iconBg}`}
              >
                <Ionicons name={item.icon} size={18} color={item.iconColor} />
              </View>
              <Text className="flex-1 text-base font-medium text-text-primary">
                {item.label}
              </Text>
              {item.count !== undefined && item.count > 0 ? (
                <Text className="mr-1 text-sm tabular-nums text-text-tertiary">
                  {item.count}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color="#5A6070" />
            </Pressable>
          ))}
        </View>

        {/* ── Settings ── */}
        <View className="mt-6">
          <View className="mx-4 h-px bg-dark-border/50" />
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings" as any);
            }}
            className="mt-4 flex-row items-center gap-3 rounded-2xl px-4 py-4 active:bg-dark-card"
          >
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-dark-elevated">
              <Ionicons name="settings-outline" size={18} color="#9BA1B0" />
            </View>
            <Text className="flex-1 text-base font-medium text-text-primary">
              Settings
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#5A6070" />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
