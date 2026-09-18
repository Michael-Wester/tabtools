# Locale support and mappings

Verified on **17 September 2026**. There are **30 implementation locales** across the extension, website and all three sets of proposed store text. This covers the complete Chrome/AMO intersection under the explicit aliases below, with Edge support inferred from its documented package-detection mechanism. **It is not a claim that the exhaustive three-store intersection or Edge dashboard codes have been independently confirmed.**

## Evidence

- `chrome-listing`: [Chrome listing instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-listing#localize_your_listing) explicitly associate each listing language with a packaged `_locales/LOCALE_CODE` directory.
- `chrome-locales`: [Chrome i18n locale table](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales) explicitly identifies Chrome Web Store support, not only browser UI languages. The extracted list is in `support-evidence.json`.
- `amo-production`: [AMO language definitions](https://github.com/mozilla/addons-server/blob/ce459da6793eb777d4d66ce96e56152834ec6e69/src/olympia/core/languages.py) and [production settings](https://github.com/mozilla/addons-server/blob/ce459da6793eb777d4d66ce96e56152834ec6e69/src/olympia/conf/prod/settings.py). Production sets `AMO_LANGUAGES` to `PROD_LANGUAGES`.
- `amo-translations`: [Author-supplied translation field handling](https://github.com/mozilla/addons-server/blob/ce459da6793eb777d4d66ce96e56152834ec6e69/src/olympia/translations/fields.py), `translation_from_dict`, excludes codes outside `AMO_LANGUAGES`. This connects production language support to developer-authored listing fields, rather than assuming AMO UI languages suffice. This is source-based evidence; a live publishing dashboard was not accessed.
- `edge-publishing`: [Edge publishing instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), sections “Enter store listing details for each language” and “If a single locale appears”. Localised manifest references and packaged messages cause languages to be detected; each language still needs a separately entered full description. The complete “Add a language” dropdown is not enumerated in the documentation. No package was uploaded to a store to probe it.
- [Firefox internationalisation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization): Firefox uses standard language codes; the package maps Chromium `no` to `nb` for Bokmål.

Every registry entry refers to these source IDs and carries its verification date. Edge values below are candidate publishing identifiers based on the package code with BCP-47 separators, **not tested dashboard identifiers**. A release reviewer must verify all 30 rows and check for any additional shared locales; record the evidence before claiming an exhaustive three-store set.

## Normalisation decisions

English source remains at `/` and `_locales/en`, mapped to AMO's default English `en-US`; there is no duplicate `en_US` package or duplicate AMO row. The original British-spelled English copy is preserved. `en-GB` has its own URL and package, with deliberately identical reviewed British English text. Canadian English is not silently equated with US or British English.

Chrome Spanish `es` maps to AMO Spanish (Spain) `es-ES`. Chrome Latin American `es_419` is not equated with any one of AMO `es-AR`, `es-CL` or `es-MX`, so those are outside this set. Chromium `no` maps to canonical Bokmål `nb` and AMO `nb-NO`; Nynorsk `nn-NO` remains distinct. Generic Swedish `sv` maps to AMO `sv-SE`. Portuguese regions and Chinese scripts remain separate. Serbian uses Cyrillic for the shared `sr` code.

AMO-only production codes excluded from the intersection: `dsb`, `en-CA`, `es-AR`, `es-CL`, `es-MX`, `fur`, `fy-NL`, `hsb`, `ia`, `ka`, `kab`, `nn-NO`, `sq`. Other Chrome languages (including Arabic and Danish) are not in this AMO production listing set. Hebrew supplies the RTL implementation case.

| Language / native name | Canonical | Extension Chromium / Firefox | URL | hreflang | Chrome | AMO | Edge candidate | Direction |
|---|---|---|---|---|---|---|---|---|
| English / English | en | en / en | / | en | en | en-US | en | ltr |
| Czech / Čeština | cs | cs / cs | /cs/ | cs | cs | cs | cs | ltr |
| German / Deutsch | de | de / de | /de/ | de | de | de | de | ltr |
| Greek / Ελληνικά | el | el / el | /el/ | el | el | el | el | ltr |
| English (British) / English (British) | en-GB | en_GB / en_GB | /en-gb/ | en-GB | en_GB | en-GB | en-GB | ltr |
| Spanish (Spain) / Español (de España) | es | es / es | /es/ | es | es | es-ES | es | ltr |
| Finnish / suomi | fi | fi / fi | /fi/ | fi | fi | fi | fi | ltr |
| French / Français | fr | fr / fr | /fr/ | fr | fr | fr | fr | ltr |
| Hebrew / עברית | he | he / he | /he/ | he | he | he | he | rtl |
| Croatian / Hrvatski | hr | hr / hr | /hr/ | hr | hr | hr | hr | ltr |
| Hungarian / magyar | hu | hu / hu | /hu/ | hu | hu | hu | hu | ltr |
| Italian / Italiano | it | it / it | /it/ | it | it | it | it | ltr |
| Japanese / 日本語 | ja | ja / ja | /ja/ | ja | ja | ja | ja | ltr |
| Korean / 한국어 | ko | ko / ko | /ko/ | ko | ko | ko | ko | ltr |
| Norwegian (Bokmål) / Norsk bokmål | nb | no / nb | /nb/ | nb | no | nb-NO | no | ltr |
| Dutch / Nederlands | nl | nl / nl | /nl/ | nl | nl | nl | nl | ltr |
| Polish / Polski | pl | pl / pl | /pl/ | pl | pl | pl | pl | ltr |
| Portuguese (Brazilian) / Português (do Brasil) | pt-BR | pt_BR / pt_BR | /pt-br/ | pt-BR | pt_BR | pt-BR | pt-BR | ltr |
| Portuguese (Portugal) / Português (Europeu) | pt-PT | pt_PT / pt_PT | /pt-pt/ | pt-PT | pt_PT | pt-PT | pt-PT | ltr |
| Romanian / Română | ro | ro / ro | /ro/ | ro | ro | ro | ro | ltr |
| Russian / Русский | ru | ru / ru | /ru/ | ru | ru | ru | ru | ltr |
| Slovak / slovenčina | sk | sk / sk | /sk/ | sk | sk | sk | sk | ltr |
| Slovenian / Slovenščina | sl | sl / sl | /sl/ | sl | sl | sl | sl | ltr |
| Serbian / Српски | sr | sr / sr | /sr/ | sr | sr | sr | sr | ltr |
| Swedish / Svenska | sv | sv / sv | /sv/ | sv | sv | sv-SE | sv | ltr |
| Turkish / Türkçe | tr | tr / tr | /tr/ | tr | tr | tr | tr | ltr |
| Ukrainian / Українська | uk | uk / uk | /uk/ | uk | uk | uk | uk | ltr |
| Vietnamese / Tiếng Việt | vi | vi / vi | /vi/ | vi | vi | vi | vi | ltr |
| Chinese (Simplified) / 中文 (简体) | zh-CN | zh_CN / zh_CN | /zh-cn/ | zh-CN | zh_CN | zh-CN | zh-CN | ltr |
| Chinese (Traditional) / 正體中文 (繁體) | zh-TW | zh_TW / zh_TW | /zh-tw/ | zh-TW | zh_TW | zh-TW | zh-TW | ltr |
