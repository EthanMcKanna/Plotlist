import type { ReactNode } from "react";
import * as ContextMenu from "zeego/context-menu";

export type CommentContextMenuProps = {
  deletable: boolean;
  reportable: boolean;
  onViewProfile?: () => void;
  onDelete: () => void;
  onReport: () => void;
  /** Noun used in menu item titles ("Report Comment" / "Report Review"). */
  entity?: string;
  children: ReactNode;
};

// Selections defer until the menu's dismissal animation settles — presenting
// an Alert or Modal mid-dismissal gets swallowed by UIKit.
function afterDismiss(fn: () => void) {
  return () => setTimeout(fn, 250);
}

// Long-press context menu over a comment or review row: UIContextMenu on iOS
// (the home-screen style popup with the row as its preview), a native popup
// menu on Android. Web falls back to CommentContextMenu.web.tsx.
export function CommentContextMenu({
  deletable,
  reportable,
  onViewProfile,
  onDelete,
  onReport,
  entity = "Comment",
  children,
}: CommentContextMenuProps) {
  if (!deletable && !reportable) {
    return <>{children}</>;
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Content>
        {onViewProfile ? (
          <ContextMenu.Item key="view-profile" onSelect={afterDismiss(onViewProfile)}>
            <ContextMenu.ItemTitle>View Profile</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "person.crop.circle" }} />
          </ContextMenu.Item>
        ) : null}
        {reportable ? (
          <ContextMenu.Item key="report" destructive onSelect={afterDismiss(onReport)}>
            <ContextMenu.ItemTitle>{`Report ${entity}`}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "flag" }} />
          </ContextMenu.Item>
        ) : null}
        {deletable ? (
          <ContextMenu.Item key="delete" destructive onSelect={afterDismiss(onDelete)}>
            <ContextMenu.ItemTitle>{`Delete ${entity}`}</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: "trash" }} />
          </ContextMenu.Item>
        ) : null}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
