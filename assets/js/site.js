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

  /* ------------------------------------------------------------ prototype */

  /* The phone is a real tablist over nine real screens. Every screen ships in
     the markup and every one is reachable with the keyboard before this file
     runs — all this adds is that only one is shown at a time. Blocked, the
     reader gets nine screens stacked down the page, which is worse but never
     broken.

     Nothing here claims to be the running app. The screens are the app's own
     App Store captures at their native 1320x2868, and the walkthrough follows
     the affordances printed in the pixels: the three chevrons on Home go where
     their own labels say they go. */

  const proto = document.querySelector('.proto');
  if (!proto) return;

  const tabs = [...proto.querySelectorAll('[role="tab"]')];
  const screens = [...proto.querySelectorAll('.screen')];
  const caption = proto.querySelector('.phone__cap');
  if (!tabs.length || tabs.length !== screens.length) return;

  /* Only now is one-at-a-time true, so only now may the rest hide. Setting
     this in the stylesheet would leave eight screens invisible and unreachable
     on any client where this script does not run. */
  proto.classList.add('proto--live');

  let active = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));

  const show = (i, { focus = false } = {}) => {
    if (i === active) return;
    for (const [n, tab] of tabs.entries()) {
      const on = n === i;
      tab.setAttribute('aria-selected', String(on));
      /* Roving tabindex: one stop for the whole strip, arrows move inside it. */
      tab.tabIndex = on ? 0 : -1;
      screens[n].hidden = !on;
    }
    /* Re-run the transition by restarting the animation on the incoming
       screen. A class toggle would not replay without a reflow. */
    screens[i].getAnimations().forEach((a) => { a.cancel(); a.play(); });
    if (caption) caption.textContent = tabs[i].dataset.cap || '';
    /* The Home-only hotspots are the printed chevrons; they mean nothing on
       any other screen. */
    proto.dataset.screen = tabs[i].dataset.key;
    active = i;
    if (focus) tabs[i].focus();
  };

  proto.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) { show(tabs.indexOf(tab), { focus: true }); return; }
    const hot = e.target.closest('.hot');
    if (hot) show(tabs.findIndex((t) => t.dataset.key === hot.dataset.to), { focus: false });
  });

  proto.addEventListener('keydown', (e) => {
    if (!e.target.closest('[role="tab"]')) return;
    const last = tabs.length - 1;
    const to = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    show(Math.min(last, Math.max(0, to)), { focus: true });
  });

  /* Warm the other eight after the page has settled, so the first tap is
     instant without competing with the first screen for bandwidth. */
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      for (const img of proto.querySelectorAll('.screen img[loading="lazy"]')) {
        img.loading = 'eager';
      }
    });
  }
})();
