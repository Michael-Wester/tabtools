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

Open `about:debugging#/runtime/this-firefox`, select
**Load Temporary Add-on**, and choose `dist/firefox/manifest.json`.

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
