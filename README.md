# elba4a.com

Portfolio landing page for Islam Soliman. One page, English.

**No build step. One CSS file. Zero runtime dependencies.** Two self-hosted fonts and one
small script of our own. Nothing is ever fetched from another origin.

```
index.html            the page
assets/css/site.css   the whole stylesheet
assets/js/site.js     scrollspy and the prototype's tablist
assets/fonts/         two variable .woff2 subsets, self-hosted
assets/img/           nine app screens, the Muhrah emblem, a social card, an SVG favicon
tools/og.html         source for the social card (not shipped)
tools/cdp.mjs         DevTools-protocol driver, Node stdlib only (not shipped)
tools/fit-test.html   the type-fitting rig; also re-derives the sizes (not shipped)
tools/check-fit.mjs   can Archivo hold flush lines at all (not shipped)
tools/check-hero.mjs  does the shipped page hold them (not shipped)
tools/check-proto.mjs the prototype, including without a mouse (not shipped)
tools/verify-dom.html DOM assertions across eleven viewports (not shipped)
Caddyfile             static file server, Railway's $PORT
Dockerfile            caddy:2-alpine, explicit COPY per path
```

Nothing under `tools/` reaches the web root — the Dockerfile copies `index.html` and
`assets/` explicitly, never `COPY .`.

## Verify it

```bash
python3 -m http.server 8145 &
node tools/check-fit.mjs && node tools/check-hero.mjs && node tools/check-proto.mjs && node tools/check-dom.mjs
```

**Every design this replaced passed with zero console errors and zero failed requests.**
Each defect they shipped was visual-only, so every harness asserts on pixels, measured
advances or computed styles, and none of them looks at the console. Each carries canaries
that must *report catching* a deliberately broken element before any PASS counts — a
detector that has never fired is indistinguishable from a detector that cannot fire.

Three traps that make a run pass while proving nothing, all hit here already:

- **macOS has no `timeout` binary.** A previous pass wrapped Chrome in it with stderr
  discarded, so Chrome never launched and the run "passed" with zero checks. `cdp.mjs`
  bounds every wait in JavaScript instead.
- **`document.getAnimations()` includes scroll-driven ones, which never finish.** Awaiting
  all of them hangs forever; filter to `a.timeline === document.timeline`.
- **Measuring before the entrance lands blames the stylesheet for the probe's timing.**
  The first run of `check-hero.mjs` read the headline 33% short at 320px and 10% at 768px,
  purely because crossing the 701px breakpoint restarts the animation.

## Run it

```bash
python3 -m http.server 8145
```

Or the way it actually ships:

```bash
docker build -t elba4a-site . && docker run --rm -p 8080:80 -e PORT=80 elba4a-site
```

## Things worth knowing before editing

**Fonts are self-hosted and must stay that way.** Archivo and Azeret Mono, both OFL, both
variable, both the `latin` subset only — about 116KB for the pair. They live in
`assets/fonts/` and are referenced by relative path. Do not swap either for a Google Fonts
`<link>`: the page makes no third-party request today and that is worth keeping.

**Archivo is not interchangeable, and Schibsted Grotesk cannot come back.** The display
type is fitted line by line to the measure and the entrance widens the letterforms until
they land on it, so the family must carry a real `wdth` axis. A dump of the shipped
Schibsted subset's `fvar` found one axis: `wght` 400–900. Archivo carries `wght 100–900`
and `wdth 62–125`, a 1.945x span measured in the browser rather than read off a foundry
page. Any replacement needs the same, and `check-fit.mjs` refuses to report a pass without
it.

**The `@font-face` must declare `font-stretch: 62% 125%`.** Omit that line and every
`font-stretch` value on the page silently clamps to 100%: the layout still looks right,
the entrance quietly becomes a no-op, and nothing reports it. Use `font-stretch`, never
`font-variation-settings` — the latter stops `font-weight` composing.

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

**All motion is CSS.** Scroll reveals use `animation-timeline: view()`. There is no
animation library and no IntersectionObserver driving visibility; the observer in
`site.js` only marks the current nav link. GSAP is deliberately absent.

### The display type

**The lines are fitted by SIZE at one width, not by width at one size.** Fitting by width
is arithmetically impossible with this copy: at one font size every line sits pinned at
the 125% ceiling and still falls 48% short of the measure. `tools/fit-test.html` solves
each line's size by bisection against its rendered advance, and `check-fit.mjs` prints the
`cqi` values that go into the stylesheet. **Do not hand-tune them, and re-derive them if
the copy changes.**

**The sizes are `cqi` against a capped container, never `vw`.** `--gut` clamps at 1066px,
so a clamped `font-size` would freeze while the measure kept widening: past ~1460px every
line would fall short of the margin and the right edge would go ragged, which is the
templated look this design exists to avoid. Capping the *container* makes the ratio
advance/measure invariant from 320px to 2560px.

**`letter-spacing` in `em` must sit on the element that carries the font-size.** It
computes to an absolute length where it is declared and inherits as that length. On
`.hero__h` it resolved against the inherited 17px body size instead of the 215px line, and
every line overran the measure by 6%.

**Four lines below 701px, two above, with the column capped at 440px in between.** The
three-way break is not offered: solved, its line sizes spread 1.85x, so the long middle
line sets visibly smaller than the two around it and the block reads as a mistake.
Uncapped, four lines at a 640px measure make an 861px block that overflows the fold on a
700x900 tablet.

**Weight is uniform across the headline.** Dropping the last line to 400 would narrow it
and break the fit, which is the whole premise. The emphasis is carried by `--accent` on
one word instead.

### The prototype

**The screens are the product's own captures, and nothing about them is drawn.** Nine App
Store screenshots at their native 1320x2868, re-encoded at an exact half. No stock phone
PNG, no drawn notch — the Dynamic Island is in the pixels — no side buttons, no angle, no
reflection.

**The corner radii are measurements.** `12.5cqw` is 55pt of 440pt, the device's own. The
bottom is `3.4cqw`, not `12.5`: probing the largest uniform corner region on all nine
found tops safe at 58pt or more everywhere but bottoms as tight as 15pt, so a true bottom
radius would clip live content on four of them.

**`container-type` goes on `.phone`, the parent, not on `.phone__frame` itself.** An
element is a container for its descendants, not for itself, so `cqw` in the frame's own
`border-radius` fell through to the viewport: 12.5% of 1280px is 160px and the device
rendered with a domed top.

**The 2px ink ring is the mechanism, not the decoration.** The screens are iOS light mode
on `#F2F2F7`: 1.08:1 against `--paper` and invisible, 16.17:1 against `--ink`. The ring
holds on any ground, in any ambient light, whatever the palette does later. The `--slab`
band behind it is composition only — delete it and the band still works.

**Navigation never infers a nav graph the screenshots do not show.** The tab strip names
all nine; the only in-screen hotspots are the three chevrons printed on Home, going where
their own labels say. The device's own tab bar is part of the image and is not wired.

**Every screen ships in the markup and is reachable before the script runs.** The script
only makes it one-at-a-time, and it adds `.proto--live` to say so — hiding the screens in
the stylesheet would leave eight unreachable on any client where it does not run.

**Colours are measured, not chosen.** Against `--paper` (`#FBFBF9`): `--ink` 17.4:1 ·
`--accent` 7.5:1 · `--ink-2` 6.6:1. Against `--slab` (`#DCDCD4`) every muted token drops a
grade — `--ink-2` is 4.95:1 and `--accent` is 5.4:1, both AA and not AAA — so the band uses
`--slab-ink-2` (`#404048`, 7.44:1) and carries no links outside the tab pills, which have
their own `--ink` ground. Re-measure before changing any of them.

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
  page. It used to get no link; on 2026-08-12 Islam chose to link it anyway, so the page
  carries `muhrah.shop` **with copy stating the lock screen is deliberate**. Never link it
  bare — a visitor meeting a password prompt with no explanation reads it as broken.
  `linktr.ee/Muhrah_009` is public by design and needs no caveat.
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
