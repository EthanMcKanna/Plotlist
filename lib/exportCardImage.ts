import { captureRef } from "react-native-view-shot";

// Native share cards go through react-native-view-shot. The .web.ts
// counterpart drives html2canvas itself; keeping the view-shot import here
// means its web backend (which statically bundles html2canvas) never enters
// the web entry chunk.
export async function captureCardToTmpFile(
  node: Parameters<typeof captureRef>[0],
  options: { width: number; height: number },
): Promise<string> {
  return await captureRef(node, {
    format: "png",
    quality: 1,
    result: "tmpfile",
    width: options.width,
    height: options.height,
  });
}

export async function exportCardToPngDataUri(
  _node: unknown,
  _options: { width: number; height: number },
): Promise<string> {
  throw new Error("exportCardToPngDataUri is web-only");
}
