# Translation glossary and review notes

Voice: practical, concise, calm. Keep the two main benefits prominent: close tabs
by site and sort tabs by site. Do not add performance promises or new features.

| Source term | Meaning and required distinction |
|---|---|
| TabTools | Brand; keep exact spelling. Translate the descriptive name suffix. |
| Tab | A browser tab, not a page section or UI tab control. Use the ordinary local browser term. |
| Site / website | Website/domain associated with a tab. Closing a site closes its matching tabs across regular windows, including the current tab. Never imply “other tabs only”. |
| Close site tabs | Same action label in the native menu, website instructions and store copy. |
| Sort tabs | Reorder tabs within the current window by site frequency, with the most represented sites first. Does not create browser tab groups. |
| Suggestions | Sites selected by open-tab counts, subject to the minimum setting. Not AI recommendations. |
| Inactive | Eligible tabs past the chosen inactivity threshold. The action runs when clicked; no automatic scheduled cleanup. Active, pinned and audible tabs stay open. |
| Duplicates | Repeated pages; extra copies close while pinned tabs remain. |
| Undo | Restore the latest popup cleanup while that popup stays open. Do not promise a persistent history. |
| Local | On the user's device/browser storage. Extension privacy claims do not apply to YouTube or browser stores. |
| Settings / light / dark | Keep labels consistent between controls and explanatory instructions. |
| `{count}`, `{site}`, `{browser}`, `{store}`, `{label}`, `{language}` | Preserve names and occurrence counts. Move whole-message placeholders naturally. User values are literal text. |
| Chrome, Firefox, Edge, Microsoft Edge, GitHub, YouTube | Preserve brands. Keep URLs and `youtube.com` exactly unchanged. |

## What was reviewed

Every translated key was authored and self-reviewed by AI against the English
meaning for omissions, terminology, scope, placeholders and length. There was no
native-speaker review. CI checks structure and fingerprints, not fluency.

All 29 non-source catalogues need fluent-reader review before release. Specific
review priorities: the short Greek title uses **σάιτ** to fit the 50-character
limit while body text uses **ιστότοπος**; confirm that abbreviation and the compact
Finnish, Slovak, Swedish and Ukrainian titles read naturally. Check Norwegian
Bokmål versus Nynorsk distinctions, Serbian Cyrillic browser terminology, Hebrew
number phrases and RTL punctuation, and Portuguese/Chinese regional conventions.
These are review priorities, not asserted known mistranslations.

British English deliberately keeps the existing British-spelled English copy.
French `Suggestions`, `minutes`, `Open source`, `Contact`; Italian `Privacy`;
Dutch `open tab(s)`, `Privacy`, `Product`, `Contact`; and Romanian `Inactive`,
`Contact` are intentional shared spellings, with per-key reasons in the reviews.
Do not remove the English-leftover check to accommodate additional matches.

Counters use whole translated messages. Open-tab counts have explicit CLDR plural
forms; result counters use a count label to avoid an English singular/plural
fragment. Numeric settings retain their stored values and input behaviour.
