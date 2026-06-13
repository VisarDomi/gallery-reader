# decisions

## Page takeover

`@run-at document-start`. `cleanDocument()` calls `document.open()` / `write()` / `close()` —
this aborts the entire original page load. No original scripts, styles, or ads execute.

## Dropdown autocomplete

All 4 site scripts required for full autocomplete with tag counts:
- `jquery.min.js` — DOM manipulation (`search.js` uses `$` everywhere)
- `common.js` — `domain`, `retry`, timer/loading helpers; provides tag metadata
  (namespace + count) to `get_suggestions_for_query`
- `searchlib.js` — B-tree index traversal, tag suggestion retrieval
- `search.js` — dropdown UI (`handle_keyup_in_search_box`, `to_page`)

Without `common.js` + `searchlib.js`: suggestions appear but missing namespace
labels and total counts. The stubs (`domain`, `retry`, `gg`, etc.) keep
`search.js` from crashing but don't populate suggestion metadata.


On search/home pages, `cleanUp()` then builds our header (search input + dropdown +
button) and grid placeholder. Site scripts (jquery, common.js, searchlib.js, search.js)
are loaded for the dropdown autocomplete only — no gallery rendering code runs.

## Reader

Own code path — `open(id, hash)` calls `cleanDocument()` directly then renders images.
No site scripts loaded on reader pages.

- Scroll tracking: `scrollend` listener + 100ms timeout → `elementFromPoint` →
  `history.replaceState(null, '', img.id)`.
- Images: appending `<img id="#N">` directly to body. No wrapper div.
- Navigation: keyboard left/right arrows.

## Search

Direct nozomi API (gallery-dl style). `searchGalleries(term)` in `hitomi.ts`
constructs the correct nozomi URL and decodes the binary response.

URL pattern: `https://ltn.gold-usergeneratedcontent.net/n/{ns}{tag}-{language}.nozomi`
- `female:X` / `male:X` → `tag/female:X-all.nozomi`
- `language:X` → `index-X.nozomi`
- Other namespaces → `ns/tag-all.nozomi`
- Bare words → `tag/word-all.nozomi`
- `_` in tags → ` ` (spaces) before constructing URL

### Why NOT results.js

`results.js`'s `do_search()` runs asynchronously via jQuery ready → `get_index_version`
→ `.then(do_search)`. Multiple failure modes:
- `get_index_version` can fail silently (promise hangs via `.catch(console.error)`)
- Index versions (`galleries_index_version`, `nozomiurl_index_version`) are fetched
  by the original page's inline scripts which we nuke — they stay empty
- `get_galleryids_for_query` needs `nozomiurl_index_version` to construct valid
  B-tree lookup URLs; with empty versions, lookup fails → unfiltered results (540K)
- `put_results_on_page` calls functions (`moveimages`, etc.) defined in scripts
  we don't load → crashes

Direct nozomi API avoids all of this. We parse the query ourselves, call the
nozomi endpoint directly, decode the binary, intersect/subtract.

### Query parsing

From gallery-dl `HitomiSearchExtractor.gallery_ids()` + `do_search()`:
- Split terms by whitespace
- Classify: positive, negative (prefix `-`), OR groups (`a or b`)
- OR groups: union terms within group, intersect group with main results
- Positive terms: intersect all
- Negative terms: subtract all
- Fallback (no positive terms): `language:japanese`

## Pagination

In-page via `history.replaceState(hash)`. `renderPage(page)` slices `allIds`,
creates pagination bar at bottom only, renders gallery rows into `#hs-grid`.

- Search: `hashchange` listener re-renders current page slice
- Home: `localStorage` for page persistence across reloads

## Ad blocking

MutationObserver on `document.body` (childList, not subtree). Removes:
- `<script>`, `<iframe>`, `<ins>` — always
- `<div>` with non-`hs-*` class — ad containers

All our body-children have `hs-*` prefixed class or id.

## Script loading

`loadScript(filename)` in clean-up.ts appends `<script>` to `<head>`.
Order: jquery → common.js → searchlib.js → search.js.
These provide: jQuery, the dropdown autocomplete (`search.js` + `searchlib.js`),
and utility functions (`retry`, `domain`, etc. from `common.js`).

`searchlib.js` is ~12KB and includes the B-tree index traversal, SHA-256,
nozomi decode, and tag suggestion logic.

## Home

`homeInit()` calls `buildGrid()` (adds saved searches bar + Enter handler) →
`getAllFavs()` from IndexedDB → `renderPage()`.

## Font

`'SF Pro Display', 'SF Pro Text', -apple-system, sans-serif` on body.
Base 16px. "i" button keeps Georgia italic for the convention.

## State persistence

- Reader: URL hash only
- Home favorites page: localStorage `hitomi_favs_page`
- Saved searches: localStorage `hitomi_saved_searches`
