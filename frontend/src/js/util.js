/** Shared helpers: HTML escaping, safe mini-markdown, hash-query parsing. */

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape any value for safe insertion into HTML text or attribute context. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
}

/** Escape first, then apply a small allow-list of formatting (bold, italic, bullets, breaks). */
export function safeMarkdown(text) {
  if (!text) return '';
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\s*[-•]\s+(.*)$/gm, '<span class="md-li">$1</span>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/** Only allow ids made of letters, digits, dash and underscore (used for var/city params). */
export function safeId(value, fallback = '') {
  return /^[a-z0-9_-]{1,40}$/i.test(String(value ?? '')) ? String(value).toLowerCase() : fallback;
}
