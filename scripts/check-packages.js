// SPDX-License-Identifier: MPL-2.0
const L=require('./localisation');
function files(dir) {return L.fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(L.path.join(dir,f.name)):[L.path.join(dir,f.name)]);}
for(const browser of ['chrome','firefox','edge']) {
 const directory=L.path.join(L.root,'dist',browser),manifest=L.read(`dist/${browser}/manifest.json`);
 const baseline=L.read(`localisation/baseline/${browser}-manifest.json`);
 for(const field of ['manifest_version','version','permissions','browser_specific_settings']) {
  if(JSON.stringify(manifest[field])!==JSON.stringify(baseline[field]))throw new Error(`${browser}: changed ${field}`);
 }
 const localeDirs=L.fs.readdirSync(L.path.join(directory,'_locales'));
 if(localeDirs.length!==L.registry.length)throw new Error(`${browser}: unexpected locale count`);
 for(const locale of L.registry) {
  const code=browser==='firefox'?locale.firefoxExtension:locale.extension;
  const actual=L.read(`dist/${browser}/_locales/${code}/messages.json`);
  if(JSON.stringify(actual)!==JSON.stringify(L.messages(L.catalogue(locale.locale),locale)))throw new Error(`${browser}/${code}: locale mismatch`);
 }
 const entries=files(directory);
 if(entries.some(f=>/marketing|baseline|COVERAGE|reviews/.test(f)))throw new Error('Non-runtime material in package');
 for(const ref of [manifest.background.service_worker,...(manifest.background.scripts||[]),(manifest.action||manifest.browser_action).default_popup].filter(Boolean)) {
  if(!L.fs.existsSync(L.path.join(directory,ref)))throw new Error(`Missing ${browser} resource ${ref}`);
 }
 const bytes=entries.reduce((sum,f)=>sum+L.fs.statSync(f).size,0);
 console.log(`${browser}: ${entries.length} runtime files, ${L.registry.length} locales, ${bytes} uncompressed bytes`);
}
