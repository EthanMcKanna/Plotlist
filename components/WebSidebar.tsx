import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../lib/plotlist/api";
import { useQuery } from "../lib/plotlist/react";
import { WEB_ACTIVE_NAV_EVENT } from "../lib/useScrollToTopOnTabPress";
import {
  WEB_RAIL_WIDTH,
  WEB_SIDEBAR_WIDTH,
  type WebNavMode,
} from "../lib/webLayout";
import { AppLogo } from "./AppLogo";
import { Avatar } from "./Avatar";

type SidebarItem = {
  key: string;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  // Extra pathname prefixes that keep this item highlighted.
  matches?: string[];
};

const PRIMARY_ITEMS: SidebarItem[] = [
  {
    key: "home",
    label: "Home",
    href: "/home",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    key: "log",
    label: "Log",
    href: "/log",
    icon: "journal-outline",
    activeIcon: "journal",
  },
  {
    key: "search",
    label: "Search",
    href: "/search",
    icon: "search-outline",
    activeIcon: "search",
    matches: ["/explore", "/facet", "/provider"],
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: "calendar-outline",
    activeIcon: "calendar",
  },
  {
    key: "notifications",
    label: "Notifications",
    href: "/notifications",
    icon: "notifications-outline",
    activeIcon: "notifications",
  },
  {
    key: "friends",
    label: "Friends",
    href: "/friends",
    icon: "people-outline",
    activeIcon: "people",
  },
];

function isItemActive(item: SidebarItem, pathname: string | null) {
  if (!pathname) return false;
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }
  return (item.matches ?? []).some((prefix) => pathname.startsWith(prefix));
}

function getNotificationsBadgeLabel(count: number) {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

function SidebarRow({
  item,
  active,
  compact,
  badge,
}: {
  item: SidebarItem;
  active: boolean;
  compact: boolean;
  badge?: string | null;
}) {
  return (
    <Link href={item.href as never} asChild>
      <Pressable
        onPress={() => {
          // Re-clicking the active item scrolls the screen to top, like a
          // re-tapped native tab.
          if (active && typeof window !== "undefined") {
            window.dispatchEvent(new Event(WEB_ACTIVE_NAV_EVENT));
          }
        }}
        accessibilityLabel={item.label}
        aria-current={active ? "page" : undefined}
        testID={`web-sidebar-${item.key}`}
        // DOM tooltip for the icon-only rail; RNW passes `title` through.
        {...(compact ? { title: item.label } : null)}
        className={`flex-row items-center rounded-xl web:transition-colors ${
          compact ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5"
        } ${active ? "bg-white/10" : "hover:bg-white/5 active:bg-white/10"}`}
      >
      <View style={styles.iconSlot}>
        <Ionicons
          name={active ? item.activeIcon : item.icon}
          size={22}
          color={active ? "#38BDF8" : "#9BA1B0"}
          accessible={false}
          aria-hidden={true}
        />
        {badge ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText} accessible={false}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
        {compact ? null : (
          <Text
            numberOfLines={1}
            className={`flex-1 text-[15px] ${
              active
                ? "font-semibold text-text-primary"
                : "font-medium text-text-secondary"
            }`}
          >
            {item.label}
          </Text>
        )}
      </Pressable>
    </Link>
  );
}

// Persistent navigation for desktop web. Rendered only by the web shell —
// native never mounts this component.
export function WebSidebar({ mode }: { mode: WebNavMode }) {
  const pathname = usePathname();
  const compact = mode === "rail";
  const me = useQuery(api.users.me, {});
  const unread = Number(useQuery(api.notifications.getUnreadCount, {}) ?? 0);
  const meActive = pathname === "/profile" || pathname?.startsWith("/me/") ||
    pathname === "/settings" || pathname?.startsWith("/settings/");

  return (
    <View
      style={[
        styles.container,
        { width: compact ? WEB_RAIL_WIDTH : WEB_SIDEBAR_WIDTH },
      ]}
      testID="web-sidebar"
    >
      <Link href="/home" asChild>
        <Pressable
          accessibilityLabel="Plotlist home"
          className={`mb-6 flex-row items-center ${compact ? "justify-center" : "gap-2.5 px-3"}`}
        >
          <AppLogo size={30} />
          {compact ? null : (
            <Text className="text-[20px] font-black tracking-tight text-text-primary">
              Plotlist
            </Text>
          )}
        </Pressable>
      </Link>

      <View className="gap-1">
        {PRIMARY_ITEMS.map((item) => (
          <SidebarRow
            key={item.key}
            item={item}
            active={isItemActive(item, pathname)}
            compact={compact}
            badge={
              item.key === "notifications"
                ? getNotificationsBadgeLabel(unread)
                : null
            }
          />
        ))}
      </View>

      <View className="flex-1" />

      <Link href="/profile" asChild>
        <Pressable
          accessibilityLabel="Your profile"
          testID="web-sidebar-profile"
          {...(compact ? { title: "Your profile" } : null)}
          className={`flex-row items-center rounded-xl web:transition-colors ${
            compact ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5"
          } ${meActive ? "bg-white/10" : "hover:bg-white/5 active:bg-white/10"}`}
        >
        <Avatar
          uri={me?.avatarUrl ?? null}
          label={me?.displayName ?? me?.name ?? "Me"}
          size={28}
        />
          {compact ? null : (
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="text-[14px] font-semibold text-text-primary"
              >
                {me?.displayName ?? me?.name ?? "You"}
              </Text>
              {me?.username ? (
                <Text
                  numberOfLines={1}
                  className="text-[12px] text-text-tertiary"
                >
                  @{me.username}
                </Text>
              ) : null}
            </View>
          )}
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0A0C11",
    borderRightColor: "rgba(255,255,255,0.07)",
    borderRightWidth: StyleSheet.hairlineWidth,
    height: "100%",
    paddingBottom: 16,
    paddingHorizontal: 12,
    paddingTop: 24,
  },
  iconSlot: {
    alignItems: "center",
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  badge: {
    alignItems: "center",
    backgroundColor: "#38BDF8",
    borderRadius: 8,
    height: 15,
    justifyContent: "center",
    minWidth: 15,
    paddingHorizontal: 3,
    position: "absolute",
    right: -4,
    top: -3,
  },
  badgeText: {
    color: "#0B0D12",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
});
