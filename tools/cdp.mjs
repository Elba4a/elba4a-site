/* Minimal Chrome DevTools Protocol driver. Node stdlib only — Node 26 ships a
 * global WebSocket and fetch, so this needs no npm and no Puppeteer.
 *
 * It exists because the two cheaper options both lie:
 *   - `--screenshot` fires at load, before a WebGL scene has drawn anything.
 *   - `--virtual-time-budget` never terminates on a page with a permanent
 *     requestAnimationFrame loop, which this page has.
 * Both failure modes look like a blank page rather than an error, which is the
 * exact shape of every defect this project is trying to stop shipping.
 *
 * Usage:
 *   const b = await launch();
 *   const p = await b.page('http://…');
 *   await p.eval('scrollTo(0, 1e6)');
 *   await p.screenshot('out.png');
 *   await b.close();
 */

import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Every await in this file is bounded. There is no `timeout` binary on macOS,
   and the last verification pass silently no-opped because it assumed there
   was one — so the budget lives in the code instead of the shell. */
function deadline(promise, ms, what) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout ${ms}ms: ${what}`)), ms); }),
  ]);
}

export async function launch({ width = 1280, height = 800, port = 9333 } = {}) {
  const profile = join(tmpdir(), `cdp-${port}-${process.pid}`);
  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    /* Chrome 151 refuses a software WebGL context without this. Omit it and
       the page's gate correctly declines to load the scene, every visual
       assertion passes against a static page, and the run means nothing. */
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--disable-background-timer-throttling',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });

  let version = null;
  for (let i = 0; i < 100; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; }
    catch { await sleep(100); }
  }
  if (!version) {
    proc.kill('SIGKILL');
    throw new Error(`chrome never opened a debugging port.\n${stderr.slice(0, 800)}`);
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await deadline(new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('cdp socket failed')), { once: true });
  }), 10_000, 'cdp connect');

  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  });

  const send = (method, params = {}, sessionId) => deadline(
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
    }), 30_000, method);

  async function page(url) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);

    const loaded = new Promise((res) => {
      const fn = (m) => {
        if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') {
          listeners.delete(fn); res();
        }
      };
      listeners.add(fn);
    });
    await send('Page.navigate', { url }, sessionId);
    await deadline(loaded, 30_000, `load ${url}`);

    const api = {
      /* `Runtime.evaluate` in a headless browser this process launched, against
         a localhost page from this repo. Not JavaScript `eval()`, and no
         caller-supplied or network-supplied input reaches it — every
         expression below is a literal in tools/. This file never ships: the
         Dockerfile copies index.html and assets/ explicitly. */
      async eval(expression, { awaitPromise = false } = {}) {
        const r = await send('Runtime.evaluate',
          { expression, returnByValue: true, awaitPromise }, sessionId);
        if (r.exceptionDetails) {
          throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        }
        return r.result.value;
      },
      async screenshot(path) {
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        const buf = Buffer.from(data, 'base64');
        if (buf.length < 2000) throw new Error(`screenshot suspiciously small: ${buf.length}B`);
        writeFileSync(path, buf);
        return buf.length;
      },
      async resize(w, h) {
        await send('Emulation.setDeviceMetricsOverride',
          { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
      },
      /* Let the scene actually draw. Two rAF ticks plus a real pause beats any
         fixed sleep, because it is the renderer's own clock. */
      async settle(ms = 900) {
        await api.eval(
          `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(
             () => setTimeout(r, ${ms}))))`, { awaitPromise: true });
      },
    };
    return api;
  }

  return {
    page,
    async close() {
      try { ws.close(); } catch {}
      proc.kill('SIGKILL');
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}
