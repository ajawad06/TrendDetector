/** "Minor trend patterns" section. All numbers come from patterns.json (scripts/build_patterns.py). */
const PATHS = ['./data/patterns.json', './public/data/patterns.json', '/data/patterns.json'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtP = p => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);

export async function initPatterns(root) {
  let data = null;
  for (const p of PATHS) { try { const r = await fetch(p); if (r.ok) { data = await r.json(); break; } } catch (e) { /* next */ } }
  if (!data) { root.innerHTML = '<div class="pi-error">Pattern data not found (patterns.json). Run <code>python scripts/build_patterns.py</code>.</div>'; return; }
  const list = [...data.patterns].sort((a, b) => !!a.untested - !!b.untested);
  root.innerHTML = `
    <div class="section-header section-header-brown">
      <span class="section-label">Seasonal &amp; Behavioural Signals</span>
      <h3 class="section-title">Minor Trend Patterns</h3>
      <p class="section-desc">Smaller recurring patterns, each tested on the ${data.period[0]} – ${data.period[1]} monthly record. Claims the data cannot test are labelled as such.</p>
    </div>
    <div class="pt-grid">${list.map(card).join('')}</div>`;
}

function card(p) {
  const max = Math.max(1e-9, ...p.rows.flatMap(r => [Math.abs(r.a), Math.abs(r.b)]));
  const bar = (v, cls) => `<span class="pt-bar"><span class="${cls} ${v < 0 ? 'neg' : ''}" style="width:${Math.abs(v) / max * 100}%"></span></span><b>${v}</b>`;
  const rows = p.rows.map(r => `
    <div class="pt-row ${r.supported ? '' : 'pt-off'}">
      <span class="pt-city">${esc(r.label)}${r.supported ? '' : ' <em>no effect</em>'}</span>
      <div class="pt-pair"><small>${esc(r.a_name)}</small>${bar(r.a, 'a')}</div>
      <div class="pt-pair"><small>${esc(r.b_name)}</small>${bar(r.b, 'b')}</div>
      <small class="pt-stat">${r.ratio ? r.ratio + '× · ' : ''}${fmtP(r.p)}</small>
    </div>`).join('');
  return `<article class="pt-card ${p.untested ? 'pt-untested' : ''}">
    <span class="pt-status">${esc(p.status)}</span>
    <h4>${esc(p.title)}</h4>
    <p class="pt-head">${esc(p.headline)}</p>
    ${p.rows.length ? `<div class="pt-unit">Values: ${esc(p.unit)}</div><div class="pt-rows">${rows}</div>` : ''}
    <p class="pt-meta"><b>How tested:</b> ${esc(p.method)}</p>
    <p class="pt-meta"><b>Caution:</b> ${esc(p.caveat)}</p>
  </article>`;
}
