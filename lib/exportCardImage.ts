// Native platforms capture share cards with react-native-view-shot directly
// (see app/me/stats-share.tsx shareCard). This module exists for its .web.ts
// counterpart — Metro resolves that file on web, so html2canvas never enters
// the native bundle.
export async function exportCardToPngDataUri(
  _node: unknown,
  _options: { width: number; height: number },
): Promise<string> {
  throw new Error("exportCardToPngDataUri is web-only");
}
