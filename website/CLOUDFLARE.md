# TabTools Cloudflare deployment

## Status

Cloudflare Pages production project `tabtools-website` is live at
https://tabtools.fyi/. DNS cutover and the HTTP checks below passed on
15 September 2026 at approximately 03:44 UTC. Interactive browser checks and
GitHub Actions credential setup remain outstanding.

- Live URL: https://tabtools.fyi/
- Production Pages URL: https://tabtools-website.pages.dev/
- Production deployment: `ba8978d7-0271-4ad1-9759-0fdf3f9a73a4`
- Preview: https://fb53d98e.tabtools-migration-preview.pages.dev/
- Preserved Sites rollback: https://tabtools-website.michaeljrwester.chatgpt.site/
- Migration branch: `hosting/cloudflare-migration`; PR #13.

## Source and hosting

The website is plain HTML, CSS and JavaScript. All authored assets live in
`website/dist`. There is no compilation, package installation, server runtime,
database, or website environment variable. Do not use the extension's root
`build.js` or `build.ps1` for website deployment.

Imported source: ChatGPT Sites `tabtools-website` version 6, commit
`c14898052e9e81d29d06c073694e5b87a4103740`. GitHub main had no website, and both
older website branches differed from this source. Commit `87d8b7b` preserves
version 6 verbatim, including its original www SEO URLs. The deployed asset tree
is from `d488e0b952dda5dd0b4240b0be1ea659fd579e85`, changing only canonical,
Open Graph, JSON-LD, robots and sitemap URLs to the requested apex domain.
CSS, JavaScript, all media, copy, privacy behavior, YouTube embed, browser-specific
store destinations and placement-specific UTM parameters remain unchanged.

Pages was selected because the site is entirely static. The Cloudflare plugin
supports Pages creation, asset deployment, custom domains, DNS and redirects.
Native Git integration repeatedly failed with Cloudflare error `8000011`, an
internal issue with the Pages Git installation. The working fallback is Pages
Direct Upload plus a GitHub Actions workflow. This does not require a Worker.

Pages Direct Upload projects cannot later be switched to native Git integration;
if that is desired after repairing the Cloudflare GitHub app installation, create
a new Git-integrated project, verify it, then move the domain. There is no need to
do that for the GitHub Actions deployment path below.

## Future updates from GitHub

Workflow: `.github/workflows/website-deploy.yml`.

The connected MCP cannot create API tokens (account token administration returned
error 9109 Unauthorized). Create the CI credential manually:

One-time remaining setup:

1. Create a Cloudflare API token with **Account > Cloudflare Pages > Edit**,
   scoped to the account `fee7bb9066b59347e43a2b35fcb827c3`. CI does not need DNS,
   redirect, SSL, billing or database permissions.
2. Save it as the repository Actions secret **CLOUDFLARE_API_TOKEN** at
   https://github.com/Michael-Wester/tabtools/settings/secrets/actions.
   Do not commit it or put it in a chat message. The non-secret account ID is
   already in the workflow.
3. Merge PR #13 into main. The workflow then deploys `website/dist` to
   `tabtools-website`, branch `main` (production). Until this setup is complete,
   automatic deployment is not operational.

Subsequent changes to `website/dist/**` deploy after merging to main. Changes to
the deployment workflow also trigger it. Extension-only and documentation-only
changes do not trigger deployments. Same-repository PRs deploy to `pr-N` preview
branches; fork PRs skip deployment because they do not receive the secret.
Manual workflow runs on main target production; manual runs on other branches
use `manual-preview`. The workflow validates JavaScript syntax and uploads the
authored static directory. There is no site build command.

For a manual deployment from a reviewed checkout, authenticate Wrangler and run:

```sh
npx wrangler pages deploy website/dist --project-name=tabtools-website --branch=main
```

Use a different branch name for a preview. Confirm the resulting deployment's
status and check its actual URL. Do not infer success from upload acceptance.

## DNS and redirects

Zone: `3b4c1a95116de83c733568a441bb404d` (`tabtools.fyi`). The complete pre-migration
snapshot is saved locally in `.codex-tmp/cloudflare-before-migration.json` outside
version control. It contains all five original DNS records, existing rule lists,
and the original SSL/HTTPS settings. Keep a secure copy for rollback.

Original website records:

| Record ID | Name | Type | Target | Proxy | TTL |
| --- | --- | --- | --- | --- | --- |
| `874887aa87b6dad4d885e4654c3f1856` | `tabtools.fyi` | A | `192.0.2.1` | Enabled | Auto |
| `5ccde86929d227221f09461fd2583db7` | `www.tabtools.fyi` | CNAME | `custom-domains.chatgpt.site` | Enabled | Auto |

The old apex record was a placeholder and returned 522. There were no MX
records, no Page Rules, and no user redirect rulesets. The three TXT records
(Google verification and two Sites hostname verification records) are preserved.

The old Sites custom-domain associations for www (active) and apex (pending)
were detached during cutover. The www association kept routing traffic to Sites
even after the DNS update, bypassing this zone's redirect. The Sites project,
version history and independent ChatGPT URL remain published for rollback.

Active configuration:

- Apex: proxied CNAME to `tabtools-website.pages.dev`, attached in Pages Custom domains.
- www: proxied CNAME to `tabtools.fyi`.
- One scoped Single Redirect sends both www schemes and HTTP apex directly to
  HTTPS apex with status **301**, preserving request path and query string.
- Rule expression: `(http.host eq "www.tabtools.fyi") or (http.host eq "tabtools.fyi" and not ssl)`.
- Target expression: `concat("https://tabtools.fyi", http.request.uri.path)`.
- Ruleset ID: `6e25739c3d2644c09425dd234cb85adc`.
- Rule ID: `04d9660becd94a52a9e71a2dfd5b787e`; reference `tabtools_canonical_https`.

The zone's existing Full SSL setting is preserved. Universal SSL was active for
apex and wildcard before migration. No zone-wide Always Use HTTPS change is
needed because the redirect is limited to the two website hosts.

## Verification

Completed before cutover:

- Sites version 6 deployment status succeeded, and its independent rollback URL
  returned 200 with normal certificate validation.
- Existing source files match the Sites source, except intended apex metadata.
- All eight files fetched from the Pages preview match local files byte-for-byte.
- All 13 HTML store links retain their original placement-specific UTM values.
- Local asset references, hash navigation targets, YouTube embed URL and
  JavaScript syntax checked. HTML contains no noindex directive or insecure
  external asset references.
- Existing Sites `/privacy`, `/chrome`, `/firefox`, `/edge` and an unknown path
  all serve the homepage. Preserve this fallback behavior on Pages.
- GitHub workflow passes actionlint. Its actual deployment run awaits the secret.

Browser discovery returned no available browser. Desktop/mobile visual checks,
theme switching and persistence, adaptive CTAs in Chrome/Firefox/Edge, privacy
focus/scroll behavior, FAQ interactions, and YouTube playback remain unverified
in a browser. Their source is preserved exactly; this is not a claim that those
interactive checks passed. Preview deployment URLs may intentionally return
`X-Robots-Tag: noindex`; production apex must not.

Final production verification passed:

| Request | Result |
| --- | --- |
| `https://tabtools.fyi/` | 200, no redirect |
| `http://tabtools.fyi/` | One 301 to HTTPS apex, then 200 |
| `https://www.tabtools.fyi/` | One 301 to HTTPS apex, then 200 |
| `http://www.tabtools.fyi/` | One 301 to HTTPS apex, then 200 |

The same matrix passed for `/robots.txt?utm_source=migration-check&keep=a%20b`,
preserving path and query without loops. Normal TLS certificate validation was
enabled for every request. Production headers contain no noindex directive.
All eight deployed files matched the source (accounting only for Cloudflare's
existing email-protection transformation in HTML); all five tested legacy/fallback
routes still serve the homepage. Canonical, Open Graph, JSON-LD, sitemap and
robots use `https://tabtools.fyi/`. All three store destinations and the YouTube
embed endpoint returned 200; this confirms endpoint access, not video playback.

## Rollback

Do not delete or unpublish the original ChatGPT Sites project. Its project ID
remains in `website/.openai/hosting.json`, which is outside the uploaded `dist`
directory and is not publicly served as configuration.

To restore Sites after DNS cutover:

1. Disable the new `tabtools_canonical_https` redirect rule by its ID above.
2. Re-add `www.tabtools.fyi` as a custom domain on the preserved Sites project.
   Restore its CNAME target to the value Sites returns (previously
   `custom-domains.chatgpt.site`), proxy enabled, TTL Auto. Apply any new hostname
   verification TXT values returned by Sites, and wait for activation.
3. Verify https://www.tabtools.fyi/ and the independent ChatGPT Sites URL.
4. To restore the apex record exactly, restore A `192.0.2.1`, proxy enabled,
   TTL Auto. That also restores its pre-existing failure; restoring this broken
   placeholder is not needed to make www work again.
5. Preserve all TXT records and unrelated configuration. Disable the GitHub
   website deployment workflow if production changes need to be frozen.

For later Pages releases, select a known-good production deployment in Pages
and use Rollback, then revert the offending website change in GitHub so a later
push does not redeploy it. The initial successful deployment is identified above.
Restore original source from `87d8b7b` if needed; never reset extension code as
part of a website rollback.

## References

- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://developers.cloudflare.com/pages/configuration/custom-domains/
- https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/
