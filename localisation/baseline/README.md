# English baseline — 17 September 2026

Source: default branch `main`, commit
`519007f3dd06c0b2ab52d57519ed7a0d145b9c79` in
[Michael-Wester/tabtools](https://github.com/Michael-Wester/tabtools/tree/519007f3dd06c0b2ab52d57519ed7a0d145b9c79).
No earlier localisation or store-copy directory existed. CONTRIBUTING.md was read;
no AGENTS.md existed. No relevant open PR overlap was found; no PR was merged.

Exact original manifests, popup HTML/JavaScript, website HTML and website script
are copied here. Original background context menu labels were “Close site tabs”
and “Sort tabs (most opened first)”. English extracted copy is in `../locales/en.json`.
The original assets and styles remain recoverable at the source commit.

| Source | Version | Exact text |
|---|---|---|
| Chrome repo | 4.0.2, MV3 worker | chrome-manifest.json |
| Edge repo | 4.0.2, MV3 worker | edge-manifest.json |
| Firefox repo | 4.0.2, MV2 background scripts, Firefox 78 minimum | firefox-manifest.json |
| Live Chrome listing | 4.0.1 | chrome-listing.json |
| Live Firefox listing | 4.0.0 | firefox-listing.json |
| Live Edge listing | Unavailable | edge-listing.json records failure; null fields are not approved copy |

Listing JSON records verified URLs, retrieval date, exact fields and response
hashes. Firefox was retrieved through the official public AMO API. Chrome text
was extracted from the public listing HTML. Edge returned a client-rendered shell
with generic metadata; the exact name, summary, description and version could
not be established. No authenticated publishing dashboards were available.

## Necessary clarification and source differences

The repo's 4.0.2 manifest title and summary already lead with site cleanup and
sorting; live stores have the older short name `TabTools` and differing summaries.
The proposed listings use the newer repo wording and feature explanations, not
an invented claim that the live listings already match them. All stores must be
aligned with the actual released extension version at a future release.

The live Chrome description calls sorting “group tabs”; code only reorders tabs,
so proposed copy says bring tabs together/sort. The spelling “Tab Tools” is
normalised to the brand `TabTools`. The unmeasured “in seconds” promise is not
carried into proposed text. Scope is stated explicitly: closing by site includes
the current tab and spans regular windows; sorting affects the current window;
inactive cleanup is user-triggered; popup Undo lasts only while the popup remains
open. Pinned tabs survive duplicate cleanup. The current website already states
these distinctions and separates extension privacy from its YouTube embed.

The English website text is preserved, adding only the language selector and
language-suggestion/theme/accessibility strings needed for localisation. Popup
fragment counters (`N closed`, `N open`, `Closed N inactive`, `Reordered N tabs`)
become whole messages with labels or correct plural forms. This small source
normalisation avoids concatenated English grammar without changing any action.
The original wording remains in popup.js for comparison.

## Before-change checks

`node build.js` successfully built Chrome, Edge and Firefox at the baseline.
Website JavaScript syntax passed. There were no existing automated tests.
No local Chrome, Firefox or Edge installation was available; baseline native
extension behaviour was inspected in source, not tested in a running browser.
The cloud browser cannot access the scratch localhost server. These environment
limitations must not be reported as a localisation regression or a passed smoke test.
