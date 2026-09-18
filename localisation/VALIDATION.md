# Validation record

17 September 2026. The source baseline is commit
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
  and 30 locale directories. Uncompressed sizes: Chrome/Edge **219,480 bytes** each;
  Firefox **220,097 bytes**. No marketing files, reviews or reports are packaged.
  Versions, permissions, MV2/MV3 architecture and Firefox minimum version preserved.
- Modified JavaScript syntax and `git diff --check` passed. No images/videos changed.

## Environment and pending checks

No local Chrome, Firefox, Edge or PowerShell executable was available. Browser
installation download timed out. The available cloud browser cannot access the
scratch localhost server or load these local extension packages. Node API/DOM
adapters are not native extension smoke tests. Windows PowerShell CI and the PR
website preview will be checked after opening the PR; results will be added here.

Native Chrome/Firefox/Edge popup and context-menu smoke tests, popup visual checks,
mobile layouts and full glyph review are pending. The PR stays draft while these
material verification gaps and the store-support evidence gaps remain. No native
speaker review has occurred; see COVERAGE.md and GLOSSARY.md.

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
