# PR #17 review progress

Review baseline: `b492c9256eef9a1393eb3bbe2cff2afa7be27b5a` (18 September 2026).

## Completed

- Preserved earlier checkouts and reviewed the actual GitHub head in a separate checkout.
- Reproduced the broken package checker; replaced obsolete helper calls with checks of built packages, locale content, manifest metadata and referenced scripts.
- Fixed the PowerShell registry shape and aligned Node/PowerShell Firefox Bokmål packaging (`no` to `nb`).
- Restored documented generator and translation-review commands using the current implementation. Removed the abandoned duplicate website template.
- Consolidated case-colliding coverage/glossary documents for Windows checkouts.
- Added Linux/Windows CI packaging gates and a regression test that builds and checks the actual packages.

## Runtime and interface fixes

- Set the popup language/direction from the selected translation catalogue; support Hebrew RTL, readable domain labels and wrapping for translated controls.
- Restore the bundled English fallback, select plural rules from the actual fallback language, and format displayed counts without changing stored numbers.
- Keep substitution positions stable when translations reorder or repeat placeholders.
- Connect the language button to its actual listbox ID, dismiss on focus exit, preserve modified-click navigation and keep focused options visible.
- Respect the first supported saved/browser language; stop suggesting a different language when the current one already matches. Suggestions record explicit choices and mark their English names as LTR.
- Group the two 44 px controls so they cannot split or shrink; remove flag inset padding, allow regional names to wrap, and use logical button dividers for RTL.
- Replace phrase matching with explicit template bindings and escape translated HTML. English wording changes now propagate without editing a second copy.
- Validate placeholder preservation, plural completeness, markup, brand/domain names and exact generated store text; coverage reports actual errors.

## Validation

- Baseline: nine tests passed, but the standalone package checker failed with `L.read is not a function`.
- Nineteen regression tests cover the failures above, actual browser packages, navigation, all 29 generated pages, safe output and review-command isolation.
- All 29 catalogues pass strengthened validation; all three Node packages build and pass integrity checks.
- First checkpoint CI: Linux and Windows passed, including the real PowerShell build and package checks (run 35356589950).
- The live browser reproduced the original missing listbox ID and menu staying open after Tab.
- Runtime/interface checkpoint `fa818f9b4b2afab145103c179ff87eee2c5794b9` passed Linux/Windows CI (run 35357687979) and the preview workflow (35357687954). The local and remote trees matched exactly.
- Live Chrome: inspected English and Hebrew screenshots, Hebrew light/dark layout and the open RTL menu. All 29 flag images loaded; the menu stayed in the viewport and the inspected pages had no document overflow at a 1363 CSS-pixel viewport.
- Exercised ArrowDown, End, Enter, Escape and Tab on the actual website. Fixed the additional Shift+Tab dismissal issue found by that review and covered it in the regression test.
- German navigation retained the test query and FAQ fragment; dark theme persisted across locale changes. The direct Hebrew URL remained Hebrew without an automatic redirect.
- Browser zoom did not change the cloud viewport; no mobile or installed-extension visual pass is claimed.

## Remaining release checks

- Installed Chrome, Firefox and Edge extension smoke tests, including native menus and real tab cleanup/undo.
- Real 320/390 px website and popup layout checks: the available cloud browser has no viewport resize API, and the local Chromium download failed with HTTP 502.
- Fluent-reader review of all translations, particularly Hebrew, Norwegian Bokmål, Serbian and compact titles.
- Publisher-dashboard confirmation of the exact three-store locale intersection and release copy/version agreement.

## Continuation — 19 September 2026

Resumed from `4ed21686c0c54926ac06c25f2603f1b622e62ca5`, whose Linux/Windows
validation (35363160387) and PR preview (35363160259) passed. The earlier
checkout is preserved; current work starts from the actual remote tree.

- Reproduced lost section navigation in live Chrome: click FAQ, open the language
  menu, then middle-click German. The new tab opened `/de/` without `#faq`.
  Language-option and suggestion hrefs now follow hash/history changes and the
  privacy link's `pushState`, including native new-tab/context-menu navigation.
  Modified suggestion clicks also leave the current saved preference unchanged.
- Corrected the Swedish Firefox listing code from `sv` to `sv-SE`, independently
  checked against Mozilla's pinned production language definitions and translated
  field filtering. The browser package correctly retains `_locales/sv`.
  Validation now checks Chrome and AMO listing codes against the recorded evidence.
- Local checkpoint: 21 regression tests and all 29 catalogue checks pass;
  package builds/checks run by the suite pass. Generated output is current.
- Checkpoint `3e171be685303ddba6dac148b82e7416345e2754` passed Linux/Windows
  CI (35419950111) and the preview workflow (35419950187).
- Live Chrome now opens German in a new tab at `/de/#features` after a middle-click,
  and `/de/#privacy` after Ctrl-click following the privacy navigation. Both
  preserve the selected section; the source tab stays English.
- Removed the website-only instruction to use browser links from all 87 generated
  store descriptions. Full-description provenance now includes the feature-title
  keys as well as their bodies. All descriptions remain within the project limits
  (424–1,411 characters).
- Generate and validate the store index from the registry, removing three dead
  links to the deleted British English listing. Reconciled the 29-row locale
  matrix, Spanish document tag, Edge candidate codes and maintenance instructions.
- Local final validation: 22 tests pass; all 29 catalogues and 87 store text files
  pass validation; Chrome/Firefox/Edge packages and the static website build pass.
  The generated-file comparison and `git diff --check` pass.
- Rechecked Microsoft's published description range (250–10,000 characters).
  Chrome's public listing guide does not state its full-description maximum;
  dashboard verification remains a release check.

The current cloud browser still exposes no viewport-resize or extension-install
capability. A local narrow-viewport test page was rejected by its URL security
policy; no workaround was attempted. Native-browser and mobile smoke tests remain
unverified rather than being inferred from DOM tests. No additional browser
installation was attempted.

The PR remains draft. Earlier unfinished checkouts were preserved. Updates use sequential file commits through the existing GitHub connection; no merge, force-push or manual deployment was performed.

## Extension runtime review — 19 September 2026

Reviewed the actual background and popup scripts from `e1360300039ec6b1e86b00a6aa1243acdf587262`.
The following behaviours also existed before the localisation PR. They were
reproduced with the shipped scripts and callback-based browser API fixtures,
then corrected:

- Site actions on single-label hosts such as `localhost` treated the hostname as
  a keyword and closed unrelated tabs whose titles mentioned it. Context-menu
  actions and site chips now explicitly request exact-host matching.
- Whitespace-only requests matched every tab. The background now treats empty
  trimmed queries as a no-op.
- Failed tab removals were counted as successful and entered the undo list.
  Each removal is now checked independently; stats and undo snapshots include
  only successful removals. The popup flags partial failure, and complete
  failure returns an error. Tab-query failures also return an error response.
- Duplicate cleanup ignored pinned copies when deciding which unpinned copy to
  retain. Pinned copies across all regular windows now seed the keep set; their
  extra unpinned copies can be removed while pinned/private tabs remain.
- A partially successful Undo discarded the entries that failed to reopen.
  Failed entries now remain available for retry without recreating successful
  entries. Undo remains limited to the open popup and restores URLs, not full
  browser sessions or page state.
- A missing background response crashed popup initialisation. The popup now
  uses its translated error states and restores the Close button after failure.
- Overlapping cleanups overwrote each other's stored statistics. Stats updates
  and resets now run in sequence; a failed write does not block later writes.

Added `tests/extension.test.js` to `npm test` and both CI workflows. Its 14 tests
cover Chrome-worker/Firefox-background startup and translated menu registration
for all 29 locales, exact-domain/keyword cleanup, private-tab exclusions,
partial removal, pinned duplicates, inactive exclusions, sorting scope, stats
concurrency, numeric settings persistence, popup errors and partial Undo retry.
Seven targeted regressions failed before their corresponding fixes.

Local validation: **36 tests pass**, all 29 catalogues validate, and the package
regression builds/checks Chrome, Firefox and Edge. Regeneration leaves the
existing generated files unchanged; `git diff --check` passes. The PR description
records the final commit and CI run links after upload.

These checks execute extension code with simulated browser APIs and a minimal
popup DOM. They do not validate installed-browser API behaviour or visual layout.
Installed Chrome/Firefox/Edge smoke tests, popup rendering, browser-managed
context menus, real close/undo and offline behaviour remain required. The current
browser cannot install extensions; its previously rejected extension-manager
access was not retried or worked around.

## Compact counters and adaptive popup width — 19 September 2026

Following the user's screenshot and correction, restored concise header counters:
`14 open` and `2479 closed` in English, with equivalent compact state labels and
plural forms in all 29 locales. Header numbers have no digit grouping. Separate
keys keep full tab-count wording and action-status messages available elsewhere.
Only the two new keys received new AI self-review records; no native review is claimed.

The popup starts at 380 px and measures the unwrapped header's actual controls,
font and spacing to grow its shared document width when needed. Main and Settings
panels use that same document width. The width does not shrink when switching
panels or when a count loses a digit during the open session. Excessive content
wraps after reaching the 800 px/screen-width cap. The 800 px browser limit is
documented in [Chrome's action API](https://developer.chrome.com/docs/extensions/reference/api/action#popup).

Local validation: **41 tests pass**, including compact counters across all locales,
the exact `14 open` / `2479 closed` case, growth after longer measured controls,
stable width across Settings, and the width-cap fallback. All catalogues and
browser packages pass validation. The size tests supply layout measurements;
installed-browser rendering still requires checking. Reload the rebuilt extension
to check English, German and Hebrew, large counts, and both Settings transitions.
The concurrent website iframe-permissions update at `c7e0fc2` and its new regression
test were incorporated before regenerating the pages and running the full suite.
