# Website guides progress

Branch: `feat/website-guides`, based on main `f5754a14b63ece94308ee29415757748eae394e0`.
Independent of localisation PR #17. No extension code changes.

## Completed

- Wrote three original guides covering site closing, duplicate cleanup and sorting.
- Added `/guides/` plus three individual static article routes with shared navigation,
  article metadata, table of contents, related guides and browser-store buttons.
- Added homepage navigation, footer and feature links; made navigation available
  at mobile widths and fixed adaptive browser-icon paths on nested pages.
- Added dependency-free generation using the homepage header/footer and CSP-approved
  theme bootstrap, with generated outputs committed for the static host.
- Preserved the existing CSP and one-year host-only HSTS policy.
- Reviewed native browser alternatives against current Google, Mozilla and Microsoft
  documentation linked from the articles.
- Executed 12 source-based behavioural checks covering matching, duplicate retention,
  window scope, pinned tabs, sort order and popup Undo. These use mocked browser APIs;
  they do not establish installed-store browser behaviour or a released version.

## Validation and remaining work

- Generator and stale-output check pass; security checks pass on all five HTML pages.
- Structural checks pass for all five pages, 163 local references and 47 tagged
  store links, including metadata, JSON-LD, navigation and sitemap coverage.
- Responsive CSS review led to an explicit second navigation row on tablets and
  a narrower install button on small phones. Actual mobile browser review is not
  claimed. A live desktop PR preview review is in progress.
- Chromium could not be downloaded in this container (CDN timeouts and a 502).
  Local installed-extension screenshot and browser checks are not claimed.
- No new screenshots are presented as installed-extension evidence. The guides use
  readable steps and concrete matching/sorting tables.
- Production publication follows review and merge through the existing Cloudflare
  workflow; this task does not merge the PR or alter hosting configuration.
