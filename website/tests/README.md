# Website mobile regression checks

These development-only dependencies do not change the published static site.
From this directory:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm test
```

The suite serves `../dist` on loopback port 4173 and covers the homepage, guide
index, and all three articles at 320, 390, 430, 768, and 1280 CSS pixels in light
and dark themes. Chromium uses Android emulation and WebKit uses iPhone
emulation at mobile/tablet widths; the desktop width uses desktop user agents.
WebKit emulation is useful regression coverage, not a test on physical iOS.

Checks cover horizontal overflow, reachable navigation and footer touch targets,
skip-link keyboard focus, theme switching and saved preference, mobile store
wording, FAQ interaction, uncaught page errors, and article links clearing the
sticky header. A compact desktop window separately
checks that desktop installation wording remains available.

The 320px and 390px homepage and close-site-tabs guide get full-page screenshots in both
themes and engines. YouTube is a labelled placeholder and other external
requests are blocked, so these checks do not contact store listings or depend on
third-party content. Screenshots are review artifacts rather than pixel baselines.

The independent `Website mobile checks` workflow runs without deployment
credentials, including on fork pull requests. It uploads the HTML report,
screenshots, and failure traces as `website-mobile-results` for seven days.
Use `npm run report` to open the report locally after a run.
