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
    let current = null;
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const next = links[sections.indexOf(entry.target)];
          if (next === current) continue;
          if (current) current.removeAttribute('aria-current');
          next.setAttribute('aria-current', 'true');
          current = next;
        }
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
     whether the machine will actually give you one. */
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) return;
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();

  /* Coarse pointer plus little memory is the profile that stutters. It still
     gets the scene, just a cheaper one. */
  const lowPower =
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    window.matchMedia('(max-width: 620px)').matches;

  import('./world.js')
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
