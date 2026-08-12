# elba4a.com

Portfolio landing page for Islam Soliman. One page, English.

**No build step. No dependencies. One CSS file.** Two self-hosted fonts and one small
vanilla JavaScript file, so nothing is ever fetched from another origin.

```
index.html            the page
assets/css/site.css   the whole stylesheet
assets/js/site.js     the only script: the language wipe and a scrollspy
assets/fonts/         two variable .woff2 subsets, self-hosted
assets/img/           app screenshots, the Muhrah emblem, a social card, an SVG favicon
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

**The language wipe degrades to a static split.** Its control is a real
`<input type="range">`, so keyboard, touch and assistive tech work before any script runs.
`site.js` only mirrors the value onto `--pos`. With JavaScript blocked the stage keeps the
`52%` written in the stylesheet, which still shows both language builds at once — the point
of the figure survives. Keep it that way.

**All other motion is CSS.** Scroll reveals use `animation-timeline: view()`. There is no
animation library and no IntersectionObserver driving visibility; the observer in
`site.js` only marks the current nav link.

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

## Deploy

Railway builds the `Dockerfile` and redeploys on every push to `main`. `elba4a.com`
resolves through Cloudflare; the DNS record must stay **grey-cloud (DNS only)** or Railway
cannot issue its certificate.
