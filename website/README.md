# TabTools website

Promotional landing page for the TabTools browser extension. The deployable
static site lives in `dist/` so it can be hosted by ChatGPT Sites or another
static host.

The site is intentionally dependency-free. Edit the homepage and shared assets
in `dist/`, then serve that directory with any static web server for local review.

## Guides

`/guides/` lists three English guides: closing tabs from the same website,
removing duplicates, and sorting tabs by website. Article content lives in
`guides-content.cjs`; `build-guides.cjs` generates the index, article pages and
sitemap, reusing the homepage's header, footer and early theme bootstrap.
Layout styles live in `dist/guides.css`. The generated HTML is committed so the
deployment remains a static upload and all articles work without JavaScript.

After editing article content, its template, or the homepage navigation/footer:

```sh
node website/build-guides.cjs
node website/build-guides.cjs --check
node website/check-guides.cjs
node website/check-security.cjs
```

Run these commands from the repository root. The deploy workflow rejects stale
generated pages, broken internal links, missing assets and invalid security
policy. Keep the article review date in `build-guides.cjs` aligned with a real
content review. Review the extension's behaviour when its cleanup/sorting rules
change; the guides describe main, independently of the pending localisation PR.
Store links use placement-specific attribution, including `guide_inline` and
`guide_<slug>`. No analytics service or extra browser permissions are added.

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

## Security headers

Cloudflare Pages reads `dist/_headers` to restrict resource loading, prevent
framing, and enable a one-year, host-only HSTS policy. The YouTube demo and
same-origin Cloudflare email decoder remain allowed. Camera, microphone and
geolocation access are disabled. No `unsafe-inline` or `unsafe-eval` is allowed.

Run `node website/check-security.cjs` from the repository root before deployment.
The deployment workflow also runs this check. If an executable inline script
changes, review it and update its SHA-256 hash in `_headers`; do not weaken CSP
to silence the check. Inert JSON data blocks do not require script permission.
With the localisation build in PR #17, run this check **after** page generation
and preserve `_headers` in the deployable output.

See [the security review](SECURITY-REVIEW.md) for findings, verification limits,
future deployment isolation work, and HSTS rollout/rollback guidance.
