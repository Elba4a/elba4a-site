/* Kill test for direction 5: can Archivo hold every display line flush on the
 * right margin, at every viewport, without the block outgrowing the fold?
 *
 * Run:  node tools/check-fit.mjs [baseUrl]
 * Exit: 0 pass · 1 the direction does not hold · 2 inconclusive (proved nothing)
 *
 * Exit 2 exists because a previous verification pass in this repo reported
 * success while Chrome had never launched. "Did not fail" and "passed" have to
 * be different codes.
 *
 * ---- What this test already killed -------------------------------------
 * The original plan fitted lines by WIDTH: one font-size, per-line
 * `font-stretch`. That is arithmetically impossible with this copy. At 15.6cqi
 * every line sits pinned at the 125% ceiling and still falls 48% short of the
 * measure — the width axis spans 1.945x, and "I build" needs roughly 2x the
 * per-glyph width of "every layer" before the font-size gap is even counted.
 * Fitting by SIZE at a constant width is what holds, and it holds to 0.02%.
 */

import { launch } from './cdp.mjs';

const BASE = process.argv[2] || 'http://localhost:8145';
const TOL = 0.015;          // flush error, as a fraction of the measure
const WDTH = 100;           // one width for every line; the axis animates, it does not fit

/* The copy is fixed: "I build every layer myself." Only the breaks move.
   Fewer, longer lines set smaller; the ladder keeps the block between roughly
   a third and two thirds of the viewport at every width. */
const SETS = {
  four: ["I build", "every", "layer", "myself."],
  two:  ["I build every", "layer myself."],
};
const setFor = (w) => (w <= 700 ? 'four' : 'two');

/* The three-way break ("I build" / "every layer" / "myself.") is not offered:
   solved, its line sizes spread 1.85x, so the long middle line sets visibly
   smaller than the two around it and the block reads as a mistake. Instead the
   four-line set carries the whole range below 701px, with the display column
   capped at 440px above 440px of viewport so it stops growing rather than
   overflowing the fold. */
const CAP = 440;
const capFor = (w) => (w > 440 && w <= 700 ? CAP : null);

/* Viewport sizes, with a plausible real height for each — the block-height
   assertion is meaningless against a uniform 900px test window. */
const VIEWPORTS = [[320, 568], [390, 844], [430, 932], [560, 900], [700, 900],
                   [768, 1024], [1280, 800], [1920, 1080], [2560, 1440]];
const HEADER = 60;
const MAX_FOLD = .78;   // above this the headline eats the whole first screen
const MIN_DISPLAY = 80; // below this it is not display type, whatever the ratio says

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
};

const browser = await launch({ width: 1280, height: 900, port: 9455 });
try {
  const p = await browser.page(`${BASE}/tools/fit-test.html`);
  await p.settle(600);

  /* ---- inconclusive guards. Not assertions: if any trips, the run proved
         nothing and must not be reported as a pass. -------------------- */
  if (!(await p.eval(`document.documentElement.dataset.ready === '1'`))) {
    console.error('INCONCLUSIVE: the page never finished loading fonts');
    process.exit(2);
  }
  if (!(await p.eval(`window.__fit.loaded`))) {
    console.error('INCONCLUSIVE: Archivo did not load — every measurement below would be of a fallback face');
    process.exit(2);
  }

  /* The axis has to be LIVE. If the @font-face range were missing or the subset
     had dropped wdth, two different font-stretch values would render identical
     advances, the entrance animation would be a no-op, and nothing here would
     say so. */
  const axis = await p.eval(`(() => {
    const el = document.createElement('div');
    el.className = 'l'; el.textContent = 'every layer';
    document.getElementById('box').dataset.mode = 'width';
    document.getElementById('lines').append(el);
    el.style.setProperty('--fs', '80px'); el.style.setProperty('--w', '62%');
    const a = el.getBoundingClientRect().width;
    el.style.setProperty('--w', '125%');
    const b = el.getBoundingClientRect().width;
    el.remove();
    return { a: +a.toFixed(1), b: +b.toFixed(1), ratio: +(b / a).toFixed(3) };
  })()`);
  if (axis.ratio < 1.5) {
    console.error(`INCONCLUSIVE: wdth axis is dead or clamped — 62% and 125% render ${axis.a}px vs ${axis.b}px`);
    process.exit(2);
  }
  console.log(`control: Archivo loaded, wdth axis live (62%→${axis.a}px, 125%→${axis.b}px, ${axis.ratio}x)`);

  /* ---- solve each set once ---------------------------------------------
     Solved in cqi, so the result is a pure ratio of the container. Advance in
     em is fixed by the width value and font-size is a constant fraction of the
     container, so advance/measure does not move with viewport width. The
     per-viewport assertions below are what prove that claim rather than
     assuming it. */
  await p.resize(1280, 900);
  await p.settle(250);

  const plans = {};
  console.log('');
  for (const [name, words] of Object.entries(SETS)) {
    const plan = await p.eval(
      `JSON.stringify(window.__fit.fitBySize(${JSON.stringify(words)}, ${WDTH}))`).then(JSON.parse);
    plan.wdth = WDTH;
    plans[name] = plan;
    const spread = Math.max(...plan.lines.map((l) => l.cqi)) / Math.min(...plan.lines.map((l) => l.cqi));
    console.log(`solved ${name.padEnd(5)} ${plan.lines.map((l) => `"${l.text}" ${l.cqi}cqi`).join('  ')}`);
    console.log(`       block ${plan.blockHeight}px @ measure ${plan.target}px  ·  size spread ${spread.toFixed(2)}x`);
    ok(spread < 1.6, `${name}: line sizes stay within 1.6x of each other`, `${spread.toFixed(2)}x`);
  }

  /* ---- the canaries, before any flush PASS counts ----------------------
     A detector that has never fired cannot be told from one that cannot fire. */
  const c = await p.eval(
    `JSON.stringify(window.__fit.canary(${JSON.stringify(plans.two)}, 'size'))`).then(JSON.parse);
  ok(c.caught, 'CANARY a deliberately wrong size is caught',
     `worst error ${(c.worst * 100).toFixed(2)}% > ${TOL * 100}%`);

  const cAxis = await p.eval(`(() => {
    /* Prove the flush check would also catch a DEAD axis, not just a bad
       number: set every line to 62% and the advances must collapse. */
    const plan = ${JSON.stringify(plans.two)};
    const bad = structuredClone(plan); bad.wdth = 62;
    return JSON.stringify(window.__fit.verify(bad, 'size'));
  })()`).then(JSON.parse);
  ok(cAxis.worst > TOL, 'CANARY a clamped/dead width axis is caught',
     `worst error ${(cAxis.worst * 100).toFixed(2)}%`);

  /* ---- the assertions --------------------------------------------------- */
  console.log('');
  for (const [w, h] of VIEWPORTS) {
    await p.resize(w, h);
    await p.eval(`window.__fit.setCap(${capFor(w) ?? 'null'})`);
    await p.settle(200);
    const set = setFor(w);
    const plan = plans[set];
    const r = await p.eval(
      `JSON.stringify(window.__fit.verify(${JSON.stringify(plan)}, 'size'))`).then(JSON.parse);
    ok(r.worst < TOL, `flush @${w}x${h} (${set}${capFor(w) ? ', capped' : ''})`,
       `worst ${(r.worst * 100).toFixed(2)}% on "${r.worstLine}", measure ${r.target}px`);

    /* Flush is worthless if the block eats the fold. The hero is 100svb, so the
       budget is the viewport minus the sticky header. */
    const m = await p.eval(`(() => {
      const ls = [...document.querySelectorAll('.l')];
      return JSON.stringify({
        block: document.getElementById('lines').getBoundingClientRect().height,
        biggest: Math.max(...ls.map(e => parseFloat(getComputedStyle(e).fontSize))),
      });
    })()`).then(JSON.parse);
    const frac = m.block / (h - HEADER);
    ok(frac < MAX_FOLD, `block fits the fold @${w}x${h}`,
       `${Math.round(m.block)}px = ${(frac * 100).toFixed(0)}% of ${h - HEADER}px`);

    /* A ratio alone would pass a tidy 40px headline on a short viewport. This
       is the assertion that the type is actually large. */
    ok(m.biggest >= MIN_DISPLAY, `type is display scale @${w}x${h}`,
       `largest line ${Math.round(m.biggest)}px >= ${MIN_DISPLAY}px`);
  }

  console.log('\n--- values for site.css ---');
  for (const [name, plan] of Object.entries(plans)) {
    console.log(`${name}: ` + plan.lines.map((l) => `${l.cqi}cqi`).join(' / '));
  }
} finally {
  await browser.close();
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
