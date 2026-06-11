# hitomi userscript decisions

## Hostile takeover — prevent ads/interceptors

Three-layer defense in cleanup.ts:

1. Remove ad scripts: Delete script tags loading from capndr.com/advertising.js
2. CSS pointer-events takeover: pointer-events: none !important on all elements, re-enable on our own
3. MutationObserver: Nuke any hostile fixed overlays (high z-index, low opacity) as they appear

Key insight: hitomi's advertising.js adds an invisible fixed div with z-index 2147483647 and opacity 0.01 that captures clicks/touches and redirects to ad sites.

## Search pagination

- Use span onclick with onPage callback so both search (full page reload) and home (localStorage-based) use the same module
- Items per page: 25
- Show ALL page numbers, no ellipsis

## State restoration

- Reader: URL hash only (history.replaceState)
- Home/favs: localStorage (hitomi_favs_page)
- Saved searches: localStorage (hitomi_saved_searches)

## DOM reading order

Critical: read hitomi DOM elements BEFORE buildPage() clears body.innerHTML.

## Gallery scraping

Enumerate ALL children of .gallery-content, not just .dj.

## OCR service

- Uses GM_xmlhttpRequest with @connect 192.168.1.197
- Picks image at viewport center
- Scales viewport coords to image coords via naturalWidth/clientWidth
- Resets spinner before navigation

## Info modal

- Uses full metadata from fetchMeta (title, artists, groups, parody, characters, type, language, tags, files)
- Clickable values navigate to hitomi search
- Tag cloud with namespace chips

## Font size

All text 16px minimum for Safari iOS.
