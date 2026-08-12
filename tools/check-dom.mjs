/* Runs tools/verify-dom.html to completion and reports.
 *
 * The suite is a page, so it needs a driver that will not throttle it. A
 * background browser tab gets its timers throttled and the sweep stalls
 * part-way — which looks exactly like a pass if you only read the failure
 * count. This polls for the explicit HARNESS-END sentinel instead.
 *
 * Exit: 0 pass · 1 assertion failed · 2 inconclusive (the run proved nothing)
 */
import { launch } from './cdp.mjs';

const BASE = process.argv[2] || 'http://localhost:8145';
const MIN_CHECKS = 100;                     // raise when assertions are added
const REQUIRED_CANARIES = ['opacity', 'overflow', 'position', 'hidden-control'];

const browser = await launch({ width: 1400, height: 1000, port: 9361 });
let text = '';
try {
  const p = await browser.page(`${BASE}/tools/verify-dom.html`);
  for (let i = 0; i < 240; i++) {           // 240 × 1s ceiling
    text = await p.eval(`document.getElementById('out').textContent`);
    if (text.includes('HARNESS-END')) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
} finally {
  await browser.close();
}

const lines = text.split('\n');
const end = lines.find((l) => l.startsWith('HARNESS-END'));
const fails = lines.filter((l) => l.startsWith('FAIL'));
const oks = lines.filter((l) => l.startsWith('OK')).length;
const canaries = lines.filter((l) => l.startsWith('CANARY-CAUGHT')).map((l) => l.split(' ')[1]);

/* Inconclusive is a distinct outcome from failed. A suite that stalled, or one
   whose detectors are dead, has not proved the page is correct — and reporting
   that as a pass is the exact mistake this project already made once. */
if (!end) {
  console.error(`INCONCLUSIVE: suite never reached HARNESS-END (${oks} checks ran)`);
  process.exit(2);
}
for (const c of REQUIRED_CANARIES) {
  if (!canaries.includes(c)) {
    console.error(`INCONCLUSIVE: canary "${c}" was not caught — that detector is dead, so its passes mean nothing`);
    process.exit(2);
  }
}
if (oks + fails.length < MIN_CHECKS) {
  console.error(`INCONCLUSIVE: only ${oks + fails.length} checks ran, expected >= ${MIN_CHECKS}`);
  process.exit(2);
}

for (const f of fails) console.log(f);
console.log(`canaries armed: ${canaries.join(', ')}`);
console.log(end);
process.exit(fails.length ? 1 : 0);
