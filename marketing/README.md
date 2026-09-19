# TabTools store text

The files below are copy-ready store text, versioned with the extension source.
They are not connected to any publishing API and do not change live listings.

Each store directory contains one Markdown file per registry locale:

- chrome/ — Chrome Web Store title, summary, and full description.
- firefox/ — Firefox Add-ons name, short description, and full description.
- edge/ — Microsoft Edge Add-ons extension name, short description, and full description.

The listing files and `INDEX.md` are generated from
`localisation/locales/<locale>.json` and `localisation/registry.json`. Descriptions
reuse feature and privacy text, without the website-only browser-link instruction:

    node scripts/generate-listings.js

The manifest-derived name and description must agree with the extension locale
files. Run the full validation before entering text into a publisher dashboard:

    node scripts/generate-extension-locales.js
    node scripts/generate-website.js
    node scripts/generate-listings.js
    node scripts/validate-localisation.js

Validation applies conservative cross-store limits: 50 characters for a
title/name, 132 for a summary/short description, and 250–10,000 for a full
description. Recheck the current limits and enabled locale choices in each
publisher dashboard immediately before release. Microsoft's [publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#enter-properties-for-a-language) confirms the 250–10,000 description range (rechecked 19 September 2026). Chrome's [listing instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) explain localisation but do not state a full-description maximum; the shared ceiling is a project guardrail, not a claim that Chrome's current maximum is 10,000.

Before applying a release, confirm the current locale choice and field limits
in each publisher dashboard. The repository records the English baseline,
source commit, store URL, locale code, and character counts for each file.
Images, screenshots, banners, and videos are deliberately not represented here.

Release checklist:

1. Upload the extension package built from the reviewed commit.
2. Confirm that each store detects the packaged _locales directories.
3. Enter the matching store file for the same extension version.
4. Check title/name, summary/short description, full description, links, and
   browser-specific wording in preview.
5. Keep screenshots and other visual assets unchanged for this text-only scope.
