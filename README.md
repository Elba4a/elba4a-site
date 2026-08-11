# elba4a.com

Portfolio landing page for Islam Soliman. One page, English.

**No build step. No dependencies. No external fonts. One CSS file. No JavaScript.**

```
index.html            the page
assets/css/site.css   the whole stylesheet
assets/img/           three screenshots, a social card, an SVG favicon
tools/og.html         source for the social card (not shipped)
Caddyfile             static file server, Railway's $PORT
Dockerfile            caddy:2-alpine, explicit COPY per path
```

## Run it

```bash
python3 -m http.server 8145
```

Or the way it actually ships:

```bash
docker build -t elba4a-site . && docker run --rm -p 8080:80 -e PORT=80 elba4a-site
```

## Things worth knowing before editing

**Boxes use CSS logical properties** (`margin-inline`, `inset-inline-start`,
`border-block-end`) even though the page is LTR-only. They cost nothing and
mean a right-to-left version would not need a mirrored stylesheet. The one
thing that would still need a hand-written override is `transform-origin`,
which has no logical keywords.

**`overflow-x` on `html` is `clip`, never `hidden`.** `hidden` forces
`overflow-y` to compute to `auto`, which turns the element into a scroll
container — and that container then becomes the nearest scrollport for every
`animation-timeline: view()` below it. It never actually scrolls, so those
timelines go inactive and every scroll-revealed element stays stuck at
opacity 0. This was a real bug here, not a hypothetical.

**Motion is opt-in, never opt-out.** The default state of every animated
element is its *finished* state. The hidden start states live inside
`@media (prefers-reduced-motion: no-preference)`, and the scroll-driven block
is gated again on `@supports (animation-timeline: view())`. So a browser that
won't run the animation shows a readable page instead of an empty one. Do not
"simplify" this by moving the start state back out to the base rule.

**All motion is CSS.** Scroll reveals use `animation-timeline: view()`, and the
language switch uses a cross-document `@view-transition`. There is no
JavaScript file to add one to.

**Colours are measured, not chosen.** Against `--ink` (`#0A0A0B`):
`--text` 16.9:1 · `--bone` 15.3:1 · `--accent` 10.0:1 · `--muted` 5.8:1.
`--accent` is `#C5B697`, which measures 2.0:1 on white — which is why every
surface here is dark. Re-measure before changing any of them.

**Assets are cached forever.** `Caddyfile` sends `immutable` for
`/assets/*`, so any edited asset needs its `?v=N` bumped in both HTML files.

**The social card and the icons are generated, not drawn.** `tools/og.html` and
`tools/icon.html` are the sources; the PNGs are screenshots of them. After
editing either:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=3000 --window-size=1200,630 \
  --screenshot="assets/img/og.png" "file://$PWD/tools/og.html"

"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=2000 --window-size=180,180 \
  --screenshot="assets/img/icon-180.png" "file://$PWD/tools/icon.html"
sips -s format png --resampleWidth 32 assets/img/icon-180.png --out assets/img/icon-32.png
```

`tools/icon.html` holds a **copy** of the favicon artwork, not an `<img>` of
it — a `viewBox`-only SVG has no intrinsic size, so it renders at the browser
default instead of filling the frame. If you change `favicon.svg`, change the
copy too.

**The icon ships three ways**: SVG for browsers that take it, a 32px PNG for
those that don't, and a 180px `apple-touch-icon` for iOS home screens. The SVG
alone was not enough — and because `/assets/*` is served `immutable` for a
year, a favicon that has already been cached wrong only refreshes when its
`?v=N` changes.

`og:image` is an absolute `https://elba4a.com/...` URL because scrapers do not
resolve relative paths — so the card only renders once the domain is live, not
from the `*.up.railway.app` URL.

**The Dockerfile copies explicit paths, never `COPY .`** — that is what keeps
`Dockerfile`, `README.md` and dotfiles out of the public web root. Keep it that
way when adding files.

## Content rules

- Hekta is **pre-submission at v1.0.0**. It is not on the App Store. Do not
  write that it shipped, and do not link `hekta.money` — that domain is parked.
- Muhrah is a brand Islam **owns**, not client work. Its storefront sits behind
  a password page, so it gets no link.
- Horus Transfer's repo is private and the site is not deployed. No link.
- The commit count is written `800+` on purpose. The exact number moved twice
  in one day; a precise figure in static HTML goes stale within a week. The
  command that re-measures it lives in the private portfolio dossier, along
  with the list of repos it counts — client repo names do not belong in a
  public README.

## Deploy

Railway builds the `Dockerfile` and redeploys on every push to `main`.
`elba4a.com` resolves through Cloudflare; the DNS record must stay **grey-cloud
(DNS only)** or Railway cannot issue its certificate.
