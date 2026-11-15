# Trend Detector redesign: audit, decisions, IA

Statistics, verdict logic and data file contents are unchanged. Status of each item is in the last column of the audit (Done / Next).

## 1. Audit
| # | Issue | Location | Sev | Fix | Status |
|---|---|---|---|---|---|
| 1 | One 9-section page, no primary action | index.html | High | 7 hash-routed pages, one CTA on Home | Done |
| 2 | Same 4 variables / "2005–2024, 240 obs" repeated in hero, cards, footer, header | index.html | Med | State once on Data & Method; drop pills, footer list | Done |
| 3 | Domain wizard duplicates Missions, dropdown, Ranked | index.html, app.js `_renderTopicsWizard` | High | Remove wizard | Done |
| 4 | Opposites duplicates Compare/Missions | `_renderOppositesExplorer` | Med | Move to Discover › Contrasts | Done |
| 5 | Status pill looks live, is not | header | Med | Remove | Done |
| 6 | Single nav button, no active state | header | High | Sticky nav + `aria-current` (router sets it) | Done |
| 7 | 4.8 MB autoplay video, no reduced-motion | HeroTD.mp4, CSS | High | Delete video; reduced-motion rule | Done |
| 8 | Dark CSS vs light documented theme; hex in legend; muted text contrast | style.css, index.html | High | `tokens.css`, ratios verified (muted 6.6:1, accent 5.7:1) | Done |
| 9 | ~32 inline styles, 2 breakpoints | index.html | Med | Class-based, mobile-first 480/768/1100 | Done |
| 10 | Assistant: user text in innerHTML (XSS), no Esc/focus trap/aria-live/retry | app.js | High | Fixed (textContent, safeMarkdown, Esc, trap, aria-live, Retry, Enter, chips hook) | **Done** |
| 11 | Canvas charts lack text alt; no skip link; icon buttons unlabeled; colour-only encoding; map not keyboard-reachable | chart.js, map.js | High | Summary + data-table toggle; skip-link CSS; city list fallback | Done (text summary, yearly data table, skip link, city list fallback) |
| 12 | Jargon first; Learning Mode hidden | header | Med | "Plain language" switch + inline tooltips | Done |
| 13 | Export buttons compete with chart | chart header | Low | Single Export menu | Done |
| 14 | Dev instructions shown to users | pollution.js, patterns.js | Med | Friendly message + Retry; hint to console | Done |
| 15 | Duplicated data/catalogs; diverged missions/topics; dup CSV; stale READMEs | repo | High | One source: `frontend/data`, `frontend/catalogs`; CSV only in `data/raw` | **Done** |
| 16 | No `<main>`/landmarks, `lang` ok, no meta description | index.html | Med | Landmarks, meta | Done |
| 17 | Chart canvas resize causes layout shift | chart-canvas-wrapper | Low | Fixed aspect-ratio box | Done |
| 18 | Tap targets <44 px (`btn-sm`, switch) | style.css | Med | `--tap` min size | Done |
| 19 | Catalog diverged in wording and icon type (emoji vs icon id) | catalogs | Low | Kept frontend (icon ids, neutral wording) | **Done** |

## 2. Keep / Remove / Merge
- Remove video: 4.8 MB, hurts contrast and battery. Remove hero pills, footer series list, status pill: repeat facts. Remove Domain wizard: third route to same chart. Remove Observational Series showcase: moves to Data page.
- Merge Missions + Opposites + Ranked into Discover tabs: all are "ways to pick a case". Merge story + why-it-matters + confidence into one Result panel: one verdict, 3 numbers, expandable detail. Merge PI + patterns into Pollution. Exports into one menu. Learning Mode into persistent Plain-language switch.
- Keep chart + fit, map as selector, assistant as slide-over, verdict logic, caveats.

## 3. Sitemap and wireframes
```
#/home  #/explore  #/discover  #/pollution  #/compare  #/data  #/about  (+404)
```
Desktop Explore:
```
[Logo] Home Explore Discover Pollution Compare Data About   [Plain ☐] [Ask]
[Variable ▾][City ▾]                         [Export ▾]
+-----------+  RESULT  ↑ Increasing · 3 numbers · [Show the numbers]
|   map     |  +--------------------------------------+
| (+ list)  |  |  chart  (text summary, [Data table]) |
+-----------+  +--------------------------------------+
```
Mobile: bottom nav (Home, Explore, Discover, Pollution, More); stack = selectors, Result, chart, map.
Home: value prop, `[Start investigating]`, 3 missions, PI snapshot. Compare: city chips (2–4), overlay chart, trend table, neighbour caveat.

## 4. Tokens and components
Tokens: `frontend/src/css/tokens.css` (2 fonts, 4 sizes, 8-pt scale, one accent, one radius). Components: NavBar, BottomNav, Select, Tabs, ResultPanel, ChartCard (+summary, table), ExportMenu, CityMap (+list), MissionCard, TrendBadge (icon+label+colour), PlainSwitch, AssistantDrawer, EmptyState/ErrorState(Retry).

## 5. QA checklist
Lighthouse Perf/A11y ≥ 95; screenshots at 360/768/1440; keyboard-only: skip link → nav → selectors → map list → chart table → assistant (Esc closes, focus returns); `prefers-reduced-motion`; page weight < 400 KB excluding data and Leaflet.

## 6. Status (pass 2)
Built: hash-routed pages (Home, Explore, Discover, Pollution, Compare, Data & Method, About, 404), mobile bottom tab bar, sticky desktop nav, Result panel, Export menu, Plain-language switch, assistant slide-over, lazy-loaded Leaflet, remembered selection, shareable URLs. Old `app.js`, video and 1,500 lines of dark-theme CSS removed.
Verified: all test suites pass; headless Chromium loads every route at 360 and 1280 px with no script errors and no horizontal scroll.
Not yet verified: Lighthouse scores (needs network), the Leaflet map and Google Fonts (sandbox was offline), screen-reader pass.
Known leftovers: `pollution.js` and `patterns.js` still generate a few inline `style` attributes for chart colours and bar widths; the live now-cast error text repeats itself when offline.
