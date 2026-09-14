# Cloudflare migration and rollback

## Status at preparation (15 September 2026, New Zealand)

Prepared, not deployed. Cloudflare plugin installation succeeded, but its API
tools were not exposed in the active session. No Cloudflare account settings,
DNS records, domains, redirects, or deployment resources were changed. Browser
discovery returned no available browsers. Hosted preview and visual checks are
still required. Reconnect the Cloudflare plugin and finish OAuth if prompted,
then resume with its authenticated API tools. No source export is needed.

Verified during preparation:

- Sites version 6 deployment reports `succeeded`.
- `https://www.tabtools.fyi/` returned 200 with valid TLS.
- `https://tabtools-website.michaeljrwester.chatgpt.site/` returned 200 with valid
  TLS and remains the independent rollback URL.
- HTTPS apex returned 522; HTTP apex timed out after 12 seconds. HTTP www returned
  302 to HTTPS www (not the requested final permanent apex redirect).
- Existing `/privacy` and `/chrome` requests returned HTML with status 200.
  Inspect their bodies and other legacy paths before changing fallback routing.
- All imported static files match the recovered source, allowing only the
  intended apex substitutions in index.html, robots.txt and sitemap.xml.
- All 13 HTML store links retain their exact placement-specific UTM values;
  hash navigation targets and local asset references resolve, the exact YouTube
  embed remains, and HTML contains no noindex directive.
- JavaScript syntax validation and Git whitespace checks passed.

This is static/source validation, not a browser interaction or Cloudflare
deployment verification. No Cloudflare preview URL exists yet.

## Source of truth

This directory imports ChatGPT Sites `tabtools-website` version 6, source commit
`c14898052e9e81d29d06c073694e5b87a4103740`. The source repository HEAD matched that
version. GitHub main had no website; `feat/tabtools-website` and
`website/clear-practical-redesign` contained different, older website content.
Do not use those branches for deployment.

Commit `87d8b7b` on this migration branch preserves the original version 6 files,
including its www SEO URLs. The migration changes only those SEO URLs to apex;
JavaScript, CSS, wording, store links and UTM parameters, privacy interactions,
YouTube embed and media remain preserved. Live www HTML differed from source
only in Cloudflare's injected email protection and challenge code.

The original Sites project and deployment must remain available. Its identifier
is retained in `.openai/hosting.json` for reference; Cloudflare Pages serves only
`dist`, so this file is not public. Do not publish the changed apex metadata back
to Sites as part of this migration.

## Hosting choice and Git deployment

Prefer Pages: this is dependency-free HTML/CSS/JavaScript with no compilation,
functions, package installation, or environment variables. Sites runtime
environment inspection returned no entries. There is no extension build step.
The Cloudflare integration's actual capabilities must still be checked; if Pages
is unavailable through it, use Workers static assets with `website/dist` and
equivalent scoped redirects, then document the actual configuration here.

For Pages, connect GitHub `Michael-Wester/tabtools` in Workers & Pages. Authorize
the Cloudflare GitHub app for this repository if it has no existing installation.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Root directory | `website` |
| Build command | Leave empty (no build required) |
| Output directory | `dist` |
| Environment variables | None |
| Initial production branch | `hosting/cloudflare-migration` (do not attach domains yet) |
| Preview branches | Include website feature branches |
| Build watch include paths | `website/*` |
| Build watch exclude paths | `website/README.md`, `website/CLOUDFLARE.md` |

Use the initial pages.dev deployment as staging and verify it before attaching
domains. For a distinct branch preview, enable preview builds and push a website
verification branch with this same source. Record the actual project name, URL,
deployment ID and commit here. None has been created yet.

After the PR is merged into main, change the Pages production branch to `main`.
Future website changes go through PR previews and deploy after merge. Watch paths
are repository-relative; `website/*` also matches nested files. Extension-only
changes ordinarily skip deployment; Cloudflare documents exceptions for unusually
large or empty pushes. Do not run root `build.js` or `build.ps1` for this website.

## DNS and HTTPS cutover (pending)

1. Inspect the authenticated account, zone, Pages/Workers projects, DNS records,
   custom hostnames, certificates, redirects, and SSL configuration first. Export
   the zone and save current record IDs, targets, proxy flags, TTLs, rule IDs and
   settings privately for rollback. Public DNS only shows Cloudflare proxy IPs
   and cannot reveal the original origin records. Do not use those IPs as origins.
2. Verify the existing generated ChatGPT Sites URL from Sites settings, and test
   it independently of the custom domain before cutover. Record it privately.
   If a SaaS custom-hostname association prevents attaching the domain, resolve
   that association without deleting or unpublishing the Sites project.
3. Add `tabtools.fyi` to Pages Custom domains and use the exact DNS target Pages
   returns. Replace only conflicting apex website A/AAAA/CNAME records. Preserve
   MX, TXT, CAA and unrelated subdomain records; inspect certificate errors before
   changing any CAA setting. Wait for hostname and certificate activation.
4. Keep `www` proxied. Replace only its website record as needed with a proxied
   CNAME to `tabtools.fyi`. Ensure its edge certificate is active. Add a scoped
   Single Redirect rule after checking existing rules for conflicts:

   Expression:
   `(http.host eq "www.tabtools.fyi") or (http.host eq "tabtools.fyi" and not ssl)`

   Dynamic destination: `concat("https://tabtools.fyi", http.request.uri.path)`

   Status: `301`. Preserve query string: **enabled**.

   This targets both www schemes and HTTP apex while excluding HTTPS apex, so
   it cannot redirect apex HTTPS back into itself. Resolve any existing apex-to-www
   rule without replacing the whole zone ruleset. Do not introduce a zone-wide
   redirect affecting unrelated subdomains. Domain redirects belong in zone
   rules, not the Pages `_redirects` file.
5. Confirm a strict encrypted origin connection appropriate to Pages; do not use
   Flexible SSL. Preserve unrelated zone settings. Verify the matrix below before
   considering the migration complete.

## Required verification

There is no build to run. `dist` is authored deployment output. Locally serve it
with `python -m http.server 4173 --directory website/dist` from repository root.

- Compare preview with the existing site at desktop and mobile widths, in both
  themes. Check theme toggle, reload persistence, and no horizontal overflow.
- Follow Features, How it works, Privacy and FAQ. Privacy must focus the section
  and center its card below the sticky header; test a fresh `/#privacy` load.
  Check FAQ expand/collapse and keyboard navigation.
- Test Chrome, Firefox and Edge adaptive CTAs and alternate browser links. Verify
  every placement's original UTM values, direct store destination, and mobile note.
- Verify the exact YouTube privacy-enhanced embed and playback, local images,
  CSS/JS, poster and retained MP4. Check console/network errors and mixed content.
- Verify canonical, Open Graph URL, JSON-LD, sitemap and robots all use apex.
  Production must have no `noindex` meta or `X-Robots-Tag: noindex` header.
  Preview environments may deliberately include a platform noindex header.
- `/`, `/index.html`, `/robots.txt`, `/sitemap.xml`, and every actual asset must
  work. Navigation uses hash sections, not separate SPA pages. Inspect existing
  host routing before introducing any new route or fallback behavior.
- Check HTTPS apex returns 200. HTTPS www, HTTP www and HTTP apex must permanently
  redirect to HTTPS apex with path and query intact, without loops. Check both `/`
  and `/robots.txt?utm_source=migration-check` using a redirect-following client.
  Verify certificates without disabling TLS validation.

## Rollback

Before cutover: nothing to roll back in hosting/DNS. Existing ChatGPT Sites is
untouched. Do not merge or deploy the older website branches over this snapshot.

After cutover: disable only the new scoped redirect rule; restore the captured
website DNS records and prior rule settings, and restore any custom-hostname
association that was changed. Leave email and unrelated records alone. Verify
the original Sites URL and www domain again. Restoring the original apex setup
would also restore its pre-existing failure unless repaired separately.

For later Cloudflare releases, roll back to the previous successful Pages
production deployment and revert the corresponding GitHub change so a later
push cannot immediately redeploy the regression. For an original source recovery,
use the website tree from `87d8b7b`; do not push an extension-wide reset.

## References

- [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)
- [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Redirect support](https://developers.cloudflare.com/pages/configuration/redirects/)
