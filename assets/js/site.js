/* elba4a.com — page script. No framework, no dependency of its own.
 *
 * Everything here is an enhancement. The page is complete and readable with
 * this file blocked, which is why nothing below creates content or hides it. */

(() => {
  'use strict';

  /* ------------------------------------------------------------ scrollspy */

  const links = [...document.querySelectorAll('.hdr__nav a[href^="#"]')];
  const sections = links
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const visible = new Set();
    let current = null;
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }

        /* Take the highest section still inside the band, and clear the mark
           when the band is empty. Acting only on the `isIntersecting` branch
           meant nothing ever removed `aria-current`, so over the hero and the
           footer — where no section qualifies — the header went on claiming
           you were somewhere you had already left. */
        const top = sections.find((s) => visible.has(s));
        const next = top ? links[sections.indexOf(top)] : null;

        if (next === current) return;
        if (current) current.removeAttribute('aria-current');
        if (next) next.setAttribute('aria-current', 'true');
        current = next;
      },
      /* Trip when a section reaches the upper third, so the mark changes when
         the reader arrives rather than when they leave. */
      { rootMargin: '-25% 0px -70% 0px' }
    );
    for (const section of sections) spy.observe(section);
  }

  /* --------------------------------------------------------------- the 3D */

  /* The scene is 183KB gzipped of Three.js plus five textures. That is a real
     cost, so it is only paid by a client that can actually use it. Every check
     below runs BEFORE the dynamic import, never after: a client that fails one
     never requests the library at all. */

  const canvas = document.getElementById('world');
  if (!canvas) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  /* Respect an explicit data-saving preference. */
  const conn = navigator.connection;
  if (conn && (conn.saveData || /^(slow-)?2g$/.test(conn.effectiveType || ''))) return;

  /* Probe for a real WebGL context, then throw it away. `getContext` is the
     only honest test — a `WebGLRenderingContext` in `window` says nothing about
     whether the machine will actually give you one.

     `webgl2` ONLY. three r185 asks for `"webgl2"` and throws if it cannot have
     it; there is no WebGL1 path. Falling back to `getContext('webgl')` here
     let a WebGL1-only client pass the gate, download the whole library, and
     then throw inside the import. */
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return;
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();

  /* Coarse pointer plus little memory is the profile that stutters. It still
     gets the scene, just a cheaper one. */
  const lowPower =
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    window.matchMedia('(max-width: 620px)').matches;

  /* `?v=` on the dynamic import too. /assets/* is served `immutable`, so
     without one an edited world.js would be served from cache forever to
     everyone who had already loaded the page. */
  import('./world.js?v=2')
    .then(({ createWorld }) => {
      const world = createWorld(canvas, { lowPower });
      document.documentElement.classList.add('has-world');
      window.addEventListener('pagehide', () => world.destroy(), { once: true });
    })
    .catch(() => {
      /* A failed import leaves the static page exactly as it was. */
      document.documentElement.classList.remove('has-world');
    });
})();
