/* elba4a.com — one machined part.
 *
 * Five plates, milled from graphite, and each one is drilled with its own
 * evidence: fourteen perforations because there are fourteen Edge Functions,
 * thirty-three because there are thirty-three Postgres tables. The counts are
 * not decoration and they are not a caption — they are the machining, and you
 * can count them against the label that names them.
 *
 * THE ONE STRUCTURAL RULE: this renders only into scissor rectangles taken
 * from real DOM elements. The canvas is full-viewport and fixed, but every
 * frame it clips to the boxes CSS laid out for it, so the 3D is a cell of the
 * page grid rather than a backdrop behind everything.
 *
 * That is what makes text legible without fog, without a scrim, and without
 * translucent panels. Three earlier builds had all three, and all three were
 * mitigations for one bad decision: a canvas behind the whole page. Text and
 * geometry now cannot share a pixel, geometrically, rather than by tuning. */

import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, Mesh,
  Shape, Path, ExtrudeGeometry, MeshMatcapMaterial,
  TextureLoader, SRGBColorSpace, NeutralToneMapping,
  Vector3, MathUtils,
} from './vendor/three.module.min.js';

/* ---------------------------------------------------------------- geometry */

const PLATE = 4.4;     // plate is square; world units
const CORNER = 0.34;
const BEVEL = 0.07;

function roundedSquare(size, r) {
  const s = new Shape(), h = size / 2;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);   s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h, -h + r);
  return s;
}

/* Square holes: four corners each, so they read as drilled rather than
   punched, and they cost almost nothing to triangulate. */
function perforations(n, cols, size, pitch, offsetY = 0) {
  const rows = Math.ceil(n / cols), out = [];
  for (let i = 0; i < n; i++) {
    const x = ((i % cols) - (cols - 1) / 2) * pitch;
    const y = (Math.floor(i / cols) - (rows - 1) / 2) * pitch + offsetY;
    const p = new Path(), h = size / 2;
    p.moveTo(x - h, y - h); p.lineTo(x + h, y - h);
    p.lineTo(x + h, y + h); p.lineTo(x - h, y + h); p.closePath();
    out.push(p);
  }
  return out;
}

/* One aperture, in the proportion of the thing that layer builds. */
function aperture(w, h, r) {
  const p = new Path(), x = w / 2, y = h / 2;
  p.moveTo(-x + r, -y);
  p.lineTo(x - r, -y);  p.quadraticCurveTo(x, -y, x, -y + r);
  p.lineTo(x, y - r);   p.quadraticCurveTo(x, y, x - r, y);
  p.lineTo(-x + r, y);  p.quadraticCurveTo(-x, y, -x, y - r);
  p.lineTo(-x, -y + r); p.quadraticCurveTo(-x, -y, -x, -y + r);
  return p;
}

/* Every count here is measured from the work. If one changes in the code, it
   changes here too or the part is lying about the thing it depicts. */
const PLATES = [
  { key: 'app',   thick: 0.50, cut: () => [aperture(1.15, 2.42, 0.16)] },
  { key: 'web',   thick: 0.50, cut: () => [aperture(2.70, 1.70, 0.14)] },
  { key: 'edge',  thick: 0.50, cut: () => perforations(14, 7, 0.30, 0.58) },
  { key: 'data',  thick: 0.50, cut: () => perforations(33, 11, 0.22, 0.34) },
  { key: 'infra', thick: 1.10, cut: () => [] },
];

/* Wide enough that five plates read as five at a glance. At 0.22 the stack
   photographed as one solid block with hairline seams — the separation is the
   idea, so it has to be legible in the first frame, not on inspection. */
const GAP_CLOSED = 0.62;

export function createWorld(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  /* CSS owns every ground colour and this owns none. Two sources of truth for
     one dark value, meeting at a hairline in two different colour pipelines,
     is how you get a faintly visible rectangle in the middle of a section —
     a defect this page has shipped twice. Clear to nothing instead. */
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;   // identity below ~0.8, rolls off above
  renderer.toneMappingExposure = 1.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();

  /* 32°, not the 52° the previous build used. Fifty-two is a video-game lens:
     it splays the edge of every box and is the loudest "WebGL demo" tell there
     is. Thirty-two is a short telephoto, which is what makes a render read as
     product photography. This one number does more than any material change. */
  const camera = new PerspectiveCamera(32, 1, 0.1, 200);
  const DIR = new Vector3(16, 5.5, 9).normalize();

  const part = new Group();
  scene.add(part);

  /* Two materials, not five. The active plate in the band swaps to gold; every
     other plate stays graphite. Swapping a reference costs nothing and the
     draw call count is unchanged either way. */
  const graphite = new MeshMatcapMaterial();
  const gold = new MeshMatcapMaterial();

  const plates = PLATES.map(({ thick, cut }) => {
    const shape = roundedSquare(PLATE, CORNER);
    shape.holes.push(...cut());
    const geo = new ExtrudeGeometry(shape, {
      depth: thick, bevelEnabled: true,
      bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3,
      curveSegments: 14,
    });
    geo.center();
    const mesh = new Mesh(geo, graphite);
    part.add(mesh);
    return mesh;
  });

  /* Lay the stack out along Z for a given gap. Assignment, never accumulation:
     an earlier build used `+=` and a screenshot ended up on its side after two
     minutes of idle. */
  function layout(gap) {
    const total = PLATES.reduce((n, p) => n + p.thick, 0) + gap * (PLATES.length - 1);
    let z = total / 2;
    /* App at the +Z end, infra at -Z. The camera sits on +Z, so it meets the
       drilled faces first — the app aperture, then the perforated edge and data
       plates behind it. Stacked the other way the viewer gets the solid infra
       plate head-on and every count the part carries is hidden behind it. */
    plates.forEach((mesh, i) => {
      z -= PLATES[i].thick;
      mesh.position.z = z + PLATES[i].thick / 2;
      z -= gap;
    });
  }
  layout(GAP_CLOSED);

  /* Frame from the RECT, not the canvas, so the object covers the same share
     of its box at every aspect ratio. This is what makes "same on mobile"
     true rather than aspirational.

     The radius is solved from the current gap rather than measured once: the
     stack grows as the plates separate, and a fixed radius would let the part
     burst out of its cell exactly when it spreads. Half-diagonal of the face
     is hypot(2.2, 2.2) plus the bevel. */
  const FACE_R = Math.hypot(PLATE / 2, PLATE / 2) + BEVEL;
  const stackDepth = (gap) =>
    PLATES.reduce((n, p) => n + p.thick, 0) + gap * (PLATES.length - 1);
  const radiusFor = (gap) => Math.hypot(FACE_R, stackDepth(gap) / 2);

  function frameTo(aspect, gap) {
    const vFov = MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    /* 1.04 is nearly tangent — the part fills its cell instead of floating in
       the middle of one. Nothing reads as expensive at thumbnail scale. */
    const d = (radiusFor(gap) * 1.04) / Math.sin(Math.min(vFov, hFov) / 2);
    camera.aspect = aspect;
    camera.position.copy(DIR).multiplyScalar(d);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------------ pose */

  let pointerX = 0, pointerY = 0, tiltX = 0, tiltY = 0;
  const onPointer = (e) => {
    pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const BASE_X = MathUtils.degToRad(-9);
  const BASE_Y = MathUtils.degToRad(28);
  const GAP_OPEN = 2.2;

  const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
  const lerp = (a, b, n) => a + (b - a) * n;
  /* Smoothstep, so the spread eases at both ends instead of starting and
     stopping dead on the scroll boundary. */
  const ease = (n) => n * n * (3 - 2 * n);

  /* How far the reader is through a band's track, 0..1. Read fresh every
     frame from the live rect: a cached one goes wrong the moment a lazy image
     lands, a font swaps, or iOS resizes the URL bar, and a stale rect is the
     standard cause of a scene running a viewport behind the page. */
  function scrubOf(el) {
    const track = el.closest('.track');
    if (!track) return 0;
    const r = track.getBoundingClientRect();
    const travel = r.height - window.innerHeight;
    return travel > 0 ? clamp01(-r.top / travel) : 0;
  }

  let activeIndex = -1;

  /* Sets rotation, spacing and materials for one stage, and returns the gap so
     the camera can be framed to the size the part actually is right now. */
  function poseFor(el, t) {
    tiltY += (pointerX * MathUtils.degToRad(2) - tiltY) * 0.05;
    tiltX += (-pointerY * MathUtils.degToRad(2) - tiltX) * 0.05;

    if (el.dataset.pose !== 'band') {
      /* Bounded oscillation around a fixed base — a pure function of time, so
         it cannot drift however long the tab stays open. 0.09 rad is 5.2°. */
      part.rotation.y = BASE_Y + 0.09 * Math.sin(t * 0.11) + tiltY;
      part.rotation.x = BASE_X + 0.04 * Math.sin(t * 0.083) + tiltX;
      layout(GAP_CLOSED);
      setActive(-1);
      return GAP_CLOSED;
    }

    /* Framed for the OPEN gap the whole way through, never for the live one.
       Refitting each frame pulls the camera back at exactly the rate the
       plates separate, so the spread cancels itself out and the part just sits
       there changing shape slightly. Holding the frame means it starts small
       inside its cell and grows into it, which is the thing the scroll is
       supposed to be doing. */

    const p = scrubOf(el);
    const spread = ease(p);
    const gap = lerp(GAP_CLOSED, GAP_OPEN, spread);

    /* Turning further as it opens, so the reader sees INTO the stack rather
       than at the face of it. Deliberately not rotating the stack axis to
       vertical: the plate faces are perpendicular to that axis, so vertical
       shows them edge-on and hides every drilled count — and the counts are
       the whole payload. */
    /* Turns TOWARD the viewer's left, not away. The stack runs along local Z,
       and the camera sits mostly along +X: at the hero's 28° the stack axis is
       only ~36° off the view axis, so plates queue up behind one another and
       spreading them barely reads. Rotating down to about -5° puts the axis
       ~67° off the view — near-maximum lateral separation while the faces, and
       the counts drilled into them, are still turned toward you. Going all the
       way to -30° is geometrically perpendicular and useless: you get the
       plate edges and none of the evidence. */
    part.rotation.y = BASE_Y - MathUtils.degToRad(33) * spread + 0.05 * Math.sin(t * 0.11) + tiltY;
    part.rotation.x = BASE_X - MathUtils.degToRad(6) * spread + tiltX;
    layout(gap);

    /* Which plate is current. Held to the second half of the track so the
       reader watches it come apart before anything starts naming layers. */
    const step = clamp01((p - 0.18) / 0.72);
    setActive(p < 0.18 ? -1 : Math.min(PLATES.length - 1, Math.floor(step * PLATES.length)));
    el.closest('.band')?.setAttribute('data-scrub', '');
    return GAP_OPEN;
  }

  /* One DOM write per change, never per frame. */
  const rows = [...document.querySelectorAll('.layers .layer')];
  function setActive(i) {
    if (i === activeIndex) return;
    activeIndex = i;
    plates.forEach((m, n) => { m.material = n === i ? gold : graphite; });
    rows.forEach((row, n) => row.classList.toggle('is-on', n === i));
  }

  /* ------------------------------------------------------------------ loop */

  let raf = 0, running = false;
  let stages = [];
  const refresh = () => { stages = [...document.querySelectorAll('.stage')]; };
  refresh();

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (canvas.width === Math.round(w * renderer.getPixelRatio())
      && canvas.height === Math.round(h * renderer.getPixelRatio())) return;
    renderer.setSize(w, h, false);
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    resize();

    const t = (now === undefined ? performance.now() : now) / 1000;

    /* Clear the whole canvas first, with scissor OFF, or the previous frame
       lingers wherever a stage has scrolled out from under its rectangle. */
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);

    const H = window.innerHeight;
    let drew = false;
    for (const el of stages) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= H || r.width < 2 || r.height < 2) continue;
      const y = H - r.bottom;              // GL's origin is bottom-left
      renderer.setViewport(r.left, y, r.width, r.height);
      renderer.setScissor(r.left, y, r.width, r.height);
      /* Pose first, then frame to the size that pose actually produced. Two
         stages can be on screen at once and they hold the part differently,
         so both have to be set per rectangle rather than once per frame. */
      const gap = poseFor(el, t);
      frameTo(r.width / r.height, gap);
      renderer.render(scene, camera);
      drew = true;
    }
    renderer.setScissorTest(false);

    /* Nothing on screen needs the GPU. Stop until something does. */
    if (!drew) pause();
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }

  /* Wake only when a stage is near the viewport, so scrolling the paper part
     of the page costs nothing at all. */
  const io = new IntersectionObserver(
    (entries) => { entries.some((e) => e.isIntersecting) ? start() : pause(); },
    { rootMargin: '25% 0px' }
  );
  const observe = () => { refresh(); for (const el of stages) io.observe(el); };

  const onVisibility = () => { document.hidden ? pause() : start(); };
  document.addEventListener('visibilitychange', onVisibility);

  /* A lost context is routine on mobile when the tab is backgrounded. Restore
     rather than surrender; only give up if the driver drops us twice. */
  const losses = [];
  const onLost = (e) => { e.preventDefault(); pause(); losses.push(performance.now()); };
  const onRestored = () => {
    if (losses.filter((x) => performance.now() - x < 60_000).length >= 2) return destroy();
    start();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function destroy() {
    pause();
    io.disconnect();
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    for (const m of plates) m.geometry.dispose();
    for (const mat of [graphite, gold]) {
      if (mat.matcap) mat.matcap.dispose();
      mat.dispose();
    }
    renderer.dispose();
    renderer.forceContextLoss();
    document.documentElement.classList.remove('has-world');
  }

  /* The texture decides whether anything is worth showing, so the world only
     announces itself once the matcap has actually landed. */
  const loader = new TextureLoader();
  const load = (url, mat) => loader.loadAsync(url).then((tex) => {
    tex.colorSpace = SRGBColorSpace;
    mat.matcap = tex;
    mat.needsUpdate = true;
  });

  const ready = Promise.all([
    load('/assets/img/matcap-graphite.jpg?v=1', graphite),
    load('/assets/img/matcap-gold.jpg?v=1', gold),
  ]).then(() => {
    resize();
    observe();
    start();
  });

  /* Opened only for the harness, so it can assert the workload budget from
     `renderer.info` rather than estimating it. Not exposed to ordinary
     visitors — a page should not carry a debug surface it never uses. */
  if (new URLSearchParams(location.search).has('verify')) {
    window.__world = () => ({
      cam: camera.position.toArray().map((n) => +n.toFixed(2)),
      fov: camera.fov, aspect: +camera.aspect.toFixed(3),
      canvas: [canvas.width, canvas.height],
      stages: stages.length, running,
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      matcap: !!graphite.matcap && !!gold.matcap, active: activeIndex,
    });
  }

  return { destroy, ready, refresh };
}
