# Firefox 4.0.3

This Firefox release packages the localization work merged in PR #17, using
the current main branch as its source. Chrome remains at 4.0.3 and Edge remains
at 4.0.2. The historical localization baseline is unchanged.

## Release notes

- Adds translated extension UI for 29 languages, including localized popup,
  settings, tab actions and context-menu labels.
- Improves popup layouts for translated text, right-to-left languages and
  font differences.
- Includes the tab-cleanup, sorting, duplicate-removal and Undo behavior
  covered by the merged extension regression tests.

## Packaging

Build with Node 22 from the repository root:

```sh
npm ci
npm test
node build.js
node scripts/check-packages.js
```

Submit the generated `dist/firefox` package for the existing listed add-on
`tabtools@michaelwester.com`. Include a source archive of the release commit
and build instructions for the locale generator. Preserve the Mozilla Public
License 2.0 and existing Firefox permission/minimum-version policy. Store listing
text and media are not changed by this package release.

The cloud release helper runs tests, package validation and Mozilla lint before
submission. Browser coverage includes native Chromium extension regressions and
Firefox website smoke checks; these do not replace native Firefox add-on checks.
Submission and Mozilla approval/publication are separate outcomes; this document
does not establish either status.
