# Browser logos

These are unmodified full-colour SVGs from
[Browser Logos](https://github.com/alrra/browser-logos), pinned to commit
`58881b84c4d73adc03c06fa2c275a7abee02d935`.

| File | Upstream source | Owner |
| --- | --- | --- |
| `chrome.svg` | [Chrome SVG](https://github.com/alrra/browser-logos/blob/58881b84c4d73adc03c06fa2c275a7abee02d935/src/chrome/chrome.svg) | Google |
| `firefox.svg` | [Firefox SVG](https://github.com/alrra/browser-logos/blob/58881b84c4d73adc03c06fa2c275a7abee02d935/src/firefox/firefox.svg) | Mozilla |
| `edge.svg` | [Edge SVG](https://github.com/alrra/browser-logos/blob/58881b84c4d73adc03c06fa2c275a7abee02d935/src/edge/edge.svg) | Microsoft |

The upstream project states that logos and trademarks belong to their respective
owners; its MIT licence applies to everything else. The upstream licence is
retained in `LICENSE.browser-logos.txt`. These logos are not relicensed under
TabTools' MPL-2.0 or represented as MIT-licensed artwork.

They identify the browser for each link to TabTools' listing in the corresponding
browser store. They do not indicate sponsorship or endorsement. Preserve their
colours and proportions; theme the surrounding button, not the logo.

Keep the files local and use `<img>` elements with empty alternative text because
the browser name is already visible in the link. Do not copy SVG path data into
the page, hotlink a CDN, or add an icon package just for these three assets.

To update, select a reviewed upstream revision, replace the SVGs together, update
the pinned links above, and check all three browser buttons in both themes.
