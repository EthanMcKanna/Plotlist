import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "../../lib/plotlist/api";
import { Screen } from "../../components/Screen";
import { Avatar } from "../../components/Avatar";
import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { formatWatchTimeLabel } from "../../lib/format";
import { usePaginatedQuery, useQuery } from "../../lib/plotlist/react";
import type { WatchInsights } from "../../lib/watchInsights";

type MenuItemDef = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  sublabel?: string;
  route: string;
  count?: number;
};

function pressWithHaptic(action: () => void) {
  return () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action();
  };
}

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
    <>
      <Text className="text-lg font-bold tabular-nums text-text-primary">
        {value.toLocaleString()}
      </Text>
      <Text className="mt-0.5 text-[11px] uppercase tracking-wide text-text-tertiary">
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={pressWithHaptic(onPress)}
        className="flex-1 items-center py-3 active:opacity-70"
      >
        {content}
      </Pressable>
    );
  }
  return <View className="flex-1 items-center py-3">{content}</View>;
}

function StatDivider() {
  return <View className="my-3 w-px self-stretch bg-dark-border" />;
}

function MenuRow({ item, isLast, onPress }: { item: MenuItemDef; isLast: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={pressWithHaptic(onPress)}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-dark-hover ${
        isLast ? "" : "border-b border-dark-border"
      }`}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-xl ${item.iconBg}`}>
        <Ionicons name={item.icon} size={17} color={item.iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-medium text-text-primary">{item.label}</Text>
        {item.sublabel ? (
          <Text className="mt-0.5 text-xs text-text-tertiary">{item.sublabel}</Text>
        ) : null}
      </View>
      {item.count !== undefined && item.count > 0 ? (
        <Text className="mr-1 text-sm tabular-nums text-text-tertiary">
          {item.count.toLocaleString()}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={15} color="#5A6070" />
    </Pressable>
  );
}

export default function ProfileTab() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const avatarUrl = useQuery(
    api.storage.getUrl,
    me?.avatarStorageId ? { storageId: me.avatarStorageId } : "skip",
  );
  const utcOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);
  const insights = useQuery(
    api.watchStats.getInsights,
    me ? { utcOffsetMinutes } : "skip",
  ) as WatchInsights | undefined;

  // Warm the exact caches behind "View public profile" and the follower /
  // following screens (same query keys) so tapping through renders instantly.
  useQuery(api.users.profile, me?._id ? { userId: me._id } : "skip");
  usePaginatedQuery(
    api.follows.listFollowersDetailed,
    me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 30 },
  );
  usePaginatedQuery(
    api.follows.listFollowingDetailed,
    me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 30 },
  );

  const counts = {
    followers: me?.countsFollowers ?? 0,
    following: me?.countsFollowing ?? 0,
    shows: me?.countsTotalShows ?? 0,
    reviews: me?.countsReviews ?? 0,
    lists: me?.countsLists ?? 0,
    watchlist: me?.countsWatchlist ?? 0,
    watching: me?.countsWatching ?? 0,
    completed: me?.countsCompleted ?? 0,
  };

  const displayName = me?.displayName ?? me?.name ?? null;
  const time = insights ? formatWatchTimeLabel(insights.totals.minutes) : null;

  const libraryItems: MenuItemDef[] = [
    {
      icon: "tv",
      iconBg: "bg-green-500/15",
      iconColor: "#22C55E",
      label: "My Shows",
      sublabel: `${counts.watching.toLocaleString()} watching · ${counts.completed.toLocaleString()} completed`,
      route: "/me/watchlist",
      count: counts.shows,
    },
    {
      icon: "bookmark",
      iconBg: "bg-brand-500/15",
      iconColor: "#38BDF8",
      label: "Watchlist",
      route: "/me/watchlist?filter=watchlist",
      count: counts.watchlist,
    },
    {
      icon: "list",
      iconBg: "bg-amber-500/15",
      iconColor: "#F59E0B",
      label: "Lists",
      route: "/me/lists",
      count: counts.lists,
    },
    {
      icon: "heart",
      iconBg: "bg-rose-500/15",
      iconColor: "#FB7185",
      label: "Favorites",
      route: "/me/favorites",
    },
  ];

  return (
    <Screen scroll hasTabBar>
      <View className="px-6 pb-24 pt-4">
        {/* ── Identity ── */}
        <GlassSurface radius={16} variant="surface" contentStyle={{ padding: 20 }}>
          <Pressable
            onPress={pressWithHaptic(() => router.push(`/profile/${me?._id ?? ""}`))}
            disabled={!me}
            className="flex-row items-center gap-4 active:opacity-80"
          >
            <Avatar uri={avatarUrl} label={displayName} size={72} />
            <View className="flex-1">
              <Text className="text-xl font-black text-text-primary" numberOfLines={1}>
                {displayName ?? "Loading..."}
              </Text>
              <Text className="mt-0.5 text-sm text-text-tertiary" numberOfLines={1}>
                @{me?.username ?? "user"}
              </Text>
              <View className="mt-2 flex-row items-center gap-1">
                <Text className="text-xs font-semibold text-brand-400">
                  View public profile
                </Text>
                <Ionicons name="chevron-forward" size={11} color="#38bdf8" />
              </View>
            </View>
          </Pressable>
          {me?.bio ? (
            <Text className="mt-4 text-sm leading-5 text-text-secondary" numberOfLines={3}>
              {me.bio}
            </Text>
          ) : null}
        </GlassSurface>

        {/* ── Social ── */}
        <GlassSurface
          radius={16}
          variant="surface"
          style={{ marginTop: 12 }}
          contentStyle={{ alignItems: "center", flexDirection: "row" }}
        >
          <StatButton
            label="Followers"
            value={counts.followers}
            onPress={() => router.push(`/followers/${me?._id ?? ""}`)}
          />
          <StatDivider />
          <StatButton
            label="Following"
            value={counts.following}
            onPress={() => router.push(`/following/${me?._id ?? ""}`)}
          />
          <StatDivider />
          <StatButton label="Shows" value={counts.shows} />
          <StatDivider />
          <StatButton label="Reviews" value={counts.reviews} />
        </GlassSurface>

        {/* ── Watch stats ── */}
        {insights && insights.totals.episodes > 0 && time ? (
          <GlassPressable
            onPress={pressWithHaptic(() => router.push("/me/stats"))}
            radius={16}
            // Content-layer card: solid tinted surface, no Liquid Glass.
            variant="surface"
            fallbackColor="rgba(14,165,233,0.20)"
            borderColor="rgba(125,211,252,0.28)"
            style={{ marginTop: 12 }}
            contentStyle={{ padding: 18 }}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-bold uppercase tracking-widest text-sky-200/80">
                Watch stats
              </Text>
              <View className="flex-row items-center gap-1">
                <Text className="text-xs font-semibold text-sky-100">See all</Text>
                <Ionicons name="chevron-forward" size={13} color="#E0F2FE" />
              </View>
            </View>
            <View className="mt-3 flex-row items-end justify-between">
              <View>
                <Text className="text-3xl font-black text-white">{time.value}</Text>
                <Text className="mt-1 text-xs text-sky-100/70">watched all time</Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold text-sky-100">
                  {insights.totals.episodes.toLocaleString()} episodes
                </Text>
                <Text className="mt-0.5 text-xs text-sky-100/70">
                  {insights.streaks.current > 0
                    ? `${insights.streaks.current}-day streak`
                    : `${insights.totals.shows.toLocaleString()} shows tracked`}
                </Text>
              </View>
            </View>
          </GlassPressable>
        ) : null}

        {/* ── Library ── */}
        <View className="mt-8">
          <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-text-tertiary">
            Library
          </Text>
          <GlassSurface radius={16} variant="surface">
            {libraryItems.map((item, index) => (
              <MenuRow
                key={item.route}
                item={item}
                isLast={index === libraryItems.length - 1}
                onPress={() => router.push(item.route as any)}
              />
            ))}
          </GlassSurface>
        </View>

        {/* ── Account ── */}
        <View className="mt-6">
          <GlassSurface radius={16} variant="surface">
            <MenuRow
              item={{
                icon: "settings-outline",
                iconBg: "bg-dark-elevated",
                iconColor: "#9BA1B0",
                label: "Settings",
                route: "/settings",
              }}
              isLast
              onPress={() => router.push("/settings")}
            />
          </GlassSurface>
        </View>
      </View>
    </Screen>
  );
}
