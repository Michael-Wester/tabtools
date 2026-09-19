# Localisation validation

Current review results and remaining checks are recorded in [PR17_REVIEW.md](PR17_REVIEW.md).
The review started at `b492c9256eef9a1393eb3bbe2cff2afa7be27b5a` on 18 September 2026.

## Automated checks

```sh
npm test
node build.js
node scripts/check-packages.js
node website/build.js
node scripts/validate-localisation.js --report
git diff --exit-code
```

CI runs on Linux and Windows with Node 22. Windows additionally runs `./build.ps1`
and checks its packages. Generated locale files, pages and store text are committed;
generation must leave them unchanged. Review fingerprints are never updated by generation.

The first review checkpoint passed both platforms:
[validation run 35356589950](https://github.com/Michael-Wester/tabtools/actions/runs/35356589950).
It repairs checks that were absent or broken despite the previous nine-test suite passing.

## Manual browser acceptance

Use disposable profiles and controlled test tabs. Check English, German (long copy),
Japanese (CJK), Hebrew (RTL), Russian/Polish (plurals), then remaining locales for glyphs.

1. Load the built package in each browser. Confirm translated manifest names, toolbar
   tooltip, popup, settings, native context menus and unsupported-language English fallback.
2. Close a site across two regular windows; confirm matching current tabs close and
   unrelated/private tabs remain. Check exact-domain and keyword matching.
3. Check site-frequency sorting in the current window, duplicate removal with pinned
   duplicates, and inactive cleanup with active/pinned/audible exceptions.
4. Check immediate Undo while the popup is open, settings persistence, and offline operation.
5. Inspect 0/1/2/5/21 counts, large numbers, long domains, both themes and Hebrew direction.
   Header counters should read `14 open` / `2479 closed` in English, with compact
   equivalents and ungrouped digits in other locales. Longer header text should
   widen the popup while Main and Settings retain the same width in both
   directions. Check the wrapping fallback at the maximum popup width.

For the website, serve `website/dist` locally or use the existing PR preview. Check
320/390 px and desktop layouts, both themes, English/Hebrew and long regional names.
The circle and theme button should stay adjacent, with 44 px targets and no overflow.
Exercise arrows, Home/End, Enter/Space, Escape, Tab/Shift+Tab and outside click. Verify
focus return, scroll visibility, direct locale links, refresh, query/fragment retention,
modified-click navigation and saved preference without automatic redirects. Check FAQ,
privacy focus, adaptive store buttons, UTM values, canonical/hreflang and sitemap.

These checks do not constitute native-speaker review or store-dashboard verification.
Media is intentionally untranslated. No live store listing is changed by this repository.
