import { Alert, Pressable } from "react-native";

import type { CommentContextMenuProps } from "./CommentContextMenu";

// Web has no native context menu, so long-press keeps the Alert flow.
export function CommentContextMenu({
  deletable,
  reportable,
  onDelete,
  onReport,
  entity = "Comment",
  children,
}: CommentContextMenuProps) {
  if (!deletable && !reportable) {
    return <>{children}</>;
  }

  const showOptions = () => {
    if (deletable) {
      onDelete();
      return;
    }
    Alert.alert(`${entity} options`, undefined, [
      { text: "Cancel", style: "cancel" },
      { text: `Report ${entity.toLowerCase()}`, style: "destructive", onPress: onReport },
    ]);
  };

  return (
    <Pressable onLongPress={showOptions} delayLongPress={350}>
      {children}
    </Pressable>
  );
}
