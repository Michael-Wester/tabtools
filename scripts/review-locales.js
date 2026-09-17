// SPDX-License-Identifier: MPL-2.0
// Explicit acknowledgement AFTER reviewing the supplied keys. Never run in CI.
const L=require('./localisation');
const [locale,...keys]=process.argv.slice(2);
if(!L.registry.some(l=>l.locale===locale)||!keys.length)throw new Error('Usage: node scripts/review-locales.js LOCALE KEY [KEY ...]');
const data=L.catalogue(locale);
let reviews={};try{reviews=L.read(`localisation/reviews/${locale}.json`);}catch(_){}
for(const key of keys){
 if(!(key in L.english)||!(key in data))throw new Error(`Unknown or missing key ${key}`);
 reviews[key]={source:L.hash(L.english[key]),translation:L.hash(data[key]),review:'AI-authored and AI self-reviewed; no native-speaker review',date:new Date().toISOString().slice(0,10)};
}
L.write(`localisation/reviews/${locale}.json`,L.json(reviews));
