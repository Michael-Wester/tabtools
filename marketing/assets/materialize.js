// SPDX-License-Identifier: MPL-2.0
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const manifest = require('./manifest.json');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assetByPath = new Map(manifest.assets.map(asset => [asset.path, asset]));

function readAsset(asset) {
  if (!/^shared\/[A-Za-z0-9.-]+$/.test(asset.path)) throw new Error(`Unsafe asset path: ${asset.path}`);
  const bytes = fs.readFileSync(path.join(root, asset.path));
  if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
    throw new Error(`Asset fingerprint changed: ${asset.path}`);
  }
  return bytes;
}

function inlineSource(source, { verify = true } = {}) {
  if (!/^sources\/[A-Za-z0-9-]+\.html$/.test(source.path)) throw new Error(`Unsafe source path: ${source.path}`);
  const stored = fs.readFileSync(path.join(root, source.path), 'utf8');
  if (verify && sha256(stored) !== source.storedSha256) throw new Error(`Source fingerprint changed: ${source.path}`);
  let references = 0;
  const expanded = stored.replace(/\.\.\/shared\/[A-Za-z0-9.-]+/g, reference => {
    const asset = assetByPath.get(reference.slice(3));
    if (!asset) throw new Error(`Unknown asset: ${reference}`);
    references += 1;
    return `data:${asset.mime};base64,${readAsset(asset).toString('base64')}`;
  });
  if (verify && (references !== source.assetReferences || Buffer.byteLength(expanded) !== source.expandedBytes || sha256(expanded) !== source.expandedSha256)) {
    throw new Error(`Expanded source differs from preserved final: ${source.locale}`);
  }
  return expanded;
}

function selectedSources(locales) {
  if (!locales.length) return manifest.sources;
  return [...new Set(locales)].map(locale => {
    const source = manifest.sources.find(item => item.locale === locale);
    if (!source) throw new Error(`Unknown source locale: ${locale}`);
    return source;
  });
}

function materialize(output, locales = []) {
  const results = [];
  for (const source of selectedSources(locales)) {
    const expanded = inlineSource(source);
    const destination = path.resolve(output, source.locale, 'TabTools.html');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, expanded);
    results.push({ locale: source.locale, path: destination, sha256: sha256(expanded) });
  }
  return results;
}

if (require.main === module) {
  try {
    const [command, output, ...locales] = process.argv.slice(2);
    if (command === 'verify' && !output) {
      for (const asset of manifest.assets) readAsset(asset);
      for (const source of manifest.sources) inlineSource(source);
      console.log(`Verified ${manifest.sources.length} final HTML sources and ${manifest.assets.length} shared assets`);
    } else if (command === 'materialize' && output) {
      console.log(JSON.stringify(materialize(output, locales), null, 2));
    } else {
      throw new Error('Usage: node marketing/assets/materialize.js verify | materialize OUTPUT_DIRECTORY [LOCALE ...]');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { manifest, root, sha256, readAsset, inlineSource, selectedSources, materialize };
