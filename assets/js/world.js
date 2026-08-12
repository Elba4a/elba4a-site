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
  Box3, Sphere, Vector3, MathUtils,
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

  const material = new MeshMatcapMaterial();
  const plates = PLATES.map(({ thick, cut }) => {
    const shape = roundedSquare(PLATE, CORNER);
    shape.holes.push(...cut());
    const geo = new ExtrudeGeometry(shape, {
      depth: thick, bevelEnabled: true,
      bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3,
      curveSegments: 14,
    });
    geo.center();
    const mesh = new Mesh(geo, material);
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
     true rather than aspirational. */
  const bounds = new Sphere();
  new Box3().setFromObject(part).getBoundingSphere(bounds);

  function frameTo(aspect) {
    const vFov = MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    /* 1.04 is nearly tangent — the part fills its cell instead of floating in
       the middle of one. Nothing reads as expensive at thumbnail scale. */
    const d = (bounds.radius * 1.04) / Math.sin(Math.min(vFov, hFov) / 2);
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

  function pose(t) {
    /* Bounded oscillation around a fixed base — a pure function of time, so it
       cannot drift however long the tab stays open. 0.09 rad is 5.2°, forever. */
    tiltY += (pointerX * MathUtils.degToRad(2) - tiltY) * 0.05;
    tiltX += (-pointerY * MathUtils.degToRad(2) - tiltX) * 0.05;
    part.rotation.y = BASE_Y + 0.09 * Math.sin(t * 0.11) + tiltY;
    part.rotation.x = BASE_X + 0.04 * Math.sin(t * 0.083) + tiltX;
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
    pose(t);

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
      frameTo(r.width / r.height);
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
    if (material.matcap) material.matcap.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    document.documentElement.classList.remove('has-world');
  }

  /* The texture decides whether anything is worth showing, so the world only
     announces itself once the matcap has actually landed. */
  const ready = new TextureLoader()
    .loadAsync('/assets/img/matcap-graphite.jpg?v=1')
    .then((tex) => {
      tex.colorSpace = SRGBColorSpace;
      material.matcap = tex;
      material.needsUpdate = true;
      resize();
      observe();
      start();
    });

  /* Opened only for the harness, so it can assert the workload budget from
     `renderer.info` rather than estimating it. Not exposed to ordinary
     visitors — a page should not carry a debug surface it never uses. */
  if (new URLSearchParams(location.search).has('verify')) {
    window.__world = () => ({
      radius: +bounds.radius.toFixed(3),
      cam: camera.position.toArray().map((n) => +n.toFixed(2)),
      fov: camera.fov, aspect: +camera.aspect.toFixed(3),
      canvas: [canvas.width, canvas.height],
      stages: stages.length, running,
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      matcap: !!material.matcap,
    });
  }

  return { destroy, ready, refresh };
}
