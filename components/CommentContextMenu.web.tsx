import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ActionSheet, type ActionSheetOption } from "./ActionSheet";
import type { CommentContextMenuProps } from "./CommentContextMenu";

// Web has no UIContextMenu, so the row gets two pointer-native entry points
// instead: a hover-revealed ellipsis button in the top-right corner, and a
// right-click (contextmenu) handler. Both open the shared ActionSheet with
// the same actions the native menu offers.
export function CommentContextMenu({
  deletable,
  reportable,
  onViewProfile,
  onDelete,
  onReport,
  entity = "Comment",
  children,
}: CommentContextMenuProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  if (!deletable && !reportable) {
    return <>{children}</>;
  }

  const options: ActionSheetOption[] = [];
  if (onViewProfile) {
    options.push({
      label: "View Profile",
      icon: "person-circle-outline",
      onPress: onViewProfile,
    });
  }
  if (reportable) {
    options.push({
      label: `Report ${entity}`,
      icon: "flag-outline",
      destructive: true,
      onPress: onReport,
    });
  }
  if (deletable) {
    options.push({
      label: `Delete ${entity}`,
      icon: "trash-outline",
      destructive: true,
      onPress: onDelete,
    });
  }

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
                accessibilityLabel={`${entity} options`}
                {...({ title: `${entity} options` } as object)}
                className="absolute right-0 top-2 h-7 w-7 items-center justify-center rounded-full bg-dark-elevated web:transition-colors hover:bg-dark-hover"
              >
                <Ionicons name="ellipsis-horizontal" size={14} color="#9BA1B0" />
              </Pressable>
            ) : null}
          </View>
        )}
      </Pressable>
      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        options={options}
      />
    </>
  );
}
