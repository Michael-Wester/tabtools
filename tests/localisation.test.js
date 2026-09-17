// SPDX-License-Identifier: MPL-2.0
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const L=require('../scripts/localisation');
const source=L.fs.readFileSync(L.path.join(L.root,'src/shared/i18n.js'),'utf8');
function runtime(locale, missing=[]) {
 const data=L.catalogue(locale), registry=L.registry.find(l=>l.locale===locale), messages=L.messages(data,registry);
 const context={Intl,TabToolsEnglish:L.english,chrome:{i18n:{getMessage(key,subs=[]) {
   if(missing.includes(key)||!messages[key])return '';
   if(typeof subs==='string')subs=[subs];
   const message=messages[key];
   return message.message.replace(/\$(\w+)\$/g,(_,name)=>subs[Number(message.placeholders[name].content.slice(1))-1]);
 }}}};vm.createContext(context);vm.runInContext(source,context);return context.TabToolsI18n;
}
test('native catalogues resolve the translation locale and direction',()=>{
 assert.equal(runtime('he').direction,'rtl');assert.equal(runtime('ja').locale,'ja');
});
test('plural rules use the selected translation language',()=>{
 const de=runtime('de'),ja=runtime('ja');
 assert.equal(de.plural('openCount',1),'1 offener Tab');
 assert.equal(de.plural('openCount',2),'2 offene Tabs');
 assert.equal(ja.plural('openCount',2),'開いているタブ: 2');
});
test('missing native messages use English with English plural rules',()=>{
 const i=runtime('de',['closeSiteLabel','openCount_one','openCount_other']);
 assert.equal(i.t('closeSiteLabel',{site:'example.com'}),'Close tabs from example.com');
 assert.equal(i.plural('openCount',1),'1 open tab');assert.equal(i.plural('openCount',2),'2 open tabs');
});
test('interpolation preserves user content as a literal value',()=>{
 assert.equal(runtime('de').t('closeSiteLabel',{site:'<img src=x onerror=alert(1)>'}),'Tabs von <img src=x onerror=alert(1)> schließen');
 // The view uses textContent/setAttribute, never translation innerHTML.
 assert.doesNotMatch(source,/innerHTML/);
});
test('changed English text invalidates existing reviews without changing keys',()=>{
 const locale=L.registry.find(l=>l.locale==='de');const data=L.catalogue('de');
 const original=L.english.settings;
 try{L.english.settings+=' changed';assert.ok(L.issuesFor(locale,data).errors.includes('stale/unreviewed: settings'));}
 finally{L.english.settings=original;}
});
test('tampered translations and placeholder omissions fail validation',()=>{
 const locale=L.registry.find(l=>l.locale==='de');const data=L.catalogue('de');data.closeSiteLabel='Schließen';
 assert.ok(L.issuesFor(locale,data).errors.includes('placeholders: closeSiteLabel'));
 assert.ok(L.issuesFor(locale,data).errors.includes('stale/unreviewed: closeSiteLabel'));
});
test('store text agrees exactly with manifest-derived messages',()=>{
 for(const locale of ['en','de','ja','he']) {
  const data=L.catalogue(locale),fields=L.listing(data),messages=L.messages(data,L.registry.find(l=>l.locale===locale));
  assert.equal(fields.name,messages.extensionName.message);assert.equal(fields.summary,messages.extensionDescription.message);
  assert.ok(fields.description.length>=250);assert.doesNotMatch(fields.description,/<\/?(?:strong|em)>/);
 }
});
