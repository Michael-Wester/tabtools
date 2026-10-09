# TabTools Privacy Policy

Effective date: 22 August 2026

TabTools is a browser extension for organizing and closing open tabs. It processes browsing information locally but does not collect or transmit it off the user's device, sell it, or share it with third parties.

## Information processed locally

To provide its tab-management features, TabTools processes information supplied by the browser about open tabs, including tab URLs, titles, domains, favicons, activity status, and whether a tab is pinned, grouped, audible, or discarded. This information is used only on the user's device to generate site suggestions, identify inactive or duplicate tabs, sort tabs, close selected tabs, and list and reopen tabs that TabTools closed.

TabTools stores the following information locally using the browser's extension storage:

- User preferences, including theme, accent colour and the inactivity time.
- Local statistics, such as the number of tabs closed with TabTools.

While the browser is running, TabTools also notes when each tab was last left, so that a tab in recent use is not treated as inactive. The note holds the browser's tab numbers and times, not addresses or titles. It is kept in the browser's session storage for extensions, or in memory where the browser has none, and is discarded when the browser closes.

TabTools also keeps a list of the tabs it has closed, so that they can be reopened from **Recently closed** in the popup. The list holds up to 25 tabs: each tab's address, title, the address of its icon, where the tab was, and when it was closed. It covers only tabs closed with TabTools, never tabs closed in the browser itself, and never tabs in private windows. It is kept in the browser's session storage for extensions, or in memory where the browser has none. It is not saved with the settings, is not transmitted externally, and is discarded when the browser closes, when TabTools is updated or turned off, or when **Clear list** is selected.

The tabs of the latest cleanup, used by **Undo**, are held in the open popup and are gone when it closes.

## Data collection and transmission

TabTools does not:

- Send browsing information or extension data to the developer or third parties.
- Use analytics, advertising, tracking, or telemetry services.
- Require an account or authentication.
- Sell, rent, or share user information.
- Execute remotely hosted code.

The extension may display favicons provided by the browser for open tabs. Any favicon loading is handled by the browser and is not sent to or controlled by the TabTools developer.

## Permissions

TabTools uses browser permissions only to provide its tab-management features:

- `tabs` reads and manages open tabs for closing, sorting, duplicate detection, suggestions, undo, and reopening tabs TabTools closed.
- `storage` saves user preferences and local statistics on the user's device, and holds the notes described above until the browser closes.
- `contextMenus` adds a user-invoked command for closing tabs from the current site.

## Data retention and control

Locally stored settings and statistics remain in the browser until the user clears the extension's storage or uninstalls TabTools. The list of recently closed tabs and the note of when tabs were left last only until the browser closes. TabTools has no external database, and the developer cannot access or delete data stored on a user's device.

## Policy changes

If this policy changes, the updated version will be published in the TabTools repository with a revised effective date.

## Contact

Questions about this privacy policy can be submitted through the [TabTools issue tracker](https://github.com/Michael-Wester/tabtools/issues).
