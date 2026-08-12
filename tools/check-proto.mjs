/* Asserts the prototype: that every screen is reachable, that it is reachable
 * WITHOUT a mouse, and that it does not lie about the product.
 *
 * Run:  node tools/check-proto.mjs [baseUrl]
 * Exit: 0 pass · 1 assertion failed · 2 inconclusive (the run proved nothing)
 */

import { launch } from './cdp.mjs';

const BASE = process.argv[2] || 'http://localhost:8145';

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
};

const shown = `(() => {
  const p = document.querySelector('.proto');
  const on = [...p.querySelectorAll('.screen')].filter((s) => !s.hidden);
  const sel = [...p.querySelectorAll('[role="tab"]')].filter((t) => t.getAttribute('aria-selected') === 'true');
  return JSON.stringify({
    count: on.length, key: on[0]?.dataset.key,
    selCount: sel.length, selKey: sel[0]?.dataset.key,
    dataScreen: p.dataset.screen,
    cap: p.querySelector('.phone__cap').textContent.trim().slice(0, 28),
    focus: document.activeElement?.dataset?.key || null,
  });
})()`;

const browser = await launch({ width: 1280, height: 900, port: 9461 });
try {
  const p = await browser.page(`${BASE}/index.html`);
  await p.settle(700);

  if (!(await p.eval(`document.querySelector('.proto')?.classList.contains('proto--live')`))) {
    console.error('INCONCLUSIVE: the prototype script never took over');
    process.exit(2);
  }

  const keys = await p.eval(
    `JSON.stringify([...document.querySelectorAll('.proto [role="tab"]')].map(t => t.dataset.key))`
  ).then(JSON.parse);
  ok(keys.length === 9, 'nine screens are offered', keys.join(' '));

  /* The images have to be the real captures at their real size. A wrong file
     or a 404 would still lay out, because the frame owns the aspect ratio. */
  const imgs = await p.eval(`JSON.stringify([...document.querySelectorAll('.proto .screen img')]
    .map(i => ({ w: i.naturalWidth, h: i.naturalHeight, src: i.currentSrc.split('/').pop() })))`)
    .then(JSON.parse);
  ok(imgs.every((i) => i.w === 660 && i.h === 1434),
     'every screen is the real 1320x2868 capture at an exact half',
     imgs.map((i) => `${i.w}x${i.h}`).join(' '));
  ok(new Set(imgs.map((i) => i.src)).size === 9, 'nine distinct files, none repeated');

  /* Alt text is the only description a screen reader gets, and it is doing
     real work here — nine near-identical device frames otherwise. */
  const alts = await p.eval(`JSON.stringify([...document.querySelectorAll('.proto .screen img')]
    .map(i => i.alt.length))`).then(JSON.parse);
  ok(alts.every((n) => n > 60), 'every screen carries a real description',
     `shortest ${Math.min(...alts)} chars`);

  /* ---- clicking each tab shows exactly that screen -------------------- */
  for (const key of keys) {
    await p.eval(`document.querySelector('.proto [data-key="${key}"][role="tab"]').click()`);
    await p.settle(120);
    const s = await p.eval(shown).then(JSON.parse);
    ok(s.count === 1 && s.key === key && s.selCount === 1 && s.selKey === key && s.dataScreen === key,
       `tab "${key}" shows exactly that screen`,
       `${s.count} visible (${s.key}), ${s.selCount} selected (${s.selKey})`);
  }

  /* ---- the keyboard ---------------------------------------------------- */
  /* Click rather than focus: with a roving tabindex the unselected tabs are
     not focusable, so focusing one directly builds a state a keyboard user
     cannot reach — and then asserts against it. */
  await p.eval(`document.querySelector('.proto [data-key="home"][role="tab"]').click()`);
  await p.settle(120);
  await p.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'ArrowRight', bubbles: true }))`);
  await p.settle(120);
  let s = await p.eval(shown).then(JSON.parse);
  ok(s.key === 'assistant' && s.focus === 'assistant',
     'ArrowRight moves the screen AND the focus', `${s.key} / focus ${s.focus}`);

  await p.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'End', bubbles: true }))`);
  await p.settle(120);
  s = await p.eval(shown).then(JSON.parse);
  ok(s.key === 'paywall', 'End reaches the last screen', s.key);

  /* Roving tabindex: the strip is ONE tab stop, not nine. */
  const stops = await p.eval(
    `[...document.querySelectorAll('.proto [role="tab"]')].filter(t => t.tabIndex === 0).length`);
  ok(stops === 1, 'the strip is one tab stop, not nine', `${stops} reachable by Tab`);

  /* ---- the printed chevrons ------------------------------------------- */
  await p.eval(`document.querySelector('.proto [data-key="home"][role="tab"]').click()`);
  await p.settle(120);
  for (const [to, label] of [['budgets', 'budget health'], ['installments', 'instalments due'], ['capture', 'new transaction']]) {
    await p.eval(`document.querySelector('.proto [data-key="home"][role="tab"]').click()`);
    await p.settle(80);
    await p.eval(`document.querySelector('.hot[data-to="${to}"]').click()`);
    await p.settle(120);
    const r = await p.eval(shown).then(JSON.parse);
    ok(r.key === to, `the printed "${label}" chevron opens ${to}`, r.key);
  }

  /* The hotspots are Home's own chevrons; on any other screen they point at
     nothing that exists. */
  await p.eval(`document.querySelector('.proto [data-key="analytics"][role="tab"]').click()`);
  await p.settle(150);
  const hotVisible = await p.eval(
    `[...document.querySelectorAll('.hot')].filter(h => h.getBoundingClientRect().width > 0).length`);
  ok(hotVisible === 0, 'the Home chevrons are gone on every other screen', `${hotVisible} still live`);

  /* ---- the caption tracks the screen ----------------------------------- */
  await p.eval(`document.querySelector('.proto [data-key="networth"][role="tab"]').click()`);
  await p.settle(120);
  s = await p.eval(shown).then(JSON.parse);
  ok(/^Net worth/.test(s.cap), 'the caption follows the screen', s.cap);

  /* ---- CANARIES. A detector that has never fired cannot be told from one
         that cannot fire. --------------------------------------------- */
  const c1 = await p.eval(`(() => {
    const s = document.querySelector('.screen[data-key="capture"]');
    s.hidden = false;                       /* two screens at once */
    const n = [...document.querySelectorAll('.screen')].filter(x => !x.hidden).length;
    s.hidden = true;
    return n;
  })()`);
  ok(c1 === 2, 'CANARY the one-at-a-time check can see two screens', `saw ${c1}`);

  const c2 = await p.eval(`(() => {
    const t = document.querySelectorAll('.proto [role="tab"]')[3];
    const before = t.tabIndex; t.tabIndex = 0;
    const n = [...document.querySelectorAll('.proto [role="tab"]')].filter(x => x.tabIndex === 0).length;
    t.tabIndex = before;
    return n;
  })()`);
  ok(c2 === 2, 'CANARY the tab-stop check can see an extra stop', `saw ${c2}`);

  /* ---- the page must not claim the app shipped ------------------------- */
  const text = await p.eval(`document.querySelector('.proto').innerText`);
  ok(/Pre-submission/i.test(text), 'the band states pre-submission');
  ok(!/App Store|Download|Get it on|shipped|launched/i.test(text),
     'the band makes no claim the app is released');
} finally {
  await browser.close();
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
