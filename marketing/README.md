# TabTools store text and artwork

Store text is versioned with the extension source. Generation does not connect to
publishing APIs or change live listings.

Each store directory contains one Markdown file per registry locale:

- `listings/chrome/`: Chrome Web Store title, summary, and full description
- `listings/firefox/`: Firefox Add-ons name, short description, and full description
- `listings/edge/`: Microsoft Edge Add-ons name, short description, and full description

## Description sources

Titles and summaries come from `localisation/locales/<locale>.json` and agree
with the manifest-derived extension locale fields. Firefox and Edge descriptions
also use those catalogues and remain proposed next-release copy.

Chrome descriptions come from `sources/chrome-descriptions.json`. This preserves
the final 29 Chrome 4.0.3 descriptions captured from the publisher dashboard on
1 October 2026. They include the Chrome-only introduction and explicitly explain
that closing a site's tabs includes the current tab and pinned tabs. Do not
replace them with the generic cross-browser website descriptions. Snapshot and
English-source fingerprints detect accidental divergence; reconcile changed copy
and its provenance explicitly. A fingerprint records source identity, not
linguistic approval. No fluent-reader review is claimed.

Run generation and validation before entering text into a publisher dashboard:

```sh
npm test
node build.js
node scripts/check-packages.js
```

Validation applies conservative cross-store limits: 50 Unicode code points for a
title/name, 132 for a summary/short description, and 250–10,000 for a full
description. These are project guardrails. The final Chrome descriptions were
accepted by the dashboard, but this does not establish its maximum field limit.
Microsoft's [publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#enter-properties-for-a-language)
records the 250–10,000 description range. Edge's available locale choices and
codes still need confirmation before an Edge store release.

## Screenshot sources

Editable final artwork, source verification and rendering instructions are in
[`assets/`](assets/README.md). Five images per locale use this order:

1. Overview
2. Sort by site
3. Right-click cleanup
4. Cleanup count
5. Inactive tabs

The original stylized right-click illustration is retained intentionally. It is
illustrative artwork, not a screenshot of Chrome's native context menu. The
extension command is available when right-clicking within a web page.

The Chrome English localized promo video is `https://www.youtube.com/watch?v=hFv7I_5vLFk`.
This is store media metadata; it does not change the website's existing embed.

## Release checklist

1. Build from the reviewed commit and verify browser-specific manifest versions:
   Chrome 4.0.3, Firefox and Edge 4.0.2 at this checkpoint
2. Confirm that the intended store detects the packaged `_locales` directories
3. Check the dashboard's current field limits and locale choices; use the matching
   store text and locale identifiers
4. Verify title/name, summary, description, links and browser-specific wording
5. Check five screenshots in the order above, with footers `01 / 05`–`05 / 05`
6. Confirm release scope and approval before submitting or publishing anything

Chrome 4.0.3 was submitted for store review on 1 October 2026. Repository merge
readiness is separate from store review/publication, fluent-reader acceptance,
and any later Firefox or Edge release. This source reconciliation neither
resubmits a package nor changes the submitted extension runtime.
