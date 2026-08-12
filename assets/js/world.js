/* elba4a.com — the stack, as a place you fall through.
 *
 * Every count in this scene is a measured number from the work itself: 14 Edge
 * Functions, 33 Postgres tables, 83 migrations. The geometry is evidence, not
 * decoration, which is the only reason a 3D layer earns its weight here.
 *
 * This module is loaded ONLY after main.js has decided the client can take it.
 * It never renders text and never owns content: every word and link lives in
 * the DOM behind it, so the static page is complete on its own. */

import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, Color, Fog,
  PlaneGeometry, BoxGeometry, MeshBasicMaterial, MeshStandardMaterial,
  Mesh, InstancedMesh, Object3D, TextureLoader, SRGBColorSpace,
  AmbientLight, DirectionalLight, PointLight,
  EdgesGeometry, LineSegments, LineBasicMaterial, MathUtils,
} from './vendor/three.module.min.js';

const PALETTE = {
  paper: 0xfbfbf9,
  ink: 0x16161a,
  accent: 0x1b44c8,
  line: 0xd2d2ca,
  navy: 0x06244a,
};

/* Layer depths. The camera travels -Z as the page scrolls, so each layer sits
   further down the same axis and the scroll maps to depth one-to-one. */
const LAYERS = { device: 0, web: -120, edge: -240, data: -360, infra: -480 };
const TRAVEL = -540;

const SCREENS = [
  'hekta-home', 'hekta-assistant', 'hekta-networth', 'hekta-capture', 'hekta-analytics',
];

export function createWorld(canvas, opts = {}) {
  const lowPower = opts.lowPower === true;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: !lowPower,
    alpha: true,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1 : 1.75));

  const scene = new Scene();
  /* Fog starts close. The scene is atmosphere behind a page of text, so depth
     has to wash out fast or the far layers compete with the copy. */
  scene.fog = new Fog(PALETTE.paper, 55, 330);

  const camera = new PerspectiveCamera(52, 1, 0.1, 600);
  camera.position.set(0, 0, 40);

  scene.add(new AmbientLight(0xffffff, 2.1));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(6, 14, 10);
  scene.add(key);
  const rim = new PointLight(PALETTE.accent, 320, 400);
  rim.position.set(-18, -6, -180);
  scene.add(rim);

  const world = new Group();
  scene.add(world);

  /* ---------------------------------------------------------- device layer */
  /* Real screenshots, floating as physical objects. The only textured thing in
     the scene, because it is the only part that depicts something real. */
  const loader = new TextureLoader();
  const phones = new Group();
  phones.position.z = LAYERS.device;

  SCREENS.forEach((name, i) => {
    const tex = loader.load(`/assets/img/${name}.jpg?v=1`);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = lowPower ? 1 : 4;

    const mat = new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 });
    const mesh = new Mesh(new PlaneGeometry(9, 19.55), mat);

    /* Wide ring, pushed well back. The reading column runs down the middle of
       the viewport, so the scene has to stay out of it: screenshots drifting
       behind the headline made it unreadable. */
    const angle = (i / SCREENS.length) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * 36, Math.sin(angle) * 14, -26 - i * 13);
    mesh.rotation.set(0, -Math.cos(angle) * 0.34, Math.sin(angle) * 0.06);
    mesh.userData.spin = 0.00018 + i * 0.00004;
    phones.add(mesh);
  });
  world.add(phones);

  /* ------------------------------------------------------------- web layer */
  /* Browser-shaped frames: outlines only, because these products have no
     screenshots and drawing a fake one would be inventing evidence. */
  const web = new Group();
  web.position.z = LAYERS.web;
  for (let i = 0; i < 6; i++) {
    const w = 26 + (i % 3) * 6;
    const frame = new LineSegments(
      new EdgesGeometry(new PlaneGeometry(w, w * 0.62)),
      new LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.5 })
    );
    const a = (i / 6) * Math.PI * 2;
    frame.position.set(Math.cos(a) * 30, Math.sin(a) * 15, -i * 11);
    frame.rotation.y = -Math.cos(a) * 0.4;
    web.add(frame);
  }
  world.add(web);

  /* ------------------------------------------------------------ edge layer */
  /* Exactly 14 nodes — the real Edge Function count. */
  const EDGE_N = 14;
  const edge = new InstancedMesh(
    new BoxGeometry(3.2, 3.2, 3.2),
    new MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.35, metalness: 0.1 }),
    EDGE_N
  );
  edge.position.z = LAYERS.edge;
  const dummy = new Object3D();
  for (let i = 0; i < EDGE_N; i++) {
    const a = (i / EDGE_N) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 26, Math.sin(a) * 26, -(i % 5) * 8);
    dummy.rotation.set(a, a * 0.5, 0);
    dummy.updateMatrix();
    edge.setMatrixAt(i, dummy.matrix);
  }
  edge.instanceMatrix.needsUpdate = true;
  world.add(edge);

  /* ------------------------------------------------------------ data layer */
  /* Exactly 33 slabs — one per Postgres table, RLS on every one. */
  const DATA_N = 33;
  const data = new InstancedMesh(
    new BoxGeometry(7, 0.55, 7),
    new MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.55, metalness: 0.05 }),
    DATA_N
  );
  data.position.z = LAYERS.data;
  for (let i = 0; i < DATA_N; i++) {
    const col = i % 6, row = Math.floor(i / 6);
    dummy.position.set((col - 2.5) * 9.5, (row - 2.5) * 4.4, -(i % 4) * 6);
    dummy.rotation.set(0, i * 0.09, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    data.setMatrixAt(i, dummy.matrix);
  }
  data.instanceMatrix.needsUpdate = true;
  world.add(data);

  /* ----------------------------------------------------------- infra layer */
  /* The floor of the stack: containers, stacked and stilled. */
  const infra = new Group();
  infra.position.z = LAYERS.infra;
  for (let i = 0; i < 9; i++) {
    const box = new Mesh(
      new BoxGeometry(11, 5, 11),
      new MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.7, metalness: 0.15 })
    );
    box.position.set(((i % 3) - 1) * 15, (Math.floor(i / 3) - 1) * 7.5, -(i % 3) * 9);
    infra.add(box);
  }
  world.add(infra);

  /* ---------------------------------------------------------------- motion */
  let progress = 0;      // 0..1, driven by page scroll
  let eased = 0;
  let pointerX = 0, pointerY = 0;
  let running = true;
  let raf = 0;

  const onPointer = (e) => {
    pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (!lowPower) window.addEventListener('pointermove', onPointer, { passive: true });

  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize, { passive: true });
  resize();

  /* Pause when the tab is hidden or the canvas is off-screen. A scene that
     keeps rendering behind another tab is a battery bug, not a feature. */
  const onVisibility = () => { running = !document.hidden; if (running) tick(); };
  document.addEventListener('visibilitychange', onVisibility);

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);

    eased += (progress - eased) * 0.06;

    camera.position.z = 40 + eased * TRAVEL;
    camera.position.x += (pointerX * 4 - camera.position.x) * 0.04;
    camera.position.y += (-pointerY * 3 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, camera.position.z - 60);

    for (const p of phones.children) p.rotation.z += p.userData.spin;
    edge.rotation.z += 0.0011;
    data.rotation.z -= 0.0004;

    renderer.render(scene, camera);
  }
  tick();

  /* A lost context freezes the canvas. Hand the page back to the static path
     rather than leaving a dead grey rectangle behind the content. */
  const onLost = (e) => {
    e.preventDefault();
    destroy();
    document.documentElement.classList.remove('has-world');
  };
  canvas.addEventListener('webglcontextlost', onLost);

  function destroy() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    renderer.dispose();
  }

  return { destroy };
}
