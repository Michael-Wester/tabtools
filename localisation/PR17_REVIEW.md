# PR #17 review progress

Review baseline: `b492c9256eef9a1393eb3bbe2cff2afa7be27b5a` (18 September 2026).

The dated sections below preserve earlier evidence and environment limitations.
The current merge-preparation checkpoint below supersedes earlier draft-status
and store-copy statements. Historical browser results remain identified by date.

## Merge preparation — 1 October 2026

The starting PR head was `87bc04bd932218592ec524d0ef680dd94a63a6b9`; current main
`3cf1f3fb4d5fa11dbe87583f5fec239a43613a32` is already its ancestor. PR #30's separate
inactive-tab guide branch is not folded into this work.

The final 29 Chrome descriptions are now preserved exactly in
`marketing/sources/chrome-descriptions.json`, rather than being overwritten by
cross-browser website text during generation. They retain the Chrome-only intro,
web-page context-menu wording, and warnings that site cleanup closes the current
and pinned matching tabs. Store-specific regressions check all 29 locale IDs,
source/description fingerprints and missing-source rejection. Firefox/Edge copy
and extension/website runtime files are unchanged by this reconciliation.

Final editable screenshot HTML, shared inputs, provenance, approved-export hashes,
and a portable source restoration/rendering workflow are in `marketing/assets/`.
All 30 HTML sources (29 locales plus the separate global design) restore byte-for-
byte to their approved source snapshots. Four regressions check source/asset
integrity, all 150 page order/footer fingerprints, locale coverage and portability;
they run in `npm test` and both applicable CI workflows. The renderer reproduced
144/145 localized PNG hashes in the checked Linux runtime; Hungarian right-click
has a small raster difference, and global exports used footer-only composites.
These limits are documented without changing approved artwork or export hashes.

Local validation at this checkpoint:

- 58 Node regressions; 29 catalogues, translation fingerprints and 87 generated
  store listings
- All three browser package checks; Chrome 4.0.3 and Firefox/Edge 4.0.2
- Guide/navigation and security checks for all 33 website pages
- Source restoration for all 30 artwork sets and shared-asset integrity checks
- Independent review of closure/Undo safety, storage races, i18n, packaging,
  website/CSP/navigation and final source-preservation changes

Every one of the 47 rebuilt Chrome runtime files remains byte-identical to the
submitted 4.0.3 ZIP, whose SHA-256 is
`12205bd904188540ac5c4d7ad820fa0b7f6ba4b60cce88b2dab7d2069cdb3c83`.
No package was resubmitted. Chrome store review is separate from repository merge
readiness. No main merge, automatic merge, or new store publication is performed.

Fresh GitHub Actions results for the final pushed head, exact commit SHA and
mergeability are recorded in the PR description. Native browser checks run in CI;
this container's earlier native-launch `EPERM` restriction is not bypassed and no
fresh local native-browser pass is claimed. Earlier native Edge/Firefox evidence
is historical, not a new execution at this checkpoint.

Fluent-reader review remains unclaimed, and Edge dashboard locale confirmation
remains a prerequisite for an Edge store release. Neither is represented as a
completed engineering check. Human maintainers decide when to merge and publish.

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

## Website Firefox console review — 19 September 2026

The attached Firefox console export identified the first-party warning as the
YouTube demo iframe requesting unsupported `accelerometer`, `clipboard-write`,
`encrypted-media`, and `gyroscope` policy features. The iframe now requests only
`picture-in-picture; fullscreen` and retains fullscreen support through
`allowfullscreen`, following the [iframe Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
semantics. All 29 generated pages were regenerated, and the website test now
checks this exact policy on every page.

The `moz-extension://` content-script and MetaMask provider stream messages are
injected third-party extension noise, not site code. Hashed third-party script
warnings are likely from the embedded YouTube player, but the export omits full
URLs, so that attribution remains qualified. The collapsed `Content-Security-Policy
warnings 4` entry does not contain enough detail to diagnose.

Local checkpoint: **37 tests pass**, all 29 catalogues validate, the packaged
browser builds/checks pass, and `git diff --check` passes. The focused 12-test
website suite passes. A separate negative probe confirmed the assertion rejects
the original seven-token policy. Source checkpoint `c7e0fc2de3a45b19b74f4965bdc76b5902e4cb30`
was saved to GitHub; its Linux/Windows validation and PR preview workflows passed.

Added a separate Playwright Firefox job to the existing localisation workflow.
It checks English, German, Japanese and Hebrew, including theme, language-menu
and Privacy interactions, console warnings/errors, uncaught errors, and failed
first-party requests or HTTP responses. The YouTube frame uses an explicit stub;
live player behaviour, installed extensions and native diagnostics outside
Playwright's page events remain outside this check. A fifth case verifies the
detector rejects an injected warning and uncaught error.

Local syntax checks and Playwright test discovery pass. Local Firefox execution
was blocked before a page opened by the container's user-namespace restriction
(`uid_map: EPERM`); no browser pass is claimed from that attempt. GitHub's Ubuntu
runner subsequently passed all **5 Firefox tests** at `7698e90a4e295b8c00181aabc2084aa954076f2b`
([Firefox job](https://github.com/Michael-Wester/tabtools/actions/runs/35433631894/job/105872494312)).
That run overlapped a separate compact-counter update: its broader Node suite
still used the older French count fixture and failed while that update was
incomplete. The Firefox result does not imply the entire combined PR passed at
that intermediate commit. Final combined CI results belong in the PR description.

## Restore native popup dimensions — 19 September 2026

The user's installed Firefox screenshot showed a narrower popup and clipped
right edges after the adaptive-width change. That change had moved the explicit
width from `body` to `html`, leaving the body at `width: 100%; min-width: 0`.
[Mozilla's popup-sizing documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups#popup_resizing)
states that standards-mode popups are sized from the body's preferred layout width
and that popup width must be set on `body`, rather than the root element.

Restored explicit body width, minimum and maximum using the shared `--popup-width`
value and removed the root width constraint. The default again matches the original
380 px border-box body in base commit `519007f3`: 10 px padding, 12 px vertical
margins, the existing font and content-driven height. Longer translations can
still increase the shared width, and Main and Settings retain that width.
Compact counters and the existing width cap are unchanged.

Local validation: **41 tests pass**; Chrome, Firefox and Edge packages build and
validate; generated localisation files are unchanged. An independent code review
confirmed the original dimensions and body-sizing correction. The Node sizing
tests supply geometry and did not catch this CSS/native-host regression. No
installed-browser render is claimed: reload the rebuilt extension and check the
original size, unclipped card edges, long translations and both Settings transitions.

## Full review — 30 September 2026

This review starts from merge `090a91ba316fa6c3b3bf6bfdc4bb580540dc3d76`.
Main `3cf1f3fb4d5fa11dbe87583f5fec239a43613a32` is an ancestor: its guide pages,
mobile navigation/store wording, touch targets, social metadata and strict
security headers are preserved. Current remote CI outcomes are recorded in the
PR description; the results below describe local evidence.

### Changes implemented

- Site chips display compact localized numbers, with complete translated action
  and count descriptions in accessible names/tooltips. Measured long domains
  expand to a full row and wrap; short domains retain the original grid. The
  380 px body sizing, padding, vertical margins and shared Settings width remain.
  A subsequent native Hebrew check caught fractional text clipping after Undo;
  exact text/label rectangles now replace integer widths with a 1px allowance.
  Browser assertions use the same precise visibility requirement.
  A native 500px case also reproduced an auto-fit grid cascade: widening one
  chip activated another column and shrank its neighbor. Fitting now rechecks
  remaining chips until stable, bounded by the chip count. The new browser
  regression fails with the prior single-pass code and passes with this fix;
  native width sweeps preserve compact layouts at 380/550/600px.
- Settings patches are serialized in the background so rapid controls or multiple
  popups cannot overwrite one another. Failed saves restore accepted values and
  show an error in Settings. Inactive cleanup fails safely when settings cannot
  be read. Site suggestions include pending URLs consistently with cleanup.
- Close and Undo share a popup guard so overlapping actions cannot overwrite the
  current Undo snapshot. Error paths restore controls for retry.
- Native Firefox review reproduced a stale site list after Undo: restored tabs
  initially appeared as `about:blank`, and completed navigation never refreshed
  the chips. Debounced URL/load-complete events now refresh suggestions, including
  normal tab creation/removal. Private/title-only updates do not trigger a refresh.
  Both focused regressions failed before the fix and pass afterward.
- Choosing the current website language dismisses a stale language suggestion
  and restores trigger focus before same-document navigation. A native details
  selector provides all 29 language links when JavaScript is disabled, including
  on guides. It uses a same-origin stylesheet compatible with the existing CSP.
- Clean CI exposed Hungarian/Ukrainian 320px overflow with wider fallback fonts.
  Privacy text grid children can now shrink, and long section-heading words can
  wrap. Their existing narrow-screen cases also exercise DejaVu Sans so font
  differences cannot conceal the regression.
- Reviewed all 4,263 values (44 extension and 103 website keys per locale).
  Corrected 16 meaning/context issues across ten languages: omitted no-account
  guarantees, Italian current-tab instructions, Vietnamese duplicate-copy wording
  and Slovak popup terminology. Only corrected keys received updated AI review
  fingerprints; no fluent/native-speaker approval is claimed.
- Added persistent native-extension tests and a CI job; expanded the website
  browser suite with 156 locale/interaction/no-JS cases. Existing main viewport
  cases remain isolated and CLI filters apply to both website suites.

### Validation evidence

- **52 Node regressions pass**; all 29 catalogues, review fingerprints and 87
  generated listings validate. All three browser packages build and pass integrity
  checks (47 runtime files and 29 locales each). Windows PowerShell verification
  remains enforced in CI.
- **34 native Chromium cases pass** using the installed Chrome package and actual
  action popups. Every catalogue, real counter strings, full domain readability,
  Settings transitions, and very long hostnames/large counts are checked. Native
  APIs cover multi-window cleanup/Undo, private exclusions, pinned duplicates,
  sorting, inactivity, concurrent settings and offline operation. Tab pages are
  controlled local fixtures. This is Chromium/CFT evidence, not branded Chrome.
  The final full suite passes on CI's exact Chromium revision 1234; the new
  500px grid regression is included.
- **33 native Microsoft Edge cases pass** with official Linux Edge
  `154.0.4258.48` and `dist/edge`. The downloaded package's SHA-256 matched the
  Microsoft repository metadata. The same native assertions and all languages
  passed; changing a user agent was not used as a substitute for Edge.
  Eight targeted native cases pass after the final fitting change, including
  the 500px regression, layout extremes and all cleanup/settings actions.
- Existing website matrix: **102 passes and 18 intentional configuration skips**
  across English homepage/guides, themes and viewports. New locale cases verify
  all 29 homepages at 320/390 px in Chromium/WebKit plus representative keyboard,
  saved-language, query/anchor, RTL/CJK and JavaScript-disabled interactions.
  Local Chromium 320/390px and WebKit 320px cases all passed (117 cases), along
  with the first 20 WebKit 390px cases. The latter run then stalled in browser
  page creation before navigation, also reproducible on an empty page. That failure
  is recorded rather than counted as a site pass. The full matrix runs in CI.
- **5 Firefox website smoke cases pass**. The explicit YouTube stub and diagnostic
  negative probes remain; authored/unknown-origin warnings and page errors fail.
- Native Firefox `153.0` temporary-addon checks pass for Spanish, Hebrew and
  Japanese: genuine action panels, full site labels, no horizontal overflow,
  large counters, Settings/theme width and persistence, concurrent settings,
  real Close and UI Undo. Marionette reads the native popup window actor; the
  popup is not loaded as a web tab. The bundled binary carries only en-US browser
  UI resources, so available/requested locales were selected in the disposable
  profile to exercise native extension catalogue selection. This verifies the
  extension locales, not installed language packs or a fully translated Firefox UI.
- Guide/navigation checks pass for 33 pages, 5,848 local references and 411 tagged
  store links; security checks pass for all 33 pages and inline bootstrap hashes.
  Independent Chromium/WebKit probes under the deployed CSP confirm working
  language/theme controls and keyboard/no-JS navigation with zero policy violations.
- Recaptured the actual Spanish native popup at 380 px with five local sample tabs
  on two sites, compact counters, complete domain labels and no page errors.

### Release readiness boundary

Translation coverage is 100% of the scoped catalogue keys. Engineering readiness
is an estimate based on source review and validated behavior, not a measurement
of linguistic accuracy or a promise of zero defects. Fluent-reader review of the
AI-authored translations and publisher-dashboard verification (Edge locale codes,
Chrome description limit and released-version/copy agreement) remain before a
store release. Physical-device behavior, live YouTube/store integrations and
browser-managed context-menu presentation are outside the deterministic suites.
The main-authored guides intentionally remain English. No live listing or
production release is changed; the PR remains draft for the external release checks.

## Chrome release preparation — 1 October 2026

The publisher dashboard shows Chrome 4.0.2 already published. The Chrome manifest
is bumped to 4.0.3 for the localisation release; Firefox and Edge remain 4.0.2.
The package checker compares release versions to their authored manifests while
continuing to enforce historical permissions and browser metadata. A negative
regression rejects stale packaged versions. No permissions are added.

The base revision for this release is `a50eaf5617c80de43b4a224474377250ecfe3b8f`.
Its three GitHub workflows were rechecked and are successful. Local regeneration,
52 Node regressions, all 29 catalogues and 87 listing files, all three package
integrity checks, generated-file freshness, and 33-page website security/navigation
checks passed again. Store text is unchanged from the reviewed catalogues.

Translations remain AI-reviewed only; no fluent-reader sign-off is claimed.
Chrome dashboard review, account requirements, package upload and submission are
separate release steps. Website, Firefox and Edge publishing are outside this
Chrome release preparation.

The local native Chromium rerun could not start: this container denied browser
socket creation (`EPERM`), including one approved retry. No local native-browser
pass is claimed for 4.0.3. The verified native Chromium CI job on the base revision
is 109932025474 (run 36728644627); release runtime bytes differ only in the Chrome
manifest version. No other browser release, website deployment, or main merge
was performed during preparation.
