// SPDX-License-Identifier: MPL-2.0
// Explicit acknowledgement AFTER reviewing the supplied keys. Never run in CI.
const L=require('./localisation');
const [locale,...keys]=process.argv.slice(2);
if(!L.registry.some(l=>l.locale===locale)||!keys.length)throw new Error('Usage: node scripts/review-locales.js LOCALE KEY [KEY ...]');
const data=L.catalogue(locale);
const file=L.path.join(L.root,'localisation/reviews',locale+'.json');
const reviews=JSON.parse(L.fs.readFileSync(file,'utf8'));
for(const key of keys){
 if(!(key in L.catalogue('en'))||!(key in data))throw new Error(`Unknown or missing key ${key}`);
 reviews[key]={...reviews[key],source:L.sourceFingerprint(key),translation:L.fingerprint(data[key]),review:'AI-authored and AI self-reviewed; no native-speaker review',date:new Date().toISOString().slice(0,10)};
}
L.fs.writeFileSync(file,JSON.stringify(reviews,null,2)+'\n');
