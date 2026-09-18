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
- Final live-browser verification and CI results will be appended after the updated preview is available.

## Remaining release checks

- Installed Chrome, Firefox and Edge extension smoke tests, including native menus and real tab cleanup/undo.
- Real 320/390 px website and popup layout checks: the available cloud browser has no viewport resize API, and the local Chromium download failed with HTTP 502.
- Fluent-reader review of all translations, particularly Hebrew, Norwegian Bokmål, Serbian and compact titles.
- Publisher-dashboard confirmation of the exact three-store locale intersection and release copy/version agreement.

The PR remains draft. Earlier unfinished checkouts were preserved. Updates use sequential file commits through the existing GitHub connection; no merge, force-push or manual deployment was performed.
