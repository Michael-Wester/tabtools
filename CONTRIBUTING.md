# Contributing to TabTools

Thanks for your interest in contributing to TabTools!

TabTools is a lightweight browser extension for managing and cleaning up
browser tabs. Contributions of all sizes are welcome.

## Ways to contribute

You can help by:

- Fixing bugs
- Improving browser compatibility
- Improving the UI/UX
- Adding or improving tests
- Improving documentation
- Suggesting small features

If you're new to the project, check issues labelled `good first issue`.

## Development setup

1. Fork the repository.

2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/tabtools.git
   cd tabtools
   ```

3. Build the extension with PowerShell (no Node.js required):

   ```powershell
   .\build.ps1
   ```

   Alternatively, with Node.js 18 or later:

   ```bash
   node build.js
   ```

4. Load the development build into your browser.

### Chrome

Open `chrome://extensions`, enable **Developer mode**, select
**Load unpacked**, and choose `dist/chrome`.

### Edge

Open `edge://extensions`, enable **Developer mode**, select
**Load unpacked**, and choose `dist/edge`.

### Firefox

Use a separate Firefox test profile with disposable tabs. Closing tabs by site
affects matching tabs across normal windows in that profile, not just the
current window.

1. From the repository root, run `node build.js firefox` or
   `.\build.ps1 -Targets firefox` to build the Firefox package.
2. Open `about:debugging#/runtime/this-firefox`, select
   **Load Temporary Add-on**, and choose `dist/firefox/manifest.json`.
   Use the generated manifest, not `src/overrides/firefox/manifest.json`:
   the generated directory also contains the shared scripts, popup and icons.
3. Open TabTools from Firefox's toolbar or extensions menu and run the short
   smoke check below.

#### Quick smoke check

- Open two tabs at `https://example.com/` and one at `https://example.org/`.
  Keep them unpinned and ensure no other tabs in the test profile use those
  sites. Leave `example.org` active, then open TabTools, enter `example.com`
  and select **Close**. Both matching
  tabs should close, the `example.org` tab should remain, and the popup should
  report **Closed 2**.
- While that same popup remains open, select **Undo** and check that both test
  tabs reopen. The current main-branch build keeps this Undo batch only for the
  lifetime of the popup; do not expect it to survive closing and reopening it.
- Open **Settings**, switch between **Light** and **Dark**, and check that the
  labels are readable and keyboard focus is visible. Close and reopen the popup
  to confirm the selected theme is retained.

#### Rebuild, reload and debug

After editing files in `src`, rerun the build command, then select **Reload**
beside TabTools in `about:debugging#/runtime/this-firefox` and reopen the popup.
Reloading alone does not copy source changes into `dist`; do not edit generated
files there. For debugging, use **Inspect** beside TabTools and record the
Firefox version, source commit, reproduction steps and relevant console errors.

Temporary add-ons are removed when Firefox restarts; load the generated manifest
again to resume testing. See Mozilla's
[temporary-installation guide](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
for installation and reload details. This smoke check is a starting point, not
a substitute for testing the changed behaviour in every affected browser.

## Making changes

Create a branch for your change:

```bash
git checkout -b fix/example-fix
```

Try to keep pull requests focused on one change.

## Before submitting a PR

Please:

- Test the change locally
- Check that existing functionality still works
- Test in relevant supported browsers
- Run the project's tests and linting, if applicable
- Explain what your PR changes

Screenshots are helpful for UI changes.

## Bugs

When reporting a bug, please include:

- Browser and version
- TabTools version
- Steps to reproduce
- Expected behaviour
- Actual behaviour

## Feature requests

Small feature suggestions are welcome.

For larger changes, please open an issue before implementing them so the
approach can be discussed first.

## License

Contributions submitted to TabTools are distributed under the terms of the
[Mozilla Public License 2.0](LICENSE).
