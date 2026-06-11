# Goal: Hostile takeover — prevent ads/interceptors from capturing clicks/touches

## Problem
On hitomi.la reader pages, click events are intercepted by ad elements/overlays.
Tapping to show/hide the OCR button doesn't work because ads capture the event first.

## Investigation Phase

1. **Test current behavior in clean browser (no adblock)**
   - Load reader page, inject userscript
   - Click on body — does `document.onclick` fire?
   - Check what elements are on top (z-index, position fixed)
   - Log all click/touch events and their targets
   - Check if hitomi's JS adds overlay elements after our script runs

2. **Research online**
   - How do userscripts do hostile takeovers?
   - Techniques: `stopImmediatePropagation()`, `pointer-events: none` on hostile elements
   - Remove event listeners from non-friendly elements
   - MutationObserver to nuke hostile elements as they appear
   - Override `addEventListener` to block non-friendly listeners
   - CSS `pointer-events: none` on body, re-enable on our elements

3. **Test different approaches**
   - A: CSS hostile takeover — `body * { pointer-events: none !important }` then re-enable on `.hs-*`
   - B: Event listener nuke — remove all click/touch listeners from body after our script runs
   - C: Override `addEventListener` / `removeEventListener` to intercept
   - D: MutationObserver that strips pointer-events and removes hostile overlays
   - E: `document.body.style.pointerEvents = 'none'` with our elements forced to `auto`

## Implementation Phase

1. Pick the best approach(es) from investigation
2. Implement in `cleanup.ts` or a new takeover module
3. Test with xvfb browser (no adblock) that clicks actually work
4. Test touch events simulation
5. Verify OCR button toggle works reliably

## Acceptance Criteria

- Clicking on the reader body toggles OCR button every time
- No ad overlay captures the click
- Our UI elements (OCR button, gallery rows, pagination) remain interactive
- Works on first load and after dynamic content changes
