# TabTools localisation sources

This directory is the source of truth for user-facing translation text.
English is represented by `locales/en.json`; `en-GB.json` is the explicit
British-English store and website variant. The locale registry in
`registry.json` maps canonical language tags to the WebExtensions directory,
website URL, hreflang value, and each store's listing code.

The current repository extension version is 4.0.2. The 2026-09-18 baseline is commit
`519007f3dd06c0b2ab52d57519ed7a0d145b9c79`. The imported translations carry
per-key review metadata in `reviews/<locale>.json`; a review's `source`
value is `sha256(JSON.stringify(EnglishValue))`. A source edit therefore
makes the affected translation stale even if its key remains present.

The read-only English live-store snapshot is in
[`store-baseline.md`](store-baseline.md). It records Chrome Web Store 4.0.1
and Firefox Add-ons 4.0.0 copy retrieved on 2026-09-18; the public Edge page
was unavailable to the retrieval tool. The copy-ready listings intentionally
follow the repository's current 4.0.2 source baseline and must be checked in
the publisher dashboards before release.

Run:

```sh
node scripts/generate-website.js
node scripts/generate-listings.js
node scripts/validate-localisation.js
node --test tests/website.test.js tests/localisation.test.js
node build.js
```

`website/src/template.html`, `website/src/styles.css`, and
`website/src/script.js` are authored sources. `website/dist/index.html`,
locale pages, `styles.css`, `script.js`, and `sitemap.xml` are generated
outputs. Store text under `marketing/listings/` is generated from the same
locale sources and is committed for review and future manual entry; it never
updates a live store listing.

Translation completion, technical validation, and linguistic review are
tracked separately. Source freshness is fingerprinted per key and reported as
current or stale in `coverage.md`; CI fails on stale non-English source
fingerprints. The current translations have AI self-review only; no
native-speaker review is claimed. The official public documentation confirms
the localisation mechanisms, while AMO and Edge expose the complete listing
language choices in publisher dashboards. Recheck those dashboards before
applying a store release.
