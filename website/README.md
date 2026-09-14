# TabTools website

Promotional landing page for the TabTools browser extension. The deployable
static site lives in `dist/` so it can be hosted by ChatGPT Sites or another
static host.

The page is intentionally dependency-free. Edit the files in `dist/`, then
serve that directory with any static web server for local review.

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

The preferred URL is `https://www.tabtools.fyi/`, matching the active custom
domain. Keep the canonical link, Open Graph URL, software metadata, sitemap,
and robots.txt sitemap URL aligned if the preferred domain changes. Redirects
and domain certificates are managed by the host, not these static files.

The page opens in light mode unless the visitor has saved a theme preference.
Store attribution remains independent of theme and browser detection.

Product instructions are grounded in the extension source: closing by site
affects matching tabs in regular windows; sorting affects the current window;
popup Undo is available while that popup remains open. Privacy copy refers to
the extension and distinguishes the website's third-party YouTube player.
