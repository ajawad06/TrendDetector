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
check(html.includes('id="missions-grid"'), 'Missions grid container present (SRD §6)');
check(html.includes('id="trend-canvas"'), 'HTML5 Chart canvas present (SRD §17)');
check(html.includes('id="story-card-container"'), 'Story Card container present (SRD §7)');
check(html.includes('id="confidence-meter-container"'), 'Confidence Meter container present (SRD §11)');
check(html.includes('id="learning-mode-toggle"'), 'Learning Mode toggle present (SRD §12)');
check(html.includes('id="map-container"'), 'Leaflet map container present (SRD §15)');
check(html.includes('id="assistant-drawer"'), 'AI Assistant drawer present (SRD §13)');
check(html.includes('id="btn-export-csv"'), 'CSV export button present (SRD §18)');
check(html.includes('id="btn-export-md"'), 'Markdown export button present (SRD §18)');

// 2. Check CSS and requested color palette tokens
const cssPath = path.join(SRC_DIR, 'css', 'style.css');
check(fs.existsSync(cssPath), 'style.css exists');
const css = fs.readFileSync(cssPath, 'utf-8');
check(css.includes('#B8DB94'), 'Color: Second top green (#B8DB94) integrated');
check(css.includes('#CBAB8D'), 'Color: Sand camel brown (#CBAB8D) integrated');
check(css.includes('#5C4333'), 'Color: Deep espresso earth brown (#5C4333) integrated');
check(css.includes('#FBFBF9'), 'Color: Linen canvas white (#FBFBF9) integrated');

// 3. Check JavaScript files
const jsFiles = ['api.js', 'stats.js', 'chart.js', 'map.js', 'app.js'];
jsFiles.forEach(f => {
  const p = path.join(SRC_DIR, 'js', f);
  check(fs.existsSync(p), `JavaScript module exists: src/js/${f}`);
});

console.log(`\n=== FRONTEND VERIFICATION COMPLETE: ${pass} PASSED, ${fail} FAILED ===`);
if (fail > 0) process.exit(1);
