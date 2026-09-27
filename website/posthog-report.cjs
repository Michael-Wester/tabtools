#!/usr/bin/env node
'use strict';

// Read-only input for an improvement agent. Never ship this script or its key in dist/.
function queries(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const middle = new Date(end.getTime() - 14 * 86400000);
  const start = new Date(end.getTime() - 28 * 86400000);
  const sqlDate = date => `toDateTime('${date.toISOString().slice(0, 19).replace('T', ' ')}', 'UTC')`;
  const period = `if(timestamp >= ${sqlDate(middle)}, 'current', 'previous')`;
  const where = `properties.site = 'tabtools.fyi' AND properties.environment = 'production'
    AND properties.analytics_version = 1
    AND timestamp >= ${sqlDate(start)} AND timestamp < ${sqlDate(end)}`;
  return {
    windows: { previous_start: start.toISOString(), current_start: middle.toISOString(), end_exclusive: end.toISOString(), days_per_period: 14 },
    sql: {
      overview: `SELECT period, countIf(pageviews > 0) AS visitors, sum(pageviews) AS pageviews,
        countIf(pageviews > 0 AND clicks > 0) AS store_clicking_visitors,
        sum(clicks) AS store_clicks, sum(errors) AS error_events
        FROM (SELECT ${period} AS period, distinct_id,
          countIf(event = '$pageview') AS pageviews,
          countIf(event = 'store_link_clicked') AS clicks,
          countIf(event = '$exception') AS errors
          FROM events WHERE ${where}
          AND event IN ('$pageview', 'store_link_clicked', '$exception')
          GROUP BY period, distinct_id)
        GROUP BY period ORDER BY period`,
      breakdown: `SELECT ${period} AS period, event, properties.page_path AS page_path,
        properties.browser_store AS browser_store, properties.placement AS placement,
        properties.utm_source AS utm_source, properties.utm_medium AS utm_medium,
        properties.utm_campaign AS utm_campaign, properties.scroll_percent AS scroll_percent,
        count() AS event_count, uniq(distinct_id) AS visitors
        FROM events WHERE ${where}
        AND event IN ('$pageview', 'store_link_clicked', 'guide_read', '$exception')
        GROUP BY period, event, page_path, browser_store, placement, utm_source, utm_medium, utm_campaign, scroll_percent
        ORDER BY event_count DESC LIMIT 1000`
    }
  };
}

async function report(env = process.env, request = fetch, now = new Date()) {
  const host = env.POSTHOG_APP_HOST;
  if (!['https://us.posthog.com', 'https://eu.posthog.com'].includes(host)) throw new Error('Set POSTHOG_APP_HOST to your US or EU PostHog app host.');
  if (!/^[1-9]\d*$/.test(env.POSTHOG_PROJECT_ID || '')) throw new Error('Set a numeric POSTHOG_PROJECT_ID.');
  if (!env.POSTHOG_PERSONAL_API_KEY || env.POSTHOG_PERSONAL_API_KEY.startsWith('phc_')) throw new Error('Set a private POSTHOG_PERSONAL_API_KEY with query:read for this project.');
  const plan = queries(now);
  const tables = {};
  for (const [name, query] of Object.entries(plan.sql)) {
    const response = await request(`${host}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `TabTools website ${name}`, query: { kind: 'HogQLQuery', query }, refresh: 'blocking' })
    });
    if (!response.ok) throw new Error(`PostHog ${name} query failed (HTTP ${response.status}).`);
    const data = await response.json();
    if (data.error || data.query_status?.error || data.query_status?.complete === false || !Array.isArray(data.results) || !Array.isArray(data.columns)) {
      throw new Error(`PostHog ${name} query did not return a complete result. Retry after checking project access.`);
    }
    tables[name] = data.results.map(row => Object.fromEntries(data.columns.map((column, index) => [column, row[index]])));
  }
  const overview = ['previous', 'current'].map(period => {
    const row = tables.overview.find(item => item.period === period) || { period, visitors: 0, pageviews: 0, store_clicking_visitors: 0, store_clicks: 0, error_events: 0 };
    return { ...row, store_click_rate: row.visitors ? row.store_clicking_visitors / row.visitors : null };
  });
  return {
    generated_at: now.toISOString(), ...plan.windows, overview, breakdown: tables.breakdown,
    limitations: [
      'Consent-gated website traffic only; ad blockers and early exits cause undercounting.',
      'Store clicks are intent, not confirmed extension installs.',
      'Store-click rate uses visitors with both events in the same period; it is not an ordered funnel.',
      'Breakdown is capped at 1000 rows. Unique visitors across rows cannot be added together.',
      'Small samples and before/after comparisons do not establish causation.'
    ]
  };
}

if (require.main === module) {
  if (process.argv.includes('--dry-run')) console.log(JSON.stringify(queries(), null, 2));
  else report().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    // Do not print provider response bodies or request headers containing credentials.
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { queries, report };
