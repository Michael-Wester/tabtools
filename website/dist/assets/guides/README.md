# Guide pictures

Two kinds of picture illustrate the guides.

## Browser screenshots

`close-site-01-tab-menu.png`, `close-site-02-tabs-closed.png`,
`duplicates-01-open-tabtools.png` and `sort-01-before.png` are original
1280 × 800 PNGs of Google Chrome 153.0.8010.52 stable with TabTools 4.0.2 loaded
from PR19 source commit `0f1507736ecf23d89044a9d35cdd99e033c3191f`. They were
captured on 21 September 2026 with Cua.ai's Sandbox SDK `screen.screenshot()`
using a disposable browser session of public, signed-out pages. Only Google
Chrome is visible. The enlarged cursor uses the Windows Aero XL shape, white fill
and an approximately 3 px black outline, rendered live before capture. The
screenshot pixels have not been edited, cropped or recompressed.

None of the four shows the popup, and what they show is the same in 5.0.0: the
tab menu with **Close site tabs**, the tab bar after closing, the toolbar icon,
and the tab bar before sorting. Website names and logos shown in Chrome belong to
their respective owners.

## Pictures of the popup

The seven `popup-*.png` files show the TabTools 5.0.0 popup alone. They are 760
pixels wide, twice the popup's 380, and are shown at 380.

They were taken on 10 October 2026 by `node scripts/capture-pictures.js guides`
from the built Chrome package, in the Chromium that Playwright installs
(141.0.7390.37 here), running headless. The popup is the extension's real toolbar
popup, opened with `chrome.action.openPopup()` as the extension's browser tests
open it, and each file is what Chromium drew: nothing is edited afterwards.

The tabs are staged to match the browser screenshots: the same six pages (three
on YouTube, two on Wikipedia, and Google in view), or eight with two more copies
of the YouTube home page. No request leaves the browser. Each tab's page is
answered locally with its title and nothing else, so the popup shows each site's
name with its own letter tile where a real session would show the site's icon.
The background's clock is moved forward three hours before the popup opens, which
is why the tabs not in view count as inactive. The pointer is placed on a control
to show it as it looks when pointed at; no cursor is drawn.

- `popup-site-row.png`, `popup-typed-site.png`: the youtube.com row, and
  `youtube.com` typed in the field with its three tabs listed.
- `popup-recently-closed.png`: the three YouTube tabs under Recently closed,
  four minutes (by the moved clock) after their site row closed them.
- `popup-close-duplicates.png`, `popup-duplicates-result.png`: Close duplicates
  showing 2, then the result with Undo.
- `popup-sort-tabs.png`, `popup-sorted-result.png`: Sort tabs, then the result.

Run the script again after a change to the popup, and update the `height` given
to `popup()` in `website/guides-content.cjs` if a picture's height changes. A test
compares the two.

## Pictures the translations still use

`close-site-03-popup-suggestion.png`, `close-site-04-enter-hostname.png`,
`duplicates-02-close-duplicates.png`, `duplicates-03-result-and-undo.png`,
`sort-02-sort-tabs.png` and `sort-03-after.png` show the 4.x popup. The English
guides no longer use them. The 28 translated guides still do, with the 4.x text
around them, until they are translated from the 5.0.0 English. Delete the six
files in that change: `tests/website.test.js` fails for a picture that no guide
shows.
