import type { ReactNode } from "react";

// Native passthrough: the real shell (sidebar, content column, tab titles)
// lives in WebShell.web.tsx so its sidebar/icon graph stays out of the
// native startup bundle. Keep the exported surface in sync with that file.
export function WebShell({ children }: { children: ReactNode }) {
  return children;
}
