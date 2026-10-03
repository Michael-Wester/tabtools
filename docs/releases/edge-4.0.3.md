# Edge 4.0.3

This release brings the merged localization work to the existing Microsoft Edge
Add-ons listing, `hajmbphgjkkinedfebgnpodlknanfdlh`. Chrome, Firefox and Edge
manifests now all declare 4.0.3.

## Release notes

- Adds translated extension UI in 29 languages, including popup, settings,
  tab actions and context-menu labels.
- Improves popup layouts for translated text, right-to-left languages and
  font differences.
- Includes the tab cleanup, sorting, duplicate removal and Undo behavior
  covered by the existing extension regression tests.

## Packaging

Build with Node 22 from the repository root:

```sh
npm ci
npm test
node build.js
node scripts/check-packages.js
```

Package the contents of `dist/edge` with `manifest.json` at the ZIP root.
Preserve the existing permission policy and Mozilla Public License 2.0.
The cloud packaging helper also retains committed source and build instructions.

The existing GitHub `v4.0.3` release contains Chrome and Firefox packages built
from its tagged commit. Prepare the Edge ZIP as an additional asset, recording
the Edge release commit separately; preserve the existing tag and asset provenance.
Publishing a GitHub asset does not submit a Microsoft Edge Add-ons update.

For an intentional store release after the version change is reviewed and merged,
use the documented cloud deployment helper. Review the complete Partner Center
draft before submitting it; the API submits all existing draft changes. A
successful API submission starts certification and does not establish public
store availability. This document does not assert submission or approval.
