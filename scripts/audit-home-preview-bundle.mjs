import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const distDir =
  process.env.PLOTLIST_HOME_PREVIEW_BUNDLE_DIST_DIR ??
  join(process.cwd(), "dist");
const bannedPatterns = [
  "Preview Viewer",
  "dev-home-preview",
  "dev-home-preview-user",
  "The Taste of Human Blood",
  "dev-preview-",
  "buildHomePreviewData",
  "buildDevHomeData",
  "createPreviewHomeData",
  "DEV_PREVIEW",
  "local-home-preview-user",
  "preview-user",
  "cw-poker",
  "schedule-love-island",
  "show-poker-face",
  "show-love-island-usa",
];
const requiredProductionPatterns = [
  "home-surface-list",
  "getHomeSectionTestID",
  "home-section",
  "homeSection",
  "homeSectionId",
  "home-topbar-profile",
  "home-topbar-search",
  "home-topbar-notifications",
];

async function walk(dir) {
  const entries = await readdir(dir);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry);
      const info = await stat(path);
      return info.isDirectory() ? walk(path) : path;
    }),
  );
  return files.flat();
}

const files = (await walk(distDir)).filter((file) => /\.(?:html|js|css|json)$/.test(file));
const findings = [];

for (const file of files) {
  const contents = await readFile(file, "utf8");
  for (const pattern of bannedPatterns) {
    if (contents.includes(pattern)) {
      findings.push(`${relative(process.cwd(), file)} contains ${pattern}`);
    }
  }
}

const bundleText = (
  await Promise.all(files.map((file) => readFile(file, "utf8")))
).join("\n");
for (const pattern of requiredProductionPatterns) {
  if (!bundleText.includes(pattern)) {
    findings.push(`production home bundle is missing ${pattern}`);
  }
}

if (findings.length > 0) {
  console.error("Home preview bundle audit failed:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Home preview bundle audit passed.");
