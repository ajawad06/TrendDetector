/**
 * Minimal hash router (static-hosting friendly).
 * URL shape: #/page?key=value&key2=value2   e.g. #/trends?tab=explorer&var=pm25&city=lahore
 */
import { safeId } from './util.js';

export const ROUTES = ['home', 'trends', 'explore', 'discover', 'pollution', 'compare', 'data', 'about']; // explore/discover are legacy aliases that redirect to trends
const STORE_KEY = 'td:last-selection';

export function parseHash(hash = '') {
  const raw = String(hash).replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const page = path.split('/')[0] || 'home';
  const params = {};
  for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { page, params, known: ROUTES.includes(page) };
}

export function buildHash(page, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return `#/${page}${s ? '?' + s : ''}`;
}

/** Remember the last variable/city so Trends and Compare open where the user left off. */
export function saveSelection(sel, storage = globalThis.localStorage) {
  try { storage?.setItem(STORE_KEY, JSON.stringify({ var: safeId(sel.var), city: safeId(sel.city) })); } catch { /* private mode */ }
}
export function loadSelection(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage?.getItem(STORE_KEY) || '{}');
    return { var: safeId(s.var, 'pm25'), city: safeId(s.city, 'lahore') };
  } catch { return { var: 'pm25', city: 'lahore' }; }
}

/**
 * start(handlers, notFound): handlers = { pageName: (params) => void }.
 * Unknown pages call notFound(page). Returns a navigate(page, params) function.
 */
export function startRouter(handlers, notFound) {
  const run = () => {
    const { page, params, known } = parseHash(location.hash);
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const active = a.dataset.nav === page;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (known && handlers[page]) handlers[page](params); else notFound?.(page);
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', run);
  run();
  return (page, params) => { location.hash = buildHash(page, params); };
}
