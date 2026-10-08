# Localized guides

## Sources and review

The three English articles in `guides-content.cjs` and guide chrome in
`guide-ui.cjs` are authoritative. Each of the 28 other supported locales has a
complete JSON catalogue in `guide-locales/<locale>.json`, covering article body,
titles, descriptions, navigation, image alt text and captions. Existing TabTools
control labels in `localisation/locales/` guide terminology. Slugs, section IDs,
URLs, screenshot files and structural markup stay identical to the English
source. The generator rewrites only internal guide destinations to their locale.

Translations have AI translation/self-review, not native-speaker certification.
Technical completeness and valid markup do not establish linguistic fluency.
Keep this distinction when reviewing a release. The English screenshot pixels
are retained, accompanied by a translated disclosure; they are not presented as
localized screenshots. Do not change factual behavior when translating, especially
which active/pinned/private tabs close and when popup Undo is available.

`guide-localisation.cjs` fingerprints the complete English source and validates
all catalogues before generating guides. An English edit makes translations stale.
Reconcile and review the changed text in every locale before updating its
`sourceFingerprint`. Never refresh fingerprints merely to silence validation.
To get the current fingerprint after a real review:

```sh
node -p 'require("./website/guide-localisation.cjs").sourceFingerprint'
```

A stale translation does not stop generation. Its guide is still built from the
earlier translation, and `scripts/validate-localisation.js` reports the language
as awaiting translation: that fails everywhere except a pull request into a
release branch, where `TABTOOLS_PENDING_TRANSLATIONS=1` lets English go ahead of
its translations. A stale catalogue cannot be compared with the new English
paragraph by paragraph, so only its review, its strings, its set of guides and
the absence of unsafe markup are checked until it is brought up to date. To list
the languages that are behind:

```sh
node -p 'require("./website/guide-localisation.cjs").pending().join(" ")'
```

For 5.0.0 the English guides changed what they say about pinned tabs, typed
sites, duplicates, tab groups and Undo, and six of their pictures. The six
earlier pictures stay in `dist/assets/guides/` only for the translations that
still show them; delete them when those are retranslated.

The `review` metadata honestly identifies the review performed. Machine-checked
structure, source freshness and AI review remain distinct from human/native review.

## Routes and SEO

- English URLs remain unchanged at `/guides/` and `/guides/<slug>/`
- Other languages use their existing locale prefix, such as `/zh-cn/guides/`
- Every page is complete static HTML with one language, matching `lang`/`dir`,
  translated metadata and localized structured data
- Every guide has its own self-canonical and reciprocal HTML `hreflang` links to
  all 29 equivalent pages, including itself. `x-default` points to the English
  equivalent article or index, never an unrelated homepage
- The sitemap lists all 145 canonical URLs once: 29 homepages and 116 guide pages
- The existing registry codes are preserved, including valid `zh-CN` and `zh-TW`
  codes, whose script meanings Google derives from the region
- Explicit URLs always win; no IP or browser-language forced redirects are added
- Native language anchors and the JS registry both describe the current guide.
  Switching language preserves the query and fragment when JavaScript is enabled

Google's [localized-version guidance](https://developers.google.com/search/docs/specialty/international/localized-versions)
says translated main content is not treated as duplicate merely because it is
another language, and requires reciprocal alternate links. Its
[multilingual-site guidance](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
recommends separate URLs rather than cookie-only language variants. The HTML
hreflang implementation is sufficient; duplicating the same annotations into the
sitemap adds maintenance without a Google Search benefit. These practices support
correct discovery and language targeting, but cannot guarantee rankings or indexing.
Sources checked 1 October 2026.

## Production release gate

These instructions and translated control labels are checked against the current
main-branch source. That is not proof that the same behavior and localization are
already available in each published Chrome, Firefox or Edge store build. Before
production publication, verify the supported live store versions against the
guides, especially pinned-copy duplicate retention and translated popup labels.
If a store is behind, wait for the matching release or add accurate version-specific
guidance rather than implying that source-only changes are already released.
No store publication, merge or production deployment is authorized by this draft.

## Adding a guide and pending integration

This change translates the three guides currently on main. The separate
[inactive-tabs guide PR #30](https://github.com/Michael-Wester/tabtools/pull/30)
is still pending and overlaps the generator/content/checker/sitemap/test files;
it is not included or merged here. Reconcile it against this localized generator
before publication. Do not restore the older English-only generator while
resolving those conflicts.

Guide routes, cards, schemas, alternate groups and sitemap entries are derived
from the English source array, not a fixed list of three slugs. Adding an English
guide changes the source fingerprint and expected catalogue shape, so every
translation must add and review the new guide before generation succeeds.
Update index copy in `guide-ui.cjs` where the scope or guide count changes, and
regenerate/recheck all output. A future fourth guide must not quietly fall back
to English beneath a translated URL.

## Verification

```sh
npm test
node website/build-guides.cjs --check
node website/check-guides.cjs
node website/check-security.cjs
node build.js
node scripts/check-packages.js
cd website/tests && npm ci && npx playwright install chromium webkit && npm test
```

Checks cover catalogue completeness/freshness and safety, the full canonical/
hreflang/sitemap graph, local assets and destination anchors, same-article language
switching and history, all guide locales at narrow widths, and native no-JavaScript
navigation for representative CJK and RTL locales. Keep the existing extension
and Firefox checks green too. A draft PR is not approval to merge or deploy.
