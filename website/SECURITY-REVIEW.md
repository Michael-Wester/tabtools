# TabTools website security review

Reviewed 20 September 2026 UTC against production `https://tabtools.fyi/`
and repository main `519007f3dd06c0b2ab52d57519ed7a0d145b9c79`.
Changes are isolated on `fix/website-security-headers`; PR #17 is unchanged.

## Result and scope

No critical or high-severity exploitable website code flaw was identified in
this limited review. The confirmed website findings are missing browser
defences. This is a static promotional site without website authentication,
forms, API endpoints, a database, or installed website runtime dependencies.
Missing headers alone do not demonstrate XSS or an existing compromise.

Review covered public GET/HEAD responses, redirects, shipped HTML/CSS/JS/SVG,
external resources, DOM input handling and the GitHub deployment workflow.
It did not audit the browser extension, Cloudflare account settings, token
scope, account MFA, every Git revision, or the internals of third-party code.
No intrusive probes or third-party scanner submissions were made.

## Confirmed findings and minor changes

| Finding | Assessment | Change in this branch |
| --- | --- | --- |
| No Content-Security-Policy | Missing defence against injected scripts/resources; no exploitable injection found | Enforced CSP allows local assets, the exact inline theme script and the YouTube privacy-enhanced frame; blocks arbitrary inline/eval code, objects, base URLs, forms and parent-page network connections |
| No framing protection | Low impact for this unauthenticated promotional page; possible misleading embedding | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| No HSTS | HTTP correctly redirects, but browsers did not retain an HTTPS requirement | Host-only `max-age=86400`; no subdomain commitment or preload |
| No explicit sensitive-feature restriction | Low-risk hardening | Deny camera, microphone and geolocation through Permissions-Policy |
| Mutable deployment action tags | Supply-chain hardening opportunity | Pin checkout v6 and Wrangler action v3 to their verified upstream commit SHAs |
| Future HTML edits could invalidate CSP hashes | Availability/maintenance risk introduced by an enforced policy | Dependency-free pre-deployment check validates the policy and executable inline scripts across all HTML pages |

`nosniff` and `strict-origin-when-cross-origin` already worked in production;
the new `_headers` file records them explicitly. Existing public-asset CORS
(`Access-Control-Allow-Origin: *`) is not a credentials leak for these public
static files and was left unchanged. All 13 external new-tab links already
use `noopener`. No website DOM HTML-injection or eval sink was found.

The parent page keeps its existing YouTube iframe and permissions. CSP does
not govern resources inside the cross-origin YouTube document. The live
Cloudflare email decoder is served from `/cdn-cgi/scripts/...` and remains
permitted by `script-src 'self'`. No broad Google/YouTube script allowlist was
added to the parent page. The current inline-script bytes match production.

## Larger changes for the owner to decide

1. **Separate production deployment access from previews (priority).** The
   existing workflow gives same-repository PR jobs the repository-level
   `CLOUDFLARE_API_TOKEN`, also used for production. A compromised repository
   writer or action could therefore misuse production access before merge.
   Fork PRs are already excluded; this is not anonymous access. Move the
   production token to a GitHub environment restricted to `main`, decide
   whether deployment approval is needed, and use an isolated preview
   credential/project with a verified permission boundary. A second token
   with the same account-wide permissions is not isolation. Actual current
   token scope and environment settings were not accessible in this review.
2. **Protect `main`.** GitHub's branch response reported `protected: false`
   and the repository ruleset list was empty. Require PRs and successful
   checks before merge, restrict force pushes/deletion and decide suitable
   reviewer/bypass rules for a solo-maintained project. These settings change
   the release process and were not modified.
3. **Extend HSTS only after a successful rollout.** Start with the committed
   one-day host-only policy, then consider a longer duration once HTTPS and
   renewal are established. Inventory all subdomains before considering
   `includeSubDomains` or preload. Preload is optional, not a prerequisite
   for resolving this finding. It creates a much longer-lived commitment.

No website framework, server, paid security service or hosting migration is
needed to apply the minor fixes. Loading the YouTube player only after a click
would be an optional privacy/product change, not a required vulnerability fix.

## Validation and release status

- Production `/`, `/privacy`, an unknown fallback path, `script.js` and
  `styles.css` returned 200. Relevant HTML routes consistently lacked the
  headers added here. The two assets matched repository main byte for byte.
- HTTP apex and both www schemes redirected to HTTPS apex; a www asset
  request preserved its path and query string.
- HTTPS requests succeeded with normal certificate verification in this
  environment. Traffic passes through a proxy; this was not a direct audit
  of the edge certificate chain, TLS versions or cipher suites.
- Local and CI validation results are recorded in the pull request. The
  checker guards authored static content; it is not an HTML sanitizer or a
  substitute for a browser test of hosting-injected code.
- These changes require merge and production deployment before they affect
  `tabtools.fyi`. Verify actual production response headers after release.
  Browser playback, theme persistence, store links, privacy navigation and
  contact-email decoding remain interactive release checks.

When integrating PR #17, preserve `website/dist/_headers` and run
`node website/check-security.cjs` **after** the localisation generator.
Its executable theme bootstrap currently matches the approved hash. JSON-LD
and locale JSON blocks are inert data; they do not require executable-script
hashes. New executable scripts and resource origins require explicit review.

## Rollback

For a CSP compatibility problem, restore a reviewed `_headers` policy through
the normal release process. Keep unrelated protections. HSTS is cached by
browsers: removing its header does not immediately undo it. To disable HSTS,
serve `Strict-Transport-Security: max-age=0` over working HTTPS; clients must
receive that response or let their previously cached one-day policy expire.
Keep HTTPS available during the rollback.

## References

- [Cloudflare Pages response headers](https://developers.cloudflare.com/pages/configuration/headers/): `_headers` applies to static responses; redirects and future Functions require separate consideration.
- [MDN HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security): persistence, host/subdomain scope and rollback.
- [MDN CSP script sources](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src): hash-based inline-script permission.
- [MDN script data blocks](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type): non-executable JSON blocks.
- [GitHub secure workflow use](https://docs.github.com/en/actions/reference/security/secure-use): repository writer access to secrets, environment protection and immutable action pins.
- [Verified checkout commit](https://github.com/actions/checkout/commit/d23441a48e516b6c34aea4fa41551a30e30af803) and [verified Wrangler action commit](https://github.com/cloudflare/wrangler-action/commit/9acf94ace14e7dc412b076f2c5c20b8ce93c79cd). Wrangler's runtime package remains version-selected by the existing action behavior; action pinning alone does not freeze it.
