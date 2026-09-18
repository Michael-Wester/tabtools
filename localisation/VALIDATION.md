# Validation record

17–18 September 2026. The source baseline is commit
`519007f3dd06c0b2ab52d57519ed7a0d145b9c79`; all three extension versions remain 4.0.2.

## Completed local checks

- Baseline Node extension builds and website syntax passed before changes. No
  existing test suite was present; no native browser baseline was available.
- All 30 catalogues: 42 extension and 96 website/shared keys each, no missing or
  stale keys, placeholder mismatches, unreviewed English matches, invalid markup,
  replacement characters or changed brands/domains. Actual font glyph rendering
  is a separate visual check, not established by Unicode validation.
- All 90 store files: all three fields present, agreed with their manifest-derived
  sources, no unresolved placeholders, within the documented common constraints.
  Edge dashboard coverage/codes and Chrome full-description cap remain unverified.
- Deterministic generation and stale-output checks passed for every locale.
- 12 Node regression tests passed: native message selection/direction, plural
  forms, English fallback, literal interpolation, changed-source and changed-target
  fingerprints, store agreement, explicit URLs, preference suggestions, region/script
  aliases, selector persistence/navigation, theme/Edge CTA behaviour, and all-page
  metadata, reciprocal hreflang, assets, anchors, store-link count and sitemap.
- Node builds passed for Chrome, Firefox and Edge. Each contains 48 runtime files
  and 30 locale directories. Uncompressed sizes: Chrome/Edge **219,468 bytes** each;
  Firefox **220,085 bytes**. No marketing files, reviews or reports are packaged.
  Versions, permissions, MV2/MV3 architecture and Firefox minimum version preserved.
- Modified JavaScript syntax and `git diff --check` passed. No images/videos changed.

## Environment and pending checks

No local Chrome, Firefox, Edge or PowerShell executable was available. Browser
installation download timed out. The available cloud browser cannot access the
scratch localhost server; its URL security policy also blocks `chrome://extensions/`.
No workaround for that restriction was attempted. Node API/DOM adapters are not
native extension smoke tests. Windows PowerShell CI passed, as recorded below.

Native Chrome/Firefox/Edge popup and context-menu smoke tests, popup visual checks,
mobile layouts and exhaustive glyph review are pending. The PR stays draft while these
material verification gaps and the store-support evidence gaps remain. No native
speaker review has occurred; see COVERAGE.md and GLOSSARY.md.

## GitHub CI and PR preview — 18 September 2026

- [Initial validation run](https://github.com/Michael-Wester/tabtools/actions/runs/35313430132):
  Linux source/generated-output checks, 12 tests, Node packaging and package checks
  passed. The Windows PowerShell build and all package checks also passed.
- [Initial preview deployment](https://github.com/Michael-Wester/tabtools/actions/runs/35313430064)
  succeeded for PR #17, targeting `pr-17`, not production. Review URL:
  https://pr-17.tabtools-website.pages.dev/ .
- In the real cloud Chrome browser, all 30 locale URLs loaded with their expected
  document language, direction, nonempty localised title/heading and production
  canonical. None had document-level horizontal overflow at a 1348 CSS-pixel
  viewport. This is a desktop check, not a mobile-device claim.
- Inspected actual viewport captures for English (light), German, Japanese and
  Hebrew (light/dark). No missing glyphs were observed in those viewports.
  The review identified an isolated Japanese heading ending and an RTL browser
  button divider on the outer edge. The follow-up adjusts only CJK heading
  wrapping/size and logical button spacing; all media remains unchanged.
- Language selection navigated to German, Japanese and Hebrew. Theme choice
  survived language changes and refresh. Opening explicit `/ja/` with Hebrew
  saved kept Japanese content and offered a Hebrew link instead of redirecting.
  FAQ expansion worked. Query strings survived language selection; privacy
  navigation focused the privacy section and updated the fragment correctly.
  Rendered store destinations and their UTM values matched the existing links.
- The cloud browser exposes no viewport-resize capability; a zoom shortcut did
  not change its CSS viewport. Mobile layout and mobile browser detection remain
  manual checks. The Edge listing still could not be retrieved by the available
  public lookup; no dashboard or live listing was changed.
- A follow-up source review corrected the free-use FAQ answer in eight locales
  to retain “no account needed”, removed a fixed-gender German store-name article,
  and used the HTML `dir="auto"` attribute for the keyword input. Each changed
  translation was re-reviewed and its fingerprint recorded individually.

These observations apply to website UI, not to an installed extension. The
follow-up code/copy changes are checked by the same CI gates and preview workflow.

## Reproduce locally

```sh
node scripts/generate-localisation.js
node website/build.js
node scripts/validate-localisation.js --report
node --test tests/*.test.js
node build.js
node scripts/check-packages.js
python -m http.server 8765 --directory website/dist
```

Also run `./build.ps1` in PowerShell, then `node scripts/check-packages.js`.

## Manual browser acceptance matrix

Use disposable browser profiles and controlled demo tabs. Check English first,
then German (long copy), Japanese (CJK), Hebrew (RTL), Russian/Polish (plural forms)
and the remaining locales for glyphs/overflow. Set the actual browser UI language,
restart, and load `dist/chrome` at chrome://extensions, `dist/edge` at
edge://extensions, or `dist/firefox/manifest.json` via about:debugging.

1. Check localised installed name/description, toolbar tooltip, popup labels,
   empty/loading/error states, settings, theme controls and native context menus.
   Unsupported UI languages must fall back to English; settings must survive restart.
2. Open multiple example.com tabs in two regular windows plus a different site.
   Click the site suggestion and separately the native context-menu action.
   Confirm the matching current tab also closes, the other site stays, and
   incognito/private tabs are excluded. Use only disposable tabs.
3. Check exact-domain and title/URL keyword closing, site-frequency sorting in
   the current window, and duplicate removal with one pinned duplicate.
   Sorting must not create browser tab groups.
4. Set a small inactivity threshold and test active, pinned, audible and eligible
   inactive tabs. Only the eligible inactive tabs close when the action is clicked.
   There is no automatic scheduled closure. Test Undo immediately while the popup
   is open and confirm its scope after closing/reopening the popup.
5. Check locale number formatting and 0/1/2/5/21 counts, long domains, narrow popup
   buttons, settings wrapping, keyboard focus and screen-reader labels in both
   themes. Hebrew URLs/domain chips should remain readable left to right.
6. With the extension loaded, disconnect networking and repeat normal actions;
   translations and tab operations must remain available offline.

Website: check every selector option/direct URL and refresh; inspect desktop and
320/375/768px mobile layouts in light/dark themes. Confirm no clipping, missing
glyphs or horizontal overflow. Check language/theme choice persists; opening a
conflicting explicit locale URL must not redirect. Test section anchors, FAQ,
privacy navigation, Chrome/Firefox/Edge adaptive CTAs, all store destinations and
UTM parameters. Existing YouTube media is intentionally untranslated. Verify
canonical/hreflang against production URLs even on the PR preview; no preview URL
belongs in the production sitemap. Capture only test evidence, not store artwork.
