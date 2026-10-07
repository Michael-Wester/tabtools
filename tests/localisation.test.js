// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../scripts/localisation');

test('registry uses distinct locale, extension, website, and hreflang identifiers', () => {
  assert.equal(L.registry.length, 29);
  assert.equal(L.registry.some(item => item.locale === 'en-GB'), false);
  for (const field of ['locale', 'extension', 'website', 'hreflang']) {
    assert.equal(new Set(L.registry.map(item => item[field])).size, L.registry.length, field);
  }
  assert.equal(L.localeInfo('he').direction, 'rtl');
  assert.equal(L.localeInfo('zh-CN').extension, 'zh_CN');
  assert.equal(L.localeInfo('nb').extension, 'no');
});

test('extension messages preserve interpolation and plural categories', () => {
  const messages = L.toWebExtensionMessages('cs');
  assert.ok(messages.closedCount.message.includes('$count$'));
  assert.equal(messages.closedCount.placeholders.count.content, '$1');
  assert.ok(messages.openCount_one);
  assert.ok(messages.openCount_few);
  assert.ok(messages.openCount_other);
});

test('generation leaves out strings English has retired or reshaped instead of stopping', () => {
  const english = structuredClone(L.catalogue('en'));
  const czech = structuredClone(L.catalogue('cs'));
  delete english.openCount;                        // a retired plural string
  delete english.settings;                         // a retired plain string
  english.closedCount = { one: '{count} closed', other: '{count} closed' };   // now plural in English only
  const messages = L.toWebExtensionMessages('cs', english, czech);
  assert.equal(Object.keys(messages).some(key => key.startsWith('openCount_')), false);
  assert.equal('settings' in messages, false);
  assert.equal(Object.keys(messages).some(key => key === 'closedCount' || key.startsWith('closedCount_')), false);
  assert.ok(messages.sortTabs.message);
  delete czech.sortTabs;                           // not translated yet: absent, so the browser shows English
  assert.equal('sortTabs' in L.toWebExtensionMessages('cs', english, czech), false);
});

function validationSandbox(run) {
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tabtools-validate-'));
  const wanted = /^(scripts|localisation|marketing[\\/](sources|listings|INDEX\.md)|src[\\/](overrides|shared[\\/](_locales|i18n-fallback\.js))|website[\\/]dist[\\/]([^\\/]+[\\/]index\.html|index\.html|sitemap\.xml))([\\/]|$)/;
  const ancestors = /^(marketing|src|src[\\/]shared|website|website[\\/]dist|website[\\/]dist[\\/][^\\/]+)$/;
  try {
    fs.cpSync(L.root, directory, { recursive: true, filter: source => {
      const relative = path.relative(L.root, source);
      return relative === '' || wanted.test(relative) || ancestors.test(relative);
    } });
    const file = name => path.join(directory, 'localisation', name);
    const edit = (name, change) => {
      const data = JSON.parse(fs.readFileSync(file(name), 'utf8'));
      fs.writeFileSync(file(name), JSON.stringify(change(data) || data, null, 2) + '\n');
    };
    const node = (script, pendingAllowed) => spawnSync(process.execPath, [script], {
      cwd: directory, encoding: 'utf8',
      env: { ...process.env, TABTOOLS_PENDING_TRANSLATIONS: pendingAllowed ? '1' : '' },
    });
    const validate = pendingAllowed => {
      const result = node('scripts/validate-localisation.js', pendingAllowed);
      return { ...result, text: result.stdout + result.stderr, coverage: fs.readFileSync(file('COVERAGE.md'), 'utf8') };
    };
    const generate = () => {
      const result = node('scripts/generate-extension-locales.js', false);
      assert.equal(result.status, 0, result.stderr);
    };
    return run({ edit, validate, generate });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('a release branch may hold untranslated and reworded English strings only when pending translations are allowed', () => {
  validationSandbox(({ edit, validate, generate }) => {
    // The repository itself may be waiting for translations, so compare with its own starting point.
    const germanRow = text => text.split('\n').find(line => line.startsWith('| de |')).split('|').map(cell => cell.trim());
    const stale = cell => Number((cell.match(/STALE \((\d+) keys\)/) || [0, 0])[1]);
    const start = validate(true);
    assert.equal(start.status, 0, start.text);
    const [, , extensionBefore, , , freshnessBefore] = germanRow(start.coverage);
    edit('locales/en.json', english => {
      const withNew = {};
      for (const [key, value] of Object.entries(english)) {
        withNew[key] = key === 'sortTabs' ? 'Sort tabs by site' : value;                     // reworded
        if (key === 'closeSiteLabel') {
          withNew.exampleNew = 'A new string';                                               // new
          withNew.examplePlural = { one: '{count} example', other: '{count} examples' };     // new plural
        }
      }
      return withNew;
    });
    generate();
    const strict = validate(false);
    assert.equal(strict.status, 1);
    for (const report of ['de: exampleNew: expected nonempty text', 'de: examplePlural: expected plural forms',
      'de: missing review metadata for exampleNew', 'de: stale source fingerprint for sortTabs']) {
      assert.ok(strict.text.includes(report), report);
    }
    assert.match(strict.text, /de: missing source keys: [^\n]*exampleNew[^\n]*examplePlural/);
    const tolerant = validate(true);
    assert.equal(tolerant.status, 0, tolerant.text);
    assert.match(tolerant.text, /Translations pending: \d+ reports above/);
    assert.ok(tolerant.text.includes('de: stale source fingerprint for sortTabs'));
    // The coverage table is committed, so it must not depend on the mode.
    assert.equal(tolerant.coverage, strict.coverage);
    const [, , extensionAfter, , , freshnessAfter, technical] = germanRow(tolerant.coverage);
    const [had, total] = extensionBefore.split('/').map(Number);
    assert.equal(extensionAfter, had + '/' + (total + 2));
    assert.equal(stale(freshnessAfter), stale(freshnessBefore) + 3);
    assert.match(technical, /^FAIL \(\d+\)$/);
  });
});

test('pending translations never excuse retired strings, broken placeholders or stale packages', () => {
  validationSandbox(({ edit, validate, generate }) => {
    edit('locales/en.json', english => { delete english.openCount; delete english.settings; });
    generate();                                    // used to stop with a TypeError on the plural string
    let result = validate(true);
    assert.equal(result.status, 1);
    assert.ok(result.text.includes('de: openCount: unknown key'));
    assert.ok(result.text.includes('de: settings: unknown key'));
  });
  validationSandbox(({ edit, validate, generate }) => {
    edit('locales/de.json', german => { german.closeSiteLabel = 'Tabs dieser Website schließen'; });
    let result = validate(true);
    assert.equal(result.status, 1);
    assert.ok(result.text.includes('de: closeSiteLabel: changed placeholders'));
    assert.ok(result.text.includes('de: packaged messages are out of date'));
    generate();
    result = validate(true);
    assert.equal(result.status, 1);
    assert.ok(result.text.includes('de: review translation fingerprint mismatch for closeSiteLabel'));
  });
});

test('store locale codes match the recorded Chrome and AMO evidence', () => {
  const { validateStoreCodes } = require('../scripts/catalogue-validation');
  const evidence = require('../localisation/support-evidence.json');
  for (const locale of L.registry) {
    assert.deepEqual(validateStoreCodes(locale, evidence), [], locale.locale);
  }
  const swedish = structuredClone(L.localeInfo('sv'));
  assert.equal(swedish.extension, 'sv');
  assert.equal(swedish.stores.firefox, 'sv-SE');
  swedish.stores.firefox = 'sv';
  assert.deepEqual(validateStoreCodes(swedish, evidence), ['firefox: unsupported listing locale sv']);
  swedish.stores.chrome = 'sv-SE';
  assert.ok(validateStoreCodes(swedish, evidence).includes('chrome: unsupported listing locale sv-SE'));
});

test('store text omits website-only navigation and its index links to current listings', () => {
  const { fullDescription, listingIndex } = require('../scripts/generate-listings');
  for (const locale of L.registry) {
    const catalogue = L.catalogue(locale.locale);
    const description = fullDescription(catalogue);
    assert.ok(!description.includes(catalogue.web_tabtools_is_available_for_chrome), locale.locale);
    assert.ok(description.includes(catalogue.web_the_tabtools_extension_processes_tab), locale.locale);
    assert.ok(Array.from(description).length >= 250, locale.locale);
    assert.doesNotMatch(description, /<[^>]+>/);
  }
  const index = listingIndex();
  const links = [...index.matchAll(/\[Text\]\(([^)]+)\)/g)];
  assert.equal(links.length, L.registry.length * 3);
  for (const [, link] of links) assert.ok(fs.existsSync(path.join(L.root, 'marketing', link)), link);
  assert.doesNotMatch(index, /en-GB/);
});

test('Chrome listings preserve the final browser-specific description snapshot for all locales', () => {
  const snapshot = require('../marketing/sources/chrome-descriptions.json');
  const { listingDescription, listing, stores, fullDescription } = require('../scripts/generate-listings');
  assert.equal(snapshot.extensionVersion, '4.0.3');
  assert.deepEqual(Object.keys(snapshot.locales).sort(), L.registry.map(locale => locale.locale).sort());
  const english = snapshot.locales.en.description;
  assert.match(english, /including the current tab and pinned tabs/);
  assert.match(english, /right-click within a web page/);
  for (const locale of L.registry) {
    const entry = snapshot.locales[locale.locale];
    assert.equal(entry.storeLocale, locale.stores.chrome, locale.locale);
    assert.equal(entry.englishSourceFingerprint, L.fingerprint(english), locale.locale);
    assert.equal(entry.descriptionFingerprint, L.fingerprint(entry.description), locale.locale);
    assert.match(entry.description.split('\n')[0], /Chrome/, locale.locale);
    assert.doesNotMatch(entry.description, /Firefox|\bEdge\b|<[^>]+>/, locale.locale);
    assert.equal(entry.description.split('\n\n').length, 7, locale.locale);
    assert.equal(listingDescription(locale, 'chrome'), entry.description, locale.locale);
    assert.ok(listing(locale, { ...stores.chrome, key: 'chrome' }).includes('\n' + entry.description + '\n'));
    for (const store of ['firefox', 'edge']) {
      assert.equal(listingDescription(locale, store), fullDescription(L.catalogue(locale.locale)), locale.locale + '/' + store);
    }
  }
});

test('Chrome generation rejects missing or mismatched sources instead of falling back to generic copy', () => {
  const { listingDescription } = require('../scripts/generate-listings');
  assert.throws(() => listingDescription({ locale: 'missing', stores: { chrome: 'missing' } }, 'chrome'), /Missing or mismatched/);
  assert.throws(() => listingDescription({ ...L.localeInfo('nb'), stores: { chrome: 'nb' } }, 'chrome'), /Missing or mismatched/);
});

test('i18n helper selects a browser message and plural fallback', () => {
  const calls = [];
  const context = {
    TabToolsEnglish: L.extensionSource(L.catalogue('en')),
    chrome: {
      i18n: {
        getUILanguage: () => 'fr',
        getMessage: (key, substitutions) => {
          calls.push([key, substitutions]);
          if (key === 'translationLocale') return 'fr';
          if (key === 'openCount_one') return substitutions[0] + ' onglet ouvert';
          if (key === 'openCount_other') return substitutions[0] + ' onglets ouverts';
          return '';
        },
      },
    },
    Intl,
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'src/shared/i18n.js'), 'utf8'),
    context
  );
  assert.equal(context.ttMessage('openCount', { count: 1 }), '1 onglet ouvert');
  assert.equal(context.ttMessage('openCount', { count: 3 }), '3 onglets ouverts');
  assert.deepEqual(calls.map(call => call[0]).filter(key=>key.startsWith('openCount_')), ['openCount_one', 'openCount_other']);
});

test('built packages preserve metadata and contain each browser locale', () => {
  const { spawnSync } = require('node:child_process');
  for (const args of [['build.js'], ['scripts/check-packages.js']]) {
    const result = spawnSync(process.execPath, args, { cwd: L.root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.ok(fs.existsSync(path.join(L.root, 'dist/firefox/_locales/nb/messages.json')));
  assert.ok(!fs.existsSync(path.join(L.root, 'dist/firefox/_locales/no')));
  const invalid = spawnSync(process.execPath, ['build.js', '../outside'], { cwd: L.root, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unknown browser/);
  const manifestFile = path.join(L.root, 'dist/chrome/manifest.json');
  const original = fs.readFileSync(manifestFile, 'utf8');
  try {
    const manifest = JSON.parse(original);
    manifest.version = '0.0.1';
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    const stale = spawnSync(process.execPath, ['scripts/check-packages.js'], { cwd: L.root, encoding: 'utf8' });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /packaged version differs from source/);
    // Any manifest key outside the approved copy fails, not only the permissions list.
    for (const [key, value] of [['host_permissions', ['<all_urls>']], ['content_scripts', [{ matches: ['<all_urls>'], js: ['background.js'] }]], ['incognito', 'split']]) {
      fs.writeFileSync(manifestFile, JSON.stringify({ ...JSON.parse(original), [key]: value }));
      const widened = spawnSync(process.execPath, ['scripts/check-packages.js'], { cwd: L.root, encoding: 'utf8' });
      assert.notEqual(widened.status, 0, key);
      assert.match(widened.stderr, /packaged manifest differs from scripts\/approved-manifests\/chrome\.json/, key);
    }
  } finally {
    fs.writeFileSync(manifestFile, original);
  }
});

function extensionRuntime(locale, uiLanguage=locale, missing=[]) {
  const messages=L.toWebExtensionMessages(locale);
  const context={Intl,chrome:{i18n:{getUILanguage:()=>uiLanguage,getMessage:(key,args=[])=>{
    if(missing.includes(key)) return '';
    const entry=messages[key];
    if(!entry) return '';
    return entry.message.replace(/\$(\w+)\$/g,(_,name)=>args[Number(entry.placeholders[name].content.slice(1))-1]);
  }}}};
  context.globalThis=context;
  for(const file of ['i18n-fallback.js','i18n.js'])vm.runInNewContext(fs.readFileSync(path.join(L.root,'src/shared',file),'utf8'),context);
  return context;
}

test('popup uses its actual catalogue language and direction, including unsupported-language fallback',()=>{
  for(const [locale,ui,dir] of [['he','he','rtl'],['en','ar','ltr'],['ja','ja','ltr']]) {
    const context=extensionRuntime(locale,ui);
    const document={documentElement:{lang:'en'},querySelectorAll:()=>[]};
    context.ttLocalizeDocument(document);
    assert.equal(document.documentElement.lang,locale);
    assert.equal(document.documentElement.dir,dir);
  }
  const fallback=extensionRuntime('en','ar');
  assert.equal(fallback.ttMessage('openCount',{count:0}),'0 open tabs');
  assert.equal(fallback.ttMessage('openCount',{count:1}),'1 open tab');
  assert.equal(fallback.ttMessage('openCount',{count:2}),'2 open tabs');
});

test('plural counts, formatted numbers and missing-message fallback remain readable',()=>{
  const russian=extensionRuntime('ru');
  for(const [count,expected] of [[1,'1 открытая вкладка'],[2,'2 открытые вкладки'],[5,'5 открытых вкладок'],[21,'21 открытая вкладка']]) {
    assert.equal(russian.ttMessage('openCount',{count}),expected);
  }
  const english=extensionRuntime('en');
  assert.equal(english.ttMessage('closedCount',{count:12345}),'Closed: 12,345');
  const fallback=extensionRuntime('he','he',['closeFailed','openCount_two','openCount_other']);
  assert.equal(fallback.ttMessage('closeFailed'),'Failed');
  assert.equal(fallback.ttMessage('openCount',{count:2}),'2 open tabs');
  assert.equal(english.ttMessage('closeSiteLabel',{site:'<test>.example'}),'Close tabs from <test>.example');
});

test('compact popup counters use translated plural forms and unformatted digits in every locale', () => {
  for (const locale of L.registry) {
    const context = extensionRuntime(locale.locale);
    for (const key of ['openCountShort', 'closedCountShort']) {
      for (const count of [0, 1, 2, 5, 14, 21, 2479, 123456]) {
        const category = new Intl.PluralRules(locale.locale).select(count);
        const expected = L.catalogue(locale.locale)[key][category].replace('{count}', String(count));
        assert.equal(context.ttMessage(key, { count }, { formatNumbers: false }), expected, locale.locale + '/' + key + '/' + count);
      }
    }
  }
  const fallback = extensionRuntime('he', 'he', ['closedCountShort_other']);
  assert.equal(fallback.ttMessage('closedCountShort', { count: 2479 }, { formatNumbers: false }), '2479 closed');
});

test('placeholder positions are stable across repetition and translation order',()=>{
  const entry=L.messageEntry('{site}: {count}, {site}', '{count} from {site}');
  assert.equal(entry.placeholders.site.content,'$2');
  assert.equal(entry.placeholders.count.content,'$1');
  assert.equal(entry.message,'$site$: $count$, $site$');
});

test('catalogue validation rejects missing placeholders, plural forms, markup and brands',()=>{
  const {validateCatalogue}=require('../scripts/catalogue-validation');
  const source=L.catalogue('en');
  // German, with any string it has not translated yet taken from English, so
  // this test does not depend on whether translations are pending.
  const fresh=()=>({...structuredClone(source),...structuredClone(L.catalogue('de'))});
  assert.deepEqual(validateCatalogue(source,fresh(),'de'),[]);
  let c=fresh();c.closedCount='Geschlossen';
  assert.ok(validateCatalogue(source,c,'de').some(error=>error.includes('changed placeholders')));
  c=fresh();delete c.openCount.one;
  assert.ok(validateCatalogue(source,c,'de').some(error=>error.includes('missing plural one')));
  c=fresh();c.web_heroTitle='<img src=x onerror="bad()">';
  assert.ok(validateCatalogue(source,c,'de').some(error=>error.includes('unsupported markup')));
  c=fresh();c.web_heroTitle='<em>unclosed';
  assert.ok(validateCatalogue(source,c,'de').some(error=>error.includes('unbalanced markup')));
  c=fresh();c.extensionName='Different brand';
  assert.ok(validateCatalogue(source,c,'de').some(error=>error.includes('missing brand/domain TabTools')));
});

test('review command updates only the explicitly reviewed key',()=>{
  const os=require('node:os');const {spawnSync}=require('node:child_process');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tabtools-review-'));
  try {
    fs.cpSync(path.join(L.root,'scripts'),path.join(directory,'scripts'),{recursive:true});
    for(const name of ['registry.json','locales/en.json','locales/de.json','reviews/de.json']) {
      const target=path.join(directory,'localisation',name);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(L.root,'localisation',name),target);
    }
    const file=path.join(directory,'localisation/reviews/de.json');
    const before=JSON.parse(fs.readFileSync(file,'utf8'));
    for(const args of [['scripts/review-translation.js','de','settings','Test reviewer','Terminology checked'],['scripts/review-locales.js','de','settings']]) {
      const result=spawnSync(process.execPath,args,{cwd:directory,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    }
    const after=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(after.settings.source,L.sourceFingerprint('settings'));
    assert.equal(after.settings.translation,L.fingerprint(L.catalogue('de').settings));
    assert.equal(after.settings.note,'Terminology checked');
    delete before.settings;delete after.settings;
    assert.deepEqual(after,before);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
