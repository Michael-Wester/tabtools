#!/usr/bin/env node
'use strict';

// Generate the guide pages using the homepage's header, footer and theme bootstrap.
// The deployed output is plain HTML; no package installation or client rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const guides = require('./guides-content.cjs');
const dist = path.join(__dirname, 'dist');
const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const base = 'https://tabtools.fyi';
const updated = '2026-09-21';
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = value => JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
const absoluteLinks = html => html.replace(/(href|src)="(?!https?:|mailto:|\/)([^"]*)"/g, '$1="/$2"');
const header = absoluteLinks(home.match(/<header class="site-header">[\s\S]*?<\/header>/)[0])
  .replace('href="/guides/"', 'href="/guides/" aria-current="page"');
const footer = absoluteLinks(home.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0]);
const theme = home.match(/<script>\s*\(\(\) => \{[\s\S]*?<\/script>/)[0];
const storeLinks = [
  ['chrome', 'Chrome', 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk'],
  ['firefox', 'Firefox', 'https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/'],
  ['edge', 'Edge', 'https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh']
];

function install(placement) {
  return `<aside class="guide-install" aria-label="Get TabTools">
    <div><p class="eyebrow">Free browser extension</p><h2>Put it into practice.</h2><p>Close tabs by site, remove duplicates and sort what stays.</p></div>
    <div class="guide-store-links">${storeLinks.map(([key, name, url]) => `<a class="button button-secondary" data-store="${key}" data-utm-placement="${placement}" href="${escape(`${url}?utm_source=tabtools.fyi&utm_medium=referral&utm_campaign=website&utm_content=${placement}_${key}`)}" target="_blank" rel="noopener"><img src="/assets/browsers/${key}.svg" width="24" height="24" alt="" />Add to ${name}</a>`).join('')}</div>
    <p class="mobile-note" data-mobile-note hidden>Open this page on your computer to add TabTools.</p>
  </aside>`;
}

function page({ title, description, route, body, schema, article = false }) {
  const url = base + route;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f6f6f4" />
    <title>${escape(title)} | TabTools</title>
    <meta name="description" content="${escape(description)}" />
    <link rel="canonical" href="${url}" />
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
    <link rel="stylesheet" href="/guides.css" />
    <script type="application/ld+json">${json(schema)}</script>
    ${theme}
  </head>
  <body class="guides-page">
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${header}
    <main id="main-content" tabindex="-1">${body}</main>
    ${footer}
    <script src="/script.js" defer></script>
  </body>
</html>
`;
}

function readTime(guide) {
  const words = [guide.lede, guide.answer, ...guide.sections.map(s => s.title + ' ' + s.html)].join(' ').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 210));
}

function cards(items) {
  return `<div class="guide-cards">${items.map(guide => `<a class="guide-card" href="/guides/${guide.slug}/">
    <div class="guide-card-top"><span class="guide-number">0${guides.indexOf(guide) + 1}</span><span class="guide-category">${escape(guide.category)}</span></div>
    <h2>${escape(guide.shortTitle)}</h2><p>${escape(guide.description)}</p>
    <span class="guide-card-bottom"><span>${readTime(guide)} min read</span><span class="guide-card-link">Read guide <span aria-hidden="true">↗</span></span></span>
  </a>`).join('')}</div>`;
}

const routes = new Set();
for (const guide of guides) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug), 'Invalid guide slug');
  assert(!routes.has(guide.slug), 'Duplicate guide slug');
  routes.add(guide.slug);
  const ids = new Set();
  for (const section of guide.sections) {
    assert(/^[a-z][a-z0-9-]*$/.test(section.id) && !ids.has(section.id), 'Invalid or duplicate section id');
    ids.add(section.id);
  }
}

const indexDescription = 'Practical TabTools guides for closing tabs from one website, removing duplicate tabs and sorting tabs by site in Chrome, Firefox and Edge.';
const output = new Map();
output.set('guides/index.html', page({
  title: 'Browser tab guides', description: indexDescription, route: '/guides/',
  schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'TabTools guides', url: `${base}/guides/`, description: indexDescription,
    mainEntity: { '@type': 'ItemList', itemListElement: guides.map((guide, i) => ({ '@type': 'ListItem', position: i + 1, name: guide.title, url: `${base}/guides/${guide.slug}/` })) } },
  body: `<section class="guides-intro shell"><p class="eyebrow"><span class="eyebrow-rule" aria-hidden="true"></span> TabTools guides</p>
    <h1>A clearer tab bar.<br /><span>One task at a time.</span></h1>
    <p class="guides-lede">Close a website’s tabs, clear repeated pages or bring related tabs together. Pick a guide and follow the steps in your browser.</p>
    <p class="guides-platforms">For Chrome, Firefox and Edge on desktop</p></section>
    <section class="shell guides-list" aria-label="Browse guides">${cards(guides)}</section>
    <section class="shell guides-start"><div><p class="eyebrow">New to TabTools?</p><h2>Three ways to tidy up.</h2></div><p>Closing by site removes a website’s pages. Duplicate cleanup removes repeated URLs. Sorting keeps your tabs open and changes their order. Each guide explains what happens, with examples and browser alternatives.</p><a class="text-link" href="/#features">Explore TabTools <span aria-hidden="true">→</span></a></section>`
}));

for (const guide of guides) {
  const route = `/guides/${guide.slug}/`;
  const url = base + route;
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Article', headline: guide.title, description: guide.description, url, mainEntityOfPage: url, inLanguage: 'en', dateModified: updated,
      author: { '@type': 'Person', name: 'Michael Wester', url: 'https://github.com/Michael-Wester' }, publisher: { '@type': 'Organization', name: 'TabTools', url: base + '/' } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: base + '/' },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: base + '/guides/' },
      { '@type': 'ListItem', position: 3, name: guide.shortTitle, item: url }
    ] }
  ] };
  output.set(`guides/${guide.slug}/index.html`, page({ title: guide.title, description: guide.description, route, schema, article: true,
    body: `<div class="shell guide-masthead"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/guides/">Guides</a><span aria-hidden="true">/</span><span aria-current="page">${escape(guide.category)}</span></nav>
      <p class="eyebrow">${escape(guide.category)} · Desktop browsers</p><h1>${escape(guide.title)}</h1><p class="guides-lede">${escape(guide.lede)}</p>
      <p class="guide-byline">By <a href="https://github.com/Michael-Wester" target="_blank" rel="noopener">Michael Wester</a>, creator of TabTools <span aria-hidden="true">·</span> ${readTime(guide)} min read <span aria-hidden="true">·</span> Updated <time datetime="${updated}">21 September 2026</time></p></div>
      <div class="shell guide-layout"><aside class="guide-sidebar"><nav aria-label="On this page"><p class="eyebrow">On this page</p><ol>${guide.sections.map(s => `<li><a href="#${s.id}">${escape(s.title)}</a></li>`).join('')}</ol></nav><a class="guide-back" href="/guides/">← All guides</a></aside>
      <article class="guide-article" aria-label="${escape(guide.title)}"><div class="guide-answer"><p class="eyebrow">Quick answer</p><p>${guide.answer}</p></div>
      ${guide.sections.map((section, i) => `<section id="${section.id}"><h2>${escape(section.title)}</h2>${section.html}</section>${i === 1 ? install(`guide_${guide.slug}`) : ''}`).join('\n')}
      </article></div>
      <section class="shell related-guides" aria-label="Related guides"><p class="eyebrow">Keep going</p><h2>More ways to organise your tabs.</h2>${cards(guides.filter(g => g !== guide))}</section>`
  }));
}

// Retain other sitemap entries when additional site pages are introduced.
const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const locations = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
for (const filename of output.keys()) locations.add(base + '/' + filename.replace(/index\.html$/, ''));
output.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...locations].map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`);

for (const [name, content] of output) {
  const file = path.join(dist, name);
  if (check) {
    assert(fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content, `${name} is stale; run node website/build-guides.cjs`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}
console.log(`Guide ${check ? 'checks' : 'build'} passed: ${guides.length} articles, index and sitemap.`);
