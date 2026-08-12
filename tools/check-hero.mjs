/* Asserts the hero on the REAL page, not on the isolated fit rig.
 *
 * tools/check-fit.mjs proves Archivo can hold flush lines. This proves the
 * shipped stylesheet actually does, which is a different claim: the first
 * version of it declared `letter-spacing` in `em` on the h1, where it resolved
 * against the inherited 17px body size instead of the 215px line, and every
 * line overran the measure by 6% while the rig stayed green.
 *
 * Run:  node tools/check-hero.mjs [baseUrl]
 * Exit: 0 pass · 1 assertion failed · 2 inconclusive (the run proved nothing)
 */

import { launch } from './cdp.mjs';

const BASE = process.argv[2] || 'http://localhost:8145';
const TOL = 0.015;
const VIEWPORTS = [[320, 568], [390, 844], [430, 932], [560, 900], [700, 900],
                   [768, 1024], [1280, 800], [1920, 1080], [2560, 1440]];
const HEADER = 60;
const MIN_DISPLAY = 80;

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
};

/* Measures the text ADVANCE of whichever element is the line at this
   breakpoint, via a Range over its contents — the element's own box is the full
   column width and would say nothing about where the letters end. */
const PROBE = `(() => {
  const type = document.querySelector('.hero__type');
  const measure = type.clientWidth;
  const wide = matchMedia('(min-width: 701px)').matches;
  const els = [...document.querySelectorAll(wide ? '.hero__h .ln' : '.hero__h .l')];
  const lines = els.map((el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    return { text: el.textContent.trim(),
             advance: r.getBoundingClientRect().width,
             size: parseFloat(getComputedStyle(el).fontSize) };
  });
  return JSON.stringify({
    measure, wide, lines,
    block: document.querySelector('.hero__h').getBoundingClientRect().height,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    stretch: getComputedStyle(els[0]).fontStretch,
  });
})()`;

const browser = await launch({ width: 1280, height: 800, port: 9459 });
try {
  const p = await browser.page(`${BASE}/index.html`);
  await p.eval(`document.fonts.ready`, { awaitPromise: true });
  await p.settle(700);

  /* ---- inconclusive guards ---------------------------------------------- */
  if (!(await p.eval(`document.fonts.check('760 100px Archivo')`))) {
    console.error('INCONCLUSIVE: Archivo did not load — every measurement below would be of a fallback face');
    process.exit(2);
  }
  if (!(await p.eval(`!!document.querySelector('.hero__h .ln1')`))) {
    console.error('INCONCLUSIVE: the hero markup is not the fitted structure');
    process.exit(2);
  }
  console.log('control: Archivo loaded, fitted hero markup present');

  /* The width axis has to be live on the real page too: if the @font-face lost
     its `font-stretch` range, the fit would still measure correct and the
     entrance would silently become a no-op. */
  const axis = await p.eval(`(() => {
    const el = document.querySelector('.hero__h .ln1');
    /* The entrance animation is fill: both, and the animation origin beats an
       inline style — probe without killing it first and every value reads
       100%, which looks exactly like a dead axis. */
    el.style.animation = 'none';
    const w = () => { const r = document.createRange(); r.selectNodeContents(el);
                      return r.getBoundingClientRect().width; };
    el.style.fontStretch = '62%'; const a = w();
    el.style.fontStretch = '125%'; const b = w();
    el.style.fontStretch = ''; el.style.animation = '';
    return +(b / a).toFixed(3);
  })()`);
  if (axis < 1.5) {
    console.error(`INCONCLUSIVE: the wdth axis is dead on the shipped page (62%→125% is ${axis}x)`);
    process.exit(2);
  }
  console.log(`control: wdth axis live on the page (${axis}x)`);

  for (const [w, h] of VIEWPORTS) {
    await p.resize(w, h);
    await p.settle(260);
    /* Crossing the 701px breakpoint starts the entrance animation fresh, because
       the rule that carries it lives inside a media query. Measure without
       waiting and the line is still mid-widen: the first run of this file read
       33% short at 320 and 10% at 768 purely from probe timing, and blamed the
       stylesheet. */
    await p.eval(`Promise.all(document.getAnimations()
      /* Scroll-driven animations hang off view() timelines and never finish;
         awaiting all of them hangs the run forever. Only the entrance ones,
         which run on the document timeline, are what we are waiting for. */
      .filter(a => a.timeline === document.timeline)
      .map(a => a.finished.catch(() => {})))`, { awaitPromise: true });
    const m = await p.eval(PROBE).then(JSON.parse);

    let worst = 0, worstLine = null;
    for (const l of m.lines) {
      const err = Math.abs(l.advance - m.measure) / m.measure;
      if (err > worst) { worst = err; worstLine = l.text; }
    }
    ok(worst < TOL, `flush @${w}x${h} (${m.lines.length} lines)`,
       `worst ${(worst * 100).toFixed(2)}% on "${worstLine}", measure ${Math.round(m.measure)}px`);

    ok(m.overflow === 0, `no horizontal overflow @${w}x${h}`, `${m.overflow}px`);

    const frac = m.block / (h - HEADER);
    ok(frac < .78, `headline fits the fold @${w}x${h}`,
       `${Math.round(m.block)}px = ${(frac * 100).toFixed(0)}% of ${h - HEADER}px`);

    const biggest = Math.max(...m.lines.map((l) => l.size));
    ok(biggest >= MIN_DISPLAY, `type is display scale @${w}x${h}`,
       `largest line ${Math.round(biggest)}px`);
  }

  /* ---- canary: a detector that has never fired cannot be told from one that
         cannot fire. Break the fit on purpose and require every check above to
         notice. --------------------------------------------------------- */
  await p.resize(1280, 800);
  await p.settle(200);
  const canary = await p.eval(`(() => {
    document.querySelector('.hero__h .ln1').style.fontSize = '30cqi';
    const r = document.createRange(); r.selectNodeContents(document.querySelector('.hero__h .ln1'));
    const adv = r.getBoundingClientRect().width;
    const measure = document.querySelector('.hero__type').clientWidth;
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    document.querySelector('.hero__h .ln1').style.fontSize = '';
    return JSON.stringify({ err: Math.abs(adv - measure) / measure, over });
  })()`).then(JSON.parse);
  ok(canary.err > TOL, 'CANARY a broken fit is caught by the flush check',
     `${(canary.err * 100).toFixed(1)}% error`);

  /* The document-overflow assertion above cannot fail from a bad fit, and that
     is by design: `overflow-x: clip` on the headline absorbs it, so a fallback
     face wider than Archivo never puts a scrollbar on the page for the length
     of one font swap. Since the check cannot detect the thing it looks like it
     detects, assert the guard that makes it true instead — the canary above
     confirms a broken fit produced no overflow at all. */
  ok(canary.over === 0, 'the headline clip absorbs a bad fit rather than scrolling the page',
     `${canary.over}px overflow while 63% over the measure`);
  ok(await p.eval(`getComputedStyle(document.querySelector('.hero__h')).overflowX === 'clip'`),
     'the clip guard is present on .hero__h');
} finally {
  await browser.close();
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
