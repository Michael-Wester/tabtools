// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const L = require('../scripts/localisation');
const script = L.fs.readFileSync(L.path.join(L.root, 'website/src/script.js'), 'utf8');

// Run the real website script against a small DOM adapter. This checks event
// behaviour, not rendering; actual browser verification is recorded separately.
function pageRuntime(locale, preferences = ['en'], saved, ua = 'Chrome/140', pageSuffix = '', { systemDark = false, theme } = {}) {
  const storage = new Map(saved ? [['tabtools-site-language', saved]] : []);
  if (theme) storage.set('tabtools-site-theme', theme);
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
    option.textContent=l.nativeName;
    return option;
  });
  picker.contains=node=>node===trigger || node===menu || options.includes(node);
  menu.hidden=true;
  const data={locale,registry:L.presentationRegistry.map(l=>({locale:l.locale,canonical:l.canonical,path:l.path+pageSuffix,nativeName:l.nativeName,flagAsset:l.flagAsset})),messages:L.catalogue(locale)};
  // As the early script in the page does before this one runs.
  const document={documentElement:{dataset:theme ? {theme} : {},lang:locale,style:{setProperty(){}}},
    getElementById:()=>({textContent:JSON.stringify(data)}),
    querySelector:s=>({'[data-language-picker]':picker,'[data-language-trigger]':trigger,'[data-language-menu]':menu,'[data-language-suggestion]':note,'[data-theme-toggle]':toggle,'[data-theme-label]':label,'[data-store-note]':storeNote}[s]||null),
    querySelectorAll:s=>s==='[data-store]'?[store]:(s==='[data-language-option]'?options:[]),
    createElement:element,createTextNode:text=>({textContent:text})};
  const navigation=[];
  const windowEvents={};
  const location={search:'?campaign=test',hash:'#faq',assign:url=>navigation.push(url)};
  const context={document,URL,navigator:{languages:preferences,userAgent:ua},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    window:{location,addEventListener:(type,handler)=>{windowEvents[type]=handler;},
      matchMedia:()=>({matches:systemDark,addEventListener(){}})}};
  vm.runInNewContext(script,context);
  return {site:context.window.TabToolsSite,document,picker,trigger,menu,flag,name,options,note,toggle,label,store,copy,icon,storeNote,storage,navigation,windowEvents,location};
}

test('explicit language URLs are never replaced by saved or browser preferences',()=>{
  const p=pageRuntime('ja',['fr'],'de');
  assert.equal(p.document.documentElement.lang,'ja');
  assert.deepEqual(p.navigation,[]);
  assert.equal(p.note.children[0].href,'/de/?campaign=test#faq');
  // The suggestion names the language as its own readers know it.
  assert.match(p.note.children[0].textContent,/Deutsch/);
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
  // Nothing is chosen or saved until the visitor chooses.
  assert.equal(p.document.documentElement.dataset.theme,undefined);
  assert.equal(p.storage.has('tabtools-site-theme'),false);
  assert.equal(p.toggle['aria-label'],L.catalogue('he').web_switch_to_dark_mode);
  p.toggle.events.click();
  assert.equal(p.document.documentElement.dataset.theme,'dark');
  assert.equal(p.storage.get('tabtools-site-theme'),'dark');
  assert.equal(p.toggle['aria-label'],L.catalogue('he').web_switchLight);
  const url=new URL(p.store.href);
  assert.equal(url.hostname,'microsoftedge.microsoft.com');
  assert.equal(url.searchParams.get('utm_content'),'hero_edge');
  assert.equal(url.searchParams.get('utm_source'),'tabtools.fyi');
  assert.equal(p.icon.src,'/assets/browsers/edge.svg');
  assert.equal(p.copy.children.map(n=>n.textContent).join(''),L.catalogue('he').web_addTo.replace('{browser}','Edge'));
});
test('the page follows the system theme until a theme is chosen, and can return to it',()=>{
  const dark=pageRuntime('en',['en'],undefined,'Chrome/140','',{systemDark:true});
  assert.equal(dark.document.documentElement.dataset.theme,undefined,'a dark system is followed without saving anything');
  assert.equal(dark.site.theme(),'system');
  assert.equal(dark.toggle['aria-label'],L.catalogue('en').web_switchLight,'the button offers the theme that is not showing');
  dark.toggle.events.click();
  assert.equal(dark.document.documentElement.dataset.theme,'light');
  assert.equal(dark.storage.get('tabtools-site-theme'),'light');
  dark.site.setTheme('system');
  assert.equal(dark.document.documentElement.dataset.theme,undefined);
  assert.equal(dark.storage.has('tabtools-site-theme'),false);
  assert.equal(dark.toggle['aria-label'],L.catalogue('en').web_switchLight);

  const saved=pageRuntime('en',['en'],undefined,'Chrome/140','',{systemDark:true,theme:'light'});
  assert.equal(saved.site.theme(),'light','a saved choice wins over the system');
  assert.equal(saved.toggle['aria-label'],L.catalogue('en').web_switch_to_dark_mode);

  const p=pageRuntime('en');
  assert.equal(p.site.accent(),'purple');
  p.site.setAccent('green');
  assert.equal(p.document.documentElement.dataset.accent,'green');
  assert.equal(p.storage.get('tabtools-site-accent'),'green');
  p.site.setAccent('not-a-colour');
  assert.equal(p.document.documentElement.dataset.accent,undefined);
  assert.equal(p.storage.has('tabtools-site-accent'),false);
});
test('dark values are the same whether the system or the visitor asks for them',()=>{
  const css=L.fs.readFileSync(L.path.join(L.root,'website/src/styles.css'),'utf8').replace(/\r\n/g,'\n');
  const system=css.match(/@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}\n((?:  :root:not.*\n)+)\}/);
  const chosen=css.match(/\n:root\[data-theme="dark"\] \{([\s\S]*?)\n\}\n((?::root\[data-theme="dark"\]\[data-accent.*\n)+)/);
  assert.ok(system && chosen,'both dark blocks are present');
  const tidy=text=>text.split('\n').map(line=>line.trim()).filter(Boolean);
  assert.deepEqual(tidy(system[1]),tidy(chosen[1]));
  assert.deepEqual(tidy(system[2]).map(line=>line.replace(':root:not([data-theme="light"])',':root[data-theme="dark"]')),tidy(chosen[2]));
  assert.equal(tidy(chosen[2]).length,5,'one line per accent other than purple');
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
    // Each language is listed under its own name, in its own script and direction.
    for(const item of L.registry)assert.ok(html.includes(`<span class="language-option-name" lang="${item.canonical}" dir="${item.direction}">${L.escape(item.nativeName)}</span>`),`${locale.locale}: ${item.locale}`);
    const order=[...html.matchAll(/data-language-option data-locale="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(order,L.presentationRegistry.map(item=>item.locale),`${locale.locale}: language order`);
    assert.match(html,new RegExp('class="language-trigger"[^>]+aria-label="[^"]+: ' +
      L.escape(locale.nativeName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    assert.match(html,/class="language-flag language-flag-current"/);
    assert.ok(html.includes('src="/assets/flags/en.svg"'));
    assert.doesNotMatch(html,/class="language-option-name"[^>]*>(Czech|German|Greek|Hebrew|Japanese|Korean|Russian|Ukrainian|Chinese)/);
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

test('no page embeds a frame, a video or anything from another origin',()=>{
  const headers=L.fs.readFileSync(L.path.join(L.root,'website/dist/_headers'),'utf8');
  assert.match(headers,/frame-src 'none'/);
  for(const locale of L.registry) {
    const html=L.fs.readFileSync(L.path.join(L.root,'website/dist',locale.website,'index.html'),'utf8');
    assert.doesNotMatch(html,/<(iframe|video|audio|object|embed)\b/,locale.locale);
    for(const m of html.matchAll(/<(?:script|img|link rel="stylesheet")[^>]*(?:src|href)="([^"]+)"/g))assert.ok(m[1].startsWith('/'),`${locale.locale}: ${m[1]}`);
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
      assert.ok(html.includes(`<meta ${attribute} content="https://tabtools.fyi/assets/tabtools-social.png" />`), locale.locale);
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
  assert.equal(label.lang,'fr');
  assert.equal(label.textContent,'Français');
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
  const original=catalogue.web_free_to_use_no_account;
  try {
    catalogue.web_free_to_use_no_account='A revised English description';
    const html=applyTranslations(template,L.localeInfo('en'));
    assert.ok(html.includes('A revised English description</p>'));
    delete catalogue.web_free_to_use_no_account;
    assert.throws(()=>applyTranslations(template,L.localeInfo('en')),/Missing website message/);
  } finally {catalogue.web_free_to_use_no_account=original;}
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

// A stand-in translation of the current English guides: every piece of prose
// and every picture description differs from English and nothing else does.
// The checks below then do not depend on how far the real translations have got.
function standInGuideTranslation(G) {
  const mark = text => '¡' + text;
  const html = text => text.replace(/(^|>)([^<]+)/g, (_, tag, run) => tag + (run.trim() ? mark(run) : run))
    .replace(/alt="([^"]+)"/g, (_, alt) => `alt="${mark(alt)}"`);
  return {
    sourceFingerprint: G.sourceFingerprint,
    review: { status: 'ai-reviewed', note: 'stand-in for tests' },
    ui: Object.fromEntries(Object.entries(G.source.ui).map(([key, value]) => [key, mark(value)])),
    guides: G.source.guides.map(guide => ({
      ...guide,
      ...Object.fromEntries(['title', 'shortTitle', 'description', 'category', 'lede', 'answer'].map(key => [key, mark(guide[key])])),
      sections: guide.sections.map(section => ({ ...section, title: mark(section.title), html: html(section.html) }))
    }))
  };
}

test('guide translations reject stale, missing, untranslated or unsafe content', () => {
  const G = require('../website/guide-localisation.cjs');
  const original = standInGuideTranslation(G);
  assert.doesNotThrow(() => G.validateTranslation(structuredClone(original), 'zh-CN'));
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

test('a guide translation older than its English is still published, checked for what does not depend on the wording', () => {
  const G = require('../website/guide-localisation.cjs');
  const older = () => ({ ...standInGuideTranslation(G), sourceFingerprint: 'an earlier English version' });
  assert.doesNotThrow(() => G.validatePending(older(), 'de'));
  // What it says may be out of date; what it is made of may not be unsafe or incomplete.
  for (const [mutate, message] of [
    [value => { value.review.status = 'draft'; }, /missing review status/],
    [value => { delete value.ui.readGuide; }, /UI keys differ/],
    [value => { value.ui.readTime = 'no duration placeholder'; }, /placeholders/],
    [value => { value.guides.pop(); }, /added, removed or reordered/],
    [value => { value.guides[0].title = '<b>Title</b>'; }, /invalid title/],
    [value => { value.guides[0].sections[0].id = 'Not An Anchor'; }, /invalid section anchor/],
    [value => { value.guides[0].sections[0].html += '<script>alert(1)</script>'; }, /unsafe markup/],
    [value => { value.guides[0].sections[0].html = value.guides[0].sections[0].html.replace('href=', 'onclick="alert(1)" href='); }, /unsafe markup/],
    [value => { value.guides[0].sections[0].html += '<a href="javascript:alert(1)">x</a>'; }, /unsafe markup/]
  ]) {
    const value = older();
    mutate(value);
    assert.throws(() => G.validatePending(value, 'de'), message);
  }
  // Validation is what reports them, and fails for them on main.
  const pending = G.pending();
  assert.ok(pending.every(locale => locale !== 'en' && L.registry.some(item => item.locale === locale)));
  const { spawnSync } = require('node:child_process');
  const run = allowed => spawnSync(process.execPath, ['scripts/validate-localisation.js'], {
    cwd: L.root, encoding: 'utf8', env: { ...process.env, TABTOOLS_PENDING_TRANSLATIONS: allowed ? '1' : '' }
  });
  const coverage = L.path.join(L.root, 'localisation/COVERAGE.md');
  const before = L.fs.readFileSync(coverage, 'utf8');
  try {
    const strict = run(false);
    const report = strict.stdout + strict.stderr;
    for (const locale of pending) assert.ok(report.includes(locale + ': guides were translated from an earlier English version'), locale);
    if (pending.length) assert.notEqual(strict.status, 0, 'pending guides fail validation unless pending translations are allowed');
    assert.equal(L.fs.readFileSync(coverage, 'utf8'), before, 'coverage is the same in both modes');
  } finally {
    L.fs.writeFileSync(coverage, before);
  }
});

test('adding an untranslated English guide invalidates existing translation catalogues', () => {
  const G = require('../website/guide-localisation.cjs');
  const value = standInGuideTranslation(G);
  const added = structuredClone(G.source.guides[0]);
  added.slug = 'new-untranslated-guide';
  G.source.guides.push(added);
  try {
    // Shape validation is an additional guard even if someone mistakenly
    // copies the current fingerprint without translating the new article.
    assert.throws(() => G.validateTranslation(value, 'zh-CN'), /missing guide/);
    assert.throws(() => G.validatePending({ ...value, sourceFingerprint: 'earlier' }, 'zh-CN'), /added, removed or reordered/);
  } finally {
    G.source.guides.pop();
  }
});

test('a page shows English for a string its language does not have yet, and English itself has no fallback', () => {
  const { applyTranslations, message } = require('../scripts/generate-website');
  const template = L.fs.readFileSync(L.path.join(L.root, 'website/src/template.html'), 'utf8');
  const french = L.catalogue('fr');
  const original = french.web_faq;
  try {
    delete french.web_faq;
    assert.equal(message(L.localeInfo('fr'), 'web_faq'), L.catalogue('en').web_faq);
    assert.ok(applyTranslations(template, L.localeInfo('fr')).includes(`<a href="#faq">${L.escape(L.catalogue('en').web_faq)}</a>`));
  } finally { french.web_faq = original; }
  assert.equal(message(L.localeInfo('en'), 'web_not_a_string'), undefined);
});

test('pages carry only the text their scripts show, and every string those scripts ask for', () => {
  const { runtimeKeys } = require('../scripts/generate-website');
  const demo = require('../website/demo-content.cjs');
  const asked = (file, pattern) => new Set([...L.fs.readFileSync(L.path.join(L.root, file), 'utf8').matchAll(pattern)].map(match => match[1]));
  assert.deepEqual([...asked('website/src/script.js', /\bmessage\((?:\s*\w+\s*\?\s*)?'(\w+)'/g)].filter(key => !runtimeKeys.includes(key)), []);
  for (const key of ['web_view', 'web_addTo']) assert.ok(runtimeKeys.includes(key), key);
  assert.deepEqual([...asked('website/src/demo.js', /\btext\('(\w+)'/g)].filter(key => !demo.messageKeys.includes(key)), []);
  for (const locale of L.registry) {
    const home = L.fs.readFileSync(L.path.join(L.root, 'website/dist', locale.website, 'index.html'), 'utf8');
    const data = JSON.parse(home.match(/id="locale-data">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(Object.keys(data.messages), runtimeKeys, locale.locale);
    assert.deepEqual(Object.keys(data.demo.messages), demo.messageKeys, locale.locale);
    for (const [key, value] of Object.entries({ ...data.messages, ...data.demo.messages })) {
      assert.ok(typeof value === 'string' ? value.trim() : value && typeof value.other === 'string', `${locale.locale}: ${key}`);
    }
    assert.deepEqual(data.demo.tabs, demo.tabs, locale.locale);
    const guide = L.fs.readFileSync(L.path.join(L.root, 'website/dist', locale.website, 'guides/index.html'), 'utf8');
    const guideData = JSON.parse(guide.match(/id="locale-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(guideData.demo, undefined, `${locale.locale}: guides do not carry the home page's sample tabs`);
    assert.doesNotMatch(guide, /src="\/demo\.js"/, locale.locale);
  }
});

test('the working popup follows the extension\'s rules for what each action closes', () => {
  const model = require('../website/src/demo.js');
  const { tabs, threshold } = require('../website/demo-content.cjs');
  const ids = list => list.map(tab => tab.id);
  assert.equal(tabs.filter(tab => tab.active).length, 1);

  // Sites: most tabs first, then by name.
  assert.deepEqual(model.sites(tabs).map(site => [site.host, site.count]), [
    ['github.com', 6], ['docs.google.com', 4], ['youtube.com', 4], ['en.wikipedia.org', 3], ['stackoverflow.com', 3],
    ['news.ycombinator.com', 2], ['calendar.google.com', 1], ['mail.google.com', 1]
  ]);

  // Duplicates: whole addresses; the first copy stays, and the copy in view always stays.
  assert.deepEqual(ids(model.duplicates(tabs)), [12, 16, 19]);
  const inView = tabs.map(tab => ({ ...tab, active: tab.id === 19 }));
  assert.deepEqual(ids(model.duplicates(inView)), [5, 12, 16], 'the copy in view stays instead of the first');
  const fragments = [{ id: 1, url: 'mail.example/#inbox/1' }, { id: 2, url: 'mail.example/#inbox/2' }];
  assert.deepEqual(model.duplicates(fragments), [], 'the part after # is part of the address');

  // Inactive: at least the chosen time, longest first, never the tab in view.
  const idle = model.inactive(tabs, threshold);
  assert.equal(idle.length, 11);
  assert.deepEqual(idle.map(tab => tab.idle), [...idle.map(tab => tab.idle)].sort((a, b) => b - a));
  assert.ok(idle.every(tab => tab.idle >= threshold && !tab.active));
  assert.equal(model.inactive(tabs, 240).length, 8);
  assert.deepEqual(model.inactive(tabs.map(tab => ({ ...tab, active: tab.id === 3 })), threshold).some(tab => tab.id === 3), false);

  // Typing: a dot names a site and its subdomains; other text matches titles and addresses.
  assert.deepEqual([...new Set(model.matches(tabs, 'google.com').map(model.hostOf))].sort(), ['calendar.google.com', 'docs.google.com', 'mail.google.com']);
  assert.deepEqual(ids(model.matches(tabs, 'www.YouTube.com')), [3, 9, 16, 22]);
  assert.deepEqual(ids(model.matches(tabs, 'wiki')), [5, 13, 19]);
  assert.deepEqual(ids(model.matches(tabs, 'TABTOOLS/ISSUES')), [4], 'a keyword is also looked for in the address');
  assert.deepEqual(model.matches(tabs, '   '), []);
  assert.deepEqual(model.matches(tabs, 'e.com'), [], 'a site is matched whole, not by the end of its name');

  // Sorting: sites by count then name, each site's tabs in their order, nothing lost.
  const { tabs: order, moved } = model.sorted(tabs);
  assert.deepEqual(order.map(model.hostOf).filter((host, index, all) => host !== all[index - 1]),
    model.sites(tabs).map(site => site.host));
  assert.deepEqual(ids(order).slice(0, 6), [1, 4, 7, 12, 17, 24]);
  assert.deepEqual(ids(order).sort((a, b) => a - b), ids(tabs));
  assert.equal(moved, order.filter((tab, index) => tabs[index] !== tab).length);
  assert.equal(model.sorted(order).moved, 0, 'sorted tabs have nothing left to move');

  // The stepper moves through the popup's eight choices and stops at each end.
  // Recently closed: the latest close first, each tab with the place it had,
  // and a reopened tab goes back there without coming into view.
  const before = tabs.map(tab => tab.id);
  const closedFirst = tabs.filter(tab => model.hostOf(tab) === 'news.ycombinator.com');
  let recent = model.remember([], closedFirst, before);
  const left = tabs.filter(tab => !closedFirst.includes(tab));
  recent = model.remember(recent, [tabs[12]], left.map(tab => tab.id));
  assert.deepEqual(recent.map(entry => [entry.id, entry.index, entry.active]), [[13, 11, false], [11, 10, false], [23, 22, false]]);
  const again = model.reopened(left, recent[1]);
  assert.deepEqual(again.map(tab => tab.id), before.filter(id => id !== 23));
  assert.equal('index' in again[10], false);
  assert.equal(model.reopened([], recent[2]).length, 1, 'a place past the end of the window is the end');
  const many = Array.from({ length: 40 }, (_, index) => ({ id: 100 + index, title: 'T', url: 'many.test/' + index, idle: 1 }));
  assert.equal(model.remember(recent, many, many.map(tab => tab.id)).length, model.RECENT_MAX);
  assert.equal(model.RECENT_MAX, 25);

  assert.deepEqual(model.THRESHOLDS, [30, 60, 120, 240, 480, 1440, 4320, 10080]);
  assert.equal(model.step(120, 1), 240);
  assert.equal(model.step(120, -1), 60);
  assert.equal(model.step(45, -1), 30);
  assert.equal(model.step(30, -1), undefined);
  assert.equal(model.step(10080, 1), undefined);
  assert.deepEqual([model.duration(120), model.duration(4320), model.duration(10080), model.duration(45)],
    [{ value: 2, unit: 'hour' }, { value: 3, unit: 'day' }, { value: 1, unit: 'week' }, { value: 45, unit: 'minute' }]);
  assert.deepEqual([model.age(59), model.age(700), model.age(4400)],
    [{ value: 59, unit: 'minute' }, { value: 11, unit: 'hour' }, { value: 3, unit: 'day' }]);

  const format = model.formatter('en', { tabCount: { one: '{count} tab', other: '{count} tabs' }, closeSiteLabel: 'Close tabs from {site}' });
  assert.equal(format.text('tabCount', { count: 1 }), '1 tab');
  assert.equal(format.text('tabCount', { count: 2492 }), '2,492 tabs');
  assert.equal(format.text('closeSiteLabel', { site: 'example.com' }), 'Close tabs from example.com');
  assert.equal(format.unit({ value: 2, unit: 'hour' }, 'short'), '2 hr');
});

test('the home page draws the working popup\'s starting state without scripts', () => {
  const model = require('../website/src/demo.js');
  const demo = require('../website/demo-content.cjs');
  for (const locale of L.registry) {
    const html = L.fs.readFileSync(L.path.join(L.root, 'website/dist', locale.website, 'index.html'), 'utf8');
    const strip = [...html.matchAll(/class="demo-tab(?: is-active)?" data-tab="(\d+)" data-host="([^"]+)"/g)];
    assert.deepEqual(strip.map(match => [Number(match[1]), match[2]]), demo.tabs.map(tab => [tab.id, model.hostOf(tab)]), locale.locale);
    const rows = [...html.matchAll(/data-pp-site data-host="([^"]+)"[^>]*>.*?<span class="pp-ticks">((?:<i><\/i>)*)<\/span><span class="pp-count">([^<]+)<\/span>/g)];
    assert.deepEqual(rows.map(match => [match[1], match[2].length / 7, match[3]]),
      model.sites(demo.tabs).map(site => [site.host, site.count, String(site.count)]), `${locale.locale}: one mark per tab`);
    // It is a picture until its script runs: no button that does nothing.
    assert.match(html, /<div class="demo" inert>/, locale.locale);
    assert.equal((html.match(/data-pp-template="/g) || []).length, 4, locale.locale);
    // Inactive and Close duplicates are the two halves of one row, and the footer
    // offers Recently closed where the closed count used to be.
    assert.match(html, /<div class="pp-pair">\s*<button class="pp-row pp-cell" type="button" data-pp-inactive-row[^>]*>[\s\S]*?<\/button>\s*<button class="pp-row pp-cell" type="button" data-pp-duplicates-row[^>]*>[\s\S]*?<\/button>\s*<\/div>/, locale.locale);
    assert.match(html, /<button class="pp-btn pp-sort" type="button" data-pp-recent-toggle>/, locale.locale);
    assert.doesNotMatch(html, /pp-foot-count|data-pp-closed/, locale.locale);
  }
});

test('every guide picture is shown by a guide, and every picture a guide shows exists', () => {
  const directory = L.path.join(L.root, 'website/dist/assets/guides');
  const files = L.fs.readdirSync(directory).filter(name => name.endsWith('.png')).sort();
  const shown = new Set();
  for (const locale of L.registry) {
    for (const guide of require('../website/guides-content.cjs')) {
      const html = L.fs.readFileSync(L.path.join(L.root, 'website/dist', locale.website, 'guides', guide.slug, 'index.html'), 'utf8');
      for (const match of html.matchAll(/src="\/assets\/guides\/([^"]+)"/g)) shown.add(match[1]);
    }
  }
  // A picture nothing shows is left over from an earlier version: delete it.
  assert.deepEqual(files, [...shown].sort());
  // Pictures of the popup alone are twice the popup's 380 pixels wide.
  for (const name of files.filter(name => name.startsWith('popup-'))) {
    const header = L.fs.readFileSync(L.path.join(directory, name)).subarray(16, 24);
    assert.equal(header.readUInt32BE(0), 760, name);
    const english = L.fs.readFileSync(L.path.join(L.root, 'website/dist/guides', require('../website/guides-content.cjs')
      .find(guide => guide.sections.some(section => section.html.includes(name))).slug, 'index.html'), 'utf8');
    assert.ok(english.includes(`src="/assets/guides/${name}" width="380" height="${header.readUInt32BE(4) / 2}"`), name);
  }
});
