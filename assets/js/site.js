/* elba4a.com — the only JavaScript on the page. No framework, no dependency.
   Everything here is an enhancement: the page is complete and readable with
   this file blocked, which is why nothing below creates content or hides it. */

(() => {
  'use strict';

  /* ---------------------------------------------------- the language wipe */

  /* The control is a native <input type="range">, so keyboard, touch, and
     assistive tech already work before this runs. All this does is mirror the
     value onto a custom property. With the file blocked the stage keeps the
     52% written in the stylesheet, which still shows both builds at once. */
  for (const fig of document.querySelectorAll('[data-wipe]')) {
    const stage = fig.querySelector('.wipe__stage');
    const ctl = fig.querySelector('.wipe__ctl');
    if (!stage || !ctl) continue;

    const paint = () => stage.style.setProperty('--pos', ctl.value + '%');
    ctl.addEventListener('input', paint);
    paint();

    /* Dragging anywhere on the image feels like the seam is the handle.
       Pointer capture keeps the drag alive when the cursor leaves the frame. */
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const track = (ev) => {
        const box = stage.getBoundingClientRect();
        const pct = ((ev.clientX - box.left) / box.width) * 100;
        ctl.value = String(Math.min(100, Math.max(0, pct)));
        paint();
      };
      stage.setPointerCapture(e.pointerId);
      track(e);
      const move = (ev) => track(ev);
      const up = () => {
        stage.removeEventListener('pointermove', move);
        stage.removeEventListener('pointerup', up);
        stage.removeEventListener('pointercancel', up);
      };
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
    });
  }

  /* ------------------------------------------------------------ scrollspy */

  /* Marks the header link for the section currently in view. Purely a hint;
     the links work as plain anchors regardless. */
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
      /* Trip the moment a section reaches the upper third, so the mark
         changes when the reader arrives rather than when they leave. */
      { rootMargin: '-25% 0px -70% 0px' }
    );
    for (const section of sections) spy.observe(section);
  }
})();
