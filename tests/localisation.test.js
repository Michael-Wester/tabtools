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

test('i18n helper selects a browser message and plural fallback', () => {
  const calls = [];
  const context = {
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

test('placeholder positions are stable across repetition and translation order',()=>{
  const entry=L.messageEntry('{site}: {count}, {site}', '{count} from {site}');
  assert.equal(entry.placeholders.site.content,'$2');
  assert.equal(entry.placeholders.count.content,'$1');
  assert.equal(entry.message,'$site$: $count$, $site$');
});

test('catalogue validation rejects missing placeholders, plural forms, markup and brands',()=>{
  const {validateCatalogue}=require('../scripts/catalogue-validation');
  const source=L.catalogue('en');
  const fresh=()=>structuredClone(L.catalogue('de'));
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
