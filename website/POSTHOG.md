# Website analytics and improvement workflow

This integration is limited to `tabtools.fyi`. The browser extension still has
no analytics, accounts or remote code. The goal is to learn which pages and
calls to action help visitors reach the appropriate browser store, and to
identify website errors worth fixing.

## Activate after reviewing the PR

1. Create or choose a PostHog project for the **website**. In its project
   settings, find the public project token (`phc_…`) and ingestion host.
2. In this repository's **Settings → Secrets and variables → Actions → Variables**,
   set these repository variables:

   | Variable | Value |
   | --- | --- |
   | `POSTHOG_PROJECT_TOKEN` | Public `phc_…` project token |
   | `POSTHOG_API_HOST` | `https://us.i.posthog.com` or `https://eu.i.posthog.com`, matching that project |

   Do not use a personal or project secret API key in either variable or in
   `dist/`. The public token is intentionally delivered to visitors; it only
   enables event ingestion. GitHub Actions variables, not Cloudflare runtime
   variables, are used because this site is uploaded as static files.
3. Merge and deploy through the existing website workflow when ready. The
   workflow generates `dist/analytics-config.js` on production deployments.
   Missing token means analytics remain disabled. Invalid non-empty token or
   region fails configuration rather than silently sending to the wrong host.
   Changing repository variables alone does not update an existing deployment;
   rerun the website workflow on `main` after any configuration change.
4. On production, allow analytics, open a guide and click a store button. In
   PostHog's live events, verify one `$pageview` per loaded page and the expected
   `store_link_clicked` browser and placement. Decline analytics in the footer
   and confirm collection stops. Use a separate test project if sending test
   traffic while configuring dashboards.

All PR previews, localhost, other hostnames and the committed default config
are disabled. There is no query-string bypass. A CDN failure or ad blocker must
not prevent site navigation, theme switching or opening browser stores.

For an authorized manual production deployment, run
`POSTHOG_ENVIRONMENT=production node website/configure-analytics.cjs` with the
two public variables supplied in that process environment before uploading.
Never commit the generated configuration. Reset to the disabled config by
running `node website/configure-analytics.cjs` without the environment variables.

## Events and interpretation

Every captured event includes `site=tabtools.fyi`, `environment=production`,
`analytics_version=1`, `page_path`, `page_type` and `theme`. Page paths come from
authored canonical links, not arbitrary requested paths. PostHog's random
visitor/session IDs and coarse browser/device metadata are retained.

| Event | Properties / meaning |
| --- | --- |
| `$pageview` | Once per page load after consent; no SPA or hash-change double counting |
| `$pageleave` | Page hidden through navigation/close; browsers may drop this event |
| `store_link_clicked` | `browser_store` (`chrome`, `firefox`, `edge`) and `placement`; uses the destination after browser detection, including middle clicks |
| `guide_link_clicked` | `guide_path` for internal guide links |
| `guide_read` | `scroll_percent` 50 or 90, each once per page; scroll depth is a proxy for engagement, not proof of reading |
| `faq_opened` | One-based `question_index` in the authored FAQ list |
| `$exception` | Native PostHog error tracking with generic error type and first-party script file/line; messages and external stack frames removed; capped at ten per page |

For campaign attribution, use URL tags such as
`?utm_source=youtube&utm_medium=social&utm_campaign=close_site&utm_content=short_01`.
The first consented page's `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content` and referrer hostname are retained for the browser tab's session.
Campaign values must be 1–100 ASCII letters, digits, dots, underscores or
hyphens and start with a letter or digit. Spaces, email-like values and other
query parameters are discarded. Do not put personal information in UTM tags.
Existing outbound store UTMs are unchanged and do not overwrite inbound
attribution. No `utm_term`, raw referrer URL, full query string or hash is sent.

## Suggested PostHog dashboard

- **Acquisition:** unique visitors and page views by day, page, `utm_source`,
  campaign and device type. Filter to this site's production events.
- **Store funnel:** `$pageview` → `store_link_clicked`, within the same session;
  break down by browser, page and placement. The target is store visits,
  **not confirmed installs**. Use store dashboards to assess installations.
- **Guides:** guide views → `guide_read` at 90 → store clicks, with counts visible.
- **Reliability:** error tracking issues, affected visitors and source lines.

Consent, browser settings, ad blockers and exits during SDK loading mean this
is an observed subset of traffic. Returning visitors use a browser identifier,
not an account identity. Do not sum unique visitor counts across breakdowns or
infer that a small before/after difference proves an improvement.

## Read-only report for an existing agent

`posthog-report.cjs` compares the last two complete 14-day periods, ending at
midnight UTC. It emits aggregate JSON with visitors, views, store-click rate,
errors and breakdowns by page, store, placement and campaign. It excludes the
incomplete current day and makes only two query requests, each with a timeout.
No individual IDs, query credentials or raw events are included in its output.

Supply these variables **only to the trusted process running the report**:

| Variable | Value |
| --- | --- |
| `POSTHOG_APP_HOST` | `https://us.posthog.com` or `https://eu.posthog.com` (not the ingestion host) |
| `POSTHOG_PROJECT_ID` | Numeric project ID |
| `POSTHOG_PERSONAL_API_KEY` | Private key limited to this project with `query:read` |

```sh
node website/posthog-report.cjs --dry-run  # Inspect the queries without credentials
node website/posthog-report.cjs          # Aggregate JSON for an improvement run
```

The report has no schedule and cannot change the site, open PRs or access GitHub.
An existing automation can read it, state the evidence and sample size, select
one improvement, implement that change in a separate PR, and compare the same
metric after release. If traffic is too low, report insufficient evidence and
prefer reproducible bugs or missing tracking over conversion claims.

## PostHog's native self-driving setup

Installing the SDK alone does not activate autonomous analysis or PR generation.
After production events arrive, use the PostHog project's **Inbox → Configuration**
(or **Set up manually**):

1. Enable AI data processing for the organization if you want PostHog agents
   to analyze its project data.
2. Connect `Michael-Wester/tabtools` through PostHog's GitHub integration.
   A project admin connects the repository; the person shipping PRs also
   connects their GitHub account.
3. Enable the error-tracking signal source and the scouts you want. Start with
   website reliability and store-click conversion. Session replay is disabled
   by this integration, so replay-based scouts will have no recordings.
4. Choose PR-generation settings explicitly. Reports can run with PR generation
   disabled; PostHog's native PR generation is a separately billed feature.

Give any coding agent this scope: **website files only; base changes on `main`;
retain consent, event definitions and security checks; do not edit `src/`,
extension manifests, store listings or privacy promises; open a reviewable PR;
do not merge or deploy production automatically.** Review evidence before
shipping. Scrubbed errors preserve source locations but omit message detail,
so some reports will need a local reproduction.

This PR does not connect accounts, activate scouts, authorize paid PR generation
or modify an existing scheduled task. Those are PostHog project/workflow settings.

## Privacy, verification and rollback

The SDK is fetched from PostHog's official regional CDN only after opt-in.
Consent is kept in `tabtools-analytics-consent-v1`; PostHog IDs use localStorage,
and campaign attribution uses sessionStorage. Declining clears PostHog
persistence and attribution, stops future capture, and synchronizes across tabs.
GPC and Do Not Track override consent. Clearing browser storage resets choices.

Autocapture, replay, surveys, heatmaps, performance collection, feature-flag
requests and person profiles are disabled. A `before_send` allowlist limits
events and properties; error messages and external stack frames are removed.
PostHog receives network requests when analytics are allowed, even though IP
capture/geolocation enrichment are disabled. Withdrawal does not erase events
already received by PostHog; manage retained data in the project.

The site CSP permits only exact US/EU PostHog asset and ingestion origins in
addition to its existing sources. The official CDN SDK can change independently
of a site deploy; explicit options and event/property allowlists limit collection.

```sh
node --check website/dist/analytics.js
node website/check-analytics.cjs
node website/build-guides.cjs --check
node website/check-guides.cjs
node website/check-security.cjs
```

The analytics checks cover consent, revocation during SDK loading, browser
privacy signals, blocked storage/SDK, property scrubbing, Chrome/Firefox/Edge
destination values, preview isolation and report failures. Live ingestion,
dashboard queries and self-driving settings still require the project setup.

To turn off new tracking, remove `POSTHOG_PROJECT_TOKEN` and redeploy, or revert
this PR. Already-open pages continue using their loaded configuration until
navigation/reload (visitors can revoke immediately using the footer).

References: [Web SDK](https://posthog.com/docs/libraries/js),
[data controls](https://posthog.com/docs/privacy/data-collection),
[query API](https://posthog.com/docs/api/query),
[self-driving setup](https://posthog.com/docs/self-driving/setup),
[self-driving pricing](https://posthog.com/docs/self-driving/pricing).
