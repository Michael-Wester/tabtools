# TabTools website

A dependency-free, static promotional site. All marketing copy is present in `dist/index.html`; `dist/style.css` contains the responsive light/dark theme and `dist/app.js` provides the illustrative demo and browser selection.

Serve `dist/` with any static web server. No installation or compilation is required. Keep the authored `dist/` files tracked: this is not generated extension output.

Official store destinations are centralised in `STORES` in `dist/app.js`. Initial HTML links should match these destinations so they remain usable without JavaScript. Store-click analytics are not enabled. The only website preference stored is the chosen website theme.

The example tabs are fictional and never access browser extension APIs. The context-menu copy accounts for Firefox tab menus and Chrome/Edge page menus, as implemented by `src/shared/background.js`.

The original TabTools icon is reused from `src/shared/icons/black/icon-128.png`. Extension privacy claims are linked to the repository's published policy.

## Outstanding store URLs

Firefox and Edge direct listing URLs could not be verified. Their entries remain `null` in the central configuration; no placeholder download buttons are rendered. Add the verified official URLs and matching initial HTML links when supplied. The repository’s redirect URLs were not substituted for official store destinations.
