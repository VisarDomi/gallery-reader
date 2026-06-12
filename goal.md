# Hitomi hostile takeover — prevent ad click interception

## Problem

Ads on hitomi.la reader pages intercept clicks/touches, especially when zoomed in on Safari iOS. The current `cleanup.ts` CSS pointer-events takeover isn't aggressive enough. The OCR FAB button is a visible target that ads can overlay.

## Phase 1: Investigation

- [ ] Set up xvfb browser test script that loads hitomi.la reader page without adblock
- [ ] Document what ads/elements intercept clicks — check z-index, position, opacity, event listeners
- [ ] Test current cleanup.ts effectiveness with instrumentation
- [ ] Research online: hostile takeover, event listener nuking, ad clickjacking prevention for userscripts
- [ ] Research: how do other userscripts (violentmonkey/tampermonkey) handle ad interference?

## Phase 2: Implementation

- [ ] Upgrade `cleanup.ts` with Tango-level aggression:
  - [ ] Nuke `addEventListener` for touch/click/mouse events on non-friendly elements
  - [ ] Periodic DOM sanitizer (every 1-2s) that removes non-friendly elements
  - [ ] Nuke `setInterval`/`setTimeout`/`requestAnimationFrame` for non-friendly code
  - [ ] Nuke `MutationObserver` on hostile elements
  - [ ] More comprehensive CSS takeover
- [ ] Replace visible OCR FAB with an invisible click area overlay on the reader:
  - [ ] Full-viewport transparent overlay on reader pages
  - [ ] Double-tap / long-press / specific gesture to show OCR button or trigger OCR directly
  - [ ] Remove old `hs-ocr-fab` floating button
  - [ ] Protect our event handlers via saved original addEventListener references
- [ ] Update reader.ts to use new invisible click area pattern

## Phase 3: Testing

- [ ] Build userscript with `npm run build`
- [ ] Test in xvfb Chrome (DISPLAY=:110 or xvfb-run) on hitomi.la reader page
- [ ] Simulate clicks, touches (touchstart/touchend), zoomed viewport
- [ ] Verify OCR activation works
- [ ] Verify ads do NOT intercept clicks
- [ ] Test on search page and home page that existing functionality isn't broken
