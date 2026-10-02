'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../scripts/localisation');
const source = { ui: require('./guide-ui.cjs'), guides: require('./guides-content.cjs') };
const sourceFingerprint = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');

function routeFor(locale, slug = '') {
  const item = typeof locale === 'string' ? L.localeInfo(locale) : locale;
  return item.path + 'guides/' + (slug ? slug + '/' : '');
}

function markupShape(html) {
  // All structure, destinations and security-related attributes are authored in
  // English. Translations may only change prose and the accessible image text.
  return (html.match(/<[^>]+>/g) || []).map(tag => tag.replace(/\balt="[^"]*"/g, 'alt=""'));
}

function validateTranslation(value, locale) {
  const label = `Guide translation ${locale}`;
  assert.equal(value.sourceFingerprint, sourceFingerprint, `${label}: stale English source; retranslate and review`);
  assert.equal(value.review?.status, 'ai-reviewed', `${label}: missing review status`);
  assert.equal(typeof value.review?.note, 'string', `${label}: missing review notes`);
  assert.deepEqual(Object.keys(value.ui || {}).sort(), Object.keys(source.ui).sort(), `${label}: UI keys differ`);
  for (const [key, original] of Object.entries(source.ui)) {
    const translated = value.ui[key];
    assert(typeof translated === 'string' && translated.trim(), `${label}: empty ${key}`);
    assert(!/[<>]/.test(translated), `${label}: markup in plain-text ${key}`);
    assert.deepEqual((translated.match(/\{\w+\}/g) || []).sort(), (original.match(/\{\w+\}/g) || []).sort(), `${label}: changed ${key} placeholders`);
    assert.notEqual(translated, original, `${label}: untranslated ${key}`);
  }
  assert(Array.isArray(value.guides), `${label}: missing guides`);
  assert.equal(value.guides.length, source.guides.length, `${label}: missing guide`);
  value.guides.forEach((guide, i) => {
    const original = source.guides[i];
    assert.deepEqual(Object.keys(guide).sort(), Object.keys(original).sort(), `${label}: guide keys differ`);
    assert.equal(guide.slug, original.slug, `${label}: changed guide slug`);
    for (const key of ['title', 'shortTitle', 'description', 'category', 'lede', 'answer']) {
      assert(typeof guide[key] === 'string' && guide[key].trim(), `${label}/${guide.slug}: empty ${key}`);
      assert(!/[<>]/.test(guide[key]), `${label}/${guide.slug}: markup in plain-text ${key}`);
      assert.notEqual(guide[key], original[key], `${label}/${guide.slug}: untranslated ${key}`);
    }
    assert.equal(guide.sections?.length, original.sections.length, `${label}/${guide.slug}: missing section`);
    guide.sections.forEach((section, j) => {
      const expected = original.sections[j];
      assert.deepEqual(Object.keys(section).sort(), Object.keys(expected).sort(), `${label}: section keys differ`);
      assert.equal(section.id, expected.id, `${label}: changed section anchor`);
      assert(typeof section.title === 'string' && section.title.trim() && !/[<>]/.test(section.title), `${label}: invalid section title`);
      assert(typeof section.html === 'string' && section.html.trim(), `${label}: empty section body`);
      assert.notEqual(section.title, expected.title, `${label}: untranslated section title`);
      assert.notEqual(section.html, expected.html, `${label}: untranslated section body`);
      assert.deepEqual(markupShape(section.html), markupShape(expected.html), `${label}/${guide.slug}#${section.id}: altered HTML structure or link attributes`);
      // Catch English body fallbacks at paragraph/inline-run granularity too,
      // rather than accepting a mostly-English section with one changed word.
      const sourceRuns = expected.html.split(/<[^>]+>/g);
      const targetRuns = section.html.split(/<[^>]+>/g);
      sourceRuns.forEach((run, k) => {
        if (run.trim().length > 40 && /[A-Za-z]{3}/.test(run)) {
          assert.notEqual(targetRuns[k]?.trim(), run.trim(), `${label}/${guide.slug}#${section.id}: untranslated prose run`);
        }
      });
      const sourceAlts = [...expected.html.matchAll(/\balt="([^"]*)"/g)].map(match => match[1]);
      const targetAlts = [...section.html.matchAll(/\balt="([^"]*)"/g)].map(match => match[1]);
      sourceAlts.forEach((alt, k) => {
        if (alt) assert(targetAlts[k]?.trim() && targetAlts[k] !== alt, `${label}: untranslated image description`);
      });
    });
  });
  return value;
}

function catalogue(locale) {
  if (locale === 'en') return source;
  const file = path.join(__dirname, 'guide-locales', locale + '.json');
  // Never silently publish English body text under a translated URL.
  return validateTranslation(JSON.parse(fs.readFileSync(file, 'utf8')), locale);
}

module.exports = { source, sourceFingerprint, routeFor, catalogue, validateTranslation, markupShape };
