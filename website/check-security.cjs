#!/usr/bin/env node
'use strict';

// Keep the deployed policy compatible with authored HTML without allowing unsafe fallbacks.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dist = path.join(__dirname, 'dist');
const base = 'https://tabtools.fyi/';
const rules = new Map();
let rule;

for (const [index, line] of fs.readFileSync(path.join(dist, '_headers'), 'utf8').split(/\r?\n/).entries()) {
  assert(line.length <= 2000, `_headers:${index + 1}: exceeds Cloudflare's 2,000-character limit`);
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  if (!/^\s/.test(line)) {
    rule = line.trim();
    assert(rule.startsWith('/') || rule.startsWith('https://'), `_headers:${index + 1}: invalid URL pattern`);
    assert(!rules.has(rule), `_headers:${index + 1}: duplicate URL pattern`);
    rules.set(rule, new Map());
  } else {
    const match = line.trim().match(/^([A-Za-z0-9-]+):\s*(\S.*)$/);
    assert(rule && match, `_headers:${index + 1}: expected an indented header after a URL pattern`);
    const key = match[1].toLowerCase();
    assert(!rules.get(rule).has(key), `_headers:${index + 1}: duplicate ${key}`);
    rules.get(rule).set(key, match[2]);
  }
}
assert(rules.size <= 100, '_headers: exceeds Cloudflare\'s 100-rule limit');
assert(rules.has('/*'), '_headers: security headers must cover every path with /*');
const headers = rules.get('/*');
// Overlapping rules must not silently weaken or concatenate these security policies.
const protectedHeaders = ['content-security-policy', 'strict-transport-security', 'x-frame-options',
  'x-content-type-options', 'referrer-policy', 'permissions-policy'];
for (const [pattern, values] of rules) {
  if (pattern !== '/*') for (const key of protectedHeaders) {
    assert(!values.has(key), `${pattern}: put ${key} only in the shared /* rule`);
  }
}
assert.equal(headers.get('x-frame-options'), 'DENY', 'X-Frame-Options must be DENY');
assert.equal(headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options must be nosniff');
assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin', 'Keep the YouTube-compatible referrer policy');
const hsts = headers.get('strict-transport-security') || '';
assert(/(?:^|;\s*)max-age=\d+(?:;|$)/.test(hsts) && Number(hsts.match(/max-age=(\d+)/)[1]) >= 86400,
  'HSTS must have max-age of at least 86400 seconds');
for (const feature of ['camera', 'microphone', 'geolocation']) {
  assert(new RegExp(`(?:^|,\\s*)${feature}=\\(\\)`).test(headers.get('permissions-policy') || ''),
    `Permissions-Policy must disable ${feature}`);
}

const policy = new Map();
for (const part of (headers.get('content-security-policy') || '').split(';')) {
  if (!part.trim()) continue;
  const [name, ...sources] = part.trim().split(/\s+/);
  assert(!policy.has(name), `CSP contains duplicate ${name}`);
  assert(!sources.some(value => /unsafe-|\*|^(?:data|blob|http):|^https:$/.test(value)), `CSP ${name} contains an unsafe or broad source`);
  policy.set(name, sources);
}
for (const [name, value] of Object.entries({
  'default-src': "'self'", 'style-src': "'self'", 'img-src': "'self'", 'font-src': "'self'",
  'media-src': "'self'", 'connect-src': "'none'", 'object-src': "'none'", 'base-uri': "'none'",
  'form-action': "'none'", 'frame-ancestors': "'none'"
})) assert.deepEqual(policy.get(name), [value], `CSP ${name} must be ${value}`);
assert.deepEqual(policy.get('upgrade-insecure-requests'), [], 'CSP must include upgrade-insecure-requests');
const scripts = policy.get('script-src') || [];
assert(scripts.includes("'self'") && scripts.every(value => value === "'self'" || /^'sha256-[A-Za-z0-9+/]{43}='$/.test(value)),
  'CSP script-src must allow self and exact SHA-256 hashes only');
// These override script-src, so reject them until this validator explicitly supports them.
assert(!policy.has('script-src-elem') && !policy.has('script-src-attr'), 'Unexpected CSP script-src override');
const frames = policy.get('frame-src') || [];
assert.deepEqual(frames, ['https://www.youtube-nocookie.com'], 'CSP must limit frames to the privacy-enhanced YouTube origin');

function attributes(source) {
  const attrs = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}
function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : /\.html?$/i.test(entry.name) ? [file] : [];
  });
}
const files = htmlFiles(dist);
assert(files.length, 'No HTML files found in website/dist');
let inlineCount = 0;
for (const file of files) {
  const label = path.relative(dist, file);
  // HTML parsing normalises line endings before script hashes are checked by browsers.
  let html = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi, (tag, raw, body) => {
    const attrs = attributes(raw);
    const type = (attrs.get('type') || '').trim().toLowerCase();
    const dataBlock = type === 'application/json' || type === 'application/ld+json';
    assert(dataBlock || ['', 'module', 'text/javascript', 'application/javascript'].includes(type),
      `${label}: review unsupported script type ${type}`);
    if (attrs.has('src')) {
      assert(!dataBlock, `${label}: script data blocks must be inline`);
      assert.equal(new URL(attrs.get('src'), base).origin, new URL(base).origin, `${label}: script must be same-origin`);
    } else if (!dataBlock) {
      const hash = `'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`;
      assert(scripts.includes(hash), `${label}: inline script needs CSP hash ${hash}`);
      inlineCount++;
    }
    // Keep the opening tag so inline event attributes are also checked on scripts.
    return `<script${raw}></script>`;
  });
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
    const tag = match[1].toLowerCase();
    const attrs = attributes(match[2]);
    for (const name of attrs.keys()) {
      assert(!name.startsWith('on') && name !== 'style', `${label}: inline ${name} attribute on ${tag} is not CSP-compatible`);
    }
    assert(tag !== 'style', `${label}: use the local stylesheet instead of inline styles`);
    if (tag === 'iframe') {
      assert(attrs.has('src') && !attrs.has('srcdoc'), `${label}: iframe requires an explicit allowed URL`);
      assert(frames.includes(new URL(attrs.get('src'), base).origin), `${label}: iframe origin is not allowed by CSP`);
    }
  }
}
console.log(`Website security checks passed: ${files.length} HTML file(s), ${inlineCount} inline script hash(es), security headers.`);
