// Post-processes the Expo web export (dist/index.html) with the head tags
// and pre-JS boot shell that Metro's "single" output offers no hook for:
//  - dark background before the bundle parses (kills the white flash)
//  - SEO/link-preview meta (description, og:*, twitter:*)
//  - theme-color, apple-touch-icon, manifest, hi-res favicon links
//  - a static "Plotlist" boot wordmark that LaunchOverlay removes on mount
// Runs as part of `npm run build`; touches build output only.
import { readFileSync, writeFileSync } from "node:fs";

const HTML_PATH = new URL("../dist/index.html", import.meta.url);

const DESCRIPTION =
  "Plotlist is the beautiful way to keep up with television — every episode tracked, every rating remembered, every finale argued over with friends.";

const HEAD_SNIPPET = `<!-- plotlist:web-head -->
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="theme-color" content="#0D0F14" />
    <meta property="og:site_name" content="Plotlist" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Plotlist — Never lose the plot" />
    <meta property="og:description" content="Track every show you watch. Review, rate, and share with friends." />
    <meta property="og:url" content="https://plotlist.app" />
    <meta property="og:image" content="https://plotlist.app/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Plotlist — Never lose the plot" />
    <meta name="twitter:description" content="Track every show you watch. Review, rate, and share with friends." />
    <meta name="twitter:image" content="https://plotlist.app/og-image.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <style id="plotlist-boot-style">
      html, body { background-color: #0D0F14; color-scheme: dark; }
      #plotlist-boot {
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        background: #0D0F14; pointer-events: none;
      }
      #plotlist-boot-wordmark {
        color: #F1F3F7; letter-spacing: -0.8px;
        font: 900 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        opacity: 0; animation: plotlist-boot-in 300ms ease-out 250ms forwards;
      }
      @keyframes plotlist-boot-in { to { opacity: 1; } }
    </style>
<!-- /plotlist:web-head -->`;

const BODY_SNIPPET = `<!-- plotlist:web-boot --><div id="plotlist-boot"><div id="plotlist-boot-wordmark">Plotlist</div></div><!-- /plotlist:web-boot -->`;

let html = readFileSync(HTML_PATH, "utf8");

if (html.includes("plotlist:web-head")) {
  console.log("postexport-web: head snippet already present, skipping");
} else {
  if (!html.includes("</head>")) {
    throw new Error("postexport-web: dist/index.html has no </head>");
  }
  html = html.replace("</head>", `${HEAD_SNIPPET}</head>`);
  // Every substitution must land — a silent miss ships a page without the
  // boot shell or SEO title and nobody notices until production.
  if (!html.includes("<title>Plotlist</title>")) {
    throw new Error("postexport-web: expected <title>Plotlist</title> in dist/index.html");
  }
  html = html.replace(
    "<title>Plotlist</title>",
    "<title>Plotlist — Never lose the plot</title>",
  );
  if (!/<body[^>]*>/.test(html)) {
    throw new Error("postexport-web: no <body> tag in dist/index.html");
  }
  html = html.replace(/<body[^>]*>/, (tag) => `${tag}${BODY_SNIPPET}`);
  writeFileSync(HTML_PATH, html);
  console.log("postexport-web: injected head meta + boot shell into dist/index.html");
}
