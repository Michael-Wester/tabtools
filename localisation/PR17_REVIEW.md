# PR #17 review progress

Review baseline: `b492c9256eef9a1393eb3bbe2cff2afa7be27b5a` (18 September 2026).

## Completed

- Preserved earlier checkouts and reviewed the actual GitHub head in a separate checkout.
- Reproduced the broken package checker; replaced obsolete helper calls with checks of built packages, locale content, manifest metadata and referenced scripts.
- Fixed the PowerShell registry shape and aligned Node/PowerShell Firefox Bokmål packaging (`no` to `nb`).
- Restored documented generator and translation-review commands using the current implementation. Removed the abandoned duplicate website template.
- Consolidated case-colliding coverage/glossary documents for Windows checkouts.
- Added Linux/Windows CI packaging gates and a regression test that builds and checks the actual packages.

## Validation so far

- Original baseline: nine tests passed; standalone package checker failed with `L.read is not a function`.
- Fixed generators, validator, all three Node builds and package checks pass for 29 locales.
- Windows/PowerShell execution will be checked by CI; PowerShell is not installed locally.

## Remaining review

- Extension language/direction, interpolation, fallback and popup layout.
- Website selector focus, preference handling, responsive grouping and rendered appearance.
- Stronger catalogue validation, final regeneration, browser checks and CI results.

The PR remains draft. Native-speaker review, installed-browser smoke tests and publisher-dashboard locale verification are still outstanding. No merge or manual deployment is part of this review.
