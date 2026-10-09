// SPDX-License-Identifier: MPL-2.0
'use strict';

// Takes the pictures of the popup that the guides, the README and link previews
// show. They come from the built extension's real toolbar popup in Chromium,
// opened the way extension-playwright/native.spec.js opens it, over tabs staged
// for the purpose. No request leaves the browser: each tab's page is answered
// here with a title and nothing else, so sites appear by name with the popup's
// own letter tiles and no site's artwork.
//
//   node build.js
//   node scripts/capture-pictures.js
//
// Needs the Chromium that Playwright installs. TABTOOLS_CHROMIUM_PATH names
// another one. Every picture is written at twice the popup's size.
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const demo = require('../website/demo-content.cjs');

const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'dist', 'chrome');
const guides = path.join(root, 'website', 'dist', 'assets', 'guides');
const executablePath = process.env.TABTOOLS_CHROMIUM_PATH || undefined;
const HOUR = 60;

// The six tabs of the guides' browser screenshots, in their order there.
const six = [
  ['YouTube', 'https://www.youtube.com/'],
  ['Web browser - Wikipedia', 'https://en.wikipedia.org/wiki/Web_browser'],
  ['study music - YouTube', 'https://www.youtube.com/results?search_query=study+music'],
  ['Google', 'https://www.google.com/'],
  ['travel guides - YouTube', 'https://www.youtube.com/results?search_query=travel+guides'],
  ['Tab (interface) - Wikipedia', 'https://en.wikipedia.org/wiki/Tab_(interface)']
];
const eight = [...six, ['YouTube', 'https://www.youtube.com/'], ['YouTube', 'https://www.youtube.com/']];

const until = async (check, what, timeout = 15_000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > end) throw new Error('Timed out waiting for ' + what);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tabtools-pictures-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    executablePath,
    headless: true,
    locale: 'en',
    viewport: { width: 1280, height: 800 },
    // Everything is drawn at twice its size. The screen is sized to match, so
    // that a tall popup is not cut off at the bottom of a small headless screen.
    args: [
      `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
      '--lang=en', '--no-sandbox', '--screen-info={3840x2400}', '--force-device-scale-factor=2'
    ]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15_000 });
  await until(() => worker.evaluate(() => typeof chrome === 'object' && Boolean(chrome.tabs?.query && chrome.action?.openPopup)), 'the extension');
  const titles = new Map();
  await context.route(/^https?:\/\//, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><title>${(titles.get(route.request().url()) || '').replace(/[<&]/g, '')}</title></head><body></body></html>`
  }));
  return {
    context, worker, titles, id: new URL(worker.url()).hostname,
    close: async () => { await context.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true }); }
  };
}

const queryTabs = worker => worker.evaluate(() => chrome.tabs.query({}));

// Opens the tabs in order after the window's first tab, which becomes `first`.
async function stage(browser, tabs, inView) {
  const { context, worker, titles } = browser;
  for (const [title, url] of tabs) titles.set(url, title);
  const [start] = context.pages();
  await start.goto(tabs[0][1]);
  for (const [, url] of tabs.slice(1)) {
    const page = await context.newPage();
    await page.goto(url);
  }
  const all = await queryTabs(worker);
  const view = all.find(tab => tab.url === inView) || all[0];
  await worker.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), view.id);
  await until(() => worker.evaluate(async ({ id, windowId }) => {
    const record = (await chrome.storage.session.get('pc.left'))['pc.left'];
    return record?.active?.[windowId] === id;
  }, { id: view.id, windowId: view.windowId }), 'the background to note the tab in view');
}

// Moves the background's clock forward, as time passing does for the tabs
// already open: they were left that much longer ago.
const later = (worker, minutes) => worker.evaluate(milliseconds => {
  globalThis.pictureClock ??= { real: Date.now.bind(Date), ahead: 0 };
  globalThis.pictureClock.ahead += milliseconds;
  Date.now = () => globalThis.pictureClock.real() + globalThis.pictureClock.ahead;
}, minutes * 60_000);

async function openPopup({ context, worker, id }) {
  const cdp = await context.browser().newBrowserCDPSession();
  const target = () => cdp.send('Target.getTargets').then(result => result.targetInfos
    .find(item => item.url === `chrome-extension://${id}/popup/popup.html`));
  await until(async () => !(await target()), 'the last popup to close');
  await until(() => worker.evaluate(() => chrome.action.openPopup()).then(() => true, () => false), 'the popup to open');
  const { targetId } = await until(target, 'the popup');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  const pending = new Map();
  let next = 0;
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const result = JSON.parse(event.message);
    const handler = pending.get(result.id);
    if (!handler) return;
    pending.delete(result.id);
    result.error ? handler.reject(new Error(result.error.message)) : handler.resolve(result.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++next;
    pending.set(commandId, { resolve, reject });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: commandId, method, params }) }).catch(reject);
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  await send('Runtime.enable');
  await evaluate('document.fonts.ready.then(() => true)');
  await until(() => evaluate('["#pc-open-count", "#pc-settings-closed"].every(selector => Boolean(document.querySelector(selector)?.textContent))'), 'the popup to fill in');
  const box = selector => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const pause = () => new Promise(resolve => setTimeout(resolve, 350));
  return {
    evaluate,
    // Puts the pointer on a control, so it is drawn as it is when pointed at.
    point: async selector => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await box(selector)) }); await pause(); },
    click: async selector => {
      const at = await box(selector);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 });
      }
      await pause();
    },
    type: async text => {
      await evaluate('document.querySelector("#pc-query").focus()');
      await send('Input.insertText', { text });
      await pause();
    },
    dark: () => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }).then(pause),
    // Writes the popup as it is drawn and returns its height in CSS pixels.
    save: async file => {
      await pause();
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      const height = await evaluate('Math.round(document.documentElement.getBoundingClientRect().height)');
      const drawn = Buffer.from(data, 'base64').readUInt32BE(20) / 2;
      if (drawn !== height) throw new Error(`${path.basename(file)}: the popup is ${height}px tall but ${drawn}px were drawn`);
      console.log(path.relative(root, file) + '  380 x ' + height);
      return height;
    },
    close: async () => {
      await cdp.send('Target.closeTarget', { targetId });
      await until(async () => !(await target()), 'the popup to close');
    }
  };
}

// One browser per scene, so nothing carries over from the scene before.
async function scene(tabs, inView, work, minutesAgo = 3 * HOUR) {
  const browser = await launch();
  try {
    await stage(browser, tabs, inView);
    if (minutesAgo) await later(browser.worker, minutesAgo);
    const popup = await openPopup(browser);
    await work(popup, browser);
  } finally {
    await browser.close();
  }
}

async function guidePictures() {
  const google = 'https://www.google.com/';
  await scene(six, google, async popup => {
    await popup.point('.row.site[data-domain="youtube.com"]');
    await popup.save(path.join(guides, 'popup-site-row.png'));
    await popup.type('youtube.com');
    await popup.save(path.join(guides, 'popup-typed-site.png'));
  });
  // The three YouTube tabs closed a few minutes ago, then listed for reopening.
  await scene(six, google, async (popup, browser) => {
    await popup.click('.row.site[data-domain="youtube.com"]');
    await popup.click('#pc-toast-dismiss');
    await later(browser.worker, 4);
    await popup.click('#pc-recent-toggle');
    await popup.point('#pc-recent-rows .tab');
    await popup.save(path.join(guides, 'popup-recently-closed.png'));
  });
  await scene(eight, google, async popup => {
    await popup.point('#pc-close-duplicates');
    await popup.save(path.join(guides, 'popup-close-duplicates.png'));
    await popup.click('#pc-close-duplicates');
    await popup.save(path.join(guides, 'popup-duplicates-result.png'));
  });
  await scene(six, google, async popup => {
    await popup.point('#pc-sort-tabs-quick');
    await popup.save(path.join(guides, 'popup-sort-tabs.png'));
    await popup.click('#pc-sort-tabs-quick');
    await popup.save(path.join(guides, 'popup-sorted-result.png'));
  });
}

// The README shows the sample session of the website's working popup, in the
// real one: the tabs left long ago are opened first and the clock moved on.
async function readmePictures() {
  const tabs = demo.tabs.map(tab => [tab.title, 'https://' + tab.url]);
  const inView = 'https://' + demo.tabs.find(tab => tab.active).url;
  for (const theme of ['light', 'dark']) {
    const browser = await launch();
    try {
      const old = demo.tabs.filter(tab => tab.idle >= demo.threshold).map(tab => tabs[tab.id - 1]);
      const recent = demo.tabs.filter(tab => tab.idle < demo.threshold).map(tab => tabs[tab.id - 1]);
      await stage(browser, old, old[0][1]);
      await later(browser.worker, 3 * HOUR);
      for (const [title, url] of recent) {
        browser.titles.set(url, title);
        await (await browser.context.newPage()).goto(url);
      }
      const all = await queryTabs(browser.worker);
      await browser.worker.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), all.find(tab => tab.url === inView).id);
      const popup = await openPopup(browser);
      if (theme === 'dark') await popup.dark();
      await popup.point('.row.site[data-domain="github.com"]');
      await popup.save(path.join(root, 'docs', 'images', `tabtools-popup-${theme}.png`));
    } finally {
      await browser.close();
    }
  }
}

// The picture link previews show: the top of the home page, as built.
async function socialPicture() {
  const dist = path.join(root, 'website', 'dist');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((request, response) => {
    let file = path.join(dist, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(fs.readFileSync(file));
    } catch (_) { response.writeHead(404).end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    // 1200 by 630 is what link previews ask for. The page is laid out a third
    // larger and scaled down, so the whole popup fits.
    const page = await browser.newPage({ viewport: { width: 1600, height: 840 }, deviceScaleFactor: 0.75, colorScheme: 'light' });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addStyleTag({ content: `
      .main-nav, .nav-actions, .language-suggestion, .hero-actions, .store-note, .browser-links, .demo-caption, .facts { display: none !important; }
      .shell { width: 1440px; }
      .hero { padding: 30px 0 0; }
      .hero-grid { grid-template-columns: minmax(0, 1fr) 640px; gap: 80px; }
      .hero-copy { max-width: none; }
      .hero h1 { font-size: 104px; }
      .hero-lede { max-width: 22em; margin-top: 32px; font-size: 31px; }
      .hero-demo { zoom: 1.14; }
    ` });
    const file = path.join(dist, 'assets', 'tabtools-social.png');
    await page.screenshot({ path: file });
    console.log(path.relative(root, file) + '  1200 x 630');
  } finally {
    await browser.close();
    server.close();
  }
}

(async () => {
  if (!fs.existsSync(path.join(extension, 'manifest.json'))) throw new Error('Run node build.js first');
  const wanted = process.argv.slice(2);
  const jobs = { guides: guidePictures, readme: readmePictures, social: socialPicture };
  for (const [name, job] of Object.entries(jobs)) {
    if (!wanted.length || wanted.includes(name)) await job();
  }
})().catch(error => { console.error(error); process.exit(1); });
