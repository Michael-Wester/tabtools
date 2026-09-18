# TabTools website

Promotional landing page for the TabTools browser extension. The deployable
static site lives in `dist/` so it can be hosted by ChatGPT Sites or another
static host.

The site is dependency-free and generated with Node 22. Edit the shared template,
styles and behaviour in `website/src/`; edit text in
`localisation/locales/<locale>.json`. Do not edit generated HTML in `dist/`.
Existing images and browser artwork remain in `dist/assets` unchanged.

From the repository root:

```sh
node scripts/generate-localisation.js
node website/build.js
node scripts/validate-localisation.js --report
node --test tests/*.test.js
python -m http.server 8765 --directory website/dist
```

Open `/`, `/de/`, `/ja/` and `/he/` for representative English, long-text, CJK
and RTL pages. The website build is separate from root extension `build.js` and
`build.ps1`. Generated output is committed; CI checks for drift before deployment.
Store-copy files live in `marketing/`, outside the deployed directory.

## Languages

The [locale registry](../localisation/LOCALES.md) defines stable paths for all
30 implementation locales. English remains at `/`. Each page contains its own
translated HTML, `lang`/`dir`, title, description, canonical and reciprocal
hreflang links. The sitemap contains production locale URLs only.

The accessible native-name selector saves the selected language and navigates
to that URL, preserving queries and anchors. An explicit URL determines the
language. Saved/browser preferences may produce a suggestion link, never a
redirect. Unsupported preferences fall back to English; Portuguese regions and
Chinese scripts are matched explicitly. See [maintenance](../localisation/README.md)
for per-key stale-translation detection and [validation](../localisation/VALIDATION.md)
for the checks actually performed.

## Browser buttons

The header, hero, how-it-works section, and final call to action adapt their
"Add to" label, full-colour logo, and store URL to Chrome, Firefox, or Edge.
The hero and final section also show buttons for the other two browsers.
Without JavaScript, Chrome is the primary button and Firefox and Edge remain
available. The footer always lists all three stores.

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

The page opens in light mode unless the visitor has saved a theme preference.
Store attribution remains independent of theme and browser detection.

Product instructions are grounded in the extension source: closing by site
affects matching tabs in regular windows; sorting affects the current window;
popup Undo is available while that popup remains open. Privacy copy refers to
the extension and distinguishes the website's third-party YouTube player.

See [Cloudflare deployment and rollback](CLOUDFLARE.md) for migration status,
hosting settings, verification requirements, and future deployment instructions.
