/* Renders tools/og.html to assets/img/og.png, and refuses to write a card that
 * is wrong in either of the two ways this one can be wrong silently.
 *
 * Run:  node tools/shoot-og.mjs [baseUrl]
 * Exit: 0 written · 1 refused · 2 inconclusive
 *
 * LinkedIn's Featured card pulls this image, so a bad card is on Islam's
 * profile, not just on a page. The two silent failures:
 *   1. A file:// origin fails the font CORS check, Chrome falls back to a
 *      system face, and the card ships in the wrong typeface with no error.
 *   2. The display lines are fitted to the measure. A fallback face, a missing
 *      font-stretch range or a stale cqi value all still lay out — just not
 *      flush — and a screenshot cannot tell you.
 */

import { launch } from './cdp.mjs';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8145';
const OUT = new URL('../assets/img/og.png', import.meta.url).pathname;
const TOL = 0.02;

const browser = await launch({ width: 1200, height: 630, port: 9463 });
try {
  const p = await browser.page(`${BASE}/tools/og.html`);
  /* --window-size is not the viewport. Without this the capture came out
     1200x543, while og:image:height declares 630 — scrapers letterbox or crop
     a card whose real size disagrees with the tag. */
  await p.resize(1200, 630);
  await p.eval(`document.fonts.ready`, { awaitPromise: true });
  await p.settle(500);

  const vp = await p.eval(`JSON.stringify([innerWidth, innerHeight])`).then(JSON.parse);
  if (vp[0] !== 1200 || vp[1] !== 630) {
    console.error(`INCONCLUSIVE: viewport is ${vp[0]}x${vp[1]}, not 1200x630`);
    process.exit(2);
  }

  if (!(await p.eval(`document.fonts.check('760 100px Archivo')`))) {
    console.error(`INCONCLUSIVE: Archivo did not load from ${BASE} — the card would ship in a system face.`);
    console.error('Render over the http server, never file://: Chrome applies CORS to fonts.');
    process.exit(2);
  }

  const m = await p.eval(`(() => {
    const box = document.querySelector('.top');
    const measure = box.clientWidth;
    const lines = [...document.querySelectorAll('h1 .ln')].map((el) => {
      const r = document.createRange(); r.selectNodeContents(el);
      return { text: el.textContent.trim(), advance: r.getBoundingClientRect().width,
               size: parseFloat(getComputedStyle(el).fontSize) };
    });
    return JSON.stringify({ measure, lines,
      overflow: document.documentElement.scrollWidth - 1200,
      bottom: document.querySelector('.btm').getBoundingClientRect().bottom });
  })()`).then(JSON.parse);

  let bad = 0;
  for (const l of m.lines) {
    const err = Math.abs(l.advance - m.measure) / m.measure;
    const ok = err < TOL;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} "${l.text}" ${Math.round(l.size)}px, ${(err * 100).toFixed(2)}% off the ${Math.round(m.measure)}px measure`);
  }
  if (m.overflow > 0) { console.log(`FAIL the card overflows 1200px by ${m.overflow}px`); bad++; }
  if (m.bottom > 630) { console.log(`FAIL the footer falls ${Math.round(m.bottom - 630)}px past the card`); bad++; }

  if (bad) {
    console.error('\nRefusing to write the card. It feeds LinkedIn\'s Featured tile.');
    process.exit(1);
  }

  const bytes = await p.screenshot(OUT);

  /* Read the PNG's own IHDR rather than trusting the request. A card whose
     real size disagrees with og:image:width/height is the failure this file
     shipped on its first run. */
  const png = readFileSync(OUT);
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (w !== 1200 || h !== 630) {
    console.error(`FAIL the written card is ${w}x${h}, not the 1200x630 the meta tags declare`);
    process.exit(1);
  }
  console.log(`\nwrote ${OUT} — ${w}x${h}, ${(bytes / 1024).toFixed(0)}KB`);
} finally {
  await browser.close();
}
