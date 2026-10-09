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

Chrome descriptions come from `sources/chrome-descriptions.json`. They carry a
Chrome-only introduction, so do not replace them with the generic cross-browser
website descriptions. For 5.0.0 the English entry is proposed text, marked
`proposedFor`, and says what 5.0.0 does: closing a site's tabs includes the tab
you are on and leaves pinned tabs open unless that is turned off in Settings.
Every other language still holds the final 4.0.3 description captured from the
publisher dashboard on 1 October 2026, which says pinned tabs close. Those are
reported as awaiting translation until they are rewritten from the English, and
must not be entered for 5.0.0 as they stand. Snapshot and English-source
fingerprints detect accidental divergence; reconcile changed copy and its
provenance explicitly. A fingerprint records source identity, not linguistic
approval. No fluent-reader review is claimed.

What changed for people who already use TabTools is in
[`release-notes/5.0.0.md`](release-notes/5.0.0.md), written for Firefox's
release-notes field and the GitHub release. Chrome and Edge have no such field.

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

**This artwork shows the 4.x popup and has not been redrawn for 5.0.0.** Four of
the five images (all but the right-click one) picture the two-column popup with
its Settings and Undo buttons, and the inactive-tabs image says inactive tabs
close in one click, which 5.0.0 no longer does. New artwork is needed before a
5.0.0 listing is submitted. Pictures of the 5.0.0 popup taken from the built extension are in
`docs/images/` and `website/dist/assets/guides/`; `scripts/capture-pictures.js`
takes them.

The original stylized right-click illustration is retained intentionally. It is
illustrative artwork, not a screenshot of Chrome's native context menu. The
extension command is available when right-clicking within a web page.

The Chrome English localized promo video is `https://www.youtube.com/watch?v=hFv7I_5vLFk`.
It shows the 4.x popup. The website no longer embeds a video; its home page has
a working copy of the 5.0.0 popup instead.

## Release checklist

1. Build from the reviewed commit and verify browser-specific manifest versions:
   Chrome, Firefox and Edge 5.0.0
2. Confirm that the intended store detects the packaged `_locales` directories
3. Check the dashboard's current field limits and locale choices; use the matching
   store text and locale identifiers
4. Verify title/name, summary, description, links and browser-specific wording.
   For 5.0.0, enter a language's description only once `npm test` passes without
   `TABTOOLS_PENDING_TRANSLATIONS`, so that no language still describes 4.x
5. Replace the five screenshots with 5.0.0 artwork, in the order above
6. Confirm release scope and approval before submitting or publishing anything

Chrome 4.0.3 was submitted for store review on 1 October 2026. The text and
pictures here for 5.0.0 are prepared in the repository only: nothing has been
entered in a publisher dashboard, submitted or published. Repository merge readiness is separate from store review/publication,
fluent-reader acceptance, and any later Firefox or Edge release.
