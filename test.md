# Behavior tests

`test.txt` remains user-owned and has not been changed.

## Local checks

```bash
npx tsc --noEmit
node scripts/build.mjs --no-increase-version
npm run test:unit
npm run test:browser
```

The browser tests run in disposable Chromium profiles with synthetic provider
responses and a real disposable PC backup store. They prove these outcomes:

- 560 existing favorites, saved searches and scroll positions survive migration.
- Repeating migration cannot overwrite committed data.
- A waiting/unavailable backup PC does not stop home rendering or typing.
- Initial setup confirms success; routine home backups save silently, including
  changed data. An offline PC/timeouts cause no dialog or notification on fresh
  or enrolled phones. Online rejection errors warn; successful retries clear them.
- Favorite edits survive a reload, with current and previous server snapshots.
- Source thumbnails open full-size originals in the reader, including native
  Hitomi hash formats that may be present before takeover.
- A fresh browser restores an independent copy without altering the source backup.
- Worker-only IndexedDB and restored data survive a browser reload.

Unit tests cover validation, setup choices and explicit startup boundaries; they
are not a substitute for the full UI and real Safari checks.

## Scroll-end delay audit — version 514

Home saves the position captured at `scrollend` immediately to the asynchronous
storage worker. Reader updates the current image URL in that event without
adding a history entry. Neither waits another 100ms. Non-image/blank midpoint
hits leave the reader URL unchanged; image IDs remain `#<index>`.

The separate 100ms favorites-publish debounce remains: it batches network sync,
not scroll handling. Image lazy loading, rendering and native Back are unchanged.

TypeScript and all 29 unit tests pass. The installed-Chromium extension fixture
also verifies the home position reaches real IndexedDB as captured at the event,
not the later viewport position. Its reader-image check currently stalls before
any image request, including with the original fixture and old delayed reader.
That is an unresolved Chromium test limitation, not a passing image check or
evidence to change production lazy loading. The userscript browser fixtures pass
reader image decoding and the backup/migration behaviors above.

On iPhone, reload after installing, scroll home, open a thumbnail, scroll the
reader, and swipe Back. Check the reader bookmark and restored home position;
physical swipe behavior remains a manual acceptance check.

Version 514 was built/signed on the Mac and installed in Reader Extensions;
the packaged Gallery JS and rules hashes match the local build. Native Safari
inspection after reload confirmed home thumbnails, then four decoded full reader
images, viewport width 428 and scale 1. This was a smoke check, not a new physical
swipe/bfcache measurement. KM Explorer and Stream Viewer bundles were not replaced.

### Follow-up: unresponsive thumbnails immediately after refresh

Reproduced on the real iPhone, not with a synthetic `.click()`. These startup
observations describe the original failure (resolution below):

- Home creates 7,096 thumbnail elements for the selected 25 favorites. Native
  ScriptProfiler samples overwhelmingly contain `populateRow`. A temporary 50ms
  heartbeat recorded repeated 250–510ms intervals during construction, settling
  around ten seconds. Lazy image fetching does not defer DOM creation.
- `populateRow` creates a row's action buttons and requests `favorite-is` only
  after constructing all its thumbnails. In a timed run, replies to requests
  sent between 2.3s and 7.1s arrived together at 7.472s; a later lookup took 3ms.
  These are page-observed round trips, not measurements of database execution
  alone. Storage is still worker-only; button appearance is not evidence of a
  synchronous favorites read on the UI thread.
- Failed stationary taps reached `pointerup`, `touchend`, `mouseover` and
  `mousemove`, with a thumbnail handler already attached, but no subsequent
  `mousedown`/`click`. Another refresh had unsuccessful taps from 1.2s through
  9.9s, followed by a successful click at 10.165s. This matches Safari's documented
  content-change click suppression; the exact triggering mutation was not isolated.
- A wrapped, otherwise unchanged `window.scrollTo` recorded the app restoring
  its previously captured position at 7.834s. `init()` awaits `renderPage()`, which
  awaits `savePage()`, before `applyPendingScroll()`. There is no cancellation for
  intervening user scrolling, so an old zero can move the user back to the top.

No production behavior was changed for this diagnosis. Temporary inspector hooks
were removed. Fix candidates are bounded startup DOM work and early/user-intent-aware
scroll restoration; moving the already-worker-based favorites read is not the fix.
Validate immediate physical taps after refresh, scrolling during startup, and Back,
not just a programmatic click after the page has settled.

References: [Apple's touch-to-mouse event sequence](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html),
[WebKit content-change observer](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/cocoa/ContentChangeObserver.cpp).

### Resolution — version 515

An isolated native iPhone benchmark identified image URL assignment, not plain
element creation, as the expensive step: 320 detached images took about 5ms to
create/configure but 464ms to assign their sources. In a second comparison, 100
cross-origin URL assignments fell from 174ms to 13ms with AdGuard disabled. The
user independently confirmed responsive taps after disabling AdGuard. This is
consistent with [WebKit bug 264235](https://bugs.webkit.org/show_bug.cgi?id=264235).
The earlier attribution to DOM insertion alone was incomplete: building detached
rows did not eliminate the URL-assignment cost.

The user chose to disable AdGuard on Hitomi/IMHentai and retain native loading.
The custom IntersectionObserver loader and detached-row experiment were removed;
thumbnail construction, direct `src` assignment, `loading="lazy"`, source image
retry and ordinary document scrolling remain. No virtual window or custom tap
handler was added. Native swipe-back acceptance is still a physical user test.

The independent late-scroll bug is fixed: home initialization does not await its
page-save transaction, and scroll restoration is abandoned if input occurs while
storage/content loads or before the scheduled restore frame. Worker-only storage
and the current/previous backup scheme are unchanged. TypeScript and all 36 unit
tests pass, including a pending page-save and input-before-restore regressions.

With AdGuard disabled, the intermediate native-loading build measured first image
at 432ms and home initialization at 564ms after navigation. These are individual
warm-run observations, not a 500ms guarantee or a cold-network benchmark.

Final v515 was signed, hash-verified and installed in the shared Reader Extensions
app, together with the separately staged Stream Viewer v248 update. On a native
Safari reload with AdGuard disabled, Gallery's shell appeared at 273ms, home
initialization completed at 340ms and the first image loaded at 447ms after
navigation. The snapshot showed 25 rows, decoded thumbnails, width 428/scale 1,
and no app error. Home initialization is not a claim that every offscreen image
has loaded. Temporary benchmark files were removed from both machines.

## Real iPhone UI and bfcache

Disable the installed readers, enable the universal debugger, and keep Safari
unlocked/foregrounded. Build first, then run:

```bash
npm run tests
```

This uses the existing migrated favorites, opens a decoded thumbnail, verifies
that an original renders, then uses real Back. Hitomi requires `pageshow.persisted`,
the original row/strip DOM objects, and unchanged vertical/horizontal positions.
IMHentai reports its known bfcache limitation separately, without failing the
reader test or claiming that a new document was a cache restoration.
It never reinjects after Back, so a reload cannot falsely pass as bfcache.
It does not toggle favorites, import data, change progress, or clear storage.
The controlled tab returns to example.com and the bridge closes in `finally`.

### Actual Safari results — 2026-09-07

Both provider homes rendered source thumbnails and both readers decoded full
originals (381 pages in the selected Hitomi gallery, 359 in IMHentai). Hitomi
passed native bfcache, original DOM identity, and exact scroll restoration.

IMHentai **failed** the bfcache assertion: Back loaded a new native home document.
The same happened without Gallery Reader, and with a minimal document takeover
containing no workers or storage. Safari's same-origin HTTP probe received
`Cache-Control: no-store, no-cache, must-revalidate` from IMHentai. This matches
[WebKit's HTTPS no-store exclusion](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/history/BackForwardCache.cpp#L144).
This is recorded as an explicit bfcache skip, not a pass, and is not hidden by
reinjecting after Back. If IMHentai does restore from bfcache in a future browser
or provider version, the same DOM/scroll assertions as Hitomi apply. Isolate it with:

```bash
npm run tests -- --site imhentai.xxx
node tests/ios/imhentai-back-diagnostic.mjs
```

The diagnostic compares the native home and a minimal takeover without touching
reader storage. A userscript cannot remove the main document's response header;
no custom navigation/back UI was introduced to work around this limitation.

## Explicitly authorized migration and PC backup

```bash
npm run phone:backup
# Or one provider:
npm run phone:backup -- --site imhentai
```

This is an operation, not a destructive restore test. It visits all eight
provider homes across Gallery Reader and Manga Reader, audits counts/hashes,
injects the builds, selects **Back up this phone** when necessary, and compares
the persisted PC snapshot with the actual phone data. It never clears phone
storage or chooses Restore. Its audit reads IndexedDB inside a temporary worker;
only hashes/counts return to the controller. Names and access keys stay private.

The old localStorage-mutating phone runners were retired because they could no
longer restore the application's authoritative IndexedDB state. Their previous
behavior remains in Git history; personal data and `test.txt` were not removed.

See [backup operations and the verified phone counts](../gallery-downloader/READER-BACKUPS.md).
