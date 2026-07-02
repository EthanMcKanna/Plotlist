import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "../../lib/plotlist/api";
import { Screen } from "../../components/Screen";
import { Avatar } from "../../components/Avatar";
import { GlassPressable, GlassSurface } from "../../components/NativeGlass";
import { usePaginatedQuery, useQuery } from "../../lib/plotlist/react";

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
    <>
      <Text className="text-lg font-bold text-text-primary">{value}</Text>
      <Text className="text-xs text-text-tertiary">{label}</Text>
    </>
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

function StatDivider() {
  return <View className="w-px self-stretch bg-dark-border" />;
}

export default function ProfileTab() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const avatarUrl = useQuery(
    api.storage.getUrl,
    me?.avatarStorageId ? { storageId: me.avatarStorageId } : "skip",
  );
  const counts = useQuery(api.watchStates.getCounts, me ? {} : "skip");
  const watchStateItems = useQuery(api.watchStates.listForUser, me ? {} : "skip");
  const { results: reviewItems, status: reviewStatus } = usePaginatedQuery(
    api.reviews.listForUserDetailed,
    me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 100 },
  );
  const { results: listItems, status: listStatus } = usePaginatedQuery(
    api.lists.listForUser,
    me?._id ? { userId: me._id } : "skip",
    { initialNumItems: 100 },
  );
  const episodeStats = useQuery(api.episodeProgress.getStats, me ? {} : "skip");

  const followers = me?.countsFollowers ?? 0;
  const following = me?.countsFollowing ?? 0;
  const derivedWatchCounts = useMemo(() => {
    if (!Array.isArray(watchStateItems)) {
      return null;
    }
    return watchStateItems.reduce(
      (acc, item: any) => {
        const status = item.status as keyof typeof acc;
        if (status in acc) {
          acc[status] += 1;
        }
        acc.total += 1;
        return acc;
      },
      { watchlist: 0, watching: 0, completed: 0, dropped: 0, total: 0 },
    );
  }, [watchStateItems]);
  const effectiveCounts = derivedWatchCounts ?? {
    watchlist: counts?.watchlist ?? 0,
    watching: counts?.watching ?? 0,
    completed: counts?.completed ?? 0,
    dropped: counts?.dropped ?? 0,
    total: counts?.total ?? 0,
  };
  const reviews =
    reviewStatus === "LoadingFirstPage" ? me?.countsReviews ?? 0 : reviewItems.length;
  const listCount =
    listStatus === "LoadingFirstPage" ? me?.countsLists ?? 0 : listItems.length;

  const libraryItems: MenuItemDef[] = [
    {
      icon: "tv",
      iconBg: "bg-green-500/15",
      iconColor: "#22C55E",
      label: "My Shows",
      route: "/me/watchlist",
      count: effectiveCounts.total,
    },
    {
      icon: "bookmark",
      iconBg: "bg-brand-500/15",
      iconColor: "#0ea5e9",
      label: "Watchlist",
      route: "/me/watchlist?filter=watchlist",
      count: effectiveCounts.watchlist,
    },
    {
      icon: "list",
      iconBg: "bg-amber-500/15",
      iconColor: "#f59e0b",
      label: "Lists",
      route: "/me/lists",
      count: listCount,
    },
  ];

  const accountItems: MenuItemDef[] = [
    {
      icon: "settings-outline",
      iconBg: "bg-dark-elevated",
      iconColor: "#9BA1B0",
      label: "Settings",
      route: "/settings",
    },
  ];

  return (
    <Screen scroll hasTabBar>
      <View className="px-6 pt-6 pb-24">
        {/* ── Profile hero ── */}
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
            size={88}
          />
          <Text className="mt-3 text-xl font-bold text-text-primary">
            {me?.displayName ?? me?.name ?? "Loading..."}
          </Text>
          <Text className="mt-0.5 text-sm text-text-tertiary">
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

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/profile/${me?._id ?? ""}`);
          }}
          disabled={!me}
          className="mt-3 self-center"
        >
          <Text className="text-sm font-medium text-brand-400">
            View public profile
          </Text>
        </Pressable>

        {/* ── Stats bar ── */}
        <GlassSurface
          radius={8}
          variant="surface"
          style={{ marginTop: 24 }}
          contentStyle={{ alignItems: "center", flexDirection: "row" }}
        >
          <StatButton
            label="Followers"
            value={followers}
            onPress={() => router.push(`/followers/${me?._id ?? ""}`)}
          />
          <StatDivider />
          <StatButton
            label="Following"
            value={following}
            onPress={() => router.push(`/following/${me?._id ?? ""}`)}
          />
          <StatDivider />
          <StatButton
            label="Shows"
            value={effectiveCounts.total}
          />
          <StatDivider />
          <StatButton
            label="Reviews"
            value={reviews}
          />
        </GlassSurface>

        {/* ── Activity cards ── */}
        <View className="mt-6 flex-row gap-3">
          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/me/watchlist", params: { filter: "watching" } });
            }}
            className="flex-1"
            radius={8}
            variant="control"
            contentStyle={{ padding: 16 }}
          >
            <View className="flex-row items-center justify-between">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-green-500/15">
                <Ionicons name="eye" size={18} color="#22C55E" />
              </View>
              <Text className="text-2xl font-bold text-text-primary">
                {effectiveCounts.watching}
              </Text>
            </View>
            <Text className="mt-2.5 text-sm text-text-tertiary">Watching</Text>
          </GlassPressable>

          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/me/watchlist", params: { filter: "completed" } });
            }}
            className="flex-1"
            radius={8}
            variant="control"
            contentStyle={{ padding: 16 }}
          >
            <View className="flex-row items-center justify-between">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-500/15">
                <Ionicons name="checkmark-circle" size={18} color="#0ea5e9" />
              </View>
              <Text className="text-2xl font-bold text-text-primary">
                {effectiveCounts.completed}
              </Text>
            </View>
            <Text className="mt-2.5 text-sm text-text-tertiary">Completed</Text>
          </GlassPressable>

          <GlassPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/me/watchlist", params: { filter: "dropped" } });
            }}
            className="flex-1"
            radius={8}
            variant="control"
            contentStyle={{ padding: 16 }}
          >
            <View className="flex-row items-center justify-between">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-amber-500/15">
                <Ionicons name="close-circle" size={18} color="#F59E0B" />
              </View>
              <Text className="text-2xl font-bold text-text-primary">
                {effectiveCounts.dropped}
              </Text>
            </View>
            <Text className="mt-2.5 text-sm text-text-tertiary">Dropped</Text>
          </GlassPressable>
        </View>

        {/* ── Watch stats ── */}
        {episodeStats && episodeStats.totalEpisodes > 0 && (() => {
          const hrs = Math.floor(episodeStats.totalMinutes / 60);
          const mins = episodeStats.totalMinutes % 60;
          const days = Math.floor(hrs / 24);
          const remHrs = hrs % 24;
          const timeLabel =
            days > 0
              ? `${days}d ${remHrs}h`
              : hrs > 0
                ? `${hrs}h ${mins}m`
                : `${mins}m`;
          return (
            <GlassPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/me/watch-stats");
              }}
              className="mt-6"
              radius={8}
              variant="surface"
              contentStyle={{ padding: 16 }}
            >
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                  Watch Stats
                </Text>
                <View className="flex-row items-center gap-1">
                  <Text className="text-xs font-semibold text-brand-400">
                    Details
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#38bdf8" />
                </View>
              </View>
              <View className="flex-row">
                <View className="flex-1 items-center">
                  <Text className="text-2xl font-bold text-brand-400">
                    {episodeStats.totalEpisodes.toLocaleString()}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-tertiary">
                    Episodes
                  </Text>
                </View>
                <View className="w-px self-stretch bg-dark-border" />
                <View className="flex-1 items-center">
                  <Text className="text-2xl font-bold text-purple-400">
                    {timeLabel}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-tertiary">
                    Time Watched
                  </Text>
                </View>
                <View className="w-px self-stretch bg-dark-border" />
                <View className="flex-1 items-center">
                  <Text className="text-2xl font-bold text-green-400">
                    {episodeStats.showsWithProgress}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-tertiary">
                    Shows Tracked
                  </Text>
                </View>
              </View>
            </GlassPressable>
          );
        })()}

        {/* ── Library ── */}
        <View className="mt-8">
          <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-text-tertiary">
            Library
          </Text>
          <GlassSurface radius={8} variant="surface">
            {libraryItems.map((item, index) => (
              <Pressable
                key={item.route}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(item.route as any);
                }}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-dark-hover ${
                  index !== libraryItems.length - 1
                    ? "border-b border-dark-border"
                    : ""
                }`}
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
          </GlassSurface>
        </View>

        {/* ── Account ── */}
        <View className="mt-6">
          <GlassSurface radius={8} variant="surface">
            {accountItems.map((item) => (
              <Pressable
                key={item.route}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(item.route as any);
                }}
                className="flex-row items-center gap-3 px-4 py-3.5 active:bg-dark-hover"
              >
                <View
                  className={`h-9 w-9 items-center justify-center rounded-xl ${item.iconBg}`}
                >
                  <Ionicons name={item.icon} size={18} color={item.iconColor} />
                </View>
                <Text className="flex-1 text-base font-medium text-text-primary">
                  {item.label}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#5A6070" />
              </Pressable>
            ))}
          </GlassSurface>
        </View>
      </View>
    </Screen>
  );
}
