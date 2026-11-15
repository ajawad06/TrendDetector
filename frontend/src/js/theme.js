/** Read design tokens from CSS so canvas/SVG code never hardcodes colours. */
export const tok = (name, fallback = '#000000') =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Array-like of numbered tokens: palette('--cat', 5)[i] reads --cat-{i+1} at call time. */
export const palette = (prefix) => new Proxy([], {
  get: (_, i) => (/^\d+$/.test(String(i)) ? tok(`${prefix}-${+i + 1}`) : undefined),
});
