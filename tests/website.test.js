// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const L = require('../scripts/localisation');
const script = L.fs.readFileSync(L.path.join(L.root, 'website/src/script.js'), 'utf8');

// Run the real website script against a small DOM adapter. This checks event
// behaviour, not rendering; actual browser verification is recorded separately.
function pageRuntime(locale, preferences = ['en'], saved, ua = 'Chrome/140', pageSuffix = '') {
  const storage = new Map(saved ? [['tabtools-site-language', saved]] : []);
  const element = () => ({dataset:{},children:[],events:{},hidden:true,_text:'',
    get textContent(){return this.children.length ? this.children.map(x=>x.textContent).join('') : this._text;},
    set textContent(value){this._text=value;this.children=[];},
    setAttribute(k,v){this[k]=v;},addEventListener(k,v){this.events[k]=v;},
    append(v){this.children.push(v);},replaceChildren(...v){this.children=v;},
    focus(){this.focused=true;document.activeElement=this;},
    scrollIntoView(){this.scrolled=true;},
    hasAttribute(k){return k==='data-adaptive-store';},
    querySelector(k){return this.parts?.[k] || (k==='a'?this.children.find(child=>child.dataset?.locale):null) || null;}});
  const picker=element(), trigger=element(), menu=element(), flag=element(), name=element();
  const note=element(), toggle=element(), label=element(), storeNote=element();
  picker.parts={'[data-language-trigger]':trigger,'[data-language-menu]':menu};
  trigger.parts={'[data-language-flag-image]':flag,'[data-language-name]':name};
  const copy=element(), icon=element(), store=element();
  store.dataset={store:'chrome',utmPlacement:'hero'};
  store.parts={'[data-browser-copy]':copy,'[data-browser-icon]':icon};
  store.textContent='Add to Chrome';
  const options=L.presentationRegistry.map(l=>{
    const option=element();
    option.dataset={locale:l.locale};
    option.href=l.path+pageSuffix;
    option.textContent=l.languageName;
    return option;
  });
  picker.contains=node=>node===trigger || node===menu || options.includes(node);
  menu.hidden=true;
  const data={locale,registry:L.presentationRegistry.map(l=>({locale:l.locale,path:l.path+pageSuffix,languageName:l.languageName,flagAsset:l.flagAsset})),messages:L.catalogue(locale)};
  const document={documentElement:{dataset:{},lang:locale},
    getElementById:()=>({textContent:JSON.stringify(data)}),
    querySelector:s=>({'[data-language-picker]':picker,'[data-language-trigger]':trigger,'[data-language-menu]':menu,'[data-language-suggestion]':note,'[data-theme-toggle]':toggle,'[data-theme-label]':label,'[data-store-note]':storeNote}[s]||null),
    querySelectorAll:s=>s==='[data-store]'?[store]:(s==='[data-language-option]'?options:[]),
    createElement:element,createTextNode:text=>({textContent:text})};
  const navigation=[];
  const windowEvents={};
  const location={search:'?campaign=test',hash:'#faq',assign:url=>navigation.push(url)};
  const context={document,URL,navigator:{languages:preferences,userAgent:ua},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    window:{location,addEventListener:(type,handler)=>{windowEvents[type]=handler;}}};
  vm.runInNewContext(script,context);
  return {document,picker,trigger,menu,flag,name,options,note,toggle,label,store,copy,icon,storeNote,storage,navigation,windowEvents,location};
}

test('explicit language URLs are never replaced by saved or browser preferences',()=>{
  const p=pageRuntime('ja',['fr'],'de');
  assert.equal(p.document.documentElement.lang,'ja');
  assert.deepEqual(p.navigation,[]);
  assert.equal(p.note.children[0].href,'/de/?campaign=test#faq');
  assert.match(p.note.children[0].textContent,/German/);
});
test('flag language picker remembers the choice and preserves queries and anchors',()=>{
  const p=pageRuntime('en');
  assert.equal(p.trigger['aria-label'],`${L.catalogue('en').web_language}: English`);
  assert.equal(p.flag.src,'/assets/flags/en.svg');
  p.trigger.events.click();
  assert.equal(p.menu.hidden,false);
  const option=p.options.find(item=>item.dataset.locale==='he');
  option.events.click({preventDefault(){}});
  assert.equal(p.storage.get('tabtools-site-language'),'he');
  assert.deepEqual(p.navigation,['/he/?campaign=test#faq']);
});
test('language suggestions resolve aliases and retain meaningful variants',()=>{
  for(const [pref,wanted] of [['de-AT','/de/'],['no-NO','/nb/'],['zh-Hant-HK','/zh-tw/'],['zh-Hans-SG','/zh-cn/'],['pt-BR','/pt-br/'],['pt-PT','/pt-pt/'],['pt',null],['zh',null],['xx',null]]) {
    const p=pageRuntime('ja',[pref]);
    if(wanted)assert.equal(p.note.children[0].href,wanted+'?campaign=test#faq',pref);
    else assert.equal(p.note.hidden,true,pref);
    assert.deepEqual(p.navigation,[]);
  }
});
test('localised theme toggles and browser buttons preserve store tracking',()=>{
  const p=pageRuntime('he',['he'],undefined,'Edg/140');
  assert.equal(p.note.hidden,true);
  assert.equal(p.document.documentElement.dataset.theme,'light');p.toggle.events.click();
  assert.equal(p.document.documentElement.dataset.theme,'dark');
  assert.equal(p.toggle['aria-label'],L.catalogue('he').web_switchLight);
  const url=new URL(p.store.href);
  assert.equal(url.hostname,'microsoftedge.microsoft.com');
  assert.equal(url.searchParams.get('utm_content'),'hero_edge');
  assert.equal(url.searchParams.get('utm_source'),'tabtools.fyi');
  assert.equal(p.icon.src,'/assets/browsers/edge.svg');
  assert.equal(p.copy.children.map(n=>n.textContent).join(''),L.catalogue('he').web_addTo.replace('{browser}','Edge'));
});
test('all generated pages have reciprocal SEO metadata, valid anchors and assets',()=>{
  const expected=L.registry.map(L.urlFor);
  const sitemap=L.fs.readFileSync(L.path.join(L.root,'website/dist/sitemap.xml'),'utf8');
  for(const url of expected)assert.ok(sitemap.includes(`<loc>${url}</loc>`));
  assert.doesNotMatch(sitemap,/pages\.dev|chatgpt\.site/);
  for(const locale of L.registry) {
    const file=L.path.join(L.root,'website/dist',locale.website,'index.html');
    const html=L.fs.readFileSync(file,'utf8');
    assert.ok(html.includes(`<html lang="${locale.canonical}" dir="${locale.direction}">`));
    assert.equal((html.match(/data-language-option/g) || []).length, L.registry.length, `${locale.locale}: language options`);
    assert.ok(html.includes('<span class="language-option-name" lang="en" dir="ltr">English</span>'));
    const order=[...html.matchAll(/data-language-option data-locale="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(order,L.presentationRegistry.map(item=>item.locale),`${locale.locale}: language order`);
    assert.match(html,new RegExp('class="language-trigger"[^>]+aria-label="[^"]+: ' +
      L.escape(locale.languageName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    assert.match(html,/class="language-flag language-flag-current"/);
    assert.ok(html.includes('src="/assets/flags/en.svg"'));
    assert.doesNotMatch(html,/class="language-option-name"[^>]*>[^<]*(Čeština|Deutsch|Ελληνικά|עברית|日本語|한국어|Русский|Українська|中文)/);
    assert.doesNotMatch(html,/English \(British\)|en-GB|en-gb/);
    assert.ok(html.includes(`<link rel="canonical" href="${L.urlFor(locale)}" />`));
    for(const alt of L.registry)assert.ok(html.includes(`hreflang="${alt.hreflang}" href="${L.urlFor(alt)}"`));
    assert.ok(html.includes('hreflang="x-default" href="https://tabtools.fyi/"'));
    assert.ok(html.includes(`<title>${L.escape(L.catalogue(locale.locale).web_tabtools_close_tabs_by_site)}</title>`));
    assert.ok(html.includes(`<h3>${L.escape(L.catalogue(locale.locale).openTabTools)}</h3>`), `${locale.locale}: instructional labels are translated`);
    const addToParts = L.catalogue(locale.locale).web_addTo.split('{browser}');
    assert.equal(addToParts.length, 2);
    const chromeButton = `<span class="browser-button-copy" data-browser-copy="Chrome">${L.escape(addToParts[0])}<span class="browser-button-name" data-browser-name>Chrome</span>${L.escape(addToParts[1])}</span>`;
    assert.ok(html.includes(chromeButton), `${locale.locale}: browser label placeholder is positioned correctly`);
    assert.ok(html.includes(`<p>${L.escape(L.catalogue(locale.locale).web_close_tabs_by_site_sort_2)}</p>`), `${locale.locale}: footer tagline is translated as a complete message`);
    assert.ok(html.includes(`<span class="footer-label">${L.escape(L.catalogue(locale.locale).web_product)}</span>`), `${locale.locale}: footer labels are not partially replaced`);
    assert.doesNotMatch(html,/{{\w+}}|__MSG_/);
    assert.match(html, /id="language-menu"[^>]*role="listbox"/);
    assert.match(html, /<img[^>]*data-language-flag-image[^>]*alt=""/);
    const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
    for(const m of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(m[1]),`${locale.locale}: ${m[1]}`);
    for(const m of html.matchAll(/(?:src|href)="(\/[^"?]+)"/g))assert.ok(L.fs.existsSync(L.path.join(L.root,'website/dist',m[1])),m[1]);
    const pageData=JSON.parse(html.match(/id="locale-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(pageData.locale,locale.locale);
    const structured=JSON.parse(html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(structured.inLanguage,locale.locale);assert.equal(structured.url,L.urlFor(locale));
    assert.equal([...html.matchAll(/data-store="/g)].length,13);
  }
});

test('YouTube demo delegates only the playback controls it uses',()=>{
  const expectedAllow='picture-in-picture; fullscreen';
  for(const locale of L.registry) {
    const file=L.path.join(L.root,'website/dist',locale.website,'index.html');
    const html=L.fs.readFileSync(file,'utf8');
    const iframe=html.match(/<iframe class="product-video"[\s\S]*?<\/iframe>/)?.[0];
    assert.ok(iframe,`${locale.locale}: YouTube demo iframe`);
    assert.equal(iframe.match(/\ballow="([^"]+)"/)?.[1],expectedAllow,`${locale.locale}: iframe Permissions Policy`);
    assert.match(iframe,/\ballowfullscreen\b/,`${locale.locale}: iframe fullscreen support`);
  }
});

test('all locales expose native language navigation when JavaScript is disabled', () => {
  const css = L.fs.readFileSync(L.path.join(L.root,'website/dist/no-script.css'),'utf8');
  assert.match(css, /\.theme-toggle,[\s\S]*\.language-picker[\s\S]*display:\s*none/);
  for (const locale of L.registry) {
    const html = L.fs.readFileSync(L.path.join(L.root,'website/dist',locale.website,'index.html'),'utf8');
    assert.ok(html.includes('<noscript><link rel="stylesheet" href="/no-script.css" /></noscript>'), locale.locale);
    const fallback = html.match(/<noscript><details class="language-fallback">([\s\S]*?)<\/details><\/noscript>/)?.[1];
    assert.ok(fallback, `${locale.locale}: native language fallback`);
    assert.match(fallback, /<summary class="language-fallback-trigger" aria-label="[^"]+">/);
    const routes = [...fallback.matchAll(/class="language-fallback-option" href="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(routes, L.presentationRegistry.map(item=>item.path), locale.locale);
    assert.equal((fallback.match(/aria-current="page"/g) || []).length, 1, locale.locale);
    assert.doesNotMatch(fallback, /tabindex="-1"|data-language-option/, locale.locale);
  }
});

test('localized homepages retain main guide links, social previews and skip-link focus targets',()=>{
  const guideRoutes = [
    '/guides/',
    '/guides/close-tabs-from-same-website/',
    '/guides/sort-tabs-by-website/',
    '/guides/close-duplicate-tabs/',
  ];
  const sitemap = L.fs.readFileSync(L.path.join(L.root,'website/dist/sitemap.xml'),'utf8');
  for (const route of guideRoutes) {
    assert.ok(L.fs.existsSync(L.path.join(L.root,'website/dist',route,'index.html')), route);
    assert.ok(sitemap.includes(`<loc>https://tabtools.fyi${route}</loc>`), route);
  }
  for (const locale of L.registry) {
    const html = L.fs.readFileSync(L.path.join(L.root,'website/dist',locale.website,'index.html'),'utf8');
    for (const route of guideRoutes) assert.ok(html.includes(`href="${locale.path}${route.slice(1)}"`), `${locale.locale}: ${route}`);
    assert.match(html, /<main id="main-content" tabindex="-1">/, locale.locale);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/, locale.locale);
    for (const attribute of ['property="og:image"', 'name="twitter:image"']) {
      assert.ok(html.includes(`<meta ${attribute} content="https://tabtools.fyi/assets/tabtools-demo-menu-poster.jpg" />`), locale.locale);
    }
  }
});

test('selector follows keyboard focus and dismisses on Tab/outside focus without trapping it', () => {
  const p=pageRuntime('en');
  const key=key=>({key,preventDefault(){}});
  p.trigger.events.keydown(key('ArrowDown'));
  assert.equal(p.menu.hidden,false);
  assert.equal(p.document.activeElement,p.options[0]);
  p.options[0].events.keydown(key('End'));
  assert.equal(p.document.activeElement,p.options.at(-1));
  assert.equal(p.options.at(-1).tabIndex,0);
  p.options.at(-1).events.keydown(key('ArrowDown'));
  assert.equal(p.document.activeElement,p.options[0]);
  p.options[0].events.keydown(key('Escape'));
  assert.equal(p.menu.hidden,true);
  assert.equal(p.document.activeElement,p.trigger);
  p.trigger.events.click();
  p.options[0].events.keydown({key:'Tab',shiftKey:true,preventDefault(){}});
  assert.equal(p.menu.hidden,true);
  assert.equal(p.document.activeElement,p.trigger);
  p.trigger.events.click();
  p.picker.events.focusout({relatedTarget:p.options[1]});
  assert.equal(p.menu.hidden,false);
  p.picker.events.focusout({relatedTarget:p.toggle});
  assert.equal(p.menu.hidden,true);
  assert.equal(p.trigger['aria-expanded'],'false');
});

test('matching saved or first browser preference suppresses contradictory suggestions', () => {
  assert.equal(pageRuntime('de',['en','fr'],'de').note.hidden,true);
  assert.equal(pageRuntime('de',['de','en']).note.hidden,true);
  const p=pageRuntime('ja',['xx','fr']);
  assert.equal(p.note.children[0].href,'/fr/?campaign=test#faq');
  const label=p.note.children[0].children[1];
  assert.equal(label.lang,'en');
  assert.equal(label.dir,'ltr');
  assert.equal(label.textContent,'French');
  p.note.children[0].events.click({});
  assert.equal(p.storage.get('tabtools-site-language'),'fr');
});

test('selecting the current language dismisses stale suggestions and restores focus before same-document navigation', () => {
  const p=pageRuntime('es',['en']);
  assert.equal(p.note.hidden,false);
  p.trigger.events.click();
  p.options.find(option=>option.dataset.locale==='es').events.click({preventDefault(){}});
  assert.equal(p.storage.get('tabtools-site-language'),'es');
  assert.equal(p.note.hidden,true);
  assert.equal(p.menu.hidden,true);
  assert.equal(p.document.activeElement,p.trigger);
  assert.deepEqual(p.navigation,['/es/?campaign=test#faq']);
});

test('modified language links keep normal browser navigation and the URL suffix', () => {
  const p=pageRuntime('en');
  const option=p.options.find(item=>item.dataset.locale==='de');
  option.events.click({ctrlKey:true,preventDefault(){assert.fail('new-tab click intercepted');}});
  assert.equal(option.href,'/de/?campaign=test#faq');
  assert.deepEqual(p.navigation,[]);
  assert.equal(p.storage.get('tabtools-site-language'),undefined);
});

test('language hrefs follow in-page navigation before native new-tab actions', () => {
  const p=pageRuntime('en',['de']);
  const option=p.options.find(item=>item.dataset.locale==='de');
  const suggestion=p.note.children[0];
  p.location.hash='#features';
  p.windowEvents.hashchange();
  assert.equal(option.href,'/de/?campaign=test#features');
  assert.equal(suggestion.href,option.href);
  p.location.search='?campaign=back';
  p.location.hash='#privacy';
  p.windowEvents.popstate();
  assert.equal(option.href,'/de/?campaign=back#privacy');
  assert.equal(suggestion.href,option.href);
  p.location.hash='#how-it-works';
  p.trigger.events.click();
  assert.equal(option.href,'/de/?campaign=back#how-it-works');
  suggestion.events.click({ctrlKey:true,preventDefault(){assert.fail('native click intercepted');}});
  assert.equal(suggestion.href,option.href);
  assert.equal(p.storage.get('tabtools-site-language'),undefined);
  assert.deepEqual(p.navigation,[]);
});

test('website translation output escapes text and permits only supported rich markup', () => {
  const {applyTranslations}=require('../scripts/generate-website');
  const template=L.fs.readFileSync(L.path.join(L.root,'website/src/template.html'),'utf8');
  const catalogue=L.catalogue('fr');
  const original=catalogue.web_heroTitle;
  try {
    catalogue.web_heroTitle='<em>Safe</em><img src=x onerror="bad()"> & text';
    const html=applyTranslations(template,L.localeInfo('fr'));
    assert.ok(html.includes('<span>Safe</span>&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; text'));
    assert.ok(!html.includes('<img src=x'));
  } finally { catalogue.web_heroTitle=original; }
});

test('English wording changes bind by key without changing the template', () => {
  const {applyTranslations}=require('../scripts/generate-website');
  const template=L.fs.readFileSync(L.path.join(L.root,'website/src/template.html'),'utf8');
  const catalogue=L.catalogue('en');
  const original=catalogue.web_free_browser_tab_manager;
  try {
    catalogue.web_free_browser_tab_manager='A revised English description';
    const html=applyTranslations(template,L.localeInfo('en'));
    assert.ok(html.includes('A revised English description</p>'));
    delete catalogue.web_free_browser_tab_manager;
    assert.throws(()=>applyTranslations(template,L.localeInfo('en')),/Missing website message/);
  } finally {catalogue.web_free_browser_tab_manager=original;}
});


test('guide language choices preserve the index or article plus the current query and anchor', () => {
  const guideSlugs = require('../website/guides-content.cjs').map(guide => guide.slug);
  for (const current of ['en', 'zh-CN', 'zh-TW']) {
    for (const slug of ['', ...guideSlugs]) {
      const suffix = 'guides/' + (slug ? slug + '/' : '');
      for (const target of L.registry) {
        const p = pageRuntime(current, ['fr'], undefined, 'Chrome/140', suffix);
        assert.deepEqual(p.navigation, [], 'Never redirect an explicitly opened guide');
        p.location.hash = slug ? '#use-the-popup' : '#main-content';
        p.windowEvents.hashchange();
        const option = p.options.find(item => item.dataset.locale === target.locale);
        const expected = target.path + suffix + '?campaign=test' + p.location.hash;
        assert.equal(option.href, expected, 'Native modified-click href keeps the guide');
        option.events.click({ preventDefault() {} });
        assert.deepEqual(p.navigation, [expected]);
        assert.equal(p.storage.get('tabtools-site-language'), target.locale);
      }
    }
  }
});

test('fully translated guides retain canonical, alternate and native same-page language links', () => {
  const G = require('../website/guide-localisation.cjs');
  const slugs = ['', ...G.source.guides.map(guide => guide.slug)];
  for (const locale of L.registry) {
    const translated = G.catalogue(locale.locale);
    assert.equal(translated.guides.length, G.source.guides.length);
    for (const slug of slugs) {
      const route = G.routeFor(locale, slug);
      const html = L.fs.readFileSync(L.path.join(L.root, 'website/dist', route, 'index.html'), 'utf8');
      assert.ok(html.includes(`<html lang="${locale.canonical}" dir="${locale.direction}">`));
      assert.ok(html.includes(`<link rel="canonical" href="https://tabtools.fyi${route}" />`));
      assert.ok(html.includes(`hreflang="x-default" href="https://tabtools.fyi${G.routeFor('en', slug)}"`));
      const data = JSON.parse(html.match(/id="locale-data">([\s\S]*?)<\/script>/)[1]);
      assert.equal(data.locale, locale.locale);
      const languageLinks = [...html.matchAll(/class="language-option"[^>]*data-locale="([^"]+)"[^>]*href="([^"]+)"/g)];
      assert.equal(languageLinks.length, L.registry.length);
      for (const target of L.registry) {
        const counterpart = G.routeFor(target, slug);
        assert.ok(html.includes(`hreflang="${target.hreflang}" href="https://tabtools.fyi${counterpart}"`));
        assert.equal(data.registry.find(item => item.locale === target.locale).path, counterpart);
        assert.equal(languageLinks.find(match => match[1] === target.locale)?.[2], counterpart);
        assert.ok(html.includes(`class="language-fallback-option" href="${counterpart}"`));
      }
      if (slug) {
        const guide = translated.guides.find(item => item.slug === slug);
        assert.ok(html.includes(`<h1>${L.escape(guide.title)}</h1>`));
        assert.ok(html.includes(`<p>${L.escape(guide.answer)}</p>`));
        for (const section of guide.sections) assert.ok(html.includes(`<section id="${section.id}"><h2>${L.escape(section.title)}</h2>`));
        if (locale.locale !== 'en') assert.ok(html.includes(`<p class="guide-screenshot-note">${L.escape(translated.ui.screenshotNote)}</p>`));
      }
    }
  }
});

test('guide translations reject stale, missing, untranslated or unsafe content before generation', () => {
  const G = require('../website/guide-localisation.cjs');
  const original = G.catalogue('zh-CN');
  for (const [mutate, message] of [
    [value => { value.sourceFingerprint = 'stale'; }, /stale English source/],
    [value => { delete value.ui.readGuide; }, /UI keys differ/],
    [value => { value.ui.readTime = 'no duration placeholder'; }, /placeholders/],
    [value => { value.guides[0].sections.pop(); }, /missing section/],
    [value => { value.guides[0].answer = G.source.guides[0].answer; }, /untranslated/],
    [value => { value.guides[0].sections[0].id = 'different-anchor'; }, /changed section anchor/],
    [value => { value.guides[0].sections[0].html += '<script>alert(1)</script>'; }, /altered HTML/],
    [value => { value.guides[0].sections[0].html = value.guides[0].sections[0].html.replace('href=', 'onclick="alert(1)" href='); }, /altered HTML/]
  ]) {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => G.validateTranslation(value, 'zh-CN'), message);
  }
});


test('adding an untranslated English guide invalidates existing translation catalogues', () => {
  const G = require('../website/guide-localisation.cjs');
  const value = structuredClone(G.catalogue('zh-CN'));
  const added = structuredClone(G.source.guides[0]);
  added.slug = 'new-untranslated-guide';
  G.source.guides.push(added);
  try {
    // Shape validation is an additional guard even if someone mistakenly
    // copies the current fingerprint without translating the new article.
    assert.throws(() => G.validateTranslation(value, 'zh-CN'), /missing guide/);
  } finally {
    G.source.guides.pop();
  }
});
