#!/usr/bin/env node
'use strict';

// Static, fully translated guides. English keeps its existing URLs; each locale
// has equivalent paths, anchors and language links without a client-side router.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../scripts/localisation');
const G = require('./guide-localisation.cjs');
const base = 'https://tabtools.fyi';
const updated = '2026-10-01';
const escape = L.escape;
const json = value => JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
const format = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
const storeLinks = [
  ['chrome', 'Chrome', 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk'],
  ['firefox', 'Firefox', 'https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/'],
  ['edge', 'Edge', 'https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh']
];

function readTime(guide) {
  // Use the same estimate across equivalent translations, including CJK text
  // where whitespace is not a word boundary. This is an approximate duration.
  const original = G.source.guides.find(item => item.slug === guide.slug);
  const words = [original.lede, original.answer, ...original.sections.map(s => s.title + ' ' + s.html)].join(' ').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 210));
}

function buildGuides({ check = false } = {}) {
  const dist = path.join(__dirname, 'dist');
  const output = new Map();
  // Validate every translation before writing anything. A missing or stale
  // catalogue must fail generation, not create a partially translated release.
  const catalogues = new Map(L.registry.map(locale => [locale.locale, G.catalogue(locale.locale)]));

  for (const locale of L.registry) {
    const { ui, guides } = catalogues.get(locale.locale);
    const messages = L.catalogue(locale.locale);
    const home = fs.readFileSync(path.join(dist, locale.website, 'index.html'), 'utf8');
    const absoluteLinks = html => html.replace(/(href|src)="(?!https?:|mailto:|\/)([^"]*)"/g, (_, attr, value) => `${attr}="${attr === 'src' ? '/' : locale.path}${value}"`);
    const header = absoluteLinks(home.match(/<header class="site-header">[\s\S]*?<\/header>/)[0])
      .replace(`href="${G.routeFor(locale)}"`, `href="${G.routeFor(locale)}" aria-current="page"`);
    const footer = absoluteLinks(home.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0]);
    const theme = home.match(/<script>\s*\(\(\) => \{[\s\S]*?<\/script>/)[0];
    const localeDataMatch = home.match(/<script\b[^>]*\bid="locale-data"[^>]*>([\s\S]*?)<\/script>/);
    assert(localeDataMatch, `${locale.locale}: generate homepage locale data before guides`);
    const homeData = JSON.parse(localeDataMatch[1]);
    const date = new Intl.DateTimeFormat(locale.canonical, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(updated + 'T00:00:00Z'));
    const localizeLinks = html => html.replace(/href="\/guides\//g, `href="${G.routeFor(locale)}`);
    const readTimeLabel = guide => format(ui.readTime, { minutes: new Intl.NumberFormat(locale.canonical).format(readTime(guide)) });

    function install(placement) {
      return `<aside class="guide-install" aria-label="${escape(ui.getTabTools)}">
    <div><p class="eyebrow">${escape(ui.installEyebrow)}</p><h2>${escape(ui.installHeading)}</h2><p>${escape(ui.installBody)}</p></div>
    <div class="guide-store-links">${storeLinks.map(([key, name, url]) => `<a class="button button-secondary" data-store="${key}" data-utm-placement="${placement}" href="${escape(`${url}?utm_source=tabtools.fyi&utm_medium=referral&utm_campaign=website&utm_content=${placement}_${key}`)}" target="_blank" rel="noopener"><img src="/assets/browsers/${key}.svg" width="24" height="24" alt="" /><span data-browser-copy>${escape(format(messages.web_addTo, { browser: name }))}</span></a>`).join('')}</div>
    <p class="mobile-note" data-mobile-note hidden>${escape(messages.web_viewing_on_a_phone_or)}</p>
  </aside>`;
    }

    function page({ title, description, slug = '', body, schema, article = false }) {
      const route = G.routeFor(locale, slug);
      const url = base + route;
      const suffix = 'guides/' + (slug ? slug + '/' : '');
      // Both native fallback anchors and JS-enhanced choices target the same
      // guide. The runtime already appends the current query and hash.
      const pageHeader = header.replace(/(<a class="language-(?:option|fallback-option)"[^>]*\bhref=")([^"]+)"/g,
        (_, prefix, homePath) => prefix + homePath + suffix + '"');
      const pageData = { ...homeData, registry: homeData.registry.map(item => ({ ...item, path: item.path + suffix })) };
      const alternates = L.registry.map(item => `    <link rel="alternate" hreflang="${escape(item.hreflang)}" href="${base + G.routeFor(item, slug)}" />`).join('\n');
      return `<!doctype html>
<html lang="${escape(locale.canonical)}" dir="${escape(locale.direction)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f6f6f4" />
    <title>${escape(title)} | TabTools</title>
    <meta name="description" content="${escape(description)}" />
    <link rel="canonical" href="${url}" />
${alternates}
    <link rel="alternate" hreflang="x-default" href="${base + G.routeFor('en', slug)}" />
    <meta property="og:type" content="${article ? 'article' : 'website'}" />
    <meta property="og:site_name" content="TabTools" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escape(title)}" />
    <meta name="twitter:description" content="${escape(description)}" />
    <link rel="icon" href="/assets/tabtools-icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <noscript><link rel="stylesheet" href="/no-script.css" /></noscript>
    <link rel="stylesheet" href="/guides.css" />
    <script type="application/ld+json">${json(schema)}</script>
    ${theme}
    <script type="application/json" id="locale-data">${json(pageData)}</script>
  </head>
  <body class="guides-page">
    <a class="skip-link" href="#main-content">${escape(messages.web_skip_to_content)}</a>
    ${pageHeader}
    <main id="main-content" tabindex="-1">${body}</main>
    ${footer}
    <script src="/script.js" defer></script>
  </body>
</html>
`;
    }

    function cards(items) {
      return `<div class="guide-cards">${items.map(guide => `<a class="guide-card" href="${G.routeFor(locale, guide.slug)}">
    <div class="guide-card-top"><span class="guide-number">0${guides.indexOf(guide) + 1}</span><span class="guide-category">${escape(guide.category)}</span></div>
    <h2>${escape(guide.shortTitle)}</h2><p>${escape(guide.description)}</p>
    <span class="guide-card-bottom"><span>${escape(readTimeLabel(guide))}</span><span class="guide-card-link">${escape(ui.readGuide)} <span aria-hidden="true">↗</span></span></span>
  </a>`).join('')}</div>`;
    }

    const routes = new Set();
    for (const guide of guides) {
      assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug) && !routes.has(guide.slug), 'Invalid or duplicate guide slug');
      routes.add(guide.slug);
      const ids = new Set();
      for (const section of guide.sections) {
        assert(/^[a-z][a-z0-9-]*$/.test(section.id) && !ids.has(section.id), 'Invalid or duplicate section id');
        ids.add(section.id);
      }
    }

    output.set(G.routeFor(locale).slice(1) + 'index.html', page({
      title: ui.indexTitle, description: ui.indexDescription,
      schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: ui.indexEyebrow, url: base + G.routeFor(locale), description: ui.indexDescription, inLanguage: locale.canonical,
        mainEntity: { '@type': 'ItemList', itemListElement: guides.map((guide, i) => ({ '@type': 'ListItem', position: i + 1, name: guide.title, url: base + G.routeFor(locale, guide.slug) })) } },
      body: `<section class="guides-intro shell"><p class="eyebrow"><span class="eyebrow-rule" aria-hidden="true"></span> ${escape(ui.indexEyebrow)}</p>
    <h1>${escape(ui.indexHeading)}<br /><span>${escape(ui.indexHeadingAccent)}</span></h1>
    <p class="guides-lede">${escape(ui.indexLede)}</p>
    <p class="guides-platforms">${escape(ui.indexPlatforms)}</p></section>
    <section class="shell guides-list" aria-label="${escape(ui.browseGuides)}">${cards(guides)}</section>
    <section class="shell guides-start"><div><p class="eyebrow">${escape(ui.startEyebrow)}</p><h2>${escape(ui.startHeading)}</h2></div><p>${escape(ui.startBody)}</p><a class="text-link" href="${locale.path}#features">${escape(ui.explore)} <span aria-hidden="true">${locale.direction === 'rtl' ? '←' : '→'}</span></a></section>`
    }));

    for (const guide of guides) {
      const route = G.routeFor(locale, guide.slug);
      const url = base + route;
      const schema = { '@context': 'https://schema.org', '@graph': [
        { '@type': 'Article', headline: guide.title, description: guide.description, url, mainEntityOfPage: url, inLanguage: locale.canonical, dateModified: updated,
          author: { '@type': 'Person', name: 'Michael Wester', url: 'https://github.com/Michael-Wester' }, publisher: { '@type': 'Organization', name: 'TabTools', url: base + '/' } },
        { '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: ui.home, item: base + locale.path },
          { '@type': 'ListItem', position: 2, name: messages.web_guides, item: base + G.routeFor(locale) },
          { '@type': 'ListItem', position: 3, name: guide.shortTitle, item: url }
        ] }
      ] };
      const authorLink = '<a href="https://github.com/Michael-Wester" target="_blank" rel="noopener">Michael Wester</a>';
      const byline = format(escape(ui.byline), { author: authorLink });
      const updatedLabel = format(escape(ui.updated), { date: `<time datetime="${updated}">${escape(date)}</time>` });
      output.set(route.slice(1) + 'index.html', page({ title: guide.title, description: guide.description, slug: guide.slug, schema, article: true,
        body: `<div class="shell guide-masthead"><nav class="breadcrumbs" aria-label="${escape(ui.breadcrumb)}"><a href="${locale.path}">${escape(ui.home)}</a><span aria-hidden="true">/</span><a href="${G.routeFor(locale)}">${escape(messages.web_guides)}</a><span aria-hidden="true">/</span><span aria-current="page">${escape(guide.category)}</span></nav>
      <p class="eyebrow">${escape(guide.category)} · ${escape(ui.desktopBrowsers)}</p><h1>${escape(guide.title)}</h1><p class="guides-lede">${escape(guide.lede)}</p>
      <p class="guide-byline">${byline} <span aria-hidden="true">·</span> ${escape(readTimeLabel(guide))} <span aria-hidden="true">·</span> ${updatedLabel}</p>${locale.locale === 'en' ? '' : `\n      <p class="guide-screenshot-note">${escape(ui.screenshotNote)}</p>`}</div>
      <div class="shell guide-layout"><aside class="guide-sidebar"><nav aria-label="${escape(ui.onThisPage)}"><p class="eyebrow">${escape(ui.onThisPage)}</p><ol>${guide.sections.map(s => `<li><a href="#${s.id}">${escape(s.title)}</a></li>`).join('')}</ol></nav><a class="guide-back" href="${G.routeFor(locale)}">${locale.direction === 'rtl' ? '→' : '←'} ${escape(ui.allGuides)}</a></aside>
      <article class="guide-article" aria-label="${escape(guide.title)}"><div class="guide-answer"><p class="eyebrow">${escape(ui.quickAnswer)}</p><p>${escape(guide.answer)}</p></div>
      ${guide.sections.map((section, i) => `<section id="${section.id}"><h2>${escape(section.title)}</h2>${localizeLinks(section.html)}</section>${i === 1 ? install(`guide_${guide.slug}`) : ''}`).join('\n')}
      </article></div>
      <section class="shell related-guides" aria-label="${escape(ui.relatedGuides)}"><p class="eyebrow">${escape(ui.relatedEyebrow)}</p><h2>${escape(ui.relatedHeading)}</h2>${cards(guides.filter(g => g !== guide))}</section>`
      }));
    }
  }

  // The complete current route set, not historical entries for removed content.
  // Hreflang is expressed in HTML; Google considers that equivalent to XML
  // alternatives, so the sitemap only needs each canonical URL once.
  const locations = [...L.registry.map(L.urlFor), ...[...output.keys()].map(filename => base + '/' + filename.replace(/index\.html$/, ''))];
  output.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.sort().map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`);
  for (const [name, content] of output) {
    const file = path.join(dist, name);
    if (check) assert(fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content, `${name} is stale; run node website/build-guides.cjs`);
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
  console.log(`Guide ${check ? 'checks' : 'build'} passed: ${L.registry.length} locales, ${G.source.guides.length} articles each, indexes and sitemap.`);
}

if (require.main === module) buildGuides({ check: process.argv.includes('--check') });
module.exports = { buildGuides, readTime };
