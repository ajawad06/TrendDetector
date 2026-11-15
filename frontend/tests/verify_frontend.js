/**
 * Trend Detector — Frontend Verification Suite
 * Checks all frontend assets, scripts, syntax, and references.
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(FRONTEND_DIR, 'src');

console.log('=== VERIFYING FRONTEND APPLICATION SUITE ===\n');

let pass = 0;
let fail = 0;

function check(cond, msg) {
  if (cond) {
    console.log(`[PASS] ${msg}`);
    pass++;
  } else {
    console.error(`[FAIL] ${msg}`);
    fail++;
  }
}

// 1. Check index.html exists and has key sections
const indexPath = path.join(FRONTEND_DIR, 'index.html');
check(fs.existsSync(indexPath), 'index.html exists');

const html = fs.readFileSync(indexPath, 'utf-8');
check(html.includes('id="main"'), 'Main landmark present');
check(html.includes('class="skip-link"'), 'Skip link present');
check(html.includes('id="drawer"') && html.includes('aria-modal="true"'), 'Assistant slide-over (dialog) present');
check(html.includes('id="plain-toggle"'), 'Plain-language switch present');
['home', 'trends', 'pollution', 'compare', 'data', 'about'].forEach(r => check(html.includes(`href="#/${r}"`), `Nav link for #/${r}`));
check(!/style="/.test(html), 'No inline styles in index.html');
check(!/<video/.test(html), 'No background video');
check(!fs.existsSync(path.join(FRONTEND_DIR, 'HeroTD.mp4')), 'Hero video file removed');

// 2. Single token file; no hardcoded hex in JS modules (canvas reads tokens)
const cssPath = path.join(SRC_DIR, 'css', 'style.css');
check(fs.existsSync(cssPath), 'style.css exists');
check(fs.existsSync(path.join(SRC_DIR, 'css', 'tokens.css')), 'tokens.css exists');
const hexIn = (f) => (fs.readFileSync(path.join(SRC_DIR, 'js', f), 'utf-8').match(/#[0-9A-Fa-f]{6}\b/g) || []);
['main.js', 'chart.js', 'map.js', 'pollution.js'].forEach(f => check(hexIn(f).length === 0, `No hardcoded hex in ${f}`));

// 3. Check JavaScript files
const jsFiles = ['api.js', 'stats.js', 'chart.js', 'map.js', 'main.js', 'router.js', 'util.js', 'theme.js'];
jsFiles.forEach(f => {
  const p = path.join(SRC_DIR, 'js', f);
  check(fs.existsSync(p), `JavaScript module exists: src/js/${f}`);
});

console.log(`\n=== FRONTEND VERIFICATION COMPLETE: ${pass} PASSED, ${fail} FAILED ===`);
if (fail > 0) process.exit(1);
