<h1><img src="src/shared/icons/tabtools-icon-auto.svg" width="60" height="60" alt="" align="absmiddle"> TabTools</h1>

Clear your tab list quickly with site suggestions, inactive tab cleanup, duplicate removal and, sorting.

[<img width="640" height="400" alt="TabTools-Too-Many-Tabs-1280x800" src="https://github.com/user-attachments/assets/5013720b-eca8-42a1-bbe7-3032f754adf1" />](https://tabtools.michaelwester.com)

[Chrome](https://tabtools.michaelwester.com/chrome) |
[Firefox](https://tabtools.michaelwester.com/firefox) |
[Microsoft Edge](https://tabtools.michaelwester.com/edge) 

## Highlights

- Close tabs by keyword or exact domain, with suggestions for busy sites.
- One-click cleanup for inactive tabs, duplicates, and domain-heavy windows.
- Undo the last close, track total tabs closed, and toggle light/dark themes.
- Context menu entry to close tabs for the current site.

## Usage

- Open the popup, type a keyword or domain, then press Enter or click Close.
- Tap a suggestion chip to close tabs for that site (or inactive tabs).
- Use quick actions to sort tabs, close duplicates, or undo the last close.
- Adjust the minimum tab count for suggestions and the inactive threshold in Settings.

## Build

PowerShell (no Node needed):

```powershell
.\build.ps1             # all browsers
.\build.ps1 firefox     # single target
```

Node 18+ (optional):

```bash
node build.js           # all browsers
node build.js firefox   # single target
```

Outputs land in `dist/<browser>/`.

## Install (temporary/dev)

- **Firefox:** `about:debugging` -> This Firefox -> Load Temporary Add-on -> `dist/firefox/manifest.json`
- **Chrome/Chromium:** `chrome://extensions` -> Developer mode -> Load unpacked -> `dist/chrome/`
- **Edge:** `edge://extensions` -> Developer mode -> Load unpacked -> `dist/edge/`

## Layout

```
src/
  shared/      # common scripts, UI, assets
  overrides/   # browser-specific manifest/files (chrome, edge, firefox)
```
