# TabTools icon kit

This kit uses the final 1024 × 1024 TabTools geometry, with the centre of the X at `(512, 482)`.

## Contents

- `svg/tabtools-icon.svg` — editable `currentColor` master.
- `svg/tabtools-icon-black.svg` — fixed black master.
- `svg/tabtools-icon-white.svg` — fixed white master.
- `svg/tabtools-icon-auto.svg` — switches between black and white using `prefers-color-scheme`.
- `png/black/` and `png/white/` — transparent PNG exports at 16, 32, 48, 64, 96, 128, 256, and 512 px.
- `manifest/` — partial manifest examples. Merge the relevant properties into your existing manifest rather than replacing it.

## Recommended use

| Size | Use |
| ---: | --- |
| 16 px | Toolbar, extension-page favicon, context menus |
| 32 px | High-density toolbar and Windows UI |
| 48 px | Extension management pages |
| 96 px | High-density Firefox extension icon |
| 128 px | Installation and Chrome Web Store icon |
| 256/512 px | Large previews and future store/marketing use |

For Chromium, copy `png/black` into your extension as `icons/black` and merge `manifest/chromium-snippet.json` into `manifest.json`.

For Firefox, copy both PNG folders into `icons/` and merge `manifest/firefox-snippet.json`. Firefox's `theme_icons.light` field is the light-coloured icon shown on dark toolbars, so it correctly points to the white asset.

Official references:

- Chrome: <https://developer.chrome.com/docs/extensions/develop/ui/configure-icons>
- Firefox: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/action>

All assets have transparent backgrounds.
