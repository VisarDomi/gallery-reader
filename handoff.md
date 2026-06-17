# Provider abstraction handoff

When adding Exhentai (or any second provider), these leaks need addressing first.

## Leaks by category

### 1. Hardcoded navigation URLs

These hardcode `https://hitomi.la/` — should come from a provider config object:

| File | Line |
|---|---|
| `src/ui/gallery-row.ts` | `window.location.href = 'https://hitomi.la/reader/...'` |
| `src/ui/info-modal.ts` | `window.location.href = 'https://hitomi.la/search.html?...'` |
| `src/ui/saved-searches.ts` | `window.location.href = 'https://hitomi.la/search.html?...'` |

### 2. Hardcoded CDN domain

| File | Line |
|---|---|
| `src/ui/shell.ts` | `const SEARCH_DOMAIN = 'ltn.gold-usergeneratedcontent.net'` |

This domain is used to load site scripts (jquery, common.js, searchlib.js, search.js)
for the dropdown autocomplete. Exhentai won't need any of these — the CDN domain and
script loading should be provider-owned.

### 3. Direct provider imports (by name)

| File | Imports |
|---|---|
| `src/routes/reader.ts` | `{fetchMeta, imageUrl} from '../provider/hitomi'` |
| `src/routes/search.ts` | `{searchGalleries} from '../provider/hitomi'` |
| `src/ui/gallery-row.ts` | `{thumbUrl} from '../provider/hitomi'` |
| `src/ui/info-modal.ts` | `{fetchMeta} from '../provider/hitomi'` |
| `src/ui/paginated-grid.ts` | `{fetchMeta, HITOMI_ITEMS_PER_PAGE} from '../provider/hitomi'` |

`HITOMI_ITEMS_PER_PAGE` is a provider-named constant — the constant name itself leaks.

## Clean files

No provider logic found in: `routes/home.ts`, `debug.ts`, `main.ts`, `core/query-parser.ts`,
`storage/db.ts`, `storage/localstorage.ts`, `css/`.

## Suggested approach

Extract a provider interface from `src/provider/hitomi.ts` with:
- `readerUrl(gid, index?)` — navigation URL builder
- `searchUrl(query)` — search page URL builder
- `thumbUrl(gid)` / `imageUrl(gid, index)` — image URL builders
- `fetchMeta(gid)` — gallery metadata
- `searchGalleries(term)` — search execution
- `itemsPerPage` — pagination constant
- `searchDomain` — CDN domain (null for providers that don't need script injection)

Then a barrel `src/provider/index.ts` that exports the active provider. All UI/route code
imports from `'../provider'` instead of `'../provider/hitomi'`.
