/**
 * Trend Detector — presentation behaviours (no data, statistics or routing logic).
 * Scroll reveal, count-up, sliding indicators, disclosures, toasts, scroll progress,
 * starfield, Earth background, route transition, scrollspy.
 * Everything animates transform/opacity only (plus stroke-dashoffset / clip-path where needed).
 */
import { esc } from './util.js';
import { initEarthBg, setEarthRoute, setEarthCity, setEarthAnimEnabled, isEarthAnimEnabled } from './earth-bg.js';
export { setEarthRoute, setEarthCity, setEarthAnimEnabled, isEarthAnimEnabled };

const root = document.documentElement;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => motionQuery.matches;
const lowPower = () => (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2 || !!navigator.connection?.saveData;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOut = (t) => 1 - (1 - t) ** 3;

/* ---------- icons (plain strokes drawn for this project) ---------- */
const ICONS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17v.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  smoke: '<path d="M3 15h13v4H3zM19 15v4M21.5 15v4"/><path d="M18 11c0-2 2.5-2 2.5-4S18 5 18 3"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M4 13h4l1.5-3 2.5 5 1.5-2H20"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>',
};
export const icon = (name, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------- small markup helpers shared by the page templates ---------- */
export const callout = (html, kind = '', attrs = '') =>
  `<div class="callout ${kind}" ${attrs}>${icon(kind.includes('warn') || kind.includes('error') ? 'warn' : 'info')}<div>${html}</div></div>`;
let discSeq = 0;
export const disclosure = (label, bodyHtml, open = false) => {
  const id = `disc-${++discSeq}`;
  return `<div class="disc${open ? ' is-open' : ''}"><button class="disc-btn" type="button" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${id}">${esc(label)}${icon('chevron')}</button>
    <div class="disc-panel" id="${id}"><div><div class="disc-body">${bodyHtml}</div></div></div></div>`;
};

/* ---------- toasts (16) ---------- */
export function toast(message, kind = '') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `${icon(kind === 'error' ? 'warn' : 'check')}<span>${esc(message)}</span><i class="toast-bar" aria-hidden="true"></i>`;
  host.appendChild(t);
  const close = () => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 180); };
  setTimeout(close, 4000);
  t.addEventListener('click', close);
}

/* ---------- sliding indicators: nav (7) and tabs ---------- */
const memo = new Map();
function slide(ind, target, key) {
  if (!ind) return;
  if (!target || !target.offsetWidth) { ind.style.setProperty('--w', 0); return; }
  const x = target.offsetLeft, w = target.offsetWidth, prev = key && memo.get(key);
  if (prev && !ind.dataset.placed) {          // re-rendered: start from where the indicator was, then slide
    ind.classList.add('no-anim');
    ind.style.setProperty('--x', `${prev.x}px`); ind.style.setProperty('--w', prev.w);
    void ind.offsetWidth; ind.classList.remove('no-anim');
  } else if (!ind.dataset.placed) { ind.classList.add('no-anim'); requestAnimationFrame(() => ind.classList.remove('no-anim')); }
  ind.dataset.placed = '1';
  ind.style.setProperty('--x', `${x}px`); ind.style.setProperty('--w', w);
  if (key) memo.set(key, { x, w });
}
function placeNav() {
  const nav = document.querySelector('.nav-links');
  if (nav) slide(nav.querySelector('.nav-ind'), nav.querySelector('a.is-active'), null);
}
function placeTabs(scope = document) {
  scope.querySelectorAll('.tabs').forEach((tabs) => {
    let ind = tabs.querySelector('.tab-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'tab-ind'; ind.setAttribute('aria-hidden', 'true'); tabs.appendChild(ind); }
    const active = tabs.querySelector('[aria-selected="true"]');
    slide(ind, active, tabs.getAttribute('aria-label') || 'tabs');
    if (active && tabs.scrollWidth > tabs.clientWidth && !tabs.dataset.scrolled) {   // keep the active tab in view on small screens
      tabs.dataset.scrolled = '1';
      tabs.scrollLeft = clamp(active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2, 0, tabs.scrollWidth);
    }
  });
}

/* ---------- horizontal scroll edge fades (tabs, chips, tables) ---------- */
function updateFade(wrap) {
  const s = wrap.matches('[data-scroller]') ? wrap : wrap.querySelector('[data-scroller]');
  if (!s) return;
  const host = wrap.classList.contains('scroll-fade') ? wrap : wrap.closest('.scroll-fade');
  if (!host) return;
  host.classList.toggle('can-l', s.scrollLeft > 4);
  host.classList.toggle('can-r', s.scrollLeft + s.clientWidth < s.scrollWidth - 4);
}
function bindFades(scope = document) {
  scope.querySelectorAll('.scroll-fade').forEach((wrap) => {
    const s = wrap.querySelector('[data-scroller]');
    if (!s) return;
    if (!s.dataset.fade) { s.dataset.fade = '1'; s.addEventListener('scroll', () => updateFade(wrap), { passive: true }); }
    updateFade(wrap);
  });
}

/* ---------- scroll reveal (2), count-up (4), badge pulse (14) ---------- */
let io;
function onVisible(entries) {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    io.unobserve(el);
    el.classList.add('is-visible');
    if (el.hasAttribute('data-count')) countUp(el);
  });
}
function countUp(el) {
  const final = el.dataset.final;
  const out = el.querySelector('[aria-hidden]');
  const m = final.match(/^([^\d+\-−]*)([+\-−]?)(\d+(?:\.(\d+))?)(.*)$/s);
  if (!out || !m || /^e[+\-−]?\d/i.test(m[5])) return;      // leave exponent notation untouched
  const [, pre, sign, numStr, dec = '', post] = m, end = parseFloat(numStr), t0 = performance.now(), dur = 900;
  const step = (now) => {
    const t = clamp((now - t0) / dur, 0, 1);
    out.textContent = t >= 1 ? final : `${pre}${sign}${(end * easeOut(t)).toFixed(dec.length)}${post}`;
    if (t < 1 && out.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/** Split a number element into an animated, aria-hidden twin and a stable screen-reader value. */
function prepCount(el) {
  const final = el.textContent.trim();
  el.dataset.final = final;
  el.innerHTML = `<span aria-hidden="true">${esc(final)}</span><span class="sr-only">${esc(final)}</span>`;
}
function enhance(scope) {
  scope.querySelectorAll('[data-reveal]:not([data-seen]), [data-count]:not([data-seen]), .gauge:not([data-seen])').forEach((el) => {
    el.dataset.seen = '1';
    if (el.dataset.reveal === 'stagger') [...el.children].forEach((c, i) => c.style.setProperty('--i', i));
    if (reducedMotion()) { el.classList.add('is-visible'); return; }
    if (el.hasAttribute('data-count')) prepCount(el);
    io.observe(el);
  });
  scope.querySelectorAll('.pi-rank-row:not([data-seen]), .pt-row:not([data-seen]), .prompts .chip:not([data-seen])').forEach((el) => {
    el.dataset.seen = '1';
    el.style.setProperty('--i', [...el.parentNode.children].indexOf(el));
  });
  placeTabs(scope); bindFades(scope);
}

/* ---------- disclosures (10) ---------- */
function onDisclosureClick(e) {
  const btn = e.target.closest('.disc-btn');
  if (!btn) return;
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  btn.closest('.disc').classList.toggle('is-open', open);
}

/* ---------- scroll-linked chrome: progress bar (17), starfield parallax (18), stepper fill (19) ---------- */
let ticking = false, stars = null;
const TILE = 1200;
function onScrollFrame() {
  ticking = false;
  const y = window.scrollY, max = root.scrollHeight - window.innerHeight;
  bar?.style.setProperty('--p', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : 0);
  if (stars) stars.style.setProperty('--y', `${-((y * 0.2) % TILE).toFixed(1)}px`);
  if (!reducedMotion()) document.querySelectorAll('.stepper').forEach((s) => {
    const r = s.getBoundingClientRect();
    s.style.setProperty('--p', clamp((window.innerHeight * 0.75 - r.top) / (r.height || 1), 0, 1).toFixed(3));
  });
}
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); } };
let bar;

function buildStarfield() {
  if (reducedMotion() || lowPower()) return;
  const host = document.createElement('div');
  host.className = 'starfield'; host.setAttribute('aria-hidden', 'true');
  const drift = document.createElement('div'); drift.className = 'starfield-drift';
  // 3 layers x 24 stars = 72 unique stars (< 80). Each list is repeated one tile lower so the parallax can wrap.
  [['var(--text)', 0, 5.5, 0], ['var(--text-2)', 0.5, 7, -2], ['var(--info)', 0, 9, -4]].forEach(([color, spread, t, d]) => {
    const layer = document.createElement('i'); layer.className = 'star-layer';
    const pts = Array.from({ length: 24 }, () => [(Math.random() * 100).toFixed(2), Math.round(Math.random() * TILE)]);
    layer.style.boxShadow = pts.flatMap(([x, y]) => [0, TILE, 2 * TILE].map((o) => `${x}vw ${y + o}px 0 ${spread}px ${color}`)).join(',');
    layer.style.setProperty('--t', `${t}s`); layer.style.setProperty('--d', `${d}s`);
    drift.appendChild(layer);
  });
  host.appendChild(drift); document.body.prepend(host);
  stars = drift;
}

/* ---------- route transition (1) ---------- */
let navToken = 0, firstView = true;
const cleanups = [];
export const onLeave = (fn) => cleanups.push(fn);
/**
 * Runs `render` with the outgoing view fading out (150ms) and the incoming view rising in (350ms).
 * The router scrolls to top straight away; --leave-y keeps the outgoing view visually in place meanwhile.
 */
export function viewTransition(main, render) {
  const token = ++navToken;
  const enter = () => {
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    main.classList.remove('view-leave'); main.style.removeProperty('--leave-y');
    render();
    window.scrollTo(0, 0);
    if (reducedMotion()) return;
    main.classList.remove('view-enter'); void main.offsetWidth; main.classList.add('view-enter');
    const done = (e) => { if (e.target !== main) return; main.classList.remove('view-enter'); main.removeEventListener('animationend', done); };   // ignore animationend bubbling up from children
    main.addEventListener('animationend', done);
  };
  if (firstView || reducedMotion()) { firstView = false; enter(); return; }
  main.style.setProperty('--leave-y', `${-window.scrollY}px`);
  main.classList.remove('view-enter'); main.classList.add('view-leave');
  setTimeout(() => { if (token === navToken) enter(); }, 150);
}

/* ---------- scrollspy for the About table of contents (19) ---------- */
export function scrollSpy(scope) {
  const links = [...scope.querySelectorAll('.toc-list a[data-s]')], select = scope.querySelector('.toc-select select'), ind = scope.querySelector('.toc-ind');
  const secs = links.map((a) => scope.querySelector(`#s-${a.dataset.s}`)).filter(Boolean);
  if (!secs.length) return;
  const setCurrent = (id) => {
    links.forEach((a) => { const on = a.dataset.s === id; a.classList.toggle('is-current', on); if (on) { a.setAttribute('aria-current', 'location'); ind?.style.setProperty('--y', `${a.offsetTop}px`); } else a.removeAttribute('aria-current'); });
    if (select && select.value !== id) select.value = id;
  };
  const spy = new IntersectionObserver((entries) => {
    const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (hit) setCurrent(hit.target.id.slice(2));
  }, { rootMargin: '-15% 0px -70% 0px' });
  secs.forEach((s) => spy.observe(s));
  const go = (id, push = true) => {
    const el = scope.querySelector(`#s-${id}`); if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    setCurrent(id);
    if (push) history.replaceState(null, '', `#/data?s=${id}`);   // shareable, without re-running the router
  };
  scope.addEventListener('click', (e) => { const a = e.target.closest('a[data-s]'); if (!a) return; e.preventDefault(); go(a.dataset.s); });
  select?.addEventListener('change', () => go(select.value));
  setCurrent(secs[0].id.slice(2));
  onLeave(() => spy.disconnect());
  return go;
}

/* ---------- boot ---------- */
export function initUI(main) {
  if (!reducedMotion()) root.classList.add('motion');
  motionQuery.addEventListener?.('change', () => root.classList.toggle('motion', !reducedMotion()));
  io = new IntersectionObserver(onVisible, { threshold: 0.15 });
  bar = document.querySelector('.scroll-progress');
  buildStarfield();
  // Earth mounts once after first paint (lazy three.js); route/city hooks in main.js
  initEarthBg();
  const { page: bootPage } = (() => {
    try {
      const raw = String(location.hash).replace(/^#\/?/, '');
      return { page: raw.split('?')[0].split('/')[0] || 'home' };
    } catch { return { page: 'home' }; }
  })();
  setEarthRoute(bootPage);
  window.addEventListener('hashchange', () => {
    const raw = String(location.hash).replace(/^#\/?/, '');
    const p = raw.split('?')[0].split('/')[0] || 'home';
    setEarthRoute(p === 'explore' || p === 'discover' ? 'trends' : p);
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onDisclosureClick);
  document.addEventListener('click', (e) => {            // close an open export menu when clicking elsewhere
    document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach((d) => { d.removeAttribute('open'); d.querySelector('summary')?.focus(); }); });

  // New markup (route renders, async cards) is picked up automatically.
  let queued = false;
  new MutationObserver((records) => {
    // count-up rewrites its own text every frame; that is not new markup
    if (queued || records.every((r) => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('[data-count]'))) return;
    queued = true; requestAnimationFrame(() => { queued = false; enhance(document.body); onScroll(); });
  })
    .observe(main, { childList: true, subtree: true });
  enhance(document.body);

  const relayout = () => { placeNav(); document.querySelectorAll('.tab-ind').forEach((i) => delete i.dataset.placed); placeTabs(); bindFades(); onScroll(); };
  window.addEventListener('hashchange', () => requestAnimationFrame(placeNav));
  window.addEventListener('resize', relayout);
  document.fonts?.ready.then(relayout);
  requestAnimationFrame(placeNav);
  onScroll();
}
