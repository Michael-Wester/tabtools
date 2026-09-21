#!/usr/bin/env node
'use strict';

// Validate the published files, including nested-page paths, without dependencies.
// Freshness of generated output is checked separately by build-guides.cjs --check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dist = path.join(__dirname, 'dist');
const origin = 'https://tabtools.fyi';
const guideRoutes = [
  '/guides/close-tabs-from-same-website/',
  '/guides/close-duplicate-tabs/',
  '/guides/sort-tabs-by-website/'
];
const stores = {
  chrome: 'https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk',
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh'
};

function decode(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key) => {
    if (key[0] !== '#') return named[key.toLowerCase()];
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd';
  });
}

function attributes(source, label) {
  const attrs = new Map();
  // Values can use either quote style, contain >, or be unquoted.
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    assert(!attrs.has(name), `${label}: duplicate ${name} attribute`);
    attrs.set(name, decode(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attrs;
}

function tags(html, label) {
  return [...html.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)]
    .map(match => ({ tag: match[1].toLowerCase(), attrs: attributes(match[2], label) }));
}

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : /\.html$/i.test(file) ? [file] : [];
  });
}

function routeFor(file) {
  return '/' + path.relative(dist, file).split(path.sep).join('/').replace(/index\.html$/, '');
}

function localFile(url, label) {
  const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
  assert(file === dist || file.startsWith(dist + path.sep), `${label}: URL escapes dist`);
  assert(fs.existsSync(file), `${label}: missing local destination ${url.pathname}`);
  const resolved = fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
  assert(fs.existsSync(resolved) && fs.statSync(resolved).isFile(), `${label}: missing file ${url.pathname}`);
  return resolved;
}

const pages = new Map();
for (const file of htmlFiles(dist)) {
  const label = path.relative(dist, file);
  const html = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const schemas = [];
  // Exclude script text from tag scanning so strings inside scripts are not HTML.
  const markup = html.replace(/<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi,
    (_tag, raw, body) => {
      if ((attributes(raw, label).get('type') || '').toLowerCase() === 'application/ld+json') {
        try { schemas.push(JSON.parse(body)); }
        catch (error) { assert.fail(`${label}: invalid JSON-LD: ${error.message}`); }
      }
      return `<script${raw}></script>`;
    });
  const elements = tags(markup, label);
  const ids = new Set();
  for (const { attrs } of elements) if (attrs.has('id')) {
    const id = attrs.get('id');
    assert(id && !ids.has(id), `${label}: empty or duplicate id ${id}`);
    ids.add(id);
  }
  assert.equal(elements.filter(el => el.tag === 'h1').length, 1, `${label}: expected one h1`);
  assert(schemas.length, `${label}: missing JSON-LD`);
  for (const schema of schemas) {
    assert(schema && typeof schema === 'object' && schema['@context'] === 'https://schema.org', `${label}: invalid schema context`);
  }
  pages.set(file, { file, label, html, elements, ids, schemas, route: routeFor(file), links: new Set() });
}

const byRoute = new Map([...pages.values()].map(page => [page.route, page]));
for (const route of ['/', '/guides/', ...guideRoutes]) assert(byRoute.has(route), `Missing page ${route}`);
let localReferences = 0;
let storeLinks = 0;
const unique = { title: new Set(), description: new Set(), canonical: new Set(), ogTitle: new Set() };
for (const page of pages.values()) {
  const { label, elements, html, schemas, route } = page;
  const canonicalUrl = origin + route;
  const isGuide = route.startsWith('/guides/');
  const isArticle = isGuide && route !== '/guides/';
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];
  assert.equal(titles.length, 1, `${label}: expected one title`);
  const title = decode(titles[0][1]).trim();
  const meta = key => {
    const found = elements.filter(el => el.tag === 'meta' && (el.attrs.get('name') === key || el.attrs.get('property') === key));
    assert.equal(found.length, 1, `${label}: expected one ${key} meta tag`);
    assert(found[0].attrs.get('content')?.trim(), `${label}: empty ${key}`);
    return found[0].attrs.get('content');
  };
  const canonical = elements.filter(el => el.tag === 'link' && (el.attrs.get('rel') || '').split(/\s+/).includes('canonical'));
  assert.equal(canonical.length, 1, `${label}: expected one canonical link`);
  assert.equal(canonical[0].attrs.get('href'), canonicalUrl, `${label}: incorrect canonical URL`);
  assert.equal(meta('og:url'), canonicalUrl, `${label}: incorrect Open Graph URL`);
  assert.equal(meta('og:type'), isArticle ? 'article' : 'website', `${label}: incorrect Open Graph type`);
  const description = meta('description');
  const ogTitle = meta('og:title');
  const ogDescription = meta('og:description');
  for (const [key, value] of Object.entries({ title, description, canonical: canonicalUrl, ogTitle })) {
    assert(value && !unique[key].has(value), `${label}: empty or duplicate ${key}`);
    unique[key].add(value);
  }
  if (isGuide) {
    assert.equal(title, ogTitle + ' | TabTools', `${label}: title and Open Graph title disagree`);
    assert.equal(description, ogDescription, `${label}: description and Open Graph description disagree`);
    assert.equal(meta('twitter:title'), ogTitle, `${label}: Twitter title disagrees`);
    assert.equal(meta('twitter:description'), description, `${label}: Twitter description disagrees`);
    for (const section of ['header', 'footer']) {
      const fragment = html.match(new RegExp(`<${section}\\b[^>]*>[\\s\\S]*?<\\/${section}>`, 'i'));
      assert(fragment, `${label}: missing ${section}`);
      const links = tags(fragment[0], label).filter(el => el.tag === 'a').map(el => el.attrs.get('href'));
      assert(links.includes('/guides/'), `${label}: ${section} missing Guides navigation`);
      assert(links.some(href => href === '/' || href?.startsWith('/#')), `${label}: ${section} missing home navigation`);
    }
    assert(elements.some(el => el.tag === 'script' && el.attrs.get('src') === '/script.js'), `${label}: missing shared script`);
    for (const stylesheet of ['/styles.css', '/guides.css']) {
      assert(elements.some(el => el.tag === 'link' && el.attrs.get('href') === stylesheet), `${label}: missing ${stylesheet}`);
    }
  }

  const schemaNodes = schemas.flatMap(schema => schema['@graph'] || [schema]);
  if (isArticle) {
    const articles = schemaNodes.filter(node => node['@type'] === 'Article');
    assert.equal(articles.length, 1, `${label}: expected one Article schema`);
    const article = articles[0];
    assert.equal(article.url, canonicalUrl, `${label}: Article URL disagrees`);
    assert.equal(article.mainEntityOfPage, canonicalUrl, `${label}: Article page disagrees`);
    assert.equal(article.headline, ogTitle, `${label}: Article headline disagrees`);
    assert.equal(article.description, description, `${label}: Article description disagrees`);
    assert(article.author?.name && article.publisher?.name, `${label}: missing article attribution`);
    const breadcrumbs = schemaNodes.filter(node => node['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumbs.length, 1, `${label}: expected breadcrumb schema`);
    assert.deepEqual(breadcrumbs[0].itemListElement.map(item => item.item), [origin + '/', origin + '/guides/', canonicalUrl], `${label}: incorrect breadcrumb URLs`);
  }

  for (const { tag, attrs } of elements) {
    for (const attribute of ['href', 'src', 'poster']) {
      if (!attrs.has(attribute)) continue;
      const value = attrs.get(attribute);
      assert(value, `${label}: empty ${attribute} on ${tag}`);
      const url = new URL(value, canonicalUrl);
      if (url.origin !== origin) continue;
      const targetFile = localFile(url, label);
      localReferences++;
      if (tag === 'a' && pages.has(targetFile)) page.links.add(pages.get(targetFile).route);
      if (url.hash && pages.has(targetFile)) {
        assert(pages.get(targetFile).ids.has(decodeURIComponent(url.hash.slice(1))), `${label}: missing destination ${value}`);
      }
      if (isGuide && (attribute !== 'href' || tag === 'link' && attrs.get('rel') !== 'canonical')) {
        assert(value.startsWith('/'), `${label}: asset ${value} must resolve from the site root`);
      }
    }
    if (tag !== 'a' || !attrs.has('href')) continue;
    const url = new URL(attrs.get('href'), canonicalUrl);
    const matchesStore = Object.values(stores).some(store => new URL(store).origin === url.origin);
    if (!matchesStore && !attrs.has('data-store')) continue;
    const key = attrs.get('data-store');
    assert(stores[key], `${label}: store link missing a valid data-store`);
    assert.equal(url.origin + url.pathname, stores[key], `${label}: wrong ${key} listing`);
    const placement = attrs.get('data-utm-placement');
    assert(placement, `${label}: store link has no UTM placement`);
    for (const [name, value] of Object.entries({ utm_source: 'tabtools.fyi', utm_medium: 'referral', utm_campaign: 'website', utm_content: `${placement}_${key}` })) {
      assert.equal(url.searchParams.get(name), value, `${label}: wrong ${name} on ${key} link`);
    }
    assert.equal(attrs.get('target'), '_blank', `${label}: store link should open a new tab`);
    assert((attrs.get('rel') || '').split(/\s+/).includes('noopener'), `${label}: store link missing noopener`);
    storeLinks++;
  }
}

const hub = byRoute.get('/guides/');
const collection = hub.schemas.flatMap(schema => schema['@graph'] || [schema]).find(node => node['@type'] === 'CollectionPage');
assert(collection, 'Guides index: missing CollectionPage schema');
assert.equal(collection.url, origin + '/guides/', 'Guides index: incorrect schema URL');
const items = collection.mainEntity?.itemListElement;
assert(Array.isArray(items), 'Guides index: missing article ItemList');
assert.deepEqual(items.map(item => item.url).sort(), guideRoutes.map(route => origin + route).sort(), 'Guides index: schema omits or duplicates an article');
assert.deepEqual(items.map(item => item.position), items.map((_, i) => i + 1), 'Guides index: invalid ItemList positions');
assert(byRoute.get('/').links.has('/guides/'), 'Homepage must link to the Guides index');
for (const route of guideRoutes) {
  assert(hub.links.has(route), `Guides index does not link to ${route}`);
  const page = byRoute.get(route);
  assert(page.links.has('/guides/'), `${route}: missing link back to Guides`);
  assert(guideRoutes.some(other => other !== route && page.links.has(other)), `${route}: missing related guide link`);
}
const reachable = new Set(['/']);
for (const route of reachable) for (const linked of byRoute.get(route)?.links || []) reachable.add(linked);
for (const route of ['/guides/', ...guideRoutes]) assert(reachable.has(route), `Orphan guide page ${route}`);
const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
assert.equal(new Set(locations).size, locations.length, 'Sitemap contains duplicate locations');
for (const route of ['/guides/', ...guideRoutes]) assert(locations.includes(origin + route), `Sitemap is missing ${route}`);

console.log(`Guide structure checks passed: ${pages.size} pages, ${localReferences} local references, ${storeLinks} tagged store links; metadata, JSON-LD, navigation and sitemap.`);
