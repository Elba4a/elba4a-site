/* Asserts the things a DOM-only harness cannot see: that the scene is on, that
 * it paints ONLY inside its stage rectangles, and that its workload stays
 * inside budget.
 *
 * Run:  node tools/check-scene.mjs [baseUrl]
 * Exit: 0 pass · 1 assertion failed · 2 inconclusive (the run proved nothing)
 *
 * The 2 matters. A previous verification pass reported success while Chrome had
 * never launched, so "did not fail" and "passed" have to be different codes.
 */

import { launch } from './cdp.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8145';
const OUT = new URL('./.shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const MAX_CALLS = 10;
const MAX_TRIS = 30_000;

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
};

/* Diffs two frames and reports how much differs, split by whether it falls
   inside a stage rectangle or outside one. Outside is the whole assertion:
   the scene must be invisible everywhere it was not given a box. */
const DIFF = (a, b, rects) => `
  (async () => {
    const grab = async (s) => {
      const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      return { d: x.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
    };
    const A = await grab("${a}"), B = await grab("${b}");
    if (A.w !== B.w || A.h !== B.h) return { error: 'size mismatch' };
    const rects = ${JSON.stringify(rects)};
    const inRect = (x, y) => rects.some(r =>
      x >= r.x - 1 && x <= r.x + r.width + 1 && y >= r.y - 1 && y <= r.y + r.height + 1);
    let inside = 0, outside = 0, firstOut = null;
    for (let y = 0; y < A.h; y++) {
      for (let x = 0; x < A.w; x++) {
        const i = (y * A.w + x) * 4;
        if (Math.abs(A.d[i] - B.d[i]) <= 6 && Math.abs(A.d[i+1] - B.d[i+1]) <= 6
            && Math.abs(A.d[i+2] - B.d[i+2]) <= 6) continue;
        if (inRect(x, y)) inside++;
        else { outside++; if (!firstOut) firstOut = x + ',' + y; }
      }
    }
    return { inside, outside, firstOut, total: A.w * A.h };
  })()`;

const browser = await launch({ width: 1280, height: 800, port: 9451 });
try {
  const p = await browser.page(`${BASE}/index.html?verify=1`);
  await p.settle(1800);

  /* ---- inconclusive guards: not assertions. If any of these fail the run
         proved nothing and must not be reported as a pass. ----------------- */
  if (!(await p.eval(`!!document.createElement('canvas').getContext('webgl2')`))) {
    console.error('INCONCLUSIVE: no webgl2 in this Chrome (--enable-unsafe-swiftshader missing?)');
    process.exit(2);
  }
  if (!(await p.eval(`document.documentElement.classList.contains('has-world')`))) {
    console.error('INCONCLUSIVE: the scene never loaded');
    process.exit(2);
  }
  if (!(await p.eval(`typeof window.__world === 'function'`))) {
    console.error('INCONCLUSIVE: no verify hook — cannot read the workload');
    process.exit(2);
  }
  console.log('control: webgl2 present, has-world present, verify hook present');

  await p.eval(`document.documentElement.style.scrollBehavior='auto'`);

  for (const [w, h] of [[1280, 800], [390, 844], [768, 1024]]) {
    await p.resize(w, h);
    await p.settle(1200);

    const rects = await p.eval(`JSON.stringify([...document.querySelectorAll('.stage')]
      .map(el => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y),
                 width: Math.round(r.width), height: Math.round(r.height) }; }))`);
    const stageRects = JSON.parse(rects);
    ok(stageRects.length > 0, `a stage exists @${w}`, `${stageRects.length}`);

    const onFile = `${OUT}scene-${w}-on.png`;
    const offFile = `${OUT}scene-${w}-off.png`;
    await p.screenshot(onFile);
    await p.eval(`document.getElementById('world').style.visibility='hidden'`);
    await p.settle(320);
    await p.screenshot(offFile);
    await p.eval(`document.getElementById('world').style.visibility=''`);
    await p.settle(320);

    const on = readFileSync(onFile).toString('base64');
    const off = readFileSync(offFile).toString('base64');
    const d = await p.eval(DIFF(on, off, stageRects), { awaitPromise: true });

    /* Positive control first. If hiding the canvas changes nothing anywhere,
       the scene was never rendering and the assertion below would pass against
       two identical pictures of a static page — the exact vacuous shape this
       project already shipped once. */
    ok(d.inside > 2000, `CONTROL the scene actually renders @${w}`,
       `${d.inside}px differ inside the stage`);

    /* The architecture, stated as a number. Anything the scene changes outside
       a rectangle CSS gave it is geometry loose on the page. */
    ok(d.outside === 0, `the scene paints ONLY inside its stage @${w}`,
       `${d.outside}px outside${d.firstOut ? ', first at ' + d.firstOut : ''}`);

    const info = await p.eval(`JSON.stringify(window.__world())`).then(JSON.parse);
    ok(info.calls <= MAX_CALLS, `draw calls within budget @${w}`, `${info.calls} <= ${MAX_CALLS}`);
    ok(info.tris <= MAX_TRIS, `triangles within budget @${w}`, `${info.tris} <= ${MAX_TRIS}`);
    ok(info.matcap, `matcap loaded @${w}`);
  }

  /* ---- source invariants ------------------------------------------------ */
  const raw = await (await fetch(`${BASE}/assets/js/world.js?v=6`)).text();
  /* Strip comments: the file documents the bugs it fixed by quoting them, and
     a checker that cannot tell code from prose reports the documentation. */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const ACC = /(rotation|position|scale)\.[xyz]\s*[-+]=/;
  ok(!ACC.test(src), 'no accumulating transform in world.js');
  ok(!/Math\.random/.test(src), 'no Math.random in world.js');
  ok(!/new Fog|FogExp2/.test(src), 'no fog in world.js');
  ok(ACC.test('mesh.rotation.z += 0.01;'),
     'CANARY accumulation detector fires on a known-bad line');

  /* Same comment-stripping discipline as the JS: this stylesheet explains the
     rules it deleted by naming them, and a checker that reads prose as code
     reports the documentation as the defect. */
  const cssRaw = await (await fetch(`${BASE}/assets/css/site.css?v=10`)).text();
  const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/backdrop-filter/.test(css), 'no backdrop-filter anywhere in the stylesheet');
  const hasWorldRules = css.split('\n').filter((l) => l.includes('.has-world') && !l.includes('#world'));
  ok(hasWorldRules.length === 0, '.has-world touches nothing but #world',
     hasWorldRules.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
