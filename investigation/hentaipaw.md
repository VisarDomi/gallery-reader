# Hentaipaw.com Provider Investigation

## Site Architecture

- **Framework**: Next.js SSR (`_next/static` assets confirm). All content rendered server-side as HTML.
- **No API**: Zero JSON data endpoints. All non-HTML network requests are ad networks (`api.shinybirdwhispered.com`, etc.).
- **No client-side search**: The only search form searches `/articles/search` (keyword-only, no filters).
- **Cloudflare anti-bot**: Obfuscated challenge script on every page. Simple HTTP fetches work from browser context (tested: 10 parallel fetches all 200 OK, no CAPTCHA).

---

## URL Structure

| Resource | Pattern | Example |
|---|---|---|
| Home | `/` | `/` |
| Artist listing (paginated) | `/artists?page=N` | `/artists?page=100` |
| Artist detail (all galleries) | `/artists/{id}` | `/artists/7` |
| Group listing (paginated) | `/groups?page=N` | `/groups?page=2` |
| Group detail | `/groups/{id}` | `/groups/748` |
| Parody listing (paginated) | `/parodies?page=N` | `/parodies?page=2` |
| Parody detail | `/parodies/{id}` | `/parodies/7` |
| Character listing (paginated) | `/characters?page=N` | `/characters?page=2` |
| Character detail | `/characters/{id}` | `/characters/7` |
| Tag listing (paginated) | `/tags?page=N` | `/tags?page=2` |
| Tag detail | `/tags/{id}` | `/tags/2` |
| Article detail | `/articles/{id}` | `/articles/928225` |
| Image CDN | `https://cdn.imagedeliveries.com/{id}/thumbnails/{N}.{ext}` | 1.webp, 2.jpg, etc. |
| Viewer | `/viewer?articleId={id}&page={N}` | `/viewer?articleId=928225&page=1` |

---

## Entity Discovery (`artist`, `group`, `parody`, `character`, `tag`)

All five namespaces have identical listing and detail page structures. The same algorithms work for all.

### Listing pages

Each namespace has a paginated listing at `/{namespace}s?page=N`. Format:

```html
<a href="/artists/7" title="007">007</a>
<a href="/artists/31613" title="02">02</a>
<a href="/parodies/7" title="009-1">009-1</a>
<a href="/characters/2" title="001">001</a>
<a href="/tags/14390" title="🟢">🟢</a>
```

Each page has ~85-100 entries, alphabetically sorted (A-Z with a jump anchor `[A-Z](#)` at top). The `?letter=X` parameter is ignored (returns page 1 regardless).

**Distribution by page** (artists sampled):

| Page | First entry |
|---|---|
| 1 | numbers/symbols (007, 013...) |
| 100 | "hg" |
| 300 | "se" (senko, sera...) |

"i" names fall in pages 60–90. Binary search narrows to the exact page in ~3-5 fetches. Other namespaces (parodies, characters, tags, groups) follow the same pattern — exponential probe to find upper bound, then binary search.

### Detail pages

**Entity detail page** `/{namespace}s/{id}` is paginated — 30 galleries per page (`?page=N`). Each entry carries the language tag in the anchor text:

```html
<a href="/articles/928225">秘密距離ゼロセンチ, 日本語 秘密距離ゼロセンチ</a>
<a href="/articles/1323973">Kizudarake no Youjuu, English Kizudarake no Youjuu</a>
```

Format: `[Title, LanguageCode TranslationTitle]`. The `, LanguageCode` token in the anchor text reliably matches the article detail page's `### Language:` metadata (verified: English→English, Русский→Русский, 日本語→日本語).

**Page count**: Most entities have <5 pages. Artist 412 ("agobitch nee-san") has ~300 galleries across ~10 pages.

**Thumbnail extension** is extracted from `<img src="cdn.imagedeliveries.com/{id}/thumbnails/{N}.{ext}">` in the detail page HTML. All pages in a gallery use the same extension (all `.webp` or all `.jpg`). Extension is known at search time.

### Detail page as reverse-lookup source

The detail page (`/{namespace}s/{id}`) also contains the entity **name** in the page heading. This is used for ID→Name reverse resolution: one `fetch()` to the detail page extracts the name.


---

## Name/ID Resolution Cache

### Bidirectional mapping with namespace-qualified keys

IDs can collide across namespaces (e.g., ID 7 could be both an artist and a group), so all cache keys include the namespace prefix.

**In-memory** (two Maps, loaded from IndexedDB at provider `init()`):

```
nameToId: Map<string, number>    // e.g. "group:yu-yake spectrum" → 19171
idToName: Map<string, string>    // e.g. "group:19171" → "yu-yake spectrum"
```

**IndexedDB**: Separate database (`storage_names`) — NOT shared with the existing `storage_favs` database. One object store, rows `{ns, name, id}`. E.g. `{ns: "group", name: "yu-yake spectrum", id: 19171}`. Separate DB avoids migration risks and allows independent cache clearing.

Binary search fallback uses exponential probe to find the upper page bound (double page until zero entries), then standard binary search within the range. Works for all 5 namespaces identically (listings at `/{namespace}s?page=N`).

Name normalization: query names use underscores for spaces (`yu-yake_spectrum`). The resolution pipeline normalizes underscores to spaces before binary search comparison, since the site listing uses spaces. Cache stores the canonical (spaced) name.
### Resolution paths

| Direction | Input | Cache miss method | Cache key |
|---|---|---|---|
| Name → ID | `group:yu-yake_spectrum` | Binary search `/groups?page=N` (normalize `_` → ` `) | `name:group:yu-yake spectrum → 19171` |
| ID → Name | `/groups/19171` | Fetch detail page `/groups/19171`, scrape heading | `id:group:19171 → "yu-yake spectrum"` |

On any successful resolution, both cache directions are populated:
- `nameToId.set("group:yu-yake spectrum", 19171)` AND `idToName.set("group:19171", "yu-yake spectrum")`
- One `{ns: "group", name: "yu-yake spectrum", id: 19171}` row written to IndexedDB

At `init()`, load all IndexedDB rows into both Maps. Subsequent lookups in either direction hit memory (sync).

---

## Language Filtering (client-side only)

No `/languages/` route is supported. Language filtering is purely client-side: the `language:` namespace is parsed in the query, and the listing page anchor text is filtered in memory.

**Language tag in listing anchor text IS reliable.** Each gallery link on entity detail pages includes the language:

```
, 日本語  → Japanese
, English → English
, 中文    → Chinese
, Русский → Russian
, Español → Spanish
, 한국어  → Korean
, Français → French
```

Verified against article detail page `### Language:` metadata (2/2 sample, zero mismatches). The tag is generated by the same Next.js template that renders the detail page, so consistency is structural, not coincidental.

**No article detail pages need to be opened for language filtering.** One listing page gives 30 `(articleId, language)` pairs.
For a query like `group:yu-yake_spectrum language:japanese`:

### 1. Resolve name → ID (cached after first lookup)

```
resolveName("group", "yu-yake_spectrum"):
  normalize _ → space: "yu-yake spectrum"
  hit  → return 19171
  miss → binary search /groups?page=N → extract ID → cache bidirectionally → return 19171
```

### 2. Fetch galleries with language filter

Scrape `/groups/{id}?page=1`:
- Parse each anchor: extract article ID and `, LanguageCode`
- Filter to target language in memory
- Collect remaining article IDs

### 3. Paginate

Repeat `?page=2`, `?page=3` until a page returns zero entries. Parallel fetch all pages.

### Performance (verified with browser `fetch`)

| Scenario | Pages | Strategy | Time |
|---|---|---|---|
| Small artist (30 galleries) | 1 | single fetch | ~100ms |
| Large artist (300 galleries) | 10 | 10× parallel `fetch()` | **349ms** (all HTTP 200) |
| Artist 412 test | 10 pages (288 articles) | 10× parallel | 349ms, zero failures |

Parallel fetching works from browser context. 10 concurrent same-origin `fetch()` calls all returned HTTP 200 with no rate limiting.

---

## URL Design (Architecture Decision)

### App URL format

The app URL encodes the resolved ID in the path (matching the real site's URL structure) and carries the language filter in a `lang` query parameter. The `lang` param is ignored by the real site. Page comes first, language last:

```
/groups/19171?page=2&lang=Japanese
/artists/8199?page=1&lang=Japanese
```

This is the URL stored in browser history and restored on Safari restart.

### Round-trip contract (IMPLEMENTED)

Three provider methods changed to async on the `Provider` interface. Existing providers added `async` prefix (zero body changes — JS auto-wraps the return in a Promise). All call sites in `main.ts`, `routes/search.ts`, `ui/shell.ts`, `ui/saved-searches.ts`, and `ui/info-modal.ts` updated to `await`.

- `searchUrl(rawQuery, page?): Promise<string>` — was sync, now async (name→ID resolution)
- `tagSearchUrl(ns, value, lang): Promise<string>` — was sync, now async (name→ID resolution)
- `matchRoute(pathname, search, hash): Promise<RouteMatch | null>` — was sync, now async (reverse ID→name resolution)

Pattern: `async` keyword on the method signature is sufficient — no `Promise.resolve()` wrapper needed. Callers add `await`. Event handlers that become async (`onclick`, `submit`) use `void` or `async () =>` naturally — rejected promises hit the browser console (unhandledrejection), which is the correct behavior for a userscript. No try/catch needed.

### searchUrl flow

1. Parse `rawQuery` → extract entity namespace (`group:yu-yake_spectrum`) + language
2. Normalize underscores to spaces, call `resolveName(ns, normalized)` → ID from cache or binary search
3. Build URL: `/{namespace}s/{id}?page={page}&lang={language}`
4. The URL IS the real site path (ID-based) + lang param

### matchRoute flow

1. Parse `pathname`: if `/groups/{id}` → extract `ns=group`, `id=19171`
2. Parse `search`: extract `page` and `lang` params
3. Call `resolveId(ns, id)` → name from reverse cache or detail page fetch
4. Reconstruct query: e.g. `"group:yu-yake spectrum language:japanese"` (canonical spaced form)
5. Return `{ handler: Handler.Search, query, page }`

### tagSearchUrl flow

1. Resolve `ns:value` → ID (same resolveName as searchUrl)
2. Build URL: `/{namespace}s/{id}?lang={language}` (no page param — defaults to 1)

### Home

`/` → `Handler.Home` (no change from existing pattern).

### Reader

`/viewer?articleId={id}&page=N` → `Handler.Reader` with `gid=id`, `index=N-1`.

---

## Image Thumbnails (search grid)

Thumbnail URL pattern: `cdn.imagedeliveries.com/{articleId}/thumbnails/{pageNum}.{ext}`.

Extension is extracted from thumbnail `<img>` elements in the entity detail page HTML at search time. All pages in a gallery use the same extension (`.webp` or `.jpg`). The article detail page (`/articles/{id}`) contains thumbnail `<img>` elements for every page — counting them gives `pageCount`.

**`thumbUrl` signature** (changed from the existing `thumbUrl(file: GalleryFile): string`):
```
thumbUrl(gid: number, index: number, ext: string): string
```

This decouples thumbnails from `GalleryFile` — the search grid calls `thumbUrl(gid, i, ext)` directly. No `fetchMeta` call, no `GalleryFile` allocation.

Extension is known from the entity listing page thumbnails. Page count comes from the article detail page (unavoidable — same number of fetches as the old `fetchMeta` approach, but cheaper: only count thumbnails, skip metadata parsing).

## Reader Images

Full-size images are at:

```
cdn.imagedeliveries.com/{articleId}/{40-char-sha1-hash}/{pageNum}.webp
```

The hash is a per-page SHA-1, embedded in the Next.js RSC payload. It is NOT predictable from article ID or page number.

### Approach A: `fetch()` the viewer page (winner)

One `fetch()` from the same origin returns the full HTML including the RSC payload with **all pages** for the article. No DOM needed. No JavaScript execution needed. Clean `document.open()` behavior preserved.

```js
const html = await (await fetch(`/viewer?articleId=${id}&page=1`)).text();
const re = new RegExp(`cdn\\.imagedeliveries\\.com/${id}/([a-f0-9]{40})/(\\d+)\\.webp`, 'g');
let match;
const pages = {};
while ((match = re.exec(html)) !== null) pages[parseInt(match[2])] = match[1];
// pages = { 1: "bd99c1...", 2: "f13113...", ... }
```

Verified: article 21743 (50 pages), all 50 hashes extracted from one fetch. Range 1-50 complete. 25KB response, ~100ms.

Viewer pages load 5 `<img>` elements at a time into a yarl lightbox, but the full hash set exists in `document.documentElement.outerHTML` from the RSC payload regardless of which viewer page you're on.

### Reader URL

`readerUrl(id, index)` returns `/viewer?articleId={id}&page={index||1}`.

---

## Info Modal

One `fetch('/articles/{id}')` provides all metadata: artists, groups, tags, language, category, page count. No additional requests needed.

- **`GalleryMeta.date`** — not present on article detail page. Default to empty string.
- **`GalleryMeta.title_jpn`** — extracted from the listing title before the `, LanguageCode` comma. Already available from the search fetch; no extra request.

---

## Image Dimensions

Dimensions are resolved via the new `resolveDimensions(files: GalleryFile[]): Promise<void>` method on the `Provider` interface. Mutates `files` in-place, filling in `width`/`height`. Only the reader calls it — info modal and search grid never pay for dimensions.

For hentaipaw: N parallel `Range: bytes=0-2047` fetches to `cdn.imagedeliveries.com/{id}/{hash}/{page}.webp`, then parse WebP VP8 headers. VP8 (lossy) parser lives in `hentaipaw/decoder.ts` — not shared across providers until another provider needs it.

For hitomi and imhentai: no-op. Dimensions come from `fetchMeta` (hitomi: gallery JS, imhentai: gallery HTML).

**VP8 (lossy) case** — missing from manga-reader's `getImageDimensions`:

```js
// WebP VP8 (lossy)
if (chunk === 'VP8 ' && buffer.length > 29) {
    return {
        width: ((buffer[26] | (buffer[27] << 8)) & 0x3FFF),
        height: ((buffer[28] | (buffer[29] << 8)) & 0x3FFF),
    };
}
```

50 parallel range requests tested at ~200-500ms.

---

## Sitemaps

Discovered via `robots.txt` → `/sitemap-index.xml`:
- **39 article sitemaps** — ~600 URLs each, ~23,400+ articles total
- Format: only `<loc>https://hentaipaw.com/articles/{id}</loc>` — no metadata
- Also: artist, group, tag, character, parody sitemaps

Not useful for language filtering (no metadata). Potentially useful for building a full article ID index.

---

## Implementation Decisions (Final)

### Contract changes (IMPLEMENTED — async methods)

Three methods already changed to async on the `Provider` interface. Existing providers added `async` keyword (zero body changes). All call sites updated to `await`.

- `searchUrl(rawQuery, page?): Promise<string>` — was sync, now async (name→ID resolution)
- `tagSearchUrl(ns, value, lang): Promise<string>` — was sync, now async (name→ID resolution)
- `matchRoute(pathname, search, hash): Promise<RouteMatch | null>` — was sync, now async (reverse ID→name resolution)

Error handling: unhandled promise rejections hit the browser console naturally. No try/catch needed — this is a userscript.

### Contract changes (PENDING — decouple files from metadata)

These changes land with the hentaipaw provider. All providers and call sites must be updated.

#### `Provider` interface changes

| Method | Old | New |
|---|---|---|
| `thumbUrl` | `(file: GalleryFile): string` | `(gid: number, index: number, ext: string): string` |
| `fetchMeta` | returns `GalleryMeta` with `files: GalleryFile[]` | returns `GalleryMeta` with `fileCount: number` (NO files array) |
| *(new)* `createFiles` | — | `createFiles(gid: number, count: number): GalleryFile[]` |
| *(new)* `resolveDimensions` | — | `resolveDimensions(files: GalleryFile[]): Promise<void>` — mutates in-place |

#### `GalleryMeta` type

- `files: GalleryFile[]` → `fileCount: number`

#### `SearchPage` type

Must carry per-gallery summaries: `ids: number[]` plus `galleryMap: Map<number, { pageCount: number; ext: string }>` (or equivalent). The search grid uses this for `thumbUrl(gid, i, ext)` without calling `fetchMeta`.

#### Rationale

- `fetchMeta` was a catch-all: metadata + files + dimensions. Info modal only needed `fileCount`; search grid needed thumbnails (gid, pageCount, ext); reader needed files with dimensions. Three unrelated concerns bundled.
- Decoupled:
  - `fetchMeta(gid)` → metadata only (title, language, artists, groups, tags, date, fileCount). One `/articles/{id}` fetch.
  - `thumbUrl(gid, index, ext)` → thumbnail URL. Search grid calls directly from data in `SearchPage`.
  - `createFiles(gid, count)` → `GalleryFile[]` with placeholder keys (enough for `imageUrls` to work).
  - `resolveDimensions(files)` → fills width/height via CDN Range requests. Reader-only.
  - `imageUrls(files)` → full CDN URLs via viewer page fetch. Reader-only.

### Name/ID Cache

- **Separate IndexedDB database** (`storage_names`) — NOT `storage_favs`. One object store, rows `{ns, name, id}`.
- In-memory: two `Map`s (`nameToId`, `idToName`), namespace-qualified keys, loaded from IndexedDB at `init()`.
- Bidirectional: any resolution populates both Maps + one IndexedDB row.
- `resolveName(ns, name)` → binary search fallback on `/{namespace}s?page=N`. Exponential probe for upper bound (double page until zero entries), then binary search. Works for all 5 namespaces.
- `resolveId(ns, id)` → fetch detail page fallback to scrape heading name.

### Reader image hashes (resolved in `imageUrls`)

`imageUrls(files)` fetches `/viewer?articleId={id}&page=1`, extracts all page→hash mappings from the RSC payload with a regex, and builds full CDN URLs: `cdn.imagedeliveries.com/{id}/{hash}/{page}.webp`. The hash map is cached by the provider so re-entry avoids re-fetching.

Files come from `createFiles(gid, count)`, not from `fetchMeta`. `key` encodes enough for `imageUrls` to work (e.g., article ID-based encoding).

### GalleryFile.key

`createFiles(gid, count)` creates `GalleryFile` objects with `key` encoding article ID (e.g., `key = String(gid)`). `imageUrls` decodes `key` to build CDN URLs. `thumbUrl` bypasses `GalleryFile` entirely — uses `(gid, index, ext)` directly.

### URL format

- Real site paths: `/{namespace}s/{id}?page=N&lang=Japanese`
- Page param first, lang param last
- `q=` NOT used; language is carried in `lang=`
- All 5 namespaces: groups, artists, parodies, characters, tags

### Query representation

- Internal query format: `"group:yu-yake_spectrum language:japanese"` (human-readable, underscore form)
- Multiple entity namespaces in one query: unsupported. `matchRoute` reconstructs from URL path + params + reverse cache.
- `search()` receives the human-readable query, resolves names→IDs internally.

### No-language search

`artist:name` without `language:japanese` shows all languages (no lang filter applied).

### Query parsing

Reuse hitomi's `namespace:value` tokenizer pattern. Supported namespace keys: `artist`, `group`, `parody`, `character`, `tag`, `language` (client-side filter).

### Error states

Generic. Promises reject, app error handling applies. No provider-specific error logic needed.

---

## App Flow (End-to-End)

### Search → Results Grid

1. User types `group:yu-yake_spectrum language:japanese` in search bar, hits Enter
2. `searchUrl(query)` resolves `group:yu-yake_spectrum` → ID `19171` (normalize `_`→` `, cache hit or binary search)
3. Navigate to `/groups/19171?lang=Japanese`
4. `matchRoute` parses path → extracts `ns=group, id=19171, lang=Japanese`
5. `initSearch(query, page)` → `initShell()` (build UI) → `await search(query, page)`
6. `search()` fetches `/groups/19171?page=1` through `?page=N` in parallel
7. Each listing page parsed: `(articleId, title, language, ext)` via regex
8. Filter to `日本語` in memory, deduplicate
9. `search()` returns `SearchPage` with `{ ids[], galleryMap: Map<gid, { pageCount, ext }> }`
10. `renderPaginatedGrid` — each row calls `thumbUrl(gid, i, ext)` directly from `galleryMap`. No `fetchMeta` call.

### Click Gallery → Reader

1. User clicks thumbnail → `readerUrl(gid, 0)` returns `/viewer?articleId={id}&page=1`
2. Page navigates, reader init: `document.open()` takeover
3. `fetchMeta(gid)` fetches `/articles/{id}` → metadata + `fileCount`. No files array, no dimensions.
4. `createFiles(gid, fileCount)` → `GalleryFile[]` with placeholder keys
5. `resolveDimensions(files)` → N parallel `Range: bytes=0-2047` fetches → VP8 parsing → width/height filled in-place
6. Create `<img>` elements with `style.aspectRatio = w/h`
7. `imageUrls(files)` fetches `/viewer?articleId={id}&page=1` → extracts page→hash mappings → full CDN URLs
8. Assign `img.src = url` for each image

### Info Modal

1. User clicks info button on gallery row
2. `fetchMeta(gid)` fetches `/articles/{id}` → metadata + `fileCount`. Lightweight — no files, no dimensions.
3. Artist/group/parody/character/tag names are clickable → `tagSearchUrl(ns, name, lang)` → resolves ID → builds URL
4. Stars (`favorites`) use existing IndexedDB toggle logic — gallery ID is the article ID

### State Restoration (Safari restart)

1. Safari restores tab → `/groups/19171?lang=Japanese` loaded from history
2. `matchRoute` extracts `ns, id, page, lang` → reconstructs query
3. `initSearch` re-fetches listing pages (IDs may have shifted, always fresh)
4. Scroll position restored from `localStorage` (app-wide scroll persistence feature)
