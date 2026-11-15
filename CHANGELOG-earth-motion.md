# Changelog — Animated Earth + deeper motion

Branch `feat/earth-bg-animations`. Visual and interaction layer only.

**Not changed:** data files, catalogs, `stats.js`, `api.js`, routing behaviour
(`router.js` handlers and hash shape), chat answering (`lib/groundedChat.js`,
`api/assistant`), export logic, location/PI math, or any scientific number.

---

## Audit — animations that already existed (extended, not duplicated)

| # | Existing motion | Where | This branch |
|---|---|---|---|
| 1 | Route leave/enter fade + translateY | `ui.js` `viewTransition`, `animations.css` | Timings → 180ms / 400ms; View Transitions API when supported; child stagger |
| 2 | Scroll reveal `data-reveal` + stagger 60ms | `ui.js` IO, `animations.css` | Added `data-reveal="card"` scale entrance; heading underline wipe |
| 3 | Hero word stagger, lead/actions/viz, spark draw | `animations.css` | Words use clip-path rise (45ms); location card scale 0.97→1 |
| 4 | Body aurora glow | `style.css` `body::before` | Unchanged; sits under starfield |
| 5 | Gauge stroke-dashoffset sweep | `animations.css` | Unchanged |
| 6 | PI / pattern bars `grow-x` | `animations.css` | Unchanged |
| 7 | Nav + tab sliding indicators | `ui.js` `slide`, `components.css` | Nav first-load 40ms stagger added |
| 8 | Count-up 900ms | `ui.js` | Unchanged |
| 9 | Chart draw-in 900ms + tooltip scale | `chart.js` | Unchanged |
| 10 | Disclosure `grid-template-rows` + chevron | `components.css` | Unchanged |
| 11 | Switch thumb overshoot | `components.css` | Unchanged |
| 12 | Skeletons shimmer 1.4s + orbit spinner | `components.css` | Unchanged |
| 13 | Map pin pop-in + selected ring | `animations.css`, `map.js` | Unchanged |
| 14 | Badge pulse + arrow nudge | `animations.css`, `components.css` | Unchanged |
| 15 | Toasts slide + progress bar | `ui.js`, `components.css` | Unchanged |
| 16 | Scroll-progress bar | `ui.js`, `components.css` | Unchanged |
| 17 | Starfield twinkle + scroll parallax | `ui.js` | Z-index moved under Earth (`--z-stars`) |
| 18 | Mascot float / blink / glide / bubble | `mascot.js`, `animations.css` | Ask-hover wiggle added; z-order above Earth |
| 19 | Card hover lift + glow | `components.css` | Spotlight `--mx/--my`; border brighten |
| 20 | Button glow / active scale | `components.css` | Sheen sweep, press 0.97, click ripple |
| 21 | Link arrow nudge 3px | `style.css` | Underline grows via `scaleX` |
| 22 | Chat drawer scale + scrim fade | `components.css` | Reinforced `panel-in` under `.motion` |
| 23 | Tooltips fade/rise | `components.css` | Unchanged |
| 24 | Typing dots | `components.css` | Unchanged |

---

## Files

| File | Change | Why |
|---|---|---|
| `frontend/src/js/earth-bg.js` | **New.** Lazy three.js globe, CSS fallback, markers, route/city camera, parallax, tilt, pause/dispose, anim toggle. | Phase 1 |
| `frontend/src/css/earth.css` | **New.** Fixed layer, vignette, route size, CSS sphere, reduced-motion/static. | Phase 1 |
| `frontend/src/img/earth/earth-day.jpg` | **New.** ~239KB day map. | Phase 1 texture |
| `frontend/src/img/earth/LICENSE.txt` | **New.** URL + NASA / three-globe notes. | License record |
| `frontend/src/css/tokens.css` | `--z-stars`, `--z-earth` | Correct stacking |
| `frontend/src/css/style.css` | Aurora z-index; link underlines; selection/scrollbars/tap | Phase 1–3 |
| `frontend/src/css/components.css` | Starfield z-index; button sheen/ripple; card spotlight; table row slide; footer toggle | Phase 1–4 |
| `frontend/src/css/animations.css` | Extended keyframes, VT rules, hero/headings/nav/footer, reduced-motion | Phase 2–4 |
| `frontend/src/js/ui.js` | Earth init/hooks; VT-aware `viewTransition`; heading IO; spotlight/ripple; Ask wiggle | Phase 1–3 |
| `frontend/src/js/main.js` | `setEarthCity` on trends/compare; credits line; earth toggle boot | Phase 1 |
| `frontend/index.html` | `earth.css` link; footer Background animation switch | Phase 1 / 4 |
| `CHANGELOG-earth-motion.md` | This file | Deliverable |

---

## Behaviour notes

- **Earth mounts once** after first paint (`requestIdleCallback` / timeout). Route changes only call `setEarthRoute` / `setEarthCity` — no recreate.
- **Z-order:** starfield (`--z-stars`) < earth (`--z-earth`) < content < nav < scrim < chat panel < mascot < toasts < progress.
- **City facing:** wired from explorer `sel.city` and compare primary city (`ids[0]`). Available via existing selection state.
- **Blur-to-sharp** on large cards was **not** implemented: hard constraint allows only transform/opacity (+ stroke-dashoffset / clip-path). Used scale + fade instead.
- **Cloud layer:** procedural canvas texture (no extra image download); skipped on low-power / mobile.
- **Lighthouse before/after:** not run in this session (needs a networked browser run). Target: ≤5 point perf drop; DPR capped at 1.5; antialias off; render pauses when hidden/off-screen.

---

## Intentionally not done / deferred

1. Full Lighthouse numeric before/after report (manual/CI needed).
2. Memory-growth DevTools profile after 20 navigations (manual).
3. Filter `blur()` card reveal (conflicts with transform/opacity-only hard rule).
4. Separate cloud JPG/PNG asset (procedural clouds used instead to stay under bandwidth budget).
5. Pre-existing `verify_frontend.js` failures (`#/about` nav alias, leftover `HeroTD.mp4`) left alone.

---

## Commits on this branch

1. Phase 1 — animated Earth background  
2. Phase 2 — page transitions and entrances  
3. Phase 3 — hover / focus / micro-interactions  
4. Phase 4 — reduced motion / data fallbacks + toggle  
5. Phase 5 — CHANGELOG (this file)
