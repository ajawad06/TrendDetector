/** Shared helpers: HTML escaping, safe mini-markdown, hash-query parsing. */

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape any value for safe insertion into HTML text or attribute context. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
}

/**
 * Safe markdown renderer for assistant replies.
 * Sanitising strategy: every piece of source text is HTML-escaped FIRST, and only then is a
 * fixed allow-list of tags added (h3–h5, p, ul/ol/li, strong, em, code, pre, blockquote, hr,
 * table). No attribute or URL is ever built from the input, so no markup in the reply can
 * survive as HTML. That makes a separate sanitiser library unnecessary.
 */
const inlineMd = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function safeMarkdown(text) {
  if (!text) return '';
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isBlockStart = (l) => /^\s*(#{1,6}\s|[-*•]\s+|\d+[.)]\s+|>\s?|```)/.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {                               // fenced code
      const buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    const h = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);     // headings: # and ## → h3, ### → h4, deeper → h5
    if (h) { const tag = h[1].length <= 2 ? 'h3' : h[1].length === 3 ? 'h4' : 'h5'; out.push(`<${tag}>${inlineMd(h[2])}</${tag}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {   // table
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inlineMd(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {                           // bullet list
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      out.push(`<ul>${items.map((x) => `<li>${inlineMd(x)}</li>`).join('')}</ul>`); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {                         // numbered list
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push(`<ol>${items.map((x) => `<li>${inlineMd(x)}</li>`).join('')}</ol>`); continue;
    }
    if (/^\s*>\s?/.test(line)) {                               // quote
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${buf.map(inlineMd).join('<br>')}</blockquote>`); continue;
    }
    const buf = [];                                            // paragraph
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inlineMd).join('<br>')}</p>`);
  }
  return out.join('');
}

/** Only allow ids made of letters, digits, dash and underscore (used for var/city params). */
export function safeId(value, fallback = '') {
  return /^[a-z0-9_-]{1,40}$/i.test(String(value ?? '')) ? String(value).toLowerCase() : fallback;
}
