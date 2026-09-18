# Proposed localised store text

[All 90 copy-ready files](INDEX.md) cover the same 30 implementation locales as the
extension and website. These files prepare a future release; no listing was edited
or submitted. [Locale mappings and evidence](../localisation/LOCALES.md) include
the unverified exhaustive Edge dashboard language list. [Exact English baselines](../localisation/baseline/README.md)
include Chrome 4.0.1 and Firefox 4.0.0; the live Edge fields/version were unavailable.

## Fields and constraints

Checked 17 September 2026. The output is plain Unicode text with paragraph breaks;
copy only field contents, excluding Markdown headings, comments and counts.

| Store | Name | Summary / short description | Full description |
|---|---|---|---|
| Chrome | Localised manifest `name`; max 75 | Manifest `description`; max 132, plain text | Separate per-locale listing field. Exact current dashboard maximum/formatting capability not independently verified; this project conservatively limits all descriptions to 10,000 and uses plain text. |
| Firefox AMO | Separate translated name; max 50 | Separate summary; max 250, URLs disallowed | Separate translated description; max 15,000. AMO supports purified Markdown; plain paragraphs need no markup. |
| Edge | Read-only manifest-derived name | Read-only manifest-derived `description` | Separate field for every language, 250–10,000 characters. Plain paragraphs; no reliance on rich formatting. |

Shared copy is restricted to name ≤50, summary ≤132 and description 250–10,000.
Counts use UTF-16 units (conservative for astral characters), including paragraph
breaks in descriptions. Edge uses Chromium manifest constraints; any additional
Partner Center field restrictions and exact language identifiers must be verified
at release. The unknown Chrome dashboard cap is a documented verification gap,
not a claimed official 10,000-character limit.

Sources: [Chrome listing fields and localisation](https://developer.chrome.com/docs/webstore/cws-dashboard-listing),
[Chrome name limit](https://developer.chrome.com/docs/extensions/reference/manifest/name),
[Chrome description limit](https://developer.chrome.com/docs/extensions/reference/manifest/description),
[AMO translated fields and limits](https://github.com/mozilla/addons-server/blob/ce459da6793eb777d4d66ce96e56152834ec6e69/src/olympia/addons/models.py),
[Edge publishing fields](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## Single source and field fingerprints

`node scripts/generate-localisation.js` generates these files. Never edit them by
hand. `node scripts/validate-localisation.js` verifies exact generated output,
manifest agreement, placeholders, completion, character limits and per-key review
fingerprints. All store fields derive from `localisation/locales/<locale>.json`:

| Field | English/translation dependency keys |
|---|---|
| Name | `extensionName` |
| Summary | `extensionDescription` |
| Description | `extensionDescription`, `web_siteBody`, `web_bring_tabs_from_the_same`, `web_close_extra_copies_of_the`, `web_type_a_word_to_match`, `web_choose_an_inactivity_threshold_in`, `web_use_undo_immediately_after_closing`, `web_light_and_dark_themes`, `web_local_cleanup_statistics`, `web_the_tabtools_extension_processes_tab` |

Description paragraphs preserve this order, strip only the approved emphasis
markup, and insert two newlines. Each contributing key has its own reviewed
English SHA-256 and translation SHA-256; changing a dependency invalidates the
corresponding translated field even if the key name stays the same. Generation
never refreshes those reviews. There is no browser-specific feature difference
in these descriptions; architectures differ, but these inspected actions are shared.

AMO name/summary are separately managed but intentionally match the native
package. Chrome/Edge read those fields from the uploaded package. Store `_locales`
alone do not populate the separately managed full descriptions.

## Future release checklist

- [ ] Finish fluent-reader and native-browser review in `localisation/VALIDATION.md`.
- [ ] Retrieve the live Edge baseline, verify every Edge language code and the
      complete shared language set; confirm Chrome's current full-description cap.
- [ ] Recheck each store's live extension version and source changes since the
      recorded baseline. Confirm every proposed claim against the version to be
      submitted to that store; do not apply 4.0.2 claims blindly to older releases.
- [ ] Update English only when behaviour requires it; refresh/review all stale
      translated keys using `localisation/README.md`. Record human reviews honestly.
- [ ] Regenerate, validate, test, and build the three browser-specific packages.
      Follow the normal release/version process; this PR intentionally does not
      increment versions or add publishing automation.
- [ ] In the appropriate store dashboard, select each mapped language. Confirm
      Chrome/Edge manifest-derived fields, or paste AMO name/summary, then paste
      that store/locale's full description. Inspect preview formatting and counts.
- [ ] Keep product URLs and privacy/support destinations correct. Review existing
      privacy declarations against actual behaviour as part of the normal release.
- [ ] Any release submission or live listing changes require a separate authorised
      release action. Images, screenshots, banners and videos are outside this text
      task; this PR creates or changes none of them.
