/* Asserts the things a DOM-only harness cannot see: that the 3D scene is
 * actually on, actually non-empty at every scroll depth, and that its motion
 * is bounded rather than accumulating.
 *
 * Run:  node tools/check-scene.mjs [baseUrl]
 * Exit: 0 pass · 1 assertion failed · 2 inconclusive (the run proved nothing)
 *
 * The 2 matters. The previous verification pass reported success while Chrome
 * had never launched, so "did not fail" and "passed" have to be different
 * exit codes.
 */

import { launch } from './cdp.mjs';

const BASE = process.argv[2] || 'http://localhost:8145';
const OUT = new URL('./.shots/', import.meta.url).pathname;
const { mkdirSync } = await import('node:fs');
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
};

/* Reads the composited frame back through the page itself: screenshot to
   base64, decode with createImageBitmap, histogram it in an OffscreenCanvas.
   No PNG decoder and no image dependency on this side. */
const STATS = (b64, label, region = null) => `
  (async () => {
    const bmp = await createImageBitmap(await (await fetch("data:image/png;base64,${b64}")).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    const r = ${region ? JSON.stringify(region) : 'null'};
    const d = r ? x.getImageData(r.x, r.y, r.w, r.h).data
                : x.getImageData(0, 0, bmp.width, bmp.height).data;
    const hist = new Map(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] >> 3) << 10 | (d[i+1] >> 3) << 5 | (d[i+2] >> 3);
      hist.set(k, (hist.get(k) || 0) + 1);
    }
    return { label: "${label}", flat: Math.max(...hist.values()) / n, bins: hist.size };
  })()`;

/* The reading column, in the 1280x800 frame. Text lives here; geometry must
   not. This is the assertion that replaces the radial paper scrim — a scrim
   is an admission that the composition was never authored. */
const COLUMN = { x: 100, y: 90, w: 560, h: 660 };

/* Scroll positions where the reading column holds real product screenshots.
   A canvas-on/canvas-off pixel diff would separate content from geometry here
   without needing this list, but it only means anything once reading grounds
   are opaque. In this build the section panels are deliberately translucent
   over the scene, so that diff measures the design rather than a defect. It
   belongs with the rebuild, not with this repair. */
const IMAGERY = [0.25, 0.5];

const DIFF = (aB64, bB64, r) => `
  (async () => {
    const grab = async (s) => {
      const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      return x.getImageData(${r.x}, ${r.y}, ${r.w}, ${r.h}).data;
    };
    const A = await grab("${aB64}"), B = await grab("${bB64}");
    let diff = 0; const n = A.length / 4;
    for (let i = 0; i < A.length; i += 4) {
      /* 8/255 per channel of slack absorbs JPEG-ish compositing noise without
         hiding a real wash, which shifts whole regions by far more. */
      if (Math.abs(A[i]-B[i]) > 8 || Math.abs(A[i+1]-B[i+1]) > 8 || Math.abs(A[i+2]-B[i+2]) > 8) diff++;
    }
    return { frac: diff / n, diff, n };
  })()`;

const browser = await launch({ width: 1280, height: 800 });
try {
  const p = await browser.page(`${BASE}/index.html`);
  await p.settle(1200);

  /* ---- inconclusive-run guards. These are not assertions; if any fails the
         run proved nothing and must not be reported as a pass. ------------- */
  const gl = await p.eval(`!!document.createElement('canvas').getContext('webgl2')`);
  if (!gl) { console.error('INCONCLUSIVE: no webgl2 in this Chrome'); process.exit(2); }
  const hasWorld = await p.eval(`document.documentElement.classList.contains('has-world')`);
  if (!hasWorld) { console.error('INCONCLUSIVE: the scene never loaded'); process.exit(2); }
  console.log('control: webgl2 present, has-world present');

  /* Smooth scrolling would make every scrollTo a race. */
  await p.eval(`document.documentElement.style.scrollBehavior='auto'`);

  /* ---- 1. the frame is never empty, at any depth --------------------------
     The build being replaced rendered pure (252,252,249) for the last ~10% of
     the page because the camera flew past the last layer. `flat` is the share
     of the frame taken by the single most common 5-bit colour. */
  for (const pos of [0, 0.25, 0.5, 0.75, 0.9, 1.0]) {
    await p.eval(`scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * ${pos})`);
    await p.settle(1100);
    const file = `${OUT}p${String(pos).replace('.', '')}.png`;
    await p.screenshot(file);
    const b64 = (await import('node:fs')).readFileSync(file).toString('base64');
    const s = await p.eval(STATS(b64, `p=${pos}`), { awaitPromise: true });
    ok(s.flat <= 0.985, `frame not blank at p=${pos}`, `flat=${s.flat.toFixed(4)} bins=${s.bins}`);
    ok(s.bins >= 24, `frame has colour variety at p=${pos}`, `bins=${s.bins}`);

    /* Inverted on purpose. A LOW flatness in the reading column means a wash
       is sitting under the copy — a ghost screenshot behind the lede, or a
       slab field smeared across a heading, both of which shipped.

       Not asserted where the column legitimately holds imagery: the Hekta
       gallery is a row of real screenshots, and a photograph of a photograph
       is not flat. Announced rather than skipped silently — a check that
       quietly exempts half the page reads as full coverage when it is not. */
    if (IMAGERY.includes(pos)) {
      console.log(`SKIP reading-column flatness at p=${pos} (gallery imagery, not a wash)`);
    } else {
      const col = await p.eval(STATS(b64, `col p=${pos}`, COLUMN), { awaitPromise: true });
      ok(col.flat >= 0.80, `reading column clear of geometry at p=${pos}`,
         `flat=${col.flat.toFixed(4)}`);
    }
  }

  /* ---- 2. drift is bounded ------------------------------------------------
     Every rotation is a pure function of time, so a long dwell cannot walk a
     product screenshot onto its side the way `rotation.z += spin` did. There
     is no scene handle to read, so assert the source shape instead — the
     property the fix actually guarantees. */
  const raw = await (await fetch(`${BASE}/assets/js/world.js?v=2`)).text();
  /* Strip comments first. The file explains the bug it fixed by quoting the
     old line, and a checker that cannot tell code from prose reports the
     documentation as the defect. */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  ok(!/(rotation|position|scale)\.[xyz]\s*[-+]=/.test(src), 'no accumulating transform in world.js');
  ok(!/Math\.random/.test(src), 'no Math.random in world.js');
  ok(/Math\.sin\(t \*/.test(src), 'motion is a function of time');

  /* Canary: prove the accumulation detector can still fail. A grep that has
     never matched is indistinguishable from a grep that cannot match. */
  const ACC = /(rotation|position|scale)\.[xyz]\s*[-+]=/;
  ok(ACC.test('mesh.rotation.z += 0.01;'), 'CANARY accumulation detector fires on a known-bad line');

  /* ---- 3. the gate still refuses when it should --------------------------- */
  ok(/getContext\('webgl2'\)\s*;/.test(await (await fetch(`${BASE}/assets/js/site.js?v=3`)).text()),
     'gate probes webgl2 only (three r185 has no webgl1 path)');
} finally {
  await browser.close();
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
