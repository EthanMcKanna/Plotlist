# Plotlist Homepage Production Readiness

This is the concise evidence log for the redesigned homepage and its freshness
pipeline.

## Release Gate

Run the full homepage release gate before shipping:

```bash
npm run check:release
```

This command runs typecheck, lint, Jest, production dependency audit, web export,
the dev-preview bundle audit, the homepage freshness summary audit, and the live
current-demand chart audit.

## Research Provenance

Homepage editorial picks are backed by `HOME_EDITORIAL_RESEARCH_SOURCES`, which
stores source labels, HTTPS URLs, and checked dates for official platform pages,
TMDB catalog data, Rotten Tomatoes, Reelgood, FlixPatrol, JustWatch, TVLine, and
streaming-watchlist research.

`tests/homeEditorialSeeds.test.ts` and `auditHomeEditorialSeeds` keep that
research auditable. They fail when picks are under-sourced, when source IDs are
unknown, when source dates drift outside the freshness window, when active
current-demand coverage loses platform or genre breadth, or when a JustWatch
daily top-10 title is missing from active current-demand seeds.

## Freshness Evidence

- Current-demand source: `https://www.justwatch.com/us/streaming-charts?ct=daily&t=shows`
- Checked-in source id: `justwatch_us_daily_streaming_charts_jul2`
- Checked at: `2026-07-02`
- Stale at: `2026-07-10`
- Current coverage target: at least 10 active current-demand titles across at
  least 5 platforms and 5 primary genres, with nonfiction/reality/news/talk
  coverage.
- Current checked-in coverage: 19 active current-demand titles across 10
  platforms, 8 primary genres, and 2 nonfiction/reality/news/talk titles.
- Current checked-in daily top 10: Widow's Bay, The Bear, I Will Find You,
  FROM, House of the Dragon, X-Men '97, Maximum Pleasure Guaranteed, Elle,
  Silo, and The Agency.
- Known same-day tail-rank jitter: the same primary top 10 has also appeared
  with Silo / The Agency swapped in positions 9 and 10.
- Known same-day primary mid-tail variant: the same primary source has also
  appeared with House of the Dragon / FROM swapped in positions 4 and 5.
- Known same-day live churn: a July 2 evening refresh replaced The Agency with
  Cape Fear at position 10. Cape Fear remains an active, source-backed
  current-demand seed, so the live audit accepts that variant without a new
  snapshot.

The release gate fails when the daily chart is stale, when the live JustWatch
top-10 order drifts outside the checked-in accepted July 2 orders (or includes
a title that is not an active source-backed current-demand seed), when source
metadata is missing, or when editorial coverage gets too thin across active
titles, platforms, primary genres, or nonfiction/reality/news/talk lanes.

The checked-in coverage minimums are the release floor. To ratchet the bar up
for a launch candidate or production incident drill, set
`PLOTLIST_HOME_MIN_CURRENT_DEMAND_TITLES`,
`PLOTLIST_HOME_MIN_ACTIVE_CURRENT_DEMAND_TITLES`,
`PLOTLIST_HOME_MIN_CURRENT_DEMAND_PLATFORMS`,
`PLOTLIST_HOME_MIN_CURRENT_DEMAND_PRIMARY_GENRES`, or
`PLOTLIST_HOME_MIN_CURRENT_DEMAND_NONFICTION_ITEMS`. These overrides can only
increase the required coverage; the audit rejects lower values so the release
gate cannot be weakened by environment drift.

## Browser QA

Use the deterministic local preview for signed-in homepage QA:

```text
http://127.0.0.1:3000/dev/home-preview?reduceMotion=1
```

Expected Browser evidence:

- The focused signed-in stack renders with `data-home-section` handles: hero,
  continue watching, schedule, taste brief, curated edit, streaming rooms,
  shelf, fresh, and pulse.
- Gesture-scroll through the homepage list until the lower sections render; the
  top discovery rails should resolve without a footer CTA or a long stack of
  redundant sections.
- Topbar actions expose stable Browser handles and accessible labels.
- Topbar route ownership stays covered by `tests/homeTopBar.test.ts`: profile,
  Search, and release calendar must push `/profile`, `/search`, and
  `/calendar` respectively. In signed-out Browser smoke, those protected routes
  may land on `/sign-in` after the auth guard runs.
- Schedule tab interaction changes the visible rail from tonight to this week.
- Console warnings/errors are empty.
- There is no framework overlay, no horizontal overflow, and no unlabeled
  controls.

Use `/home` for the signed-out auth smoke. It should redirect to `/sign-in`,
keep the phone field labeled as `Phone number`, and render without console
errors.

Latest local QA evidence:

- `2026-06-01`: simplified the `Picks` cards from a four-poster collage into a
  single lead-artwork recommendation with quieter metadata. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x844` and `1280x900`; screenshots
  were captured under local-only `output/playwright/home-polish-curated-card/`.
- Fresh Playwright load of `http://127.0.0.1:3000/home?preview=1` reported 0
  console errors and 1 known React Native web `shadow*` deprecation warning.
- Gates passed: `npm test -- --runTestsByPath
  tests/components/HomeCuratedEdits.test.tsx`, `npm run check:homepage`, and
  `npm run check`.
- `2026-06-01`: tightened the hero CTA row by making the watchlist action an
  icon-only bookmark with the same 44px touch target and full accessibility
  label. Verified on `http://127.0.0.1:3000/home?preview=1` at `390x844`;
  screenshots were captured under local-only
  `output/playwright/home-polish-hero-save/`.
- Fresh Playwright load after the hero CTA pass reported 0 console errors and 1
  known React Native web `shadow*` deprecation warning.
- `2026-06-01`: removed the redundant visible `TONIGHT` badge from the active
  Tonight schedule card while preserving future date badges in the This week
  rail and the full card accessibility label. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x844`; screenshots were captured
  under local-only `output/playwright/home-polish-schedule-badge/`.
- `2026-06-01`: removed the visible `New` freshness pill from Continue
  watching cards so the first viewport shows one episode chip per resume card.
  The full release-aware resume context remains in the accessibility label.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x844`; screenshots
  were captured under local-only `output/playwright/home-polish-continue-badge/`.
- `2026-06-01`: simplified `Where to watch` cards by relying on the provider
  logo instead of repeating the provider name in card text, while preserving the
  provider name in the tap target label and falling back to visible text when a
  logo is unavailable. Verified on `http://127.0.0.1:3000/home?preview=1` at
  `390x844`; screenshots were captured under local-only
  `output/playwright/home-polish-streaming-room/`.
- `2026-06-01`: trimmed `Where to watch` provider cards to one visible lead
  title per card, with additional provider titles retained in the accessibility
  label and provider detail screen. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x844`, including horizontal
  scroll states; screenshots were captured under local-only
  `output/playwright/home-polish-provider-leads/`.
- `2026-06-01`: simplified the taste brief into a single `Watch next` lead card
  instead of a three-card mini shortlist, so the following `Picks`, `Where to
  watch`, `For you`, `New`, and `Trending` sections each carry one clear job.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x844` and
  `1280x900`; screenshots were captured under local-only
  `output/playwright/home-polish-watch-next/`.
- `2026-06-01`: removed the visible count badges from the `Schedule` tabs while
  retaining count and selected-state details in each tab accessibility label.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x844`;
  screenshots were captured under local-only
  `output/playwright/home-polish-schedule-tabs/`.
- `2026-06-01`: quieted the `Picks` rail further by removing visible per-card
  intent labels such as `Trending`, `New`, `Critics`, and `Quick`. Cards now
  show only the lead title, metadata, artwork, and icon action; the intent label
  remains in the accessibility label. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x844`; screenshots were
  captured under local-only `output/playwright/home-polish-picks-labels/`.
- `2026-06-01`: refreshed current-demand coverage for a same-day JustWatch edge
  variant that returned FROM, Off Campus, Your Friends & Neighbors, Rick and
  Morty, The Boys, World War II with Tom Hanks, Condor, The Madison, Invincible,
  and Pluribus. Added official/provenance sources for the newly covered titles
  and kept the live audit strict for any order outside the accepted June 1 set.
- `2026-06-01`: tightened the fallback surface audit after the same-day chart
  refresh so all primary June 1 daily-chart titles remain represented when live
  catalog rails are empty. Normalized JustWatch chart signal copy and expanded
  the current-demand audit sample before de-duping.
- `2026-06-01`: final local QA pass on `http://127.0.0.1:3000/home?preview=1`
  at `390x844` confirmed the simplified first viewport and quieted `Picks`
  rail; screenshots were captured under local-only
  `output/playwright/home-polish-final-qa/`. Gates passed: `npm run check:homepage`
  and `npm run check`.
- `2026-06-01`: removed the duplicate visible calendar action from the
  `Schedule` section header because the top bar already owns that shortcut.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x844`;
  screenshots were captured under local-only `output/playwright/home-polish-next-10/`.
- `2026-06-01`: removed duplicate poster captions from loading/fallback poster
  cards, so the lower `New` rail no longer repeats title and date copy inside
  and below the same card while artwork resolves. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x3000`; screenshots were
  captured under local-only `output/playwright/home-polish-next-11/`.
- `2026-06-01`: hid the visible episode code on premiere schedule cards when
  the `PREMIERE` badge already carries the launch context, while preserving the
  full episode code in the card accessibility label. Focused Jest coverage
  passed, Browser attach still timed out in the in-app Browser, and Playwright
  CLI fallback screenshots confirmed the cleaner schedule card at `390x1400`
  under local-only `output/playwright/home-polish-next-12/`.
- `2026-06-01`: tightened compact homepage metadata so airing-season signals
  render as terse `S9 now` copy instead of `S9 airing now` on narrow cards,
  while keeping source `homeSignal` values intact for provenance and ranking.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x3000` and
  `1280x1000`; Browser attach still timed out in the in-app Browser, so
  screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-13/`.
- `2026-06-01`: removed the redundant visible arrow from `Picks` cards because
  the whole recommendation card already acts as the open target. The card keeps
  its full accessibility label and now reads visually as artwork, title, and
  compact metadata only. Verified on `http://127.0.0.1:3000/home?preview=1` at
  `390x3000` and `1280x1600`; Browser attach still timed out in the in-app
  Browser, so screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-14/`.
- `2026-06-01`: removed the redundant visible arrow from the `Watch next` lead
  card because the whole card already acts as the open target. The card keeps
  its full accessibility label and now reads visually as artwork, title, and
  compact metadata only. Verified on `http://127.0.0.1:3000/home?preview=1` at
  `390x1800` and `1280x1600`; Browser attach still timed out in the in-app
  Browser, so screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-15/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay.
- `2026-06-01`: removed the redundant visible arrow from `Where to watch`
  provider cards because the full provider card is already the browse target.
  Provider cards now rely on artwork, logo, the featured title, and compact
  signal copy only, while preserving the full provider accessibility label and
  tap behavior. Verified on `http://127.0.0.1:3000/home?preview=1` at
  `390x2600` and `1280x1900`; Browser attach still timed out in the in-app
  Browser, so screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-16/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay.
- `2026-06-01`: removed the visible hero eyebrow chip from the signed-in
  homepage hero because the adjacent metadata already carries the useful
  freshness context, such as `Crime · Prime May 27`. The lead heading keeps the
  full accessibility label, including release context, while the visual hero now
  opens with title, metadata, and direct actions only. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x1400` and `1280x1000`; Browser
  attach still timed out in the in-app Browser, so screenshots were captured
  with Playwright CLI under local-only `output/playwright/home-polish-next-17/`.
  A separate fresh-context `http://127.0.0.1:3000/home` Playwright check reached
  the signed-out gate after the app boot wait with no framework overlay.
- `2026-06-01`: removed visible schedule status pills such as `PREMIERE` and
  `FINALE` from schedule cards because the title/provider line is enough for the
  homepage scan state. The full episode code and release context remain in the
  card accessibility label. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x1400` and `1280x1400`; Browser
  attach still timed out in the in-app Browser, so screenshots were captured
  with Playwright CLI under local-only `output/playwright/home-polish-next-18/`.
  A separate fresh-context `http://127.0.0.1:3000/home` Playwright check reached
  the signed-out gate after the app boot wait with no framework overlay.
- `2026-06-01`: softened the Continue watching mark-watched control from a
  bright filled check into a dark outlined control, keeping the 44px tap target
  and full accessibility label while reducing first-viewport visual noise.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x1600` and
  `1280x1200`; Browser attach still timed out in the in-app Browser, so
  screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-19/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. Gates passed:
  `npm test -- --runTestsByPath tests/components/ContinueWatchingRail.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: removed empty remote-logo frames from `Where to watch` provider
  cards by making provider identity text-first. The cards now render a compact
  provider label, featured title, and signal without waiting on logo imagery,
  while preserving the full provider tap target and accessibility label.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x2200` and
  `1280x1400`; Browser attach still timed out in the in-app Browser, so
  screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-20/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. The same pass accepted a
  live same-day JustWatch variant where Rick and Morty entered the daily top 10
  after verifying that title is already source-covered. Gates passed:
  `npm test -- --runTestsByPath tests/homeCurrentDemandAuditScript.test.ts
  tests/components/StreamingRooms.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`, `npm run check:homepage`, and
  `npm run check`.
- `2026-06-01`: removed duplicate fallback-owned caption copy from the
  `Watch next` lead card so loading or failed artwork states no longer stack a
  hidden artwork caption under the real card title and metadata. The fallback
  still kept only its decorative mark at that point, while the card body remains
  the single visible copy source. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x2400` and
  `1280x1400`; Browser attach still timed out in the in-app Browser, so
  screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-21/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. Gates passed:
  `npm test -- --runTestsByPath tests/components/HomeTasteBrief.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: removed decorative TV icon boxes from `For you`, `Trending`,
  and poster-card fallback artwork in shared signature rails. Missing or
  loading art now stays as quiet gradient space behind the single title/metadata
  layer, reducing repeated fallback chrome on the homepage while preserving the
  complete card accessibility labels. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x2600` and `1280x1500`;
  Browser attach still timed out in the in-app Browser, so screenshots were
  captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-22/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. Gates passed:
  `npm test -- --runTestsByPath tests/components/SignatureRail.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: removed the remaining decorative sparkle mark from the
  `Watch next` fallback artwork so failed or loading art uses the same quiet
  gradient treatment as the lower rails. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x2600` and `1280x1500`;
  Browser attach still timed out in the in-app Browser, so screenshots were
  captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-23/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. Gates passed:
  `npm test -- --runTestsByPath tests/components/HomeTasteBrief.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: removed the centered initials mark from Continue watching
  fallback artwork so resume cards keep the episode chip, title, subtitle,
  progress, and mark-watched control without an extra artwork badge. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x2600` and `1280x1500`;
  Browser attach still timed out in the in-app Browser, so screenshots were
  captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-24/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. Gates passed:
  `npm test -- --runTestsByPath tests/components/ContinueWatchingRail.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: removed the boxed sparkle/initial mark and fallback signal badge
  from the homepage hero fallback art, leaving the fallback as quiet atmosphere
  behind the real hero title, metadata, CTAs, and carousel dots. Verified on
  `http://127.0.0.1:3000/home?preview=1` at `390x3000` and `1280x1700`;
  Browser attach still timed out in the in-app Browser, so screenshots were
  captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-25/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. Gates passed:
  `npm test -- --runTestsByPath tests/components/HeroCarousel.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: changed the hero primary CTA from `Details` with a play icon to
  the more literal `Open` action with an open icon, matching the existing
  accessibility label and avoiding the implication that Plotlist plays the show.
  Verified on `http://127.0.0.1:3000/home?preview=1` at `390x1600` and
  `1280x1200`; Browser attach still timed out in the in-app Browser, so
  screenshots were captured with Playwright CLI under local-only
  `output/playwright/home-polish-next-26/`. A separate fresh-context
  `http://127.0.0.1:3000/home` Playwright check reached the signed-out gate
  after the app boot wait with no framework overlay. Gates passed:
  `npm test -- --runTestsByPath tests/components/HeroCarousel.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: tightened Schedule card release copy so premiere/finale cards
  show one compact signal line such as `Premiere · Netflix` instead of
  provider-only copy. This keeps the minimal card shape but makes the visible
  release reason as clear as the accessibility label. Browser attach still timed
  out in the in-app Browser, so Playwright CLI fallback checked
  `http://127.0.0.1:3000/home?preview=1` at `390x1600` and `1280x1200`, clicked
  `This week`, and captured screenshots under local-only
  `output/playwright/home-polish-next-27/`. The fallback reported no page
  errors or bad responses, with the existing React Native Web `shadow*`
  deprecation warning still present. Gates passed:
  `npm test -- --runTestsByPath tests/components/TonightStrip.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: moved the shared `PrimaryButton` glow from deprecated web
  `shadow*` props to `boxShadow` while keeping native shadow props on iOS/Android.
  This clears the remaining homepage Browser QA warning without changing the
  visible button treatment used by the contact-sync/home bundle. Browser attach
  still timed out in the in-app Browser, so Playwright CLI fallback rechecked
  `http://127.0.0.1:3000/home?preview=1` at `390x1600` and `1280x1200`, clicked
  `This week`, and captured screenshots under local-only
  `output/playwright/home-polish-next-28/`. The fallback reported zero console
  warnings/errors, zero page errors, and zero bad responses. Gates passed:
  `npm test -- --runTestsByPath tests/components/PrimaryButton.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts
  tests/suppressWarnings.test.ts`, `npm run check:homepage`, and
  `npm run check`.
- `2026-06-01`: normalized homepage metadata rhythm so dated signals render as
  separate compact beats, e.g. `Netflix · May 29`, `S2 · May 28`, and
  `Paramount+ · May 15`, across hero, Watch next, Picks, Where to watch,
  For you, Trending, and New cards. This keeps the copy minimal while making
  provider/date and release/date context easier to scan. Browser attach still
  timed out in the in-app Browser, so Playwright CLI fallback rechecked
  `http://127.0.0.1:3000/home?preview=1` at `390x1800` and `1280x1400`, clicked
  `This week`, scrolled the homepage list to the lower rails, and captured
  screenshots under local-only `output/playwright/home-polish-next-29/`. The
  fallback reported zero console warnings/errors, zero page errors, and zero
  bad responses. Focused gates passed:
  `npm test -- --runTestsByPath tests/homeDisplayMeta.test.ts
  tests/components/HeroCarousel.test.tsx tests/components/SignatureRail.test.tsx
  tests/components/HomeTasteBrief.test.tsx
  tests/components/HomeCuratedEdits.test.tsx
  tests/components/StreamingRooms.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`, `npm run check:homepage`, and
  `npm run check`.
- `2026-06-01`: shortened chart/trending display signals on compact home cards,
  so `Chart mover` now renders as `Rising` and `JustWatch chart #8` renders as
  `JustWatch #8` while preserving the raw source/provenance strings for audits
  and ranking. Browser attach still timed out in the in-app Browser with
  `Timed out waiting for the Browser webview to attach for this browser-use page`,
  so Playwright CLI fallback rechecked
  `http://127.0.0.1:3000/home?preview=1` at `390x1800` and `1280x1400`,
  clicked `This week`, scrolled the lower homepage rails, and captured focused
  Trending rail screenshots under local-only
  `output/playwright/home-polish-next-30/`. The fallback reported zero console
  warnings/errors, zero page errors, zero bad responses, visible `Rising` and
  `JustWatch #8`, and no visible `Chart mover` or `JustWatch chart #` text.
  The freshness gate passed against checked-in source
  `justwatch_us_daily_streaming_charts_jun1` with live chart updated at
  `2026-06-01T17:23:14.14Z`. Gates passed:
  `npm test -- --runTestsByPath tests/homeDisplayMeta.test.ts
  tests/components/SignatureRail.test.tsx tests/components/HomeTasteBrief.test.tsx
  tests/components/HomeCuratedEdits.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`, `npm run check:homepage`, and
  `npm run check`.
- `2026-06-01`: quieted future schedule date badges from all-caps copy such as
  `TUESDAY, JUN 2` to the existing human date label, e.g. `Tuesday, Jun 2`,
  with a softer text weight. The full date remains in the schedule card
  accessibility label. Browser attach still timed out in the in-app Browser with
  `Timed out waiting for the Browser webview to attach for this browser-use page`,
  so Playwright CLI fallback rechecked
  `http://127.0.0.1:3000/home?preview=1` at `390x1800` and `1280x1400`, clicked
  `This week`, and captured schedule screenshots under local-only
  `output/playwright/home-polish-next-31/`. The fallback reported visible
  `Tuesday, Jun 2`, no visible `TUESDAY, JUN 2`, zero console warnings/errors,
  zero page errors, and zero bad responses. The freshness gate passed against
  checked-in source `justwatch_us_daily_streaming_charts_jun1` with live chart
  updated at `2026-06-01T17:23:14.14Z`. Gates passed:
  `npm test -- --runTestsByPath tests/components/TonightStrip.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: simplified the visible Continue watching episode chips from
  padded codes such as `S02 · E07` to compact viewer-facing labels such as
  `S2 E7`, while preserving the canonical padded episode code in card
  accessibility labels and mark-watched actions. Browser attach still timed out
  in the in-app Browser with
  `Timed out waiting for the Browser webview to attach for this browser-use page`,
  so Playwright CLI fallback rechecked
  `http://127.0.0.1:3000/home?preview=1` at `390x1400` and `1280x1200` and
  captured first-viewport screenshots under local-only
  `output/playwright/home-polish-next-32/`. The fallback reported visible
  `S2 E7` and `S2 E4`, no visible padded `S02 · E07` or `S02 · E04` chip text,
  zero console warnings/errors, zero page errors, and zero bad responses. The
  freshness gate passed against checked-in source
  `justwatch_us_daily_streaming_charts_jun1` with live chart updated at
  `2026-06-01T17:23:14.14Z`. Gates passed:
  `npm test -- --runTestsByPath tests/components/ContinueWatchingRail.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`,
  `npm run check:homepage`, and `npm run check`.
- `2026-06-01`: removed the visible orange notification dot from the topbar
  calendar action so the first viewport reads as profile, brand, search, and
  calendar only. The action still routes to `/calendar`, keeps its 44px touch
  target, and preserves the release count in the accessibility label, e.g.
  `Release calendar, 2 upcoming releases`. Browser attach still timed out in
  the in-app Browser with
  `Timed out waiting for the Browser webview to attach for this browser-use page`,
  so Playwright CLI fallback rechecked
  `http://127.0.0.1:3000/home?preview=1` at `390x900` and `1280x900` and
  captured first-viewport screenshots under local-only
  `output/playwright/home-polish-next-33/`. The fallback reported the calendar
  accessibility count intact, zero console warnings/errors, zero page errors,
  and zero bad responses. The same pass accepted a live same-day JustWatch
  variant where Rick and Morty entered rank 8 ahead of Hacks and Your Friends &
  Neighbors after confirming the titles are already source-covered. The
  freshness gate passed against checked-in source
  `justwatch_us_daily_streaming_charts_jun1` with live chart updated at
  `2026-06-01T17:23:14.14Z`. Gates passed:
  `npm test -- --runTestsByPath tests/homeTopBar.test.ts
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts
  tests/homePreviewBundleAuditScript.test.ts tests/homeCurrentDemandAuditScript.test.ts
  tests/homeEditorialSeeds.test.ts`, `npm run check:homepage`, and
  `npm run check`.
- `2026-06-01`: tightened the homepage's web heading hierarchy without adding
  visible copy or chrome. The hero remains the single `h1`; repeated homepage
  section headers now render as `h2` on React Native Web while keeping the same
  native `accessibilityRole="header"` labels. Browser attach still timed out in
  the in-app Browser with
  `Timed out waiting for the Browser webview to attach for this browser-use page`,
  so Playwright fallback rechecked
  `http://127.0.0.1:3000/home?preview=1` at `390x844` and `1440x1000` with
  screenshots under local-only `output/playwright/home-polish-next-34/`. The
  fallback found exactly 1 `h1` and 8 `h2` headings, no framework overlay, zero
  console warnings/errors, zero page errors, and zero bad responses; it also
  clicked the Schedule `This week` tab and verified `This week, 1 release,
  selected` with the week rail visible. The same pass accepted the live
  JustWatch rank-six variant where Rick and Morty moved ahead of Off Campus,
  The Four Seasons, Your Friends & Neighbors, and Hacks; the live chart was
  updated at `2026-06-02T01:22:55.851Z`. Date-only calendar tests were frozen
  to `2026-06-01T12:00:00.000Z` so the June 2 regression fixtures keep proving
  date formatting rather than becoming `Tonight` when the local day advances.
  Gates passed: `npm test -- --runTestsByPath
  tests/components/HomeSectionHeader.test.tsx tests/homeSurfaceRender.test.ts
  tests/components/HomeTasteBrief.test.tsx`, `npm test -- --runTestsByPath
  tests/homeCurrentDemandAuditScript.test.ts tests/homeEditorialSeeds.test.ts`,
  `npm test -- --runTestsByPath tests/components/CalendarScreen.test.tsx
  tests/components/ReleaseCalendarPreview.test.tsx`, `npm run
  check:homepage`, and approved unsandboxed `npm run check` after sandboxed
  Jest hit `tsx` IPC `listen EPERM` on `/var/folders/.../tsx-*.pipe`.
- `2026-06-01`: softened the Continue watching mark-watched control again so
  the first viewport keeps a 44px action target without a bright cyan badge
  competing with the card title. Browser successfully attached to
  `http://127.0.0.1:3000/home?preview=1`, found the signed-in homepage DOM with
  empty console logs, clicked the Schedule `This week` tab, and verified the
  week rail was visible with `This week, 1 release, selected`. The Browser
  screenshot write hit a local `EPERM`, so Playwright saved mobile and desktop
  evidence under local-only `output/playwright/home-polish-next-35/`. The same
  Playwright pass found exactly one `h1`, eight `h2` section headings, no
  framework overlay, zero console warnings/errors, zero page errors, zero bad
  responses, and both visible mark-watched actions measuring 44px by 44px.
  Focused gates passed: `npm test -- --runTestsByPath
  tests/components/ContinueWatchingRail.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`. The homepage freshness gate passed with
  `npm run check:homepage` after the sandboxed run hit the known `tsx` IPC
  `listen EPERM`; the unsandboxed current-demand audit accepted the live
  `2026-06-02T01:22:55.851Z` chart update against checked-in source
  `justwatch_us_daily_streaming_charts_jun1`. A separate exact-route Browser
  smoke of `http://127.0.0.1:3000/home` redirected to `/sign-in`, found one
  `Phone number` field, reported empty Browser warn/error logs, and showed no
  framework overlay.
- `2026-06-02`: flattened the `Schedule` tabs from a boxed segmented control to
  a quiet baseline/underline pattern, keeping the same tab roles, selected
  state, count-aware accessibility labels, and 44px touch targets. Browser
  initially attached to `http://127.0.0.1:3000/home?preview=1`, found the
  signed-in homepage DOM, clicked the Schedule `This week` tab, verified
  `This week, 1 release, selected` with the week rail visible, and reported
  empty warn/error logs. Follow-up Browser screenshots saved mobile and desktop
  evidence to local-only `/private/tmp/plotlist-home-polish-next-36/`, and the
  computed style showed the tablist had only a bottom rule, with top/left/right
  borders at `0px`. After the Browser runtime rotated, final screenshot
  recapture was blocked by `ERR_BLOCKED_BY_CLIENT`; the final code additionally
  removed the temporary web focus box in favor of the same underline language.
  Focused gates passed: `npm test -- --runTestsByPath
  tests/components/TonightStrip.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`. The same pass refreshed the current-demand
  audit for a June 2 live JustWatch variant containing already covered titles:
  Spider-Noir, Widow's Bay, Euphoria, The Boroughs, The Four Seasons, Off
  Campus, Rick and Morty, Your Friends & Neighbors, FROM, and Hacks. The
  homepage freshness gate passed with `npm run check:homepage`; the live
  current-demand audit reported chart metadata updated at
  `2026-06-03T01:22:04.487Z`.
- `2026-06-02`: made image-backed poster cards in the lower `New` and
  `Trending` signature rails self-contained, moving the title and compact
  metadata into the poster frame instead of rendering a second caption block
  under each card. Browser QA on
  `http://127.0.0.1:3000/dev/home-preview?reduceMotion=1` found all expected
  signed-in section handles, exactly one `h1`, eight `h2` section headings, no
  framework overlay, no horizontal overflow, and empty warn/error logs after
  clicking the `This week` schedule tab. The lower rail screenshot was saved to
  local-only `/private/tmp/plotlist-home-polish-next-37/lower-poster-rail.jpeg`.
  A separate exact-route Browser smoke of `http://127.0.0.1:3000/home`
  redirected to `/sign-in`, found the phone input with `aria-label="Phone
  number"`, reported empty warn/error logs, and showed no framework overlay.
  Focused gates passed: `npm test -- --runTestsByPath
  tests/components/SignatureRail.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`. The homepage freshness gate passed with
  `npm run check:homepage`; the live current-demand audit reported chart
  metadata updated at `2026-06-03T01:22:04.487Z`. The full project gate also
  passed with `npm run check`: typecheck, lint, and 78 Jest suites / 863 tests.
- `2026-06-02`: made the `Picks` cards self-contained too, replacing the
  separate artwork band plus caption body with one artwork surface, bottom
  scrim, and a single title/metadata layer. The rail card height dropped from
  190px to 164px in Browser while preserving the same card tap target and full
  curated-edit accessibility label. Browser QA on
  `http://127.0.0.1:3000/dev/home-preview?reduceMotion=1` found all expected
  signed-in section handles, exactly one `h1`, eight `h2` section headings, no
  framework overlay, no horizontal overflow, and empty warn/error logs after
  clicking the `This week` schedule tab. The `Picks` screenshot was saved to
  local-only `/private/tmp/plotlist-home-polish-next-38/picks-rail.jpeg`. A
  separate exact-route Browser smoke of `http://127.0.0.1:3000/home` redirected
  to `/sign-in`, found the phone input with `aria-label="Phone number"`, and
  reported empty warn/error logs. Focused gates passed: `npm test --
  --runTestsByPath tests/components/HomeCuratedEdits.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`. The homepage
  freshness gate passed with `npm run check:homepage`; the live current-demand
  audit reported chart metadata updated at `2026-06-03T01:22:04.487Z`. The
  full project gate also passed with `npm run check`: typecheck, lint, and 78
  Jest suites / 863 tests.
- `2026-06-02`: made `Where to watch` provider cards self-contained, replacing
  the image band plus padded body and left accent rail with one artwork surface,
  bottom scrim, and provider/title/signal copy on the card. The first provider
  card height dropped from 207px to 172px in Browser while preserving provider
  identity, the featured title, compact signal copy, provider routing, and the
  full support-title accessibility label. Browser QA on
  `http://127.0.0.1:3000/dev/home-preview?reduceMotion=1` found all expected
  signed-in section handles, exactly one `h1`, eight `h2` section headings, no
  framework overlay, no horizontal overflow, and empty warn/error logs after
  clicking the `This week` schedule tab. The `Where to watch` screenshot was
  saved to local-only
  `/private/tmp/plotlist-home-polish-next-39/where-to-watch-rail.jpeg`. A
  separate exact-route Browser smoke of `http://127.0.0.1:3000/home` redirected
  to `/sign-in`, found the phone input with `aria-label="Phone number"`, and
  reported empty warn/error logs. Focused gates passed: `npm test --
  --runTestsByPath tests/components/StreamingRooms.test.tsx
  tests/homeSurfaceRender.test.ts tests/homeSurfaceCopy.test.ts`. The homepage
  freshness gate passed with `npm run check:homepage`; the live current-demand
  audit reported chart metadata updated at `2026-06-03T01:22:04.487Z`. The
  full project gate also passed with `npm run check`: typecheck, lint, and 78
  Jest suites / 863 tests.
- `2026-06-02`: tightened the lower feature rails so `For you` and `Trending`
  no longer read like a second hero stack. Feature cards now use a 204px height
  with slightly smaller title, padding, badge, and metadata spacing while
  preserving the same artwork surface, tap target, rank badge, and full
  accessibility label. This keeps the lower page visually quieter and closer to
  the compact `New` rail without removing the editorial image context. Focused
  coverage added `feature-card-*` handles and asserts the compact feature-card
  height in `tests/components/SignatureRail.test.tsx`.
- `2026-06-02`: removed the remaining loaded-state caption overlay from poster
  cards in the lower `New` rail so poster artwork stands on its own instead of
  repeating title and metadata copy already baked into the key art. Missing or
  failed poster artwork still renders the fallback title and compact metadata,
  and every card keeps the full title/context in its accessibility label.
  Browser QA on
  `http://127.0.0.1:3000/dev/home-preview?reduceMotion=1` found exactly one
  `h1`, eight `h2` section headings, no framework overlay, empty warn/error
  logs, zero loaded `poster-caption-*` overlays, and four visible poster images
  in the `New` rail. Screenshot evidence was saved to local-only
  `/private/tmp/plotlist-home-polish-next-42/poster-rail-preview-no-captions.jpeg`.
  A separate exact-route Browser smoke of `http://127.0.0.1:3000/home`
  redirected to `/sign-in`, found one phone input, and reported empty warn/error
  logs. Focused gates passed: `npm test -- --runTestsByPath
  tests/components/SignatureRail.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`. The homepage freshness gate passed with
  `npm run check:homepage`; the live current-demand audit reported chart
  metadata updated at `2026-06-03T01:22:04.487Z`. The full project gate also
  passed with `npm run check`: typecheck, lint, and 78 Jest suites / 864 tests.
- `2026-06-02`: quieted the shared homepage section heading rhythm so repeated
  section titles render at 20px / 800 weight / 25px line height instead of the
  previous 22px black treatment. The hero remains the single large `h1`, while
  `Continue watching`, `Schedule`, `Watch next`, `Picks`, `Where to watch`,
  `For you`, `Trending`, and `New` keep their `h2` semantics and full
  accessibility labels. Browser QA on
  `http://127.0.0.1:3000/dev/home-preview?reduceMotion=1` found exactly one
  `h1`, eight `h2` section headings, no framework overlay, empty warn/error
  logs, and computed section-heading styles of `20px`, weight `800`, and
  `25px` line height. Screenshot evidence was saved to local-only
  `/private/tmp/plotlist-home-polish-next-43/calmer-headings-top.jpeg` and
  `/private/tmp/plotlist-home-polish-next-43/calmer-headings-mid.jpeg`. Browser
  interaction clicked the `This week` schedule tab and verified
  `This week, 1 release, selected`; a separate exact-route smoke of
  `http://127.0.0.1:3000/home` redirected to `/sign-in`, found one phone input,
  and reported empty warn/error logs. Focused gates passed: `npm test --
  --runTestsByPath tests/components/HomeSectionHeader.test.tsx
  tests/components/HomeTasteBrief.test.tsx tests/homeSurfaceRender.test.ts
  tests/homeSurfaceCopy.test.ts`. The homepage freshness gate passed with
  `npm run check:homepage`; the live current-demand audit reported chart
  metadata updated at `2026-06-03T01:22:04.487Z`. The full project gate also
  passed with `npm run check`: typecheck, lint, and 78 Jest suites / 864 tests.

## Production Safety

- `app/dev/home-preview.tsx` is development-only and blocked from production
  Metro bundles.
- `npm run audit:home-preview-bundle` fails if preview-only identifiers leak
  into `dist`, or if production homepage Browser handles such as
  `home-surface-list`, `home-section-*`, or topbar actions disappear from the
  web export.
- Generated release and QA artifacts stay local-only via `.gitignore`:
  `dist/`, `.playwright-cli/`, `.expo/`, and `.vercel/`.
- `/api/internal/cron/homepage-feed-refresh` runs every 3 hours, emits a compact
  structured summary log on every run, and escalates separate warning/error
  action-item logs when freshness or catalog rails need intervention.
