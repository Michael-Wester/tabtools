# TabTools website

Promotional landing page for the TabTools browser extension. The deployable
static site lives in `dist/` so it can be hosted by ChatGPT Sites or another
static host.

The site is intentionally dependency-free. Serve `dist/` with any static web
server for local review; edit the authored files in `src/` and regenerate the
output as described below.

## Design

The site is drawn with the 5.0.0 popup's own parts. `src/styles.css` starts with
the popup's colour tokens (light and dark, and its six accent colours), uses its
system font stack, and carries its rows, tick marks, field, stepper, segmented
control and result bar under a `pp-` prefix. Change a token in
`src/shared/popup/popup.html` and in `src/styles.css` together.

The home page opens with a working copy of the popup over a row of sample tabs.
Clicking a site closes its tabs, with Undo; typing lists matches first; Inactive
opens a list to review; Sort tabs reorders the row; its Settings change this
site's theme and accent colour. It never reads the visitor's own tabs.

- `demo-content.cjs` holds the sample tabs, the extension strings the popup
  shows (taken from the same catalogue as the extension) and the markup for its
  starting state, which is written into each home page.
- `src/demo.js` holds the rules, which follow the extension's (what counts as
  a duplicate, what is inactive, what a typed site matches, how tabs sort), and
  the script that takes over in the browser. The generator loads the same file
  for the rules, so the page reads the same before the script runs.
- Without JavaScript the popup is marked `inert`: a picture of its starting
  state, with no buttons that do nothing.

Each feature on the home page has a small piece of the popup beside it. These
are static and hidden from assistive technology; the text next to them says the
same thing.

## Localisation source and generation

The authored website template is `src/template.html`, with explicit translation
keys rather than duplicated English copy. The runtime and CSS live in `src/`;
the landing-page HTML and shared runtime/CSS files in `dist/` are generated and
should not be edited by hand. Guide content, guide styles and security headers
have separate sources described below. The shared locale registry and source
catalogues live in [`../localisation/`](../localisation/). From the repository root,
run:

```sh
npm run locales:generate
npm run locales:validate
node website/build-guides.cjs --check
node website/check-guides.cjs
node website/check-security.cjs
```

The generators write one page per supported locale, reciprocal `hreflang`
metadata, the sitemap, and browser-store listing text. Locale paths use the
registry values (`/de/`, `/pt-br/`, `/zh-cn/`, and so on); the root page is the
English fallback. The language selector preserves a visitor's choice and
offers a browser-language suggestion without replacing an explicitly chosen
URL. Website generation also regenerates all localized guides after the landing
pages so they use the current shared header, footer and theme bootstrap.

The language menu lists every language under its own name (`nativeName` in the
registry), in its own script and direction, with English first. The button shows
the current language's flag and, on wide windows, its name.

Each page embeds the few strings its scripts show (`runtimeKeys` in
`scripts/generate-website.js`, and on the home page the popup's strings), not
the whole catalogue.

A release branch can carry English text ahead of its translations. A website
string that a language does not have yet is shown in English, and a guide whose
English has changed keeps its earlier translation. Both are reported by
`scripts/validate-localisation.js`, which fails for them unless
`TABTOOLS_PENDING_TRANSLATIONS=1`, and that is only set for pull requests into a
branch other than `main`.

## Guides

`/guides/` lists three English guides: closing tabs from the same website,
removing duplicates, and sorting tabs by website. Article content lives in
`guides-content.cjs`; `build-guides.cjs` generates the index, article pages and
sitemap, reusing the homepage's header, footer and early theme bootstrap.
Layout styles live in `src/guides.css`. The generated HTML is committed so the
deployment remains a static upload and all articles work without JavaScript.
Every supported locale has the same three complete guides and index. English
keeps `/guides/` and `/guides/<slug>/`; other locales use their existing homepage
prefix, for example `/zh-cn/guides/close-tabs-from-same-website/`. The homepage,
related-guide links, breadcrumbs and guide language picker stay in the selected
language. Switching language preserves the current guide, query and section
anchor, including native modified-click links. Without JavaScript the picker
still has equivalent article links, but cannot carry a fragment supplied only
to the browser.

English article copy remains in `guides-content.cjs`, shared guide chrome is in
`guide-ui.cjs`, and complete translated catalogues are in `guide-locales/`.
`guide-localisation.cjs` validates their keys, placeholders, anchors, structural
markup, destinations and source fingerprint before any guide is generated.
Missing, untranslated or stale catalogue fields fail the build rather than
publishing English body copy at a translated URL. Review metadata describes AI
translation and self-review; it does not claim native-speaker review. See
[`GUIDE-LOCALISATION.md`](GUIDE-LOCALISATION.md) for maintenance and SEO checks.

Guide pictures live in `dist/assets/guides/` and are of two kinds. Browser
screenshots (1280 × 800, the `screenshot()` helper in `guides-content.cjs`) show
a whole Chrome window. Pictures of the popup alone (760 pixels wide, shown at
380, the `popup()` helper) are taken from the built extension by
`node scripts/capture-pictures.js`. Keep descriptive alt text and captions
aligned with each example. Images reserve their aspect ratio, load lazily and
link to the full-size PNG. The pictures show English browser and extension UI;
translated articles explicitly say this and translate the alt text and captions.
Details are in `dist/assets/guides/README.md`. A test fails for a picture that
no guide shows.

After editing article content, its template, or the homepage navigation/footer:

```sh
npm run locales:generate
npm run locales:validate
node website/build-guides.cjs --check
node website/check-guides.cjs
node website/check-security.cjs
```

Run these commands from the repository root, generating the landing pages before
the guides so their shared header, footer and theme bootstrap are current.
The deploy workflow generates both sets of pages before validating them and
rejects uncommitted generated changes, broken internal links, missing assets
and invalid security policy. Keep the article review date in `build-guides.cjs`
aligned with a real content review. Review the extension's behaviour when its cleanup/sorting rules
change; translation must preserve all cleanup, pinned/active-tab and Undo caveats.
Store links use placement-specific attribution, including `guide_inline` and
`guide_<slug>`. No analytics service or extra browser permissions are added.

## Browser buttons

The header, hero, how-it-works section, and final call to action adapt their
"Add to" label, full-colour logo, and store URL to Chrome, Firefox, or Edge.
The hero and final section also show buttons for the other two browsers.
Without JavaScript, Chrome is the primary button and Firefox and Edge remain
available. The footer always lists all three stores.

On phones and tablets, store buttons say "View" and the homepage and article
calls to action explain that installation should be completed on a computer.
Browser detection, direct store destinations and attribution stay the same.
Compact desktop windows keep the desktop "Add to" wording.

The [mobile regression suite](tests/README.md) checks narrow layouts, navigation,
store wording and guide anchors in Chromium and WebKit. Its independent CI
workflow saves mobile screenshots for review without deployment credentials.

Button surfaces use the site's purple and neutral theme colours. The original
browser artwork is served locally, with provenance and ownership documented in
[`dist/assets/browsers/README.md`](dist/assets/browsers/README.md).

## Store link attribution

Every store link includes `utm_source=tabtools.fyi`, `utm_medium=referral`,
and `utm_campaign=website`. `utm_content` combines the placement
(`header`, `hero`, `hero_alternative`, `how_it_works`, `final_cta`,
`final_alternative`, or `footer`) with `chrome`, `firefox`, or `edge`.

HTML fallback links are tagged, and browser detection regenerates tags for the
actual destination. Store links use direct URLs so intermediary redirects cannot
drop the parameters. Internal navigation remains untagged. No analytics scripts,
cookies, or visitor identifiers are added. Reporting depends on each destination
store's analytics support; tags alone do not provide a website analytics dashboard.

## Search and content

The preferred URL is `https://tabtools.fyi/`.
Keep the canonical link, Open Graph URL, software metadata, sitemap,
and robots.txt sitemap URL aligned if the preferred domain changes. Redirects
and domain certificates are managed by the host, not these static files.

The page follows the system's light or dark setting until the visitor chooses a
theme with the header button or in the working popup's Settings. Only a choice is
saved, and choosing System there removes it. The accent colour is saved the same
way. Store attribution remains independent of theme and browser detection.

The header stays at the top of wide windows. On phones (720 pixels and under) it
scrolls away with the page, because its two rows covered what the keyboard had
reached. Links to a section stop below it either way (`scroll-padding-top`).

Product instructions are grounded in the extension source: closing by site
affects that site's tabs in regular windows and leaves pinned tabs open by
default; sorting affects the current window and leaves pinned tabs and tab
groups in place; Undo is offered in the popup for a few seconds after a close.
Privacy copy refers to the extension. The site itself loads nothing from another
origin: the YouTube demo it used to embed showed the 4.x popup and was replaced
by the working popup.

The link-preview picture (`dist/assets/tabtools-social.png`) is the top of the
built home page, taken by `node scripts/capture-pictures.js social`.

See [Cloudflare deployment and rollback](CLOUDFLARE.md) for migration status,
hosting settings, verification requirements, and future deployment instructions.

## Language selector flags

The website language selector serves square SVG flags locally and clips them to
circular controls. The flags are vendored from [`flag-icons`](https://github.com/lipis/flag-icons)
under its MIT License; the attribution and permission notice are kept with the
authored assets in [`src/assets/flags/`](src/assets/flags/) and copied to
`dist/assets/flags/` during website generation.

## Security headers

Cloudflare Pages reads `dist/_headers` to restrict resource loading, prevent
framing, and enable a one-year, host-only HSTS policy. No frame is allowed, and
the same-origin Cloudflare email decoder remains allowed. Camera, microphone and
geolocation access are disabled. No `unsafe-inline` or `unsafe-eval` is allowed.

Run `node website/check-security.cjs` from the repository root before deployment.
The deployment workflow also runs this check. If an executable inline script
changes, review it and update its SHA-256 hash in `_headers`; do not weaken CSP
to silence the check. Inert JSON data blocks do not require script permission.
Run this check **after** landing-page and guide generation and preserve
`_headers` in the deployable output.

See [the security review](SECURITY-REVIEW.md) for findings, verification limits,
future deployment isolation work, and HSTS rollout/rollback guidance.
