import { useCallback, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import * as ContextMenu from "zeego/context-menu";

import { useAccent } from "../lib/appearanceStore";

export type NotificationRowActionsProps = {
  unread: boolean;
  onToggleRead: () => void;
  onDelete: () => void;
  /** Present only for rows about a show the user can mute. */
  onMuteShow?: () => void;
  onOpenSettings: () => void;
  children: ReactNode;
};

const ACTION_WIDTH = 76;

// Selections defer until the menu's dismissal animation settles — presenting
// an Alert or pushing a route mid-dismissal gets swallowed by UIKit.
function afterDismiss(fn: () => void) {
  return () => setTimeout(fn, 250);
}

function SwipeAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center justify-center active:opacity-80"
      style={{ width: ACTION_WIDTH }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{ backgroundColor: color, height: 40, width: 40 }}
      >
        <Ionicons name={icon} size={19} color="#FFFFFF" />
      </View>
      <Text className="mt-1 text-[11px] font-semibold text-text-secondary">{label}</Text>
    </Pressable>
  );
}

// Swipe left for read/unread + delete (Mail-style), long-press for the full
// menu. Both surfaces drive the same callbacks; VoiceOver gets them as
// custom actions on the row itself (see NotificationRow).
export function NotificationRowActions({
  unread,
  onToggleRead,
  onDelete,
  onMuteShow,
  onOpenSettings,
  children,
}: NotificationRowActionsProps) {
  const accent = useAccent();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const run = useCallback((fn: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    swipeableRef.current?.close();
    fn();
  }, []);

  const renderRightActions = useCallback(
    () => (
      <View className="flex-row items-center pr-1">
        <SwipeAction
          icon={unread ? "mail-open-outline" : "mail-unread-outline"}
          label={unread ? "Read" : "Unread"}
          color={accent.ramp[500]}
          onPress={() => run(onToggleRead)}
        />
        <SwipeAction
          icon="trash-outline"
          label="Delete"
          color="#EF4444"
          onPress={() => run(onDelete)}
        />
      </View>
    ),
    [accent.ramp, onDelete, onToggleRead, run, unread],
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={ACTION_WIDTH * 0.6}
      friction={1.6}
      overshootRight={false}
      onSwipeableWillOpen={() => Haptics.selectionAsync()}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item key="toggle-read" onSelect={onToggleRead}>
            <ContextMenu.ItemTitle>{unread ? "Mark as Read" : "Mark as Unread"}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon
              ios={{ name: unread ? "envelope.open" : "envelope.badge" }}
            />
          </ContextMenu.Item>
          {onMuteShow ? (
            <ContextMenu.Item key="mute-show" onSelect={afterDismiss(onMuteShow)}>
              <ContextMenu.ItemTitle>Mute This Show</ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: "bell.slash" }} />
            </ContextMenu.Item>
          ) : null}
          <ContextMenu.Item key="settings" onSelect={afterDismiss(onOpenSettings)}>
            <ContextMenu.ItemTitle>Notification Settings</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "gearshape" }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="delete" destructive onSelect={onDelete}>
            <ContextMenu.ItemTitle>Delete</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "trash" }} />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    </ReanimatedSwipeable>
  );
}
