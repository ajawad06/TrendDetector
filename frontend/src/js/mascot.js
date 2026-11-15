/**
 * Trend Detector — space mascot (chat launcher).
 *
 * ORIGINAL ARTWORK: the astronaut-bot below was drawn by hand as inline SVG for this project.
 * It is not derived from any third-party asset, character or logo, so there is no licence to
 * record beyond the project's own. Colours come from the design tokens via CSS classes.
 *
 * Behaviour: fixed on every route; opens/closes the chat panel; idle float, antenna pulse and
 * visor blink are CSS (animations.css). Scroll gliding uses one passive scroll listener and one
 * requestAnimationFrame loop that only runs while something is still moving.
 */

let uid = 0;
/** The mascot drawing. `mini` omits the thruster flame (used for the chat header avatar). */
export function mascotSvg(mini = false) {
  const k = `m${++uid}`;
  return `<svg viewBox="0 0 72 88" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${k}-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="m-shell-a"/><stop offset="1" class="m-shell-b"/></linearGradient>
      <radialGradient id="${k}-visor" cx="0.35" cy="0.3" r="0.9"><stop offset="0" class="m-visor-a"/><stop offset="1" class="m-visor-b"/></radialGradient>
      <linearGradient id="${k}-flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="m-flame-a"/><stop offset="1" class="m-flame-b"/></linearGradient>
    </defs>
    ${mini ? '' : `<g class="m-flame"><path d="M29 68h14l-7 18z" fill="url(#${k}-flame)"/></g>`}
    <line class="m-antenna" x1="36" y1="11" x2="36" y2="5"/>
    <circle class="m-halo" cx="36" cy="4" r="4"/>
    <circle class="m-light" cx="36" cy="4" r="2.6"/>
    <rect class="m-outline" x="22" y="50" width="28" height="20" rx="9" fill="url(#${k}-shell)"/>
    <rect class="m-outline m-pod" x="14" y="53" width="9" height="12" rx="4.500"/>
    <rect class="m-outline m-pod" x="49" y="53" width="9" height="12" rx="4.500"/>
    <circle class="m-chest" cx="36" cy="61" r="2.600"/>
    <rect class="m-outline m-pod" x="9" y="26" width="7" height="12" rx="3.500"/>
    <rect class="m-outline m-pod" x="56" y="26" width="7" height="12" rx="3.500"/>
    <circle class="m-outline" cx="36" cy="32" r="22" fill="url(#${k}-shell)"/>
    <rect x="19" y="21" width="34" height="23" rx="11.500" fill="url(#${k}-visor)"/>
    <rect class="m-visor-glow" x="19" y="21" width="34" height="23" rx="11.500"/>
    <rect class="m-eye" x="27.500" y="28" width="4" height="8" rx="2"/>
    <rect class="m-eye" x="40.500" y="28" width="4" height="8" rx="2"/>
  </svg>`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const BUBBLE_KEY = 'td:mascot-hello';

/**
 * @param {{ onToggle: () => void, isOpen: () => boolean, panel: HTMLElement }} opts
 * @returns {{ el: HTMLButtonElement, sync: () => void }}
 */
export function initMascot({ onToggle, isOpen, panel }) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'mascot'; btn.className = 'mascot';
  btn.setAttribute('aria-label', 'Ask about the data');
  btn.setAttribute('aria-controls', panel.id);
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="mascot-tilt"><span class="mascot-float">${mascotSvg()}</span></span>`;
  document.body.appendChild(btn);
  btn.addEventListener('click', () => { hideBubble(); onToggle(); });   // Enter and Space come free with <button>

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cur = { x: 0, y: 0, tilt: 0, flame: 1 };
  let geo = null, lastY = window.scrollY, vel = 0, running = false, lastStar = 0, liveStars = 0;

  /** Layout reads happen here only (resize, route change, panel open/close) — never per frame. */
  function measure() {
    const cw = document.documentElement.clientWidth, vh = window.innerHeight;
    const size = btn.offsetWidth, h = btn.offsetHeight, restLeft = btn.offsetLeft, restTop = btn.offsetTop;
    const box = document.querySelector('.top .container');
    const pad = box ? parseFloat(getComputedStyle(box).paddingRight) || 0 : 0;
    const free = box ? cw - box.getBoundingClientRect().right + pad - 8 : 0;   // empty gutter right of the content
    const amp = Math.min(32, (free - size) / 2);                               // sine-weave amplitude that fits the gutter
    geo = { cw, vh, size, h, restLeft, restTop, free, amp, glide: !mq.matches && amp >= 12 };
    if (isOpen()) {
      // desktop: sits just under the panel's bottom-right corner (its rest spot); phone: perches on the sheet's top-right corner
      // (offsetHeight ignores the panel's opening scale transform)
      geo.dock = cw >= 768 ? { x: 0, y: 0 } : { x: 0, y: (vh - panel.offsetHeight) - h + 6 - restTop };
    }
  }

  function target() {
    if (geo.dock && isOpen()) return geo.dock;
    if (!geo.glide) return { x: 0, y: 0 };
    const max = document.documentElement.scrollHeight - geo.vh;
    const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    const cy = geo.vh * (0.2 + 0.6 * p);                                       // 20% → 80% of the viewport height
    const cx = geo.cw - 8 - geo.free / 2 + geo.amp * Math.sin(p * Math.PI * 5); // sine weave inside the gutter
    return { x: cx - (geo.restLeft + geo.size / 2), y: cy - (geo.restTop + geo.h / 2) };
  }

  function star(now) {
    if (now - lastStar < 90 || liveStars >= 10) return;
    lastStar = now; liveStars++;
    const s = document.createElement('i');
    s.className = 'm-star';
    s.style.left = `${geo.restLeft + cur.x + geo.size / 2 + (Math.random() * 16 - 8)}px`;
    s.style.top = `${geo.restTop + cur.y + geo.h * (vel > 0 ? 0.2 : 0.9)}px`;
    s.style.setProperty('--dx', `${(Math.random() * 12 - 6).toFixed(1)}px`);
    s.style.setProperty('--dy', `${vel > 0 ? -18 : 18}px`);
    s.addEventListener('animationend', () => { s.remove(); liveStars--; }, { once: true });
    document.body.appendChild(s);
  }

  function apply() {
    btn.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
    btn.style.setProperty('--tilt', `${cur.tilt.toFixed(2)}deg`);
    btn.style.setProperty('--flame', cur.flame.toFixed(3));
  }

  function tick(now) {
    if (!geo) measure();
    const y = window.scrollY, dv = y - lastY; lastY = y;
    vel += (dv - vel) * 0.2;
    const t = target(), docked = geo.dock && isOpen();
    cur.x += (t.x - cur.x) * 0.1;                                   // lerp 0.1: trails the scroll
    cur.y += (t.y - cur.y) * 0.1;
    cur.tilt += ((docked ? 0 : clamp(vel * 0.8, -12, 12)) - cur.tilt) * 0.15;
    cur.flame += ((1 + Math.min(Math.abs(vel) / 18, 1.6)) - cur.flame) * 0.15;
    if (!docked && Math.abs(vel) > 6) star(now);
    apply();
    const settled = Math.abs(t.x - cur.x) < 0.2 && Math.abs(t.y - cur.y) < 0.2 && Math.abs(vel) < 0.05 && Math.abs(cur.tilt) < 0.05 && Math.abs(cur.flame - 1) < 0.01;
    if (settled || document.hidden) { running = false; return; }   // eases back to rest, then the loop stops
    requestAnimationFrame(tick);
  }
  const wake = () => { if (running || document.hidden) return; if (mq.matches) return rest(); running = true; lastY = window.scrollY; requestAnimationFrame(tick); };
  /** Reduced motion: no glide, no float — static, docked bottom-right (or on the open panel). */
  function rest() {
    measure();
    const t = geo.dock && isOpen() ? geo.dock : { x: 0, y: 0 };
    Object.assign(cur, { x: t.x, y: t.y, tilt: 0, flame: 1 }); apply();
  }
  const remeasure = () => { measure(); wake(); };

  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', remeasure);
  window.addEventListener('hashchange', () => setTimeout(remeasure, 400));   // new page height after the route transition
  document.addEventListener('visibilitychange', () => { if (!document.hidden) remeasure(); });
  mq.addEventListener?.('change', remeasure);
  measure();
  if (geo.glide) { const t = target(); cur.x = t.x; cur.y = t.y; apply(); } else rest();

  /* One-time speech bubble on Home after 6s, never again in the session. */
  let bubble = null;
  function hideBubble() {
    if (!bubble) return;
    const b = bubble; bubble = null;
    b.classList.add('is-leaving'); setTimeout(() => b.remove(), 180);
  }
  const seen = () => { try { return sessionStorage.getItem(BUBBLE_KEY) === '1'; } catch { return true; } };
  if (!seen()) setTimeout(() => {
    const onHome = /^#?\/?(home)?(\?|$)/.test(location.hash);
    if (!onHome || isOpen() || seen()) return;
    try { sessionStorage.setItem(BUBBLE_KEY, '1'); } catch { /* private mode */ }
    bubble = document.createElement('span');
    bubble.className = 'mascot-bubble'; bubble.setAttribute('aria-hidden', 'true'); bubble.textContent = 'Ask me about any city';
    btn.appendChild(bubble);
    setTimeout(hideBubble, 7000);
  }, 6000);

  return {
    el: btn,
    /** Call after the chat panel opens or closes: dock to the panel corner / resume gliding. */
    sync() { btn.setAttribute('aria-expanded', String(isOpen())); hideBubble(); remeasure(); },
  };
}
