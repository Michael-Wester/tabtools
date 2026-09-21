# Website guides progress

Branch: `feat/website-guides`, based on main `f5754a14b63ece94308ee29415757748eae394e0`.
Independent of localisation PR #17. No extension code changes.

PR: https://github.com/Michael-Wester/tabtools/pull/19
Preview: https://pr-19.tabtools-website.pages.dev/guides/

## Completed

- Wrote three original guides covering site closing, duplicate cleanup and sorting.
- Added `/guides/` plus three individual static article routes with shared navigation,
  article metadata, table of contents, related guides and browser-store buttons.
- Added homepage navigation, footer and feature links; made navigation available
  at mobile widths and fixed adaptive browser-icon paths on nested pages.
- Added dependency-free generation using the homepage header/footer and CSP-approved
  theme bootstrap, with generated outputs committed for the static host.
- Preserved the existing CSP and one-year host-only HSTS policy.
- Added ten original Cua.ai Chrome captures with the bold enlarged Windows cursor,
  step captions, alt text, responsive sizing, lazy loading and full-size links.
  Screenshots demonstrate the PR's unpacked TabTools 4.0.2 source using YouTube,
  Wikipedia and Google; the article examples match the visible tab counts.
- Verified Chrome's tab context menu with the unpacked extension and replaced
  the webpage-menu screenshot with the tab-menu capture. The primary instructions
  now use the tab bar, with the webpage menu retained as a fallback.
- Reviewed native browser alternatives against current Google, Mozilla and Microsoft
  documentation linked from the articles.
- Executed 12 source-based behavioural checks covering matching, duplicate retention,
  window scope, pinned tabs, sort order and popup Undo. These use mocked browser APIs;
  they do not establish installed-store browser behaviour or a released version.

## Validation and remaining work

- Generator and stale-output check pass; security checks pass on all five HTML pages.
- Structural checks pass for all five pages, 183 local references and 47 tagged
  store links, including metadata, JSON-LD, navigation and sitemap coverage.
- Responsive CSS review led to an explicit second navigation row on tablets and
  a narrower install button on small phones. Actual mobile browser review is not
  claimed.
- GitHub validation and preview deployment passed for the initial guide pages in
  workflow run `35558369695`; screenshot integration runs the same workflow.
- Live Chrome review at 1348px covered the Guides index and all three articles,
  light/dark switching and theme persistence between pages, related links,
  table rendering, loaded icons and no desktop horizontal overflow. The tested
  contents link settled below the sticky header (96px versus header bottom 73px).
  Browser logs showed injected browser-extension metadata errors; no website-source
  error was observed in the inspected log entries.
- The screenshot integration was inspected in the in-app browser. At a 1280px
  viewport, the duplicate guide's images loaded at their original 1280px width,
  displayed at 728px inside the numbered steps, and caused no horizontal overflow.
  Mobile sizing was reviewed in CSS; an additional raw-debugging browser check
  was not completed because browser permission was denied.
- The screenshots were captured with the PR's unpacked extension in disposable
  Cua.ai Google Chrome sessions. Capture resources are released after review;
  provenance is recorded in `dist/assets/guides/README.md`.
- Production publication follows review and merge through the existing Cloudflare
  workflow; this task does not merge the PR or alter hosting configuration.
