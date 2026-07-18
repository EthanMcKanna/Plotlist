import html2canvas from "html2canvas";

// TMDB's CDN only sends Access-Control-Allow-Origin when the request has an
// Origin header, and the page's plain <img> loads cache a non-CORS response
// — so html2canvas's useCORS re-fetch hits that cached entry and the
// posters get skipped. Swapping each cross-origin image to a same-origin
// blob URL for the duration of the capture sidesteps both the cache and
// canvas tainting.
async function withBlobImages<T>(
  element: HTMLElement,
  run: () => Promise<T>,
): Promise<T> {
  const images = Array.from(element.querySelectorAll("img"));
  const swaps: Array<{
    img: HTMLImageElement;
    originalSrc: string;
    originalSrcset: string;
    objectUrl: string;
  }> = [];

  await Promise.all(
    images.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
      try {
        if (new URL(src, window.location.href).origin === window.location.origin) {
          return;
        }
        const response = await fetch(src, { mode: "cors", cache: "no-store" });
        if (!response.ok) return;
        const objectUrl = URL.createObjectURL(await response.blob());
        swaps.push({
          img,
          originalSrc: img.src,
          originalSrcset: img.srcset,
          objectUrl,
        });
      } catch {
        // Leave the image untouched; it will render blank in the export
        // rather than failing the whole capture.
      }
    }),
  );

  try {
    for (const swap of swaps) {
      swap.img.srcset = "";
      swap.img.src = swap.objectUrl;
    }
    await Promise.all(
      swaps.map((swap) => swap.img.decode().catch(() => undefined)),
    );
    return await run();
  } finally {
    for (const swap of swaps) {
      swap.img.src = swap.originalSrc;
      if (swap.originalSrcset) swap.img.srcset = swap.originalSrcset;
      URL.revokeObjectURL(swap.objectUrl);
    }
  }
}

// Rasterize a rendered share card to a PNG data URI. Called with the DOM
// node behind a react-native-web View ref. react-native-view-shot's web
// backend also wraps html2canvas but hardcodes its options, so we drive it
// directly.
export async function exportCardToPngDataUri(
  node: unknown,
  options: { width: number; height: number },
): Promise<string> {
  const element = node as HTMLElement;
  if (!element || typeof element.getBoundingClientRect !== "function") {
    throw new Error("Card element is not available");
  }

  const rect = element.getBoundingClientRect();
  const scale = rect.width > 0 ? options.width / rect.width : 2;
  const rendered = await withBlobImages(element, () =>
    html2canvas(element, {
      useCORS: true,
      backgroundColor: "#0D0F14",
      scale,
      logging: false,
    }),
  );

  // Normalize to the exact export dimensions regardless of rounding.
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available");
  }
  context.drawImage(rendered, 0, 0, options.width, options.height);
  return canvas.toDataURL("image/png");
}
