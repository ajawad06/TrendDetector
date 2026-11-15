# Changelog — "Deep Space Observatory" redesign

Branch `redesign/deep-space`. Visual and interaction layer only.

**Not changed:** data files, catalogs, `stats.js` (Mann-Kendall, Sen's slope, confidence levels),
`api.js`, `router.js`, the chat backend (`lib/groundedChat.js`, `api/`), `server.js`, the Python
backend, and every number or scientific statement shown. `git diff main` is empty for all of those paths.
Test suites: statistics 384/384, integrity 7758/7758, router + escaping, live PI all pass.

Commits are one per phase. Phases 1–6 were built together and split by file, so the app is
runnable from the Phase 6 commit onward, not at each intermediate commit.

---

## Files

| File | Change | Reason |
|---|---|---|
| `frontend/src/css/tokens.css` | Rewritten. Colours, type, spacing, radii, shadows, motion, layers. | Phase 1: single source of truth. Replaces the cream/olive theme and its `prefers-color-scheme` dark variant with one dark theme. |
| `frontend/src/css/style.css` | Rewritten. Reset, typography, `.container`, section spacing, grids, page sections (hero, your city, explorer, compare, About). | Phase 2: layout and alignment system. |
| `frontend/src/css/components.css` | New. Navbar, tab bar, buttons, cards, badges, inputs, switch, chips, tabs, tooltips, callouts, disclosures, tables, skeletons, toasts, states, footer, map, chat panel, mascot. | Phase 3/4/5: one component stylesheet used by every route. |
| `frontend/src/css/animations.css` | New. Keyframes, motion utilities, reduced-motion rules. | Phase 6. |
| `frontend/src/css/pollution.css` | Rewritten with tokens; same class names. | Pollution Index and Minor patterns sections now match the system. |
| `frontend/index.html` | New fonts, stylesheet links, navbar with switch, loading skeleton, About in the mobile tab bar, chat panel structure, toast region, scroll-progress bar. | Phases 1, 3, 4. |
| `frontend/src/js/main.js` | Page templates rewritten (markup only). Added hero sparkline, gauge, stat cards, About layout, mascot and transition wiring. Analysis calls, export, location, compare and chat request code are unchanged. | Phases 2–6. |
| `frontend/src/js/ui.js` | New. Reveal, count-up, sliding indicators, disclosures, toasts, scroll progress, starfield, route transition, scrollspy, icon set. | Phase 6. |
| `frontend/src/js/mascot.js` | New. Original inline SVG + glide loop. | Phase 5. |
| `frontend/src/js/util.js` | `safeMarkdown` extended to headings, lists, tables, code, quotes. Still escape-first. | Phase 4: raw markdown was shown to users. |
| `frontend/src/js/chart.js` | Colours and fonts from tokens, mono axis labels, rounded tooltip, draw-in and tooltip fade. Scales and data handling unchanged. | Phase 3/6. |
| `frontend/src/js/map.js` | Darkened tiles, marker pop-in classes. | Known issue: bright map. |
| `frontend/src/js/pollution.js` | Token names (`--aq-*`, `--chart-*`), mono canvas labels, heading levels, loading skeleton. | Phase 1/3. |
| `frontend/src/js/patterns.js` | Heading levels and class names only. | Phase 3. |
| `CHANGELOG.md` | New. | Requested. |

No files were deleted.

---

## Known issues: status

Each was checked in the running app first. "Not reproduced" means the current code did not show
the bug as described (the screenshots looked like an older build), but the fix is in place anyway.

### Home
- [x] **"Start investigating" washed out.** Not reproduced on `main`. Now `--on-primary` dark text on `--primary` green in default, hover, active, focus and disabled (10.9:1 computed from the two token values).
- [x] **Two competing bright buttons.** Reproduced ("Start investigating" and "Use my location" were both primary). One primary; "Compare cities" and "Use my location" are outlined.
- [x] **Stat cards misaligned.** Reproduced (they were a loose flex list). Now three cards with the same four rows (label / value + unit on one baseline / badge / caption), rows shared through `subgrid`, equal heights, mono tabular numerals, same padding.
- [x] **Dense methodology footnote.** Reproduced. Now a collapsed "How is this calculated?" disclosure, small text, 68ch; the PM2.5 link is a proper text link with an arrow.
- [x] **Featured missions uneven / overflowing.** Overflow not reproduced on `main`. Now `repeat(auto-fit, minmax(260px, 1fr))`, stretch, `min-width: 0`, wrapping titles, footer pinned to the bottom.
- [x] **"Most polluted city" touching the cards above.** Reproduced. Now its own section with `--section-gap`, and a card: city, status badge (Moderate = amber), large index value, caption, "See the full ranking" link with arrow.

### Trends
- [x] **Headline colliding with badges.** Reproduced. Result header is a vertical stack: badges row (wraps, 8px gap) / headline (`text-wrap: balance`, line-height 1.2) / metrics.
- [x] **Tabs clipped.** Reproduced at 360–390px. Single row, `nowrap`, horizontal scroll with edge fades on both sides, 44px tap height, sliding indicator, active tab scrolled into view.
- [x] **Bright map tiles.** Reproduced. See "Deviations" below for why this is the CSS-filter route and not CARTO.
- [x] **Metrics not aligned.** Reproduced. Equal three-column grid, mono numbers, muted units below, confidence as a chip with a 3-segment meter. Below 480px the three become stacked value | unit rows, because "dimensionless" does not fit a 90px column without breaking mid-word.
- [x] **"A trend shows what changed, not why"** is a callout with an info border and icon.
- [x] **"Show the numbers"** is an animated disclosure with a chevron. It now stays open when you change city or variable.
- [x] **Chart header:** title left, Export right, vertically centred.
- [x] **Filter row:** labels above, 44px controls, aligned, two columns that stack below 480px.

### Chat panel
- [x] **Chips overlapping messages / third chip cut / Send clipped.** Chips have their own non-shrinking row that scrolls sideways with an edge fade. Input row is `grid 1fr auto`; Send has an icon, a label and a minimum width.
- [x] **Raw markdown shown.** Reproduced (`###` headings). Headings, lists, bold, italics, tables, code and quotes now render and are styled.

### About
- [x] Text-first page: 68ch column, lead paragraph with badge, sticky table of contents with scrollspy (dropdown below 1024px), section anchor links, "Trend does not mean cause" callout, datasets table, numbered pipeline stepper, glossary as a definition list, Limitations, Credits and licenses.

---

## Wording changes (flagged)

No scientific statement or number was changed. These are the only text edits:

| Where | Before | After | Why |
|---|---|---|---|
| Home, smoke card | "Daily smoke equivalent — breathing the past year's average air is like smoking this many." | Label "Daily smoke equivalent", caption "Breathing the past year's average air is like smoking this many." | Split into label and caption for the card structure. |
| Home, life card | "Life expectancy at risk if this level of air lasted a lifetime, compared with the WHO guideline." | Label "Life expectancy at risk", caption "If this level of air lasted a lifetime, compared with the WHO guideline." | Same. |
| Home, smoke and life cards | value read "≈ 2.8 cigarettes a day" as one bold string | value "≈ 2.8", unit "cigarettes a day", plus an "Estimate" pill | Value and unit on one baseline. "Estimate" repeats what the footnote already says ("Estimates, not medical advice"). |
| Home, index card | — | "Live" pill when the value comes from the live now-cast | The caption already said so; the pill makes it scannable. |
| Home, most polluted | "Lahore: Moderate" / "Highest Pollution Index in the latest month (38.7 on a 0 to 100 scale)." | "Lahore" + "Moderate" badge + "38.7 / 100" / "Highest Pollution Index in the latest month, on a 0 to 100 scale." | The value moved out of the sentence into the big number. |
| Home, hero card | — | "{variable}, {city}", "Yearly average ({unit})", "Open in the explorer" | New mini trend visual. Uses the last series you viewed; plain yearly means of the real monthly values. |
| Home | — | "How is this calculated?", "Your city" eyebrow | Disclosure label; section label. |
| Compare | city picker had an invisible label "Choose 2 to 4 cities" | same words, now visible | Label above the control. |
| Chat | typing text "Checking the observation record…" | three animated dots; the same sentence is kept for screen readers | Requested typing indicator. |
| Chat header | "Close" button | × icon, `aria-label="Close assistant"`; subtitle "Answers use only this dataset" | Icon-only control with a label; subtitle repeats the greeting. |
| Export | — | toast "Download started" | Feedback for the action. |
| About | section "AI disclosure" kept; "Source code" line moved into Credits | — | Grouping. |
| About, glossary | learning terms only | adds the four variable definitions from `data/metadata.json` (existing text) | Requested PM2.5 / AOD / NO2 terms without writing new claims. |
| About, credits | — | new list: data source, Open-Meteo, Leaflet + OpenStreetMap, BigDataCloud, fonts (SIL OFL 1.1), mascot and icons (original) | Requested section. Only attributions of what the code already uses. |
| Mascot | — | bubble "Ask me about any city" | Requested. |

---

## Deviations from the brief, and why

1. **Map basemap.** CARTO Dark Matter was implemented first. Its tiles came back stamped
   "API KEY REQUIRED" on localhost, so the map now uses the brief's stated fallback: OpenStreetMap
   tiles with `invert(1) hue-rotate(180deg) brightness(.9) contrast(.9)` on the tile pane only.
2. **Mascot glide below about 1380px.** The 20%–80% glide with sine weave runs only when there is
   an empty gutter right of the 1200px container wide enough to hold it. On narrower screens a
   gliding mascot would sit on top of content and inputs, which the brief also forbids, so there it
   rests as a corner launcher (above the bottom tab bar on phones) and keeps the tilt, flame and
   float. It can still overlap whatever is under that corner while you scroll; pages have bottom
   padding so the last content always scrolls clear of it.
3. **No `marked` + DOMPurify.** The existing renderer was already escape-first (every character of
   the reply is HTML-escaped before any tag is added, and no attribute or URL is built from input).
   Extending it covers the requested markdown without two new network dependencies. Links in
   replies are deliberately not turned into anchors.
4. **"Animate only transform and opacity".** Followed for everything that moves. Three items the
   brief itself specifies use other paint-only properties: colour on hover (item 7), the focus ring
   growing 0 → 3px via `box-shadow` (item 11), and disclosure height via `grid-template-rows`
   (item 10). Glows are opacity on a pseudo-element.
5. **Heading font preload.** The Space Grotesk stylesheet is preloaded and loaded first. The font
   file itself is not preloaded because Google's file URLs are versioned and change.
6. **Plain language switch restored.** It was removed from `main` in commit `75f5996`. The brief
   lists it as a feature to keep and to restyle, so the earlier logic was put back unchanged
   (`td:plain` in localStorage, swaps the labels in "Show the numbers"). One line in `boot()` and
   the `<label class="switch">` in `index.html` remove it again if that was intentional.
7. **About added to the mobile tab bar.** On phones About was reachable only from the footer.
8. **Focus after closing the chat** returns to whichever control opened it (mascot or the navbar
   "Ask" button), which is the expected dialog behaviour, rather than always to the mascot.
9. **"Ask" in the navbar is hidden below 480px**, where the mascot is the launcher, so the brand
   and switch fit at 360px.
10. **Light theme removed.** The previous build was light by default with a dark variant; the brief
    specifies one dark theme.

---

## QA

Checked in the running app with a script that visits every route and reports any element outside
the viewport, any clipped button/badge/heading, any card row with unequal heights, and whether the
mascot touches the bottom nav.

| Width | Home | Trends (5 tabs) | Pollution | Compare | About | 404 |
|---|---|---|---|---|---|---|
| 360 | ok | ok | ok | ok | ok | ok |
| 390 | ok | ok | ok | ok | ok | ok |
| 768 | ok | ok | ok | ok | ok | ok |
| 1024 | ok | ok | ok | ok | ok | ok |
| 1440 | ok | ok | ok | ok | ok | ok |

(768 first failed: the brand was squeezed in the navbar. Fixed by tightening link padding 768–900px.)

- **Contrast.** 867 visible text nodes across 10 routes (chat panel open on Home) measured against
  their composited background at 1440px: no failures, lowest ratio 5.2:1 (trend badge arrows).
  Not covered by that script: text drawn on canvas (chart axis labels use `--text-2`), the map
  tiles, and the seasonal heatmap cells (dark text on the band colour at variable opacity).
  Control borders use `--border-ui` (3.2:1+ on every surface, computed).
- **Lighthouse.** A run was started but had not finished when this was written, so there are no
  performance or accessibility scores to report yet.
- **Keyboard.** Order: skip link, brand, nav, switch, Ask, page, footer, mascot. Mascot opens the
  chat with Enter/Space; focus moves to the input; Tab wraps inside the panel; Escape closes and
  returns focus to the mascot. Nothing inside the closed panel or a closed disclosure is focusable.
  No unlabeled buttons or links; no image without `alt`.
- **Console.** Clean on every route.
- **Behaviour unchanged.** Charts, city select, location card states, Plain language, Export menu,
  compare picker and live chat answers were exercised after the change.

### Not verified, or verified only partly
- **Reduced motion** could not be switched on in the test browser. Checked instead: with the
  `motion` class off, nothing on Home stays hidden; the CSS and JS paths for
  `prefers-reduced-motion` were read through. Worth one manual check with the OS setting on.
- **Slow-network throttling** was not run. Loading states (boot skeleton, city card skeleton, live
  card skeleton, map shimmer) were seen only at normal speed.
- **"Use my location"** was tested through its empty, picker and loaded states. The browser
  permission prompt itself was not exercised.
- **Pre-existing test failures**, unrelated and left alone: `frontend/tests/verify_frontend.js`
  expects a nav link to `#/about` (the app links to `#/data`) and expects `HeroTD.mp4` to be
  deleted (it is unused but still in the repo). The "Plain-language switch present" check in the
  same file was failing on `main` and now passes.
