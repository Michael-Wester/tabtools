# Translation glossary and review notes

Voice: practical, concise, calm. Keep the two main benefits prominent: close tabs
by site and sort tabs by site. Do not add performance promises or new features.

| Source term | Meaning and required distinction |
|---|---|
| TabTools | Brand; keep exact spelling. Translate the descriptive name suffix. |
| Tab | A browser tab, not a page section or UI tab control. Use the ordinary local browser term. |
| Site / website | Website/domain associated with a tab. Closing a site closes its matching tabs across regular windows, including the current tab. Never imply “other tabs only”. |
| Close site tabs | Same action label in the native menu, website instructions and store copy. |
| Sort tabs | Reorder tabs within the current window by site frequency, with the most represented sites first. Pinned tabs and tabs in a tab group stay where they are. Does not create browser tab groups. |
| Suggestions | The popup's main list: Inactive, Close duplicates, then every site with open tabs, most tabs first. Not AI recommendations. |
| Inactive | Eligible tabs not used for longer than the chosen time. The row opens a list to review; nothing closes until Close or a row's own button is pressed, and there is no automatic scheduled cleanup. Active, pinned and audible tabs stay open. |
| Duplicates | Tabs with exactly the same address, including the part after `#`. Extra copies close; a pinned copy, a copy playing sound and a copy in view stay. |
| Undo | Restore the latest popup cleanup while that popup stays open. Do not promise a persistent history. |
| Dismiss | Closes the message about the last action (and its Undo) without doing anything else. Screen readers and the tooltip only; use the usual word for closing a notification. |
| Local | On the user's device/browser storage. Extension privacy claims do not apply to YouTube or browser stores. |
| Settings / system / light / dark | Keep labels consistent between controls and explanatory instructions. System is the theme that follows the browser's light or dark setting. |
| Accent colour | The colour of the popup's buttons, switches and highlights. Purple, Blue, Green, Orange, Pink and Graphite name its six presets; Graphite is a dark grey. |
| Keep pinned tabs open | A switch. When on, closing a site or a keyword leaves pinned tabs alone. |
| Pinned, playing and current tabs stay open. | The note above the inactive list. Playing means playing sound; current means the tab in view in each window. |
| Clear / Reset | Clear empties the keyword field. Reset sets the count of closed tabs back to zero; it closes and restores nothing. |
| No tabs match | Shown when no open tab matches the typed keyword. |
| {count} tabs | How many tabs are open, in the popup header. Kept short to fit a small pill; "{count} open tabs" is the longer form used for matches and screen readers. |
| {count} sites | How many different sites have an open tab; shown beside the open-tab count. |
| `{count}`, `{site}`, `{browser}`, `{store}`, `{label}`, `{language}` | Preserve names and occurrence counts. Move whole-message placeholders naturally. User values are literal text. |
| Chrome, Firefox, Edge, Microsoft Edge, GitHub, YouTube | Preserve brands. Keep URLs and `youtube.com` exactly unchanged. |

## What was reviewed

Every translated key was authored and self-reviewed by AI against the English
meaning for omissions, terminology, scope, placeholders and length. There was no
native-speaker review. CI checks structure and fingerprints, not fluency.

All 28 non-source catalogues need fluent-reader review before release. Specific
review priorities: the short Greek title uses **σάιτ** to fit the 50-character
limit while body text uses **ιστότοπος**; confirm that abbreviation and the compact
Finnish, Slovak, Swedish and Ukrainian titles read naturally. Check Norwegian
Bokmål versus Nynorsk distinctions, Serbian Cyrillic browser terminology, Hebrew
number phrases and RTL punctuation, and Portuguese/Chinese regional conventions.
These are review priorities, not asserted known mistranslations.

The single English source keeps the existing British-spelled English copy.
French `Suggestions`, `Open source`, `Contact`; Italian `Privacy`;
Dutch `open tab(s)`, `Privacy`, `Product`, `Contact`; and Romanian `Inactive`,
`Contact` are intentional shared spellings, with per-key reasons in the reviews.
Do not remove the English-leftover check to accommodate additional matches.

Counters use whole translated messages. Open-tab and site counts have explicit CLDR
plural forms; result counters use a count label to avoid an English singular/plural
fragment. Durations such as “2 hours” and “3 hr” are not in the catalogues: the popup
takes them from the browser's own formatting for the language.
