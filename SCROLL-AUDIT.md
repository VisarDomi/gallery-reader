# Scroll tracking audit — 2026-09-11

## Recommendation

Do not replace scrollend everywhere. Separate **finding the current item** from
**committing progress**, **prefetching**, and **moving the scroll layout**. Geometry
can select an item during movement; it does not prove that native momentum ended.
The user's early-scrollend observation is a reason to retain a tested settling
guard, not evidence that every geometry callback is synchronized to visible pixels.

This is a source/documentation audit, not a measured iPhone performance comparison.
Only the separately requested 100 ms restoration has been implemented. No observer,
continuous sampling, new snapping algorithm, or other-repo rewrite was made.

## What the repositories actually do

| Repository | Selection / scroll-end work | Consequence of acting too early |
| --- | --- | --- |
| Gallery Reader reader | One `elementFromPoint` hit at the viewport midpoint, then `history.replaceState` | Bookmark can identify an intermediate image; this handler does not move scroll position |
| Gallery Reader home/search | Save `scrollY` through the worker | Restored position can be premature; no reason to scan images |
| Manga Reader | Scan loaded images, read every top, filter/sort to choose the last top above midpoint; update URL/title, save progress, track provider chapter, append next chapter | Wrong resume position, premature read-history writes or chapter loading; more work than a bookmark alone |
| Stream Viewer | Already checks the visual midpoint against three video slots during scroll; scrollend also normalizes layout and corrects scroll after a spacer landing | Early correction can cut momentum; target math alone cannot replace this safety decision |
| Video Platform | Same three-slot midpoint/rebase pattern | Same momentum risk |
| KM Explorer | Save listing `scrollY` on scrollend and pagehide | Intermediate saved position; no layout correction here |

No separate `video-explorer` directory was found under `work/video`; Video
Platform is the video app inspected here. Native Gallery Downloader and its paused
background-sync draft are outside this audit.

Source locations:

- `src/routes/reader.ts`, `src/ui/shell.ts` in Gallery Reader.
- `../manga-reader/src/routes/reader.ts`, `src/core/tracking.ts` and
  `src/core/compute/worker-entry.ts` in Manga Reader.
- `../../video/stream-viewer/src/routes/stream.ts`.
- `../../video/video-platform/packages/app/src/routes/videoViewer.ts`.
- `../../video/km-explorer/src/routes/search.ts`.

## Options and costs

### 1. Small, event-driven midpoint sampling

Use a passive scroll listener to mark a sample as needed, and allow at most one
pending animation-frame callback. Read geometry together, then update an in-memory
candidate only when its identity changes. Stop entirely when idle/hidden. This can
remove the requirement to finish a long gesture before knowing the current image.

Gallery Reader already uses one hit test, and the video viewers inspect only three
slots. Those are sensible starting points. Do not describe a hit test as zero-cost:
DOM geometry/hit-testing can require style/layout work. Do not read/write/read DOM
in a loop or send worker/database requests on every frame. Workers cannot read DOM
geometry; they can handle the bounded persistence work after selection.

`requestAnimationFrame` aligns/coalesces work; it does not automatically reduce
scroll processing to a low frequency. If measurements require a lower sample rate,
apply an explicit time cap and measure its latency trade-off. MDN warns against
treating rAF as a scroll-event throttle. [MDN scroll event](https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event)

### 2. IntersectionObserver

Promising for next-chapter prefetch and maintaining a small set of nearby images.
A narrow center band can detect image-boundary crossings without calling a handler
for every pixel. Use one observer for many targets, not an observer per image.

However, delivery is asynchronous, not proof of the exact composited screen state.
The callback still runs application JS; observing thousands of targets still has
setup/browser costs. Tall webtoon images must not use a naive 50%-visible threshold:
they may never reach it. A center-band design needs explicit handling of gaps,
rapid jumps and multiple entries in one callback. Root-margin percentages are
width-relative, and observer root rectangles do not track pinch zoom as a visual
magnifier. [Intersection Observer specification](https://www.w3.org/TR/intersection-observer/)

Thus an observer is a good visibility/prefetch signal, not a universal scroll-stop
detector. [WebKit's introduction](https://webkit.org/blog/8582/intersectionobserver-in-webkit/)

### 3. Improve Manga Reader's existing math before sampling it more often

Its current full-image scan and sort is the strongest identifiable CPU risk if
moved into a live scroll callback. It is not currently evidence of a measured
slowdown, since it runs after settling.

First remove the sort by finding the best candidate in one pass. If larger
libraries justify more work, retain ordered loaded-image references and investigate
binary search of their live top positions, or restrict reads to observer-maintained
nearby candidates. For 8,000 ordered entries, binary search needs roughly 13
comparisons instead of 8,000 top reads; this is an algorithmic comparison, **not**
a measured millisecond saving. The invariant must be monotonic vertical order.
Cached offsets require invalidation after image loads, chapter appends and resize.

Preserve semantics: Manga currently chooses the latest loaded image whose top is
above the midpoint, even when the midpoint is in a gap. That is not identical to
Gallery's hit test, which ignores a non-image hit. Do not silently unify them.

### 4. Determine quietness from position samples

Sample scroll/viewport position during activity and treat a short unchanged period
plus no held contact as a possible stop, resetting on new movement. This could
avoid relying solely on scrollend, but it still has a time/epsilon heuristic.
Two identical frames are not proof that Safari's compositor finished. More frequent
sampling cannot recover information WebKit hasn't exposed yet.

WebKit explicitly separates scrolling work and main-thread document updates.
Consequently neither DOM math nor a worker timer is an independent source of
ground truth for the visible last frame. [WebKit scrolling architecture](https://trac.webkit.org/wiki/Scrolling)

### 5. Native CSS scroll snapping for videos

Potentially removes the need for our own final scroll correction, but not a small
replacement: the present three-slot recycler, 10,000px spacers, transforms and
one-adjacent-video landing rule are part of the behavior. Treat this as a separate
design/prototype only if the current video scrolling actually needs changing.

## Suggested low-risk sequence

1. Keep the restored 100 ms behavior as the baseline. It delays bookkeeping, not
   native scrolling or normal image rendering. Confirm it feels right on the phone.
2. Prototype **Gallery Reader only**, in shadow mode: compute a live candidate
   without changing URL, storage, layout, or navigation. Compare it to the settled
   bookmark and actual observed image. One bounded diagnostics buffer, no permanent
   frame loop and no per-frame journal files.
3. If latency/cost justify it, promote candidate changes to URL bookkeeping while
   retaining separate, coalesced persistence. Handle visual viewport/zoom explicitly;
   `innerHeight / 2` is not always the magnified visible center. The video code
   already uses `visualViewport.offsetTop + visualViewport.height / 2` for its
   layout-coordinate midpoint. [CSSOM View](https://drafts.csswg.org/cssom-view/#visualViewport)
4. Tackle Manga separately: preserve resume/read-history semantics, optimize its
   selection, and consider an end-of-chapter observer for bounded one-chapter-ahead
   prefetch. Do not chain-load every chapter simply because the sentinel remains
   visible. Do not mark a quickly crossed chapter as read without deciding that
   policy first.
5. Leave Stream Viewer/Video Platform's layout-settlement guard alone until a real
   defect or measurement warrants changing it. KM is low-risk if later desired,
   but live candidate math adds no value to a plain stored `scrollY`.

## Evidence required before adopting an alternative

- Same iPhone/Safari, same long gallery/chapter and cache state; slow drag, fast
  fling, reversal, touch held still, rubber-band edges, toolbar changes, pinch
  zoom, rotation, image-load height changes, Back/Forward and background return.
- Time to correct candidate/bookmark, selected-image mismatches, JS callback count
  and duration, layout work, worker write count, and any scroll correction during
  visible momentum. Correlate with actual device viewing/recording; JS timestamps
  alone cannot certify the compositor's final frame.
- Verify database writes are bounded/latest-position-coalesced and ordered, and
  no stale callback writes after pagehide or overwrites a restored bfcache view.
- No universal numeric frame budget claimed before measurement. No change merely
  because synthetic tests pass or because one technique sounds more mathematical.

Bottom line: geometry is better for **live target identification**; it is not by
itself better for **proving scrolling has finished**. The useful simplification
is separating those responsibilities, not deleting the same event everywhere.
