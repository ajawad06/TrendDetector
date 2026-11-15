import assert from 'node:assert/strict';
import { esc, safeMarkdown, safeId } from '../frontend/src/js/util.js';
import { parseHash, buildHash, saveSelection, loadSelection } from '../frontend/src/js/router.js';

// escaping
assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(esc('"a" & \'b\''), '&quot;a&quot; &amp; &#39;b&#39;');
assert.ok(!safeMarkdown('**hi** <script>alert(1)</script>').includes('<script>'));
assert.ok(safeMarkdown('**hi**').includes('<strong>hi</strong>'));
assert.equal(safeId('lahore'), 'lahore');
assert.equal(safeId('"><svg onload=1>', 'pm25'), 'pm25');

// routing
assert.deepEqual(parseHash('#/explore?var=pm25&city=lahore'), { page: 'explore', params: { var: 'pm25', city: 'lahore' }, known: true });
assert.equal(parseHash('').page, 'home');
assert.equal(parseHash('#/nope').known, false);
assert.equal(buildHash('explore', { var: 'aod', city: 'multan', x: '' }), '#/explore?var=aod&city=multan');
assert.equal(parseHash(buildHash('compare', { var: 'rain_mm' })).params.var, 'rain_mm');

// remembered selection (in-memory storage stub; hostile values are sanitised)
const mem = {}; const store = { setItem: (k, v) => { mem[k] = v; }, getItem: (k) => mem[k] };
assert.deepEqual(loadSelection(store), { var: 'pm25', city: 'lahore' });
saveSelection({ var: 'no2', city: 'karachi' }, store);
assert.deepEqual(loadSelection(store), { var: 'no2', city: 'karachi' });
saveSelection({ var: '<x>', city: 'multan' }, store);
assert.equal(loadSelection(store).var, 'pm25');
console.log('router + escaping tests passed');
