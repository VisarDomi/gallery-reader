# Goal: Hostile takeover — prevent ads/interceptors from capturing clicks/touches

## Status: COMPLETE ✓

## Solution
Three-layer defense in `cleanup.ts`:

1. **Remove ad scripts**: Delete `<script>` tags loading from `capndr.com/advertising.js`
2. **CSS pointer-events takeover**: `pointer-events: none !important` on all elements, re-enable on our own (`[class*="hs-"]`, `[class*="row-"]`, etc.)
3. **MutationObserver**: Nuke any hostile fixed overlays (high z-index, low opacity) as they appear

## Test Results
- Reader page loads without ad redirect
- Clicking toggles OCR overlay correctly
- No ad scripts remain after cleanup
