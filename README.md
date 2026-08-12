# elba4a.com

Portfolio landing page for Islam Soliman. One page, English.

**No build step. One CSS file.** Two self-hosted fonts, two small scripts of our own, and
one vendored dependency: Three.js, which drives the 3D layer. Nothing is ever fetched from
another origin — the library is committed here, not pulled from a CDN.

```
index.html            the page
assets/css/site.css   the whole stylesheet
assets/js/site.js     scrollspy, and the gate that decides whether the 3D loads at all
assets/js/world.js    the scene: procedural layers, scroll-driven camera
assets/js/vendor/     Three.js r0.185.1, MIT, vendored (two ESM files)
assets/fonts/         two variable .woff2 subsets, self-hosted
assets/img/           five app screens, the Muhrah emblem, a social card, an SVG favicon
tools/og.html         source for the social card (not shipped)
tools/cdp.mjs         DevTools-protocol driver, Node stdlib only (not shipped)
tools/check-scene.mjs pixel assertions on the 3D layer (not shipped)
tools/verify-dom.html DOM assertions across seven viewports (not shipped)
Caddyfile             static file server, Railway's $PORT
Dockerfile            caddy:2-alpine, explicit COPY per path
```

Nothing under `tools/` reaches the web root — the Dockerfile copies `index.html` and
`assets/` explicitly, never `COPY .`.

## Verify it

```bash
node tools/check-scene.mjs http://localhost:8145
```

Then open `http://localhost:8145/tools/verify-dom.html` and read the `<pre>`.

**Both of the designs this replaced passed with zero console errors and zero failed
requests.** Every defect they shipped was visual-only, so both harnesses assert on pixels
and computed styles and neither one looks at the console. Each carries canaries that must
*report catching* a deliberately broken element before any PASS counts — a detector that
has never fired is indistinguishable from a detector that cannot fire.

Two traps that make a run pass while proving nothing, both already hit once here:
`--enable-unsafe-swiftshader` is mandatory on Chrome 151 or headless has no WebGL context,
the gate correctly declines, and every visual assertion passes against a static page. And
**macOS has no `timeout` binary** — a previous pass wrapped Chrome in it with stderr
discarded, so Chrome never launched and the run "passed" with zero checks. `cdp.mjs` bounds
every wait in JavaScript instead.

## Run it

```bash
python3 -m http.server 8145
```

Or the way it actually ships:

```bash
docker build -t elba4a-site . && docker run --rm -p 8080:80 -e PORT=80 elba4a-site
```

## Things worth knowing before editing

**Fonts are self-hosted and must stay that way.** Schibsted Grotesk and Azeret Mono, both
OFL, both variable, both the `latin` subset only — about 73KB for the pair. They live in
`assets/fonts/` and are referenced by relative path. Do not swap either for a Google Fonts
`<link>`: the page makes no third-party request today and that is worth keeping. Both are
variable across their weight range, so there is one file per family, not one per weight.

**Boxes use CSS logical properties** (`margin-inline`, `inset-inline-start`,
`border-block-end`) even though the page is LTR-only. They cost nothing and mean a
right-to-left version would not need a mirrored stylesheet. The one thing that would still
need a hand-written override is `transform-origin`, which has no logical keywords.

**`overflow-x` on `html` is `clip`, never `hidden`.** `hidden` forces `overflow-y` to
compute to `auto`, which turns the element into a scroll container — and that container
then becomes the nearest scrollport for every `animation-timeline: view()` below it. It
never actually scrolls, so those timelines go inactive and every scroll-revealed element
stays stuck at opacity 0. This was a real bug here, not a hypothetical.

**Motion is opt-in, never opt-out.** The default state of every animated element is its
*finished* state. The hidden start states live inside
`@media (prefers-reduced-motion: no-preference)`, and the scroll-driven block is gated
again on `@supports (animation-timeline: view())`. So a browser that won't run the
animation shows a readable page instead of an empty one. Do not "simplify" this by moving
the start state back out to the base rule.

**Never put two animations on one element's opacity.** `.s-head` is both a `.reveal` and
the owner of the section rule; the rule is drawn on an `::after` with `transform` alone for
exactly this reason. An earlier version animated both and the headings rendered half-faded.

**The 3D layer is optional, and the gate runs before the import.** `site.js` checks for
reduced motion, a data-saving preference, and a real WebGL context *before* it dynamically
imports `world.js`. A client that fails any check never requests Three.js at all — verified,
not assumed, with a positive control: on a normal client the log shows `world.js` once and
`three.*` twice; with `--disable-gpu --disable-webgl` and again with
`--force-prefers-reduced-motion`, both are zero while the page and `site.js` still load.
The zeros only mean something because the normal run is non-zero. Keep every new check on
that side of the import.

**The probe asks for `webgl2` and nothing else.** three r185 requests `"webgl2"` and throws
if it cannot have it — there is no WebGL1 path. An earlier gate fell back to
`getContext('webgl')`, so a WebGL1-only client passed, downloaded the whole library, and
then threw inside the import.

**`.has-world` may not touch `position`, `z-index` or layout.** The canvas is
`z-index: -1` unconditionally, so content never needs lifting above it. The rule that used
to do the lifting was `.has-world body > :not(#world) { position: relative }`, and
`:not(#world)` counts as an **ID** selector — it scored (1,1,1) and silently beat both
`.skip { position: absolute }` and `.hdr { position: sticky }` at (0,1,0). One line put a
black skip-link slab in the page corner, killed the sticky header, and shifted the page
28px when the async import landed.

**The skip link hides by size and `clip-path`, never by an offset.** `inset-block-start:
-100%` resolves against the containing block's height, so anything that forces
`position: relative` turns it into a visible black box at the page origin.

**Scroll-driven ranges use `entry`, never `cover`.** A `cover` range is *element height +
viewport height* long, so an element near the end of the document never has that much
scroll left and its progress parks partway — permanently, at rest. That is what left
panels at opacity 0.4987 and section rules frozen half-drawn.

**Nothing that owns a background animates its own opacity.** Fading such an element makes
its ground translucent and whatever sits behind — here, a 1px hairline grid — shows
through, so identical sibling panels render in different colours.

**No transform accumulates.** Every rotation in `world.js` is a pure function of
`(scroll, time)` and is assigned, never `+=`. An unbounded `rotation.z += spin` walked a
product screenshot onto its side in about two minutes and upside down in five, so any tab
left open eventually showed the product broken. `tools/check-scene.mjs` greps for this.

**The canvas paints only inside `.stage` rectangles.** It is full-viewport and fixed, but
every frame it scissors to the boxes CSS laid out for it, so the 3D is a *cell of the page
grid* rather than a backdrop behind everything. Text and geometry cannot share a pixel —
geometrically, not by tuning.

That one decision replaced four separate mitigations, all now deleted: fog, the
88%-opaque section panels with `backdrop-filter`, the radial hero scrim, and a rule that
kept every object beyond `x > 34`. Each existed to protect copy from a canvas sitting
behind the whole page. `tools/check-scene.mjs` asserts it as a number: hide the canvas,
shoot the same frame, and **zero differing pixels may fall outside a stage rect** — with a
positive control first, because a diff of two identical pictures of a static page would
otherwise pass.

**The stage ground is a `z-index: -2` pseudo-element, never a background on the section.**
Paint order is html paper → stage ground (-2) → canvas (-1) → text in normal flow. Put the
background on `.hero` itself and it paints in the in-flow block-background phase, over the
canvas, and the scene renders perfectly into a rectangle nobody can see. `body` is
transparent for the same reason: an opaque body background covers the whole document.

**`.has-world` may touch nothing but `#world`.** Asserted. The canvas is fixed and out of
flow, so its arrival cannot move anything, and the page must look identical either way.

**The camera is 32°, not 52°.** Fifty-two splays the edge of every box and is the loudest
"WebGL demo" tell there is; thirty-two is a short telephoto, which is what makes a render
read as product photography.

**The material is a matcap, and that was measured, not assumed.** A bake-off rendered the
same object under a procedural PMREM environment, a generated equirect, a hybrid with a
grain roughness map, and two generated matcaps. The procedural environment lost — five
flat colour boxes reflect five soft blobs and read as dark plastic. A matcap encodes the
whole shading response, grain included. It bakes into view space, which is correct here
precisely because the *object* turns under a near-fixed camera.

**Every count in the part is a real number, milled into it.** Fourteen perforations because
there are fourteen Edge Functions; thirty-three because there are thirty-three Postgres
tables. If those figures change in the work they change in `world.js`, or the part is
lying about the thing it depicts.

**The scene never holds content.** Every word, number and link lives in the DOM. `world.js`
renders geometry and textures only. This is what makes the fallback a complete page rather
than a stub, and it is why the canvas carries `aria-hidden`.

**All other motion is CSS.** Scroll reveals use `animation-timeline: view()`. There is no
animation library and no IntersectionObserver driving visibility; the observer in
`site.js` only marks the current nav link. GSAP is deliberately absent.

**Every count in the scene is a real number.** Fourteen edge nodes, thirty-three data slabs.
If those figures change in the work, change them in `world.js` too, or the geometry starts
lying.

**Colours are measured, not chosen.** Against `--paper` (`#FBFBF9`): `--ink` 17.4:1 ·
`--accent` 7.5:1 · `--ink-2` 6.6:1. On `--paper-2` the muted text still measures 6.1:1.
Re-measure before changing any of them.

**Assets are cached forever.** `Caddyfile` sends `immutable` for `/assets/*`, so any edited
asset needs its `?v=N` bumped in `index.html`.

**The social card is generated, not drawn.** `tools/og.html` is the source and the PNG is a
screenshot of it. Render it **over the local http server, not `file://`** — Chrome applies
CORS to fonts, a `file://` origin fails it, and the card silently falls back to a system
face:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=4000 --window-size=1200,630 \
  --screenshot="assets/img/og.png" "http://localhost:8145/tools/og.html"
```

`tools/icon.html` holds a **copy** of the favicon artwork, not an `<img>` of it — a
`viewBox`-only SVG has no intrinsic size, so it renders at the browser default instead of
filling the frame. If you change `favicon.svg`, change the copy too.

**The icon ships three ways**: SVG for browsers that take it, a 32px PNG for those that
don't, and a 180px `apple-touch-icon` for iOS home screens.

`og:image` is an absolute `https://elba4a.com/...` URL because scrapers do not resolve
relative paths. **LinkedIn's Featured card pulls this image**, so changing the card changes
what Islam's LinkedIn profile shows.

**The Dockerfile copies explicit paths, never `COPY .`** — that is what keeps `Dockerfile`,
`README.md`, `PRODUCT.md` and dotfiles out of the public web root. Keep it that way when
adding files.

## Content rules

These mirror the private portfolio dossier. If one changes there, change it here too.

- Hekta is **pre-submission at v1.0.0**. It is not on the App Store. Do not write that it
  shipped, and do not link `hekta.money` — that domain is parked. `legal.hekta.money` is
  public and live over https, and is the one Hekta link the page carries.
- Muhrah is a brand Islam **owns**, not client work. Its storefront sits behind a password
  page, so it gets no link.
- Horus Transfer's repo is private and the site is not deployed. No link, and never "live".
- NOOR may be named and linked. It is live at `noor-eg.net` with a public repo. No other
  client may be named.
- **Never mention a project called Prokem.** Undelivered prototype, no relationship.
- No "me and the model" language — no parsers, retries, or prompt mechanics. AI **as a
  product feature** is correct and stays: Hekta's input layer, Muhrah's WhatsApp bot,
  `Claude API` as a stack item.
- Banned words: Passionate, Enthusiast, Ninja, Rockstar, Aspiring, "Open to opportunities".
  No years-of-experience or seniority number.
- The commit count is written `800+` on purpose. The exact number moved three times in
  three days. The command that re-measures it lives in the private portfolio dossier, along
  with the list of repos it counts — client repo names do not belong in a public README.
- Keep the em-dash count low. The prose was rewritten specifically to stop reading as
  machine-generated, and em-dash saturation was the measurable half of that.
- **The positioning is "one engineer builds every layer", not "Arabic-first".** That framing
  was removed on 2026-08-12 at Islam's request: it read as regional-specialist and worked
  against the international remote audience. Arabic survives only as a fact about the
  languages he works in, never as the thesis. Do not reintroduce it as a headline.

## Deploy

Railway builds the `Dockerfile` and redeploys on every push to `main`. `elba4a.com`
resolves through Cloudflare; the DNS record must stay **grey-cloud (DNS only)** or Railway
cannot issue its certificate.
