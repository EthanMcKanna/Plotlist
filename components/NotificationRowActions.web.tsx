import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ActionSheet, type ActionSheetOption } from "./ActionSheet";
import type { NotificationRowActionsProps } from "./NotificationRowActions";

// Web has no swipe or UIContextMenu: a hover-revealed ellipsis button and a
// right-click handler open the shared ActionSheet with the same actions.
export function NotificationRowActions({
  unread,
  onToggleRead,
  onDelete,
  onMuteShow,
  onOpenSettings,
  children,
}: NotificationRowActionsProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  const options: ActionSheetOption[] = [
    {
      label: unread ? "Mark as read" : "Mark as unread",
      icon: unread ? "mail-open-outline" : "mail-unread-outline",
      onPress: onToggleRead,
    },
  ];
  if (onMuteShow) {
    options.push({ label: "Mute this show", icon: "notifications-off-outline", onPress: onMuteShow });
  }
  options.push(
    { label: "Notification settings", icon: "settings-outline", onPress: onOpenSettings },
    { label: "Delete", icon: "trash-outline", destructive: true, onPress: onDelete },
  );

  return (
    <>
      <Pressable
        {...({
          onContextMenu: (event: { preventDefault?: () => void }) => {
            event.preventDefault?.();
            setMenuVisible(true);
          },
        } as object)}
      >
        {(state) => (
          <View>
            {children}
            {(state as { hovered?: boolean }).hovered ? (
              <Pressable
                onPress={() => setMenuVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Notification options"
                {...({ title: "Notification options" } as object)}
                className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-dark-elevated web:transition-colors hover:bg-dark-hover"
              >
                <Ionicons name="ellipsis-horizontal" size={14} color="#9BA1B0" />
              </Pressable>
            ) : null}
          </View>
        )}
      </Pressable>
      <ActionSheet visible={menuVisible} onClose={() => setMenuVisible(false)} options={options} />
    </>
  );
}
