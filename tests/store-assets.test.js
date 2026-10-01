// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { manifest, root, sha256, readAsset, inlineSource, selectedSources, materialize } = require('../marketing/assets/materialize');
const { locales: registry } = require('../localisation/registry.json');

const order = ['overview', 'sort', 'rightclick', 'count', 'inactive'];
const sectionSuffixes = ['Overview', 'Sort-Tabs', 'Right-Click', 'Cleanup-Count', 'Inactive-Tabs'];

test('store artwork preserves every registry locale plus the separate global design', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.localisedSourceCount, 29);
  assert.equal(manifest.globalSourceCount, 1);
  assert.equal(manifest.sources.length, 30);
  assert.deepEqual(manifest.sources.filter(source => source.locale !== 'global').map(source => source.locale).sort(), registry.map(item => item.locale).sort());
  assert.equal(new Set(manifest.sources.map(source => source.locale)).size, 30);
  assert.deepEqual(manifest.order, order);
  assert.deepEqual(manifest.dimensions, { width: 1280, height: 800 });
  assert.deepEqual(fs.readdirSync(path.join(root, 'sources')).sort(), manifest.sources.map(source => path.basename(source.path)).sort());
});

test('all shared artwork inputs have valid hashes, sizes, local paths and Inter licensing', () => {
  assert.equal(manifest.assets.length, 36);
  assert.equal(new Set(manifest.assets.map(asset => asset.path)).size, 36);
  const referenced = new Set();
  for (const source of manifest.sources) {
    const html = fs.readFileSync(path.join(root, source.path), 'utf8');
    assert.doesNotMatch(html, /data:[^;]+;base64,/);
    assert.doesNotMatch(html, /(?:file:\/\/|\/workspace\/|\/usr\/share\/)/);
    for (const [, resource] of html.matchAll(/(?:src="|url\()([^"\)]+)/g)) {
      assert.match(resource, /^\.\.\/shared\/[A-Za-z0-9.-]+$/);
      referenced.add(resource.slice(3));
    }
  }
  assert.deepEqual([...referenced].sort(), manifest.assets.map(asset => asset.path).sort());
  assert.deepEqual(fs.readdirSync(path.join(root, 'shared')).sort(), manifest.assets.map(asset => path.basename(asset.path)).sort());
  for (const asset of manifest.assets) {
    assert.ok(readAsset(asset).length > 0, asset.path);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.ok(asset.bytes < 350000, `${asset.path}: shared sources should remain modest`);
  }
  assert.equal(manifest.assets.filter(asset => asset.mime === 'font/ttf').length, 6);
  const license = fs.readFileSync(path.join(root, 'licenses', 'Inter-OFL.txt'), 'utf8');
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(license, /Copyright 2016 The Inter Project Authors/);
  const embeddedNotice = Buffer.from('Copyright 2016 The Inter Project Authors', 'utf16le').swap16();
  for (const font of manifest.assets.filter(asset => asset.mime === 'font/ttf')) {
    assert.ok(readAsset(font).includes(embeddedNotice), font.path);
  }
});

test('deduplicated sources round-trip byte-exactly with final order, copy and five-image footers', () => {
  for (const source of manifest.sources) {
    const html = inlineSource(source);
    assert.equal(sha256(html), source.expandedSha256, source.locale);
    const language = source.locale === 'global' ? 'en' : source.locale;
    assert.ok(html.includes(`<html lang="${language}">`), source.locale);
    const sections = [...html.matchAll(/<section\b[^>]*>.*?<\/section>/gs)].map(match => match[0]);
    assert.equal(sections.length, 5, source.locale);
    assert.equal(source.slides.length, 5, source.locale);
    assert.deepEqual(source.slides.map(slide => slide.feature), order);
    for (let index = 0; index < sections.length; index++) {
      const section = sections[index];
      const slide = source.slides[index];
      const footer = `${String(index + 1).padStart(2, '0')} / 05`;
      assert.equal(slide.order, index + 1);
      assert.equal(slide.footer, footer);
      assert.equal(slide.sectionId, section.match(/\bid="([^"]+)"/)[1]);
      assert.ok(slide.sectionId.endsWith(sectionSuffixes[index]));
      assert.equal(sha256(section), slide.expandedSectionSha256, `${source.locale}: slide ${index + 1}`);
      assert.deepEqual([...section.matchAll(/>(\d\d \/ \d\d)</g)].map(match => match[1]), [footer]);
      assert.equal(slide.approvedExport.path, `${source.locale}/screenshot-${index + 1}.png`);
      assert.match(slide.approvedExport.sha256, /^[a-f0-9]{64}$/);
      assert.equal(slide.approvedExport.width, 1280);
      assert.equal(slide.approvedExport.height, 800);
      assert.equal(slide.approvedExport.mode, 'RGB');
    }
    assert.doesNotMatch(html, />\d\d \/ 06</);
  }
});

test('materialization is independent of the current directory and rejects unknown locales or altered fingerprints', () => {
  assert.throws(() => selectedSources(['../escape']), /Unknown source locale/);
  assert.deepEqual(selectedSources(['fr', 'fr', 'global']).map(source => source.locale), ['fr', 'global']);
  assert.throws(() => inlineSource({ ...manifest.sources[0], storedSha256: '0'.repeat(64) }), /Source fingerprint changed/);
  assert.throws(() => readAsset({ ...manifest.assets[0], path: '../escape' }), /Unsafe asset path/);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tabtools-store-artwork-'));
  try {
    const results = materialize(output, ['en', 'global']);
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(sha256(fs.readFileSync(result.path)), result.sha256);
      assert.equal(result.sha256, manifest.sources.find(source => source.locale === result.locale).expandedSha256);
    }
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
