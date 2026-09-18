# TabTools website

Promotional landing page for the TabTools browser extension. The deployable
static site lives in `dist/` so it can be hosted by ChatGPT Sites or another
static host.

The page is intentionally dependency-free. Serve `dist/` with any static web
server for local review; edit the authored files in `src/` and regenerate the
output as described below.

## Localisation source and generation

The authored website template and runtime live in `src/`; `dist/` is generated
output and should not be edited by hand. The shared locale registry and source
catalogues live in [`../localisation/`](../localisation/). From the repository
root, run:

```sh
npm run locales:generate
npm run locales:validate
```

The generator writes one page per supported locale, reciprocal `hreflang`
metadata, the sitemap, and browser-store listing text. Locale paths use the
registry values (`/de/`, `/pt-br/`, `/zh-cn/`, and so on); the root page is the
English fallback. The language selector preserves a visitor's choice and
offers a browser-language suggestion without replacing an explicitly chosen
URL.

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

## Language selector flags

The website language selector serves square SVG flags locally and clips them to
circular controls. The flags are vendored from [`flag-icons`](https://github.com/lipis/flag-icons)
under its MIT License; the attribution and permission notice are kept with the
authored assets in [`src/assets/flags/`](src/assets/flags/) and copied to
`dist/assets/flags/` during website generation.
