// SPDX-License-Identifier: MPL-2.0
const L = require('../scripts/localisation');
const check = process.argv.includes('--check');
const template = L.fs.readFileSync(L.path.join(__dirname,'src/index.html'),'utf8');
const richKeys = new Set(['web_heroTitle','web_featuresTitle','web_workflowTitle','web_privacyTitle','web_finalTitle','web_siteBody']);
function rich(value) {
  return L.escape(value).replace(/&lt;(\/?)(em|strong)&gt;/g,(_,end,tag) => `<${end}${tag==='em'?'span':tag}>`).replaceAll('&lt;br&gt;','<br />');
}
function browserCopy(value,browser) {
  return L.escape(value).replace('{browser}',`<span class="browser-button-name" data-browser-name>${L.escape(browser)}</span>`);
}
const requested=process.argv.indexOf('--locale');
const targets=requested<0?L.registry:L.registry.filter(l=>l.locale===process.argv[requested+1]);
if(!targets.length)throw new Error('Unknown locale');
for (const locale of targets) {
  const data=L.catalogue(locale.locale), canonical=L.urlFor(locale);
  const alternates = [...L.registry.map(item => `<link rel="alternate" hreflang="${item.hreflang}" href="${L.urlFor(item)}" />`),'<link rel="alternate" hreflang="x-default" href="https://tabtools.fyi/" />'].join('\n    ');
  const pageData = `<script type="application/json" id="locale-data">${JSON.stringify({locale:locale.locale,registry:L.registry.map(l=>({locale:l.locale,path:'/'+(l.website?l.website+'/':''),nativeName:l.nativeName})),messages:Object.fromEntries(Object.entries(data).filter(([key])=>key.startsWith('web_')))}).replaceAll('<','\\u003c')}</script>`;
  const structuredData = `<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication',name:'TabTools',url:canonical,description:data.web_structuredDescription,inLanguage:locale.locale,applicationCategory:'BrowserApplication',isAccessibleForFree:true}).replaceAll('<','\\u003c')}</script>`;
  const options=L.registry.map(l=>`<option lang="${l.locale}" value="/${l.website?l.website+'/':''}"${l.locale===locale.locale?' selected':''}>${L.escape(l.nativeName)}</option>`).join('');
  const languageSelector=`<label class="language-picker"><span class="sr-only">${L.escape(data.web_language)}</span><select data-language-select aria-label="${L.escape(data.web_language)}">${options}</select></label>`;
  const special={locale:locale.locale,direction:locale.direction,canonical,alternates,pageData,structuredData,languageSelector};
  const html=template.replace(/{{(\w+)(?::([^}]+))?}}/g,(_,key,arg)=>{
    if (key in special)return special[key];
    const value=data[key];
    if (typeof value!=='string') throw new Error(`Missing website message ${locale.locale}:${key}`);
    if(key==='web_addTo')return browserCopy(value,arg);
    if(key==='web_storeNote')return L.escape(value.replace('{store}',arg));
    return richKeys.has(key)?rich(value):L.escape(value);
  });
  L.write(`website/dist/${locale.website?locale.website+'/':''}index.html`,html,check);
}
for(const file of ['script.js','styles.css']) L.write('website/dist/'+file,L.fs.readFileSync(L.path.join(__dirname,'src',file),'utf8'),check);
L.write('website/dist/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+L.registry.map(l=>`  <url><loc>${L.urlFor(l)}</loc></url>`).join('\n')+'\n</urlset>\n',check);
console.log(`Generated/checked ${targets.length} static pages.`);
