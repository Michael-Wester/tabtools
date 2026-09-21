// Editorial source for the static guides. Regenerate pages with build-guides.cjs.
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const screenshot = (filename, alt, caption) => `<figure class="guide-screenshot">
  <a class="guide-screenshot-link" href="/assets/guides/${filename}" target="_blank" rel="noopener">
    <img src="/assets/guides/${filename}" width="1280" height="800" loading="lazy" decoding="async" alt="${escape(alt)}" />
    <span class="guide-screenshot-zoom">View full size <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></span>
  </a>
  <figcaption>${escape(caption)}</figcaption>
</figure>`;

module.exports = [
  {
    slug: "close-tabs-from-same-website",
    title: "How to Close All Tabs from the Same Website in Chrome",
    shortTitle: "Close tabs from the same website",
    description: "Close tabs from the same website in Chrome with TabTools, use a manual alternative, and follow the steps for Firefox and Edge.",
    category: "Close site tabs",
    lede: "Finished with a shopping session, a research rabbit hole or a stack of YouTube videos? You can close that website’s tabs together and leave your other websites open.",
    answer: "With TabTools installed, right-click a tab from the website you want to close in Chrome’s tab bar and choose Close site tabs. This closes matching tabs across your normal browser windows, including matching active and pinned tabs.",
    sections: [
      {
        id: "close-site-tabs-in-chrome",
        title: "Close a website’s tabs in Chrome",
        html: `<p>The tab’s context menu gives you a shortcut directly from Chrome’s tab bar.</p>
<ol>
  <li><a href="https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_chrome" target="_blank" rel="noopener" data-store="chrome" data-utm-placement="guide_inline">Install TabTools from the Chrome Web Store</a>.</li>
  <li>Find a tab from the website you want to close, such as the YouTube homepage or a search results page.</li>
  <li>Right-click that tab in Chrome’s tab bar.</li>
  <li>Choose <strong>Close site tabs</strong>. Tabs with the same website hostname close together.</li>
</ol>
${screenshot('close-site-01-tab-menu.png', 'Chrome with six mixed tabs and Close site tabs highlighted in a YouTube tab’s context menu.', 'Right-click a YouTube tab in Chrome’s tab bar and choose Close site tabs.')}
<p>In this example, three pages on <code>youtube.com</code> close while two Wikipedia tabs and Google stay open. You do not need to collect the YouTube tabs beside one another first.</p>
${screenshot('close-site-02-tabs-closed.png', 'Chrome after closing the three YouTube tabs, with two Wikipedia tabs and Google remaining.', 'After closing: only the two Wikipedia tabs and Google remain.')}
<p>If <strong>Close site tabs</strong> is not available in a tab’s menu, open that tab and right-click inside the webpage instead, or use the TabTools popup below.</p>
<p>This is useful when you have finished with the whole website. If you still need a particular page from it, keep that in mind before using the command: it includes the tab you right-click.</p>`,
      },
      {
        id: "use-the-popup",
        title: "Close a different website from the popup",
        html: `<p>You can also choose a website without switching to one of its pages.</p>
<ol>
  <li>Open TabTools from your browser’s extensions menu or toolbar.</li>
  <li>Find the website among the suggestions under <strong>Tap to close tabs from site</strong>. Each suggestion shows its open-tab count.</li>
  <li>Select the website to close its matching tabs.</li>
</ol>
${screenshot('close-site-03-popup-suggestion.png', 'TabTools in Chrome with the pointer on the YouTube suggestion showing 3 open tabs.', 'With the same six tabs open, select the YouTube suggestion to close its three tabs without leaving Google.')}
<p>You can also enter a hostname directly, which is useful if the website is not shown in Suggestions. Enter its hostname, such as <code>youtube.com</code>, in <strong>Close by keyword (press Enter)</strong>, then press Enter or click <strong>Close</strong>. Enter the hostname alone, without <code>https://</code> or a page path.</p>
${screenshot('close-site-04-enter-hostname.png', 'The TabTools keyword field contains youtube.com, with the pointer on Close.', 'Or enter youtube.com and click Close or press Enter.')}
<p>A plain keyword such as <code>shopping</code> works differently: it searches tab titles and URLs. Use the exact hostname when your intention is to close one specific website.</p>`,
      },
      {
        id: "which-tabs-close",
        title: "Which tabs count as the same website?",
        html: `<p>Site closing matches the hostname, ignoring a leading <code>www.</code>. Different pages on that hostname match even when their paths or query parameters differ.</p>
<table>
  <thead><tr><th scope="col">When closing example.com</th><th scope="col">Result</th></tr></thead>
  <tbody>
    <tr><td><code>example.com/article-one</code></td><td>Closes</td></tr>
    <tr><td><code>www.example.com/article-two</code></td><td>Closes</td></tr>
    <tr><td><code>shop.example.com/product</code></td><td>Stays open: a different subdomain</td></tr>
    <tr><td><code>another-site.com/example</code></td><td>Stays open</td></tr>
  </tbody>
</table>
<p>The command covers normal windows in the browser where you run it. Matching pinned tabs and active tabs are included; private or incognito tabs are excluded. It does not reach tabs in another browser application.</p>`,
      },
      {
        id: "without-an-extension",
        title: "Close matching tabs manually in Chrome",
        html: `<p>For a small number of tabs, Chrome’s Tab Search provides a manual route.</p>
<ol>
  <li>Open Tab Search with <strong>Ctrl + Shift + A</strong> on Windows or Linux, or <strong>Command + Shift + A</strong> on Mac.</li>
  <li>Search for the website’s name or hostname.</li>
  <li>Review the open-tab results and use the close control for each page you want to remove.</li>
</ol>
<p>This lets you keep selected pages from the website. It also means reviewing and closing the matches individually. Google documents the search and close controls in its <a href="https://support.google.com/chrome/answer/2391819?hl=en&amp;co=GENIE.Platform%3DDesktop">Chrome tabs guide</a>.</p>`,
      },
      {
        id: "firefox-and-edge",
        title: "Use the same workflow in Firefox and Edge",
        html: `<h3>Firefox</h3>
<p><a href="https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_firefox" target="_blank" rel="noopener" data-store="firefox" data-utm-placement="guide_inline">Install TabTools for Firefox</a>, then right-click a tab from the target website in the tab bar and choose <strong>Close site tabs</strong>. You can also right-click inside its webpage or choose a website from the popup’s suggestions.</p>
<h3>Microsoft Edge</h3>
<p><a href="https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_edge" target="_blank" rel="noopener" data-store="edge" data-utm-placement="guide_inline">Install TabTools for Edge</a>, then right-click a tab from the target website and choose <strong>Close site tabs</strong> if your Edge version shows it in the tab’s menu. Otherwise, open the tab and right-click inside the webpage, or enter the hostname in the popup. The matching rules and cross-window scope are the same as described above.</p>`,
      },
      {
        id: "undo-and-next-steps",
        title: "Reopen tabs or choose a smaller cleanup",
        html: `<p>After closing tabs through the popup, its <strong>Undo</strong> button can reopen the tabs from your latest popup cleanup while that popup remains open. The right-click <strong>Close site tabs</strong> action is not recorded by the popup’s Undo button.</p>
<p>After a context-menu close, look in your browser’s recently closed tabs or history. Reopening a URL should not be treated as restoring unsaved form input or every detail of a page’s previous state.</p>
<p>If your goal is to retain one copy of each page, follow the guide to <a href="/guides/close-duplicate-tabs/">closing duplicate tabs</a>. To keep all your pages and make them easier to scan, <a href="/guides/sort-tabs-by-website/">sort tabs by website</a> instead.</p>`,
      },
    ],
  },
  {
    slug: "close-duplicate-tabs",
    title: "How to Close Duplicate Tabs in Chrome, Firefox and Edge",
    shortTitle: "Close duplicate tabs",
    description: "Remove duplicate tabs in Chrome, Firefox and Edge. Follow the TabTools steps, use Firefox’s built-in option, and understand which copies remain.",
    category: "Remove duplicates",
    lede: "Opening the same document, search or video again is easy. Removing repeated copies makes the tab bar easier to navigate without clearing every page from a website.",
    answer: "Open TabTools and click Close duplicates to remove repeated unpinned pages across your normal browser windows. Firefox also has built-in commands for closing duplicates of one tab or cleaning up duplicate tabs from its tab overview menu.",
    sections: [
      {
        id: "choose-a-method",
        title: "Choose a method for your browser",
        html: `<table>
  <thead><tr><th scope="col">Browser</th><th scope="col">Method covered here</th></tr></thead>
  <tbody>
    <tr><td>Chrome</td><td>Open TabTools and select <strong>Close duplicates</strong>.</td></tr>
    <tr><td>Firefox</td><td>Use its built-in duplicate commands, or select <strong>Close duplicates</strong> in TabTools.</td></tr>
    <tr><td>Microsoft Edge</td><td>Open TabTools and select <strong>Close duplicates</strong>.</td></tr>
  </tbody>
</table>
<p>Before a bulk cleanup, finish any unsaved work in repeated pages. Two tabs can show the same URL while holding different text you have entered into a form.</p>`,
      },
      {
        id: "what-counts-as-a-duplicate",
        title: "What counts as a duplicate tab?",
        html: `<p>Duplicate tabs are repeated copies of a page. Three copies of the YouTube homepage are duplicates; the homepage and two different YouTube search results are different pages from the same website.</p>
<p>TabTools compares page URLs after removing the fragment: the part beginning with <code>#</code>. Paths and query parameters remain part of the comparison.</p>
<table>
  <thead><tr><th scope="col">Example URLs</th><th scope="col">TabTools treatment</th></tr></thead>
  <tbody>
    <tr><td><code>example.com/guide</code> opened twice</td><td>Duplicates</td></tr>
    <tr><td><code>example.com/guide#intro</code> and <code>example.com/guide#steps</code></td><td>Duplicates: fragments are ignored</td></tr>
    <tr><td><code>example.com/guide</code> and <code>example.com/contact</code></td><td>Different pages</td></tr>
    <tr><td><code>example.com/search?q=tabs</code> and <code>example.com/search?q=bookmarks</code></td><td>Different query parameters; both stay</td></tr>
  </tbody>
</table>
<p>Some web apps use fragments to identify different screens, so those screens can count as duplicates. Conversely, tracking parameters can make otherwise similar pages count as different URLs. The command compares addresses; it does not inspect page content to decide whether two pages mean the same thing.</p>`,
      },
      {
        id: "chrome-and-edge",
        title: "Close duplicate tabs in Chrome or Edge",
        html: `<p>The TabTools popup uses the same command in both browsers. These screenshots show Chrome with eight tabs, including three copies of the YouTube homepage.</p>
<ol>
  <li>Install TabTools for <a href="https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_chrome" target="_blank" rel="noopener" data-store="chrome" data-utm-placement="guide_inline">Chrome</a> or <a href="https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_edge" target="_blank" rel="noopener" data-store="edge" data-utm-placement="guide_inline">Microsoft Edge</a>.</li>
  <li>Open the extension from the toolbar or extensions menu.
    ${screenshot('duplicates-01-open-tabtools.png', 'Chrome with eight tabs, including three copies of the YouTube homepage, and the pointer on the TabTools toolbar icon.', 'Open TabTools from Chrome’s toolbar.')}
  </li>
  <li>Click <strong>Close duplicates</strong>.
    ${screenshot('duplicates-02-close-duplicates.png', 'The TabTools popup shows 8 open tabs, with the pointer on Close duplicates.', 'Click Close duplicates to remove repeated copies.')}
  </li>
  <li>Check the popup’s status message. It reports how many duplicates closed, or <strong>No duplicates</strong> when none matched.
    ${screenshot('duplicates-03-result-and-undo.png', 'TabTools reports Closed 2 duplicates, shows 6 open tabs, and offers an enabled Undo button.', 'Two duplicate copies close, leaving six tabs. Keep the popup open if you want to use Undo.')}
  </li>
</ol>
<p>You do not need to select the repeated tabs first. The cleanup covers normal windows within that browser, so two copies of a page can be matched even when they are in different windows. Private or incognito tabs are excluded.</p>
<p>Running the command in Chrome does not change Edge tabs, or vice versa. Use it separately in each browser if you have duplicates in both.</p>`,
      },
      {
        id: "firefox-native-option",
        title: "Use Firefox’s built-in duplicate commands",
        html: `<p>Firefox provides native options if duplicate removal is all you need.</p>
<ul>
  <li><strong>For copies of one page:</strong> right-click the tab you want to keep and choose <strong>Close Duplicate Tabs</strong>.</li>
  <li><strong>For a broader cleanup:</strong> open <strong>List all tabs</strong>, then choose its duplicate-closing command, shown as <strong>Close all duplicate tabs</strong> or <strong>Close Duplicate Tabs</strong> depending on the interface.</li>
</ul>
<p>Mozilla’s <a href="https://support.mozilla.org/en-US/kb/tab-context-menu">tab context menu guide</a> explains the first option. Its <a href="https://support.mozilla.org/en-US/kb/tab-overview-menu">tab overview menu guide</a> describes the broader cleanup and says it keeps the last active tab among duplicates.</p>
<p>If you already use <a href="https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_firefox" target="_blank" rel="noopener" data-store="firefox" data-utm-placement="guide_inline">TabTools for Firefox</a>, open its popup and click <strong>Close duplicates</strong>. Its matching and retention rules are the TabTools rules below; do not assume they are identical to Firefox’s native command.</p>`,
      },
      {
        id: "which-copy-stays",
        title: "Which copy does TabTools keep?",
        html: `<p>TabTools keeps the first unpinned copy encountered in the browser’s tab list and closes later matches. It does not deliberately choose the active tab, the newest tab or the tab you used most recently. A retained copy may therefore be in another window.</p>
<p>Pinned tabs are skipped completely. They are neither closed nor counted as the copy to keep. If a page has one pinned tab and two unpinned copies, the pinned tab remains and one of the unpinned copies remains too.</p>
<p>This makes pinning useful for keeping a page in place, but it means <strong>Close duplicates</strong> does not guarantee exactly one tab for every URL across pinned and unpinned tabs.</p>`,
      },
      {
        id: "undo-and-organise",
        title: "Undo a cleanup and organise what remains",
        html: `<p>Keep the popup open after cleanup if you want to check the result. <strong>Undo</strong> can reopen the tabs from the latest popup close action during that popup session. It reopens pages by URL; unsaved page content is not guaranteed to return. Once the popup is closed, use your browser’s recently closed tabs or history instead.</p>
<p>For different pages you have finished with, see <a href="/guides/close-tabs-from-same-website/">how to close all tabs from the same website</a>. For pages you want to keep, <a href="/guides/sort-tabs-by-website/">sorting tabs by website</a> brings related tabs together without closing them.</p>`,
      },
    ],
  },
  {
    slug: "sort-tabs-by-website",
    title: "How to Sort Tabs by Website in Chrome, Firefox and Edge",
    shortTitle: "Sort tabs by website",
    description: "Bring related tabs together in Chrome, Firefox and Edge with TabTools. Learn how site counts, pinned tabs and browser tab groups affect your options.",
    category: "Sort tabs",
    lede: "When your tab bar mixes documents, videos and research pages, finding the next tab takes longer than it should. Sorting brings pages from the same website together while keeping them open.",
    answer: "Open TabTools in the window you want to organise and click Sort tabs. It arranges unpinned tabs by website, putting sites with the most currently open tabs first. Pinned tabs stay in place.",
    sections: [
      {
        id: "sort-with-tabtools",
        title: "Sort the tabs in your current window",
        html: `<p>The same popup action is available in Chrome, Firefox and Microsoft Edge. This Chrome example starts with six tabs mixed between YouTube, Wikipedia and Google.</p>
<ol>
  <li>Install TabTools for <a href="https://chromewebstore.google.com/detail/tabtools/penbnlignepchllgkflhnpfbabdfalkk?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_chrome" target="_blank" rel="noopener" data-store="chrome" data-utm-placement="guide_inline">Chrome</a>, <a href="https://addons.mozilla.org/en-US/firefox/addon/tabtools-michael-wester/?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_firefox" target="_blank" rel="noopener" data-store="firefox" data-utm-placement="guide_inline">Firefox</a> or <a href="https://microsoftedge.microsoft.com/addons/detail/tabtools/hajmbphgjkkinedfebgnpodlknanfdlh?utm_source=tabtools.fyi&amp;utm_medium=referral&amp;utm_campaign=website&amp;utm_content=guide_inline_edge" target="_blank" rel="noopener" data-store="edge" data-utm-placement="guide_inline">Edge</a>.</li>
  <li>Switch to the browser window whose tabs you want to arrange.
    ${screenshot('sort-01-before.png', 'Chrome with three YouTube tabs, two Wikipedia tabs, and Google interleaved in the tab bar.', 'Before sorting: six tabs from three websites are mixed together.')}
  </li>
  <li>Open TabTools from the toolbar or extensions menu.</li>
  <li>Click <strong>Sort tabs</strong>.
    ${screenshot('sort-02-sort-tabs.png', 'The TabTools popup in Chrome with the pointer on Sort tabs.', 'Click Sort tabs to bring pages from each website together.')}
  </li>
</ol>
<p>Related unpinned tabs move beside one another. Pages stay open, and tabs in other windows are not brought into this window. If you want to organise another window, switch to it and run the command again.</p>
<p>Sorting is a one-time action. New tabs open normally afterwards; TabTools does not continuously rearrange the tab bar as you browse. Click <strong>Sort tabs</strong> again when you want to tidy the current arrangement.</p>`,
      },
      {
        id: "how-the-order-works",
        title: "How TabTools chooses the order",
        html: `<p>TabTools counts the open tabs for each website in the current window. Sites with larger counts come first, immediately after pinned tabs. Here is a simple example with no pinned tabs:</p>
<table>
  <thead><tr><th scope="col">Website</th><th scope="col">Open tabs</th><th scope="col">Position after sorting</th></tr></thead>
  <tbody>
    <tr><td><code>youtube.com</code></td><td>3</td><td>First</td></tr>
    <tr><td><code>en.wikipedia.org</code></td><td>2</td><td>Second</td></tr>
    <tr><td><code>google.com</code></td><td>1</td><td>Third</td></tr>
  </tbody>
</table>
${screenshot('sort-03-after.png', 'Chrome after sorting: three YouTube tabs, then two Wikipedia tabs, then Google; TabTools reports Reordered 6 tabs.', 'After sorting: YouTube ×3, Wikipedia ×2, then Google. All six tabs stay open.')}
<p>“Most opened” means the largest number of tabs open right now. It does not mean your most visited website, browsing history or the number of times you have opened a site over the past week.</p>
<p>If two sites have the same count, their hostnames determine the order alphabetically. Tabs from the same hostname keep their relative order. For example, the three YouTube pages retain their order within the YouTube set; they are not sorted by page title.</p>`,
      },
      {
        id: "pinned-tabs-and-subdomains",
        title: "Pinned tabs and subdomains",
        html: `<p>Pinned tabs stay in their pinned positions. They still contribute to a website’s count when TabTools decides the order of its unpinned tabs.</p>
<p>For example, two pinned GitHub tabs and two unpinned GitHub tabs give GitHub a count of four. Its unpinned tabs therefore come ahead of a website with three open tabs, while the two pinned GitHub tabs remain where they are.</p>
<p>Website matching uses the hostname and ignores a leading <code>www.</code>. Pages on <code>example.com</code> and <code>www.example.com</code> belong together. Pages on <code>docs.example.com</code> form a separate set from <code>shop.example.com</code>.</p>
<p>This is useful when different services share a parent domain: documentation and a shop can remain separate in the sorted tab bar.</p>`,
      },
      {
        id: "sorting-or-tab-groups",
        title: "Choose between sorting and tab groups",
        html: `<p>Sorting is useful when the website itself is the organising rule. Browser tab groups are useful when your organising rule is a task, such as a holiday, a work project or a purchase that involves several websites.</p>
<table>
  <thead><tr><th scope="col">Your goal</th><th scope="col">A suitable option</th></tr></thead>
  <tbody>
    <tr><td>Put pages from each website beside one another</td><td>TabTools <strong>Sort tabs</strong></td></tr>
    <tr><td>Choose the exact order of a few tabs</td><td>Drag tabs manually</td></tr>
    <tr><td>Keep a project’s different websites together under a name</td><td>Your browser’s named tab groups</td></tr>
  </tbody>
</table>
<p>TabTools rearranges tabs; it does not create named or coloured browser groups. If you have deliberately arranged tabs by project, consider whether sorting by website suits that window before changing the order.</p>`,
      },
      {
        id: "native-browser-options",
        title: "Organise tabs without an extension",
        html: `<h3>Chrome</h3>
<p>Drag tabs along the tab bar to set their order manually. You can also use named tab groups when related work spans several websites. Google’s <a href="https://support.google.com/chrome/answer/2391819?hl=en&amp;co=GENIE.Platform%3DDesktop">Chrome tabs guide</a> covers arranging and grouping tabs.</p>
<h3>Firefox</h3>
<p>Use the tab bar to move individual tabs, or use the grouping options in Firefox’s tab context menu for a named collection. Mozilla’s <a href="https://support.mozilla.org/en-US/kb/tab-context-menu">tab context menu guide</a> describes the available tab actions.</p>
<h3>Microsoft Edge</h3>
<p>Edge offers named tab groups and an <strong>Organize tabs</strong> feature that can group related tabs. Availability can vary. These organise by your chosen groups or relevance, which differs from sorting by current website counts. Microsoft explains them in its <a href="https://www.microsoft.com/en-us/edge/features/tab-groups">Edge tab groups guide</a>.</p>`,
      },
      {
        id: "after-sorting",
        title: "What to do after sorting",
        html: `<p>TabTools has no undo action for sorting. The popup’s <strong>Undo</strong> button is for its latest tab-closing action, not the previous tab order. If you want a different arrangement after sorting, drag the tabs into place.</p>
<p>Sorting also keeps repeated copies of pages. If that makes the largest sets unnecessarily long, <a href="/guides/close-duplicate-tabs/">close duplicate tabs</a> and sort again using the remaining counts.</p>
<p>When you finish with an entire website, use <a href="/guides/close-tabs-from-same-website/">Close site tabs</a> to remove its pages. Sorting is the option for the tabs you still need: it makes them easier to find without deciding which pages to close.</p>`,
      },
    ],
  },
];
