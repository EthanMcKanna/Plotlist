import { Pressable, Text, View } from "react-native";
import { useQuery } from "convex/react";
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
  const episodeStats = useQuery(api.episodeProgress.getStats, me ? {} : "skip");

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
        <View className="mt-6 flex-row items-center rounded-2xl border border-dark-border bg-dark-card">
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
            value={counts?.total ?? 0}
          />
          <StatDivider />
          <StatButton
            label="Reviews"
            value={reviews}
          />
        </View>

        {/* ── Activity cards ── */}
        <View className="mt-6 flex-row gap-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/me/watchlist", params: { filter: "watching" } });
            }}
            className="flex-1 rounded-2xl border border-dark-border bg-dark-card p-4 active:bg-dark-hover"
          >
            <View className="flex-row items-center justify-between">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-green-500/15">
                <Ionicons name="eye" size={18} color="#22C55E" />
              </View>
              <Text className="text-2xl font-bold text-text-primary">
                {counts?.watching ?? 0}
              </Text>
            </View>
            <Text className="mt-2.5 text-sm text-text-tertiary">Watching</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/me/watchlist", params: { filter: "completed" } });
            }}
            className="flex-1 rounded-2xl border border-dark-border bg-dark-card p-4 active:bg-dark-hover"
          >
            <View className="flex-row items-center justify-between">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-500/15">
                <Ionicons name="checkmark-circle" size={18} color="#0ea5e9" />
              </View>
              <Text className="text-2xl font-bold text-text-primary">
                {counts?.completed ?? 0}
              </Text>
            </View>
            <Text className="mt-2.5 text-sm text-text-tertiary">Completed</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/me/watchlist", params: { filter: "dropped" } });
            }}
            className="flex-1 rounded-2xl border border-dark-border bg-dark-card p-4 active:bg-dark-hover"
          >
            <View className="flex-row items-center justify-between">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-amber-500/15">
                <Ionicons name="close-circle" size={18} color="#F59E0B" />
              </View>
              <Text className="text-2xl font-bold text-text-primary">
                {counts?.dropped ?? 0}
              </Text>
            </View>
            <Text className="mt-2.5 text-sm text-text-tertiary">Dropped</Text>
          </Pressable>
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
            <View className="mt-6 rounded-2xl border border-dark-border bg-dark-card p-4">
              <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Watch Stats
              </Text>
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
            </View>
          );
        })()}

        {/* ── Library ── */}
        <View className="mt-8">
          <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-text-tertiary">
            Library
          </Text>
          <View className="rounded-2xl border border-dark-border bg-dark-card">
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
          </View>
        </View>

        {/* ── Account ── */}
        <View className="mt-6">
          <View className="rounded-2xl border border-dark-border bg-dark-card">
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
          </View>
        </View>
      </View>
    </Screen>
  );
}
