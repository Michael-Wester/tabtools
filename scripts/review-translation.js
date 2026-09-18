// SPDX-License-Identifier: MPL-2.0
// Record a deliberate review of ONE key; generation never changes fingerprints.
const L=require('./localisation');
const [locale,key,reviewer,...notes]=process.argv.slice(2);
if(!locale||!key||!reviewer||!notes.length||locale==='en')throw new Error('Usage: node scripts/review-translation.js LOCALE KEY REVIEWER "specific review note"');
if(!L.registry.some(l=>l.locale===locale)||!(key in L.english))throw new Error('Unknown locale or key');
const translation=L.catalogue(locale)[key];
if(!translation)throw new Error('Missing translation; write and review it first');
const file=`localisation/reviews/${locale}.json`;
const reviews=L.read(file);
reviews[key]={...reviews[key],source:L.hash(L.english[key]),translation:L.hash(translation),review:reviewer,note:notes.join(' '),date:new Date().toISOString().slice(0,10)};
L.write(file,L.json(reviews));
console.log(`Recorded review of ${locale}:${key}. Run validation; this command does not certify linguistic accuracy.`);
