# iOS Safari bfcache Investigation

## Problem Statement

imhentai cache is breaking on iOS Safari. The hypothesis: a WebSocket or persistent connection is being kept open, which prevents or interferes with the browser's back-forward cache (bfcache). When a user navigates from the userscript back to the original site (or vice versa), the cached page state is stale or broken.

---

## How bfcache Works

### Core Mechanism

bfcache is a **full in-memory snapshot** of a page — DOM, JS heap, layout, scroll position, form inputs, everything. When a user navigates away (back/forward), instead of destroying the page, the browser **freezes** it. If the user navigates back, the browser **restores** the snapshot instantly, without any network requests.

Key distinction from HTTP cache: bfcache stores the entire rendered page in memory, not just HTTP responses. A bfcache restore is always faster than even the best HTTP cache hit.

### Lifecycle Events

| Event | When it fires | Key property |
|---|---|---|
| `pagehide` | Page is about to be destroyed OR enter bfcache | `event.persisted` — `true` if entering bfcache, `false` if being destroyed |
| `pageshow` | After initial `load`, OR restored from bfcache | `event.persisted` — `true` if restored from bfcache |
| `freeze` | Immediately after `pagehide` (Chromium only) | Page is frozen, JS paused |
| `resume` | When page is unfrozen (Chromium only) | Fires before `pageshow` on restore |

**Critical:** `unload` event is the enemy of bfcache. Safari on iOS will cache pages with `unload` listeners but **won't fire** the event, making it unreliable. Use `pagehide` instead.

### What Gets Frozen

- All `setTimeout`/`setInterval` — paused, resumed on restore
- All pending Promises — frozen, resolved on restore
- JS execution — completely paused
- WebSocket connections — **this is the problem** (see below)

---

## WebSocket + bfcache Interaction

### Browser Behavior Varies

| Browser | Active WebSocket + bfcache |
|---|---|
| **Chrome (desktop)** | Page is **ineligible** for bfcache — evicted entirely |
| **Firefox** | Page is **ineligible** for bfcache — evicted entirely |
| **Safari/WebKit** | Page **enters bfcache**, WebSocket is **auto-closed on entry** |

This is the key: **Safari/WebKit takes a different approach.** Rather than blocking bfcache, it lets the page in and closes the WebSocket. This is the subject of active standards discussion (WHATWG HTML issue #12085, WebKit standards-positions #648). Chrome is experimenting with matching Safari's behavior.

### The "Ghost Socket" Problem

When a page enters bfcache on Safari:
1. JS execution is paused
2. WebSocket is auto-closed by the browser
3. But the JS code **doesn't know** — close event handlers may not fire while frozen
4. On restore, the WebSocket object exists in memory but is **dead**
5. If the code doesn't detect this, it will use a dead connection, losing messages

This is the "ghost socket" — looks alive, actually dead.

### iOS Safari's Additional Layer: Tab Suspension

Beyond bfcache, iOS Safari aggressively suspends background tabs:

1. **Timer throttling** — `setTimeout`/`setInterval` in background tabs can be throttled to once per minute or less
2. **Silent WebSocket death** — iOS can kill WebSocket connections in suspended tabs **without firing close events** (close code 1006 = dropped without close frame)
3. **Heartbeat failure** — if the app uses `setTimeout`-based heartbeats, they won't run in a suspended tab, so the server may close the connection for inactivity
4. **No `visibilitychange` on bfcache restore** — when returning from another app, Safari may restore from bfcache and fire `pageshow` with `persisted=true` but **not** `visibilitychange`

### The Flarum Precedent

The Flarum project (issue #4588, PR #4590) documented exactly this problem:
- WebSocket appears alive after iOS backgrounding but is actually dead
- `visibilitychange` alone misses bfcache restores
- Solution: force reconnect on BOTH `visibilitychange` (with >5s threshold) AND `pageshow` with `persisted=true`
- After reconnect, refresh visible data to catch up on missed events

---

## Browser Investigation Results

### Observed Behavior

- **imhentai**: navigating back from reader → page **refreshes** (bfcache not working)
- **hitomi**: navigating back from reader → page **resumes where it was** (bfcache working)

### What imhentai's Scripts Actually Do

Inspected via headless Chromium on `https://imhentai.xxx/search/?key=big+breasts&en=1`:

| Script | WebSocket | EventSource | unload | setInterval | Notes |
|---|---|---|---|---|---|
| `main.12163238.js` (75KB) | ✗ | ✗ | ✗ | ✓ | Countdown timers for UI messages, keyboard scroll. All clear themselves. |
| `user.14235631.js` (30KB) | ✗ | ✗ | ✗ | ✓ | User interaction code. |
| `notifications.65x2jh3.js` (712B) | ✗ | ✗ | ✗ | ✗ | Just AJAX scroll-to-load-more. Not real-time. |
| `expp.js` (11KB) | ✗ | ✗ | ✗ | ✗ | **Popup ad controller from exosrv.com.** Uses `window.open(href, "_blank")` + `popMagic.top.document.location = popMagic.url`. |
| `phasedcleft.com` (67KB) | ✗ | ✗ | ✗ | ✓ | Ad SDK. `setInterval(ut, 3e4)` polls battery status every 30s. Uses `localStorage`. |
| `waust.at/s.js` (7KB) | ✗ | ✗ | ✗ | ✗ | Tracking script. Creates iframes. |

**No WebSocket or EventSource anywhere.** The original hypothesis was wrong.


### Definitive Findings: Chrome `notRestoredReasons` API

Tested on `https://imhentai.xxx/search/?key=test&page=1` using a back/forward navigation in headless Chromium. The `notRestoredReasons` API reported three blocking reasons:

```json
{
  "reasons": [
    { "reason": "masked" },
    { "reason": "response-cache-control-no-store" },
    { "reason": "response-cache-control-no-store-with-js-network-request" }
  ]
}
```

### Root Cause #1: `response-cache-control-no-store`

**imhentai.xxx serves ALL pages with anti-caching response headers:**

```
cache-control: no-store, no-cache, must-revalidate
pragma: no-cache
expires: Thu, 19 Nov 1981 08:52:00 GMT
```

**hitomi.la serves with cache-friendly headers:**

```
cache-control: max-age=3600
```

This is the primary block. WebKit's own documentation ([WebKit Page Cache I](https://webkit.org/blog/427/webkit-page-cache-i-the-basics/)) states HTTPS pages are excluded from Page Cache when `cache-control: no-store` or `cache-control: no-cache` is present. Chrome blocks `no-store` pages from bfcache by default (newer Chrome has a limited 3-minute allowance, but the `no-store-with-js-network-request` variant overrides that).

### Root Cause #2: `response-cache-control-no-store-with-js-network-request`

This is a variant: the page has `no-store` AND JavaScript made a network request (fetch/XHR) while the page was being navigated away from. The ad/tracking scripts on imhentai make ongoing `fetch()` calls or `navigator.sendBeacon()` calls that trigger this. Scripts confirmed to use `sendBeacon`:

- `phasedcleft.com` (67KB ad SDK) — `sendBeacon`
- `cloudflareinsights.com` — `sendBeacon` (Cloudflare analytics beacon)
- `mrktmtrcs.net/mm.js` (40KB) — `sendBeacon`
- `dtscout.com` — `sendBeacon` + `beforeunload` handler

### Root Cause #3: `masked`

This means a cross-origin iframe or user-agent-specific reason is blocking bfcache. The page loads these cross-origin iframes:

- `t.dtscout.com/idg/` — tracking iframe, its own script with inline JS
- `tags.crwdcntrl.net/lt/shared/2/lt.iframe.html` — tracking iframe from Lotame/Crwdcntrl, serves its own HTML+JS

Either could register bfcache-blocking handlers internally (unload listeners, WebSocket connections, etc.) that propagate to block the parent page. The `masked` reason means Chrome hides the specific cause for privacy since these are cross-origin.

### Comparison: hitomi.la vs imhentai.xxx

| Property | hitomi.la | imhentai.xxx |
|---|---|---|
| `Cache-Control` | `max-age=3600` | `no-store, no-cache, must-revalidate` |
| `Pragma` | not set | `no-cache` |
| `Expires` | future date | 1981 (ancient past) |
| Script count | 15 | 35 |
| Ad/tracking scripts | 0 | ~15 |
| Tracking iframes | 0 | 2 (dtscout, crwdcntrl) |
| `sendBeacon` usage | 0 scripts | 4 scripts |
| `beforeunload` handlers | 0 | 1 (dtscout) |
| bfcache result | works | blocked (3 reasons) |

### Script-by-Script Analysis (2026-06-25)

| Script | Size | `unload` listener | `beforeunload` | `sendBeacon` | Notes |
|---|---|---|---|---|---|
| `main.12163238.js` (imhentai own) | 75KB | ✗ | ✗ | ✗ | Site UI, no lifecycle hooks |
| `user.14235631.js` (imhentai own) | 30KB | ✗ | ✗ | ✗ | User interaction |
| `notifications.65x2jh3.js` (imhentai own) | 712B | ✗ | ✗ | ✗ | AJAX scroll-to-load-more |
| `expp.js` (exosrv.com) | 11KB | ✗ | ✗ | ✗ | Popup ad controller |
| `phasedcleft.com` (ad SDK) | 67KB | ✗ | ✗ | ✓ | Battery polling + localStorage |
| `waust.at/s.js` (tracking) | 7KB | ✗ | ✗ | ✗ | Creates iframes |
| `cloudflareinsights` (beacon) | 33KB | ✗ | ✗ | ✓ | Cloudflare analytics |
| `mrktmtrcs.net/mm.js` | 40KB | ✗ | ✗ | ✓ | Marketing metrics |
| `dtscout.com` (tracking) | 7.5KB | ✗ | ✓ | ✓ | Tracking with beforeunload |
| `tsyndicate.com/ms.js` (ad SDK) | 61KB | ✗ | ✗ | ✗ | Media syndication |
| `tpmedia-reactads.com` (ad) | 107KB | ✗ | ✗ | ✗ | Ad platform |
| `crwdcntrl.net` iframe | N/A | unknown | unknown | unknown | Cross-origin iframe, content opaque |

Note: imhentai's own scripts (`main`, `user`, `notifications`, `download`, `slider`) contain **zero** bfcache-breaking patterns. All blockers come from third-party ad/tracking infrastructure.


### Safari iOS Live Test (2026-06-25)

Tested on real iOS Safari hardware with `debug.ts` v445 after DOM takeover (`document.open()`/`document.close()`) had wiped all page scripts.

**hitomi.la — bfcache works:**

```
[ 7530] PAGEHIDE persisted=true  → entering bfcache
[ 9626] PAGESHOW persisted=true  → bfcache RESTORE confirmed ✓
[ 9626] SENTINEL=1               (unchanged, init didn't re-run)
```

**imhentai.xxx — bfcache fails:**

```
[  290] PAGESHOW persisted=false  (fresh load, bfcache NOT used)
[  290] NAV-TYPE: back_forward    (user pressed back, bfcache skipped)
[  290] SENTINEL=1                (init re-ran from scratch)
```

Post-takeover imhentai stats confirm all script-level blockers are eliminated:

| After `document.open()` | |
|---|---|
| `SCRIPTS: 0` | All ad/tracking scripts wiped |
| `IFRAMES: 0` | dtscout, crwdcntrl gone |
| `window handlers: none` | No unload/beforeunload registered |
| `sendBeacon` interceptor: silent | No beacons fired |

**Conclusion:** The DOM takeover successfully removes all script-level bfcache blockers. The sole remaining blocker is the `Cache-Control: no-store, no-cache, must-revalidate` response header served by imhentai.xxx — which Safari reads before JS executes and uses to mark the page ineligible for Page Cache. There is no client-side workaround for this header.




---

## Comprehensive Bfcache Blocking Reasons Reference

Every known reason a page can be blocked from bfcache, compiled from the HTML spec, Chrome implementation, and MDN. Use this for triaging what imhentai's scripts/dependencies might be triggering.

### Primary Documentation

| Resource | Link |
|---|---|
| MDN: Complete blocking reasons list (spec + browser-specific) | https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Monitoring_bfcache_blocking_reasons#blocking_reasons |
| web.dev: Back/forward cache guide | https://web.dev/articles/bfcache |
| Chrome DevTools: Test back/forward cache | https://developer.chrome.com/docs/devtools/application/back-forward-cache |
| WICG NotRestoredReasons explainer + spreadsheet of all reasons | https://github.com/WICG/bfcache-not-restored-reason/blob/main/NotRestoredReason.md |
| Google Sheets: full list of Chrome bfcache blocking reasons | https://docs.google.com/spreadsheets/d/1li0po_ETJAIybpaSX5rW_lUN62upQhY0tH4pR5UPt60/edit |
| WebKit Page Cache I – The Basics | https://webkit.org/blog/427/webkit-page-cache-i-the-basics/ |
| WebKit Page Cache II – The unload Event | https://webkit.org/blog/516/webkit-page-cache-ii-the-unload-event/ |
| WebKit BackForwardCacheNotes (implementation notes) | https://trac.webkit.org/wiki/BackForwardCacheNotes |
| Smashing Magazine: Performance Game Changer: Browser Back/Forward Cache | https://www.smashingmagazine.com/2022/05/performance-game-changer-back-forward-cache/ |
| Chrome: Enabling bfcache for Cache-Control: no-store | https://developer.chrome.com/docs/web-platform/bfcache-ccns |
| Chrome DevTools Tips: Debugging bfcache | https://developer.chrome.com/blog/devtools-tips-29 |
| Website Spec: bfcache reference | https://specification.website/spec/performance/bfcache/ |
| Lighthouse: Ensure page can be restored from bfcache | https://developer.chrome.com/docs/lighthouse/performance/bf-cache |
| Chrome: notRestoredReasons API | https://developer.chrome.com/docs/web-platform/bfcache-notrestoredreasons |
| MDN: NotRestoredReasonDetails.reason | https://developer.mozilla.org/en-US/docs/Web/API/NotRestoredReasonDetails/reason |

### All Known Blocking Reasons

Grouped by likely relevance to imhentai's ad/tracking scripts. Each reason is a string value in `NotRestoredReasonDetails.reason`.

#### Spec-mandated reasons (common across browsers)

| Reason | What it means |
|---|---|
| `fetch` | A `fetch()` initiated during unload was canceled; page not stable. |
| `lock` | Held Web Locks (`navigator.locks`) terminated during unload. |
| `masked` | Privacy-protected: either cross-origin iframe blocked it, or user-agent-specific reason. |
| `navigation-failure` | Original navigation errored; storing error doc prevented. |
| `parser-aborted` | Initial HTML parsing never finished. |
| `websocket` | Open WebSocket shut down during unload. Chrome/Firefox block; Safari auto-closes on entry. |

#### Browser-specific reasons (Chrome primarily, may vary)

| Reason | What it means |
|---|---|
| `unload-listener` | `unload` event listener registered. Chrome/Firefox block entirely; Safari more lenient. |
| `response-cache-control-no-store` | HTML response had `Cache-Control: no-store`. Blocks in Chrome (relaxed with 3min timeout in newer versions); Safari iOS may still bfcache. |
| `response-cache-control-no-cache` | HTML response had `Cache-Control: no-cache`. |
| `response-status-not-ok` | HTTP status was not 2xx. |
| `response-scheme-not-http-or-https` | Non-HTTP(S) scheme. |
| `response-auth-required` | 401/407 authentication required. |
| `response-keep-alive` | `Keep-Alive` header present. |
| `request-method-not-get` | Page loaded via POST (not GET). |
| `outstanding-network-request` | Pending network requests on unload. |
| `broadcastchannel-message` | `BroadcastChannel` message arrived while page cached → evicted. |
| `sharedworker` | Page is in owner set of a `SharedWorker`. |
| `webtransport` | Open `WebTransport` connection. |
| `rtc` | Active `RTCPeerConnection` / `RTCDataChannel`. |
| `plugins` | Page contains plugins (`<object>`, `<embed>`). |
| `modals` | `alert()`, `confirm()`, `prompt()` shown during unload. |
| `non-trivial-browsing-context-group` | Multiple top-level browsing contexts in the group. |
| `navigating` | Loading was still ongoing on unload. |
| `navigation-canceled` | `window.stop()` called. |
| `audio-capture` | `getUserMedia({ audio })` permission requested. |
| `video-capture` | `getUserMedia({ video })` permission requested. |
| `mediastream` | `MediaStreamTrack` live during unload. |
| `background-work` | Background sync/fetch registered (`SyncManager`, `PeriodicSyncManager`, `BackgroundFetchManager`). |
| `idledetector` | Active `IdleDetector`. |
| `keyboardlock` | `Keyboard.lock()` active. |
| `midi` | MIDI access requested via `navigator.requestMIDIAccess()`. |
| `otpcredential` | `OTPCredential` created. |
| `paymentrequest` | Active `PaymentRequest`. |
| `pictureinpicturewindow` | Active `PictureInPictureWindow`. |
| `sensors` | Sensor access requested. |
| `speechrecognition` | Active `SpeechRecognition`. |
| `storageaccess` | Storage Access API permission requested. |
| `webhid` | WebHID `requestDevice()` called. |
| `webshare` | `navigator.share()` used. |
| `webxrdevice` | `XRSystem` created. |
| `smartcardconnection` | Active `SmartCardConnection`. |
| `serviceworker-added` | Service worker started controlling the client while cached. |
| `serviceworker-claimed` | Active service worker claimed while cached. |
| `serviceworker-postmessage` | Service worker received message while cached. |
| `serviceworker-version-activated` | Service worker version activated while cached. |
| `serviceworker-unregistered` | Service worker registration unregistered while cached. |
| `idbversionchangeevent` | Pending `IDBVersionChangeEvent` on unload. |

### Extension / Userscript Manager Interactions

| Resource | Link |
|---|---|
| Tampermonkey bfcache breakage bug (fixed in beta 5.3) | https://github.com/Tampermonkey/tampermonkey/issues/1491 |
| Firefox: Content scripts don't rerun with bfcache + fission (BZ 1734991) | https://bugzilla.mozilla.org/show_bug.cgi?id=1734991 |
| Firefox: User scripts don't run on pages with caching service worker (BZ 1643405) | https://bugzilla.mozilla.org/show_bug.cgi?id=1643405 |
| Violentmonkey inject-into context modes (page vs content) | https://violentmonkey.github.io/posts/inject-into-context/ |

### Open IndexedDB Connections

An open `IDBDatabase` connection (not just an active transaction) blocks bfcache. Well-documented across multiple projects:

| Resource | Link |
|---|---|
| idb-keyval #166: IDB connections must be closed for bfcache | https://github.com/jakearchibald/idb-keyval/issues/166 |
| Firebase JS SDK #6167: open IDB connection blocks bfcache | https://github.com/firebase/firebase-js-sdk/issues/6167 |
| w3c/IndexedDB #381: how IDB should behave with bfcache | https://github.com/w3c/IndexedDB/issues/381 |
| angular-async-local-storage #996: bfcache disabled with open IDB in Chromium + Safari iOS | https://github.com/cyrilletuzi/angular-async-local-storage/issues/996 |
| WebKit commit: IDBRequest no longer blocks bfcache (partial fix) | https://github.com/jaybhaskar/WebKit/commit/5a259e95eb65128a0dd742ed3b96156f452c80ac |

### WebSocket + bfcache Standards Discussion

| Resource | Link |
|---|---|
| WHATWG HTML #12085: Proposal to unblock bfcache for active WebSockets by disconnecting on entry | https://github.com/whatwg/html/issues/12085 |
| WebKit/standards-positions #648: WebKit's position (Safari already does this) | https://github.com/WebKit/standards-positions/issues/648 |
| Chrome Platform Status: Disconnect WebSockets on BFCache entry | https://chromestatus.com/feature/5068439115923456 |

### Debugging Tools

| Tool | Link |
|---|---|
| Chrome DevTools bfcache test (Application → Back/forward cache) | https://developer.chrome.com/docs/devtools/application/back-forward-cache |
| `notRestoredReasons` API for real-user monitoring | https://developer.chrome.com/docs/web-platform/bfcache-notrestoredreasons |
| BFCache Test (third-party online checker) | https://milten.io/services/bf-cache |
| Unlighthouse: Fix back/forward cache issues | https://unlighthouse.dev/learn-lighthouse/best-practices/bf-cache |
| SpeedVitals: Back Forward Cache Explained | https://speedvitals.com/blog/back-forward-cache/ |
| bfcache Optimization Guide (2026) | https://webperfclinic.com/article/bfcache-optimization-guide-instant-back-navigation |
---

## Sources

- [web.dev: Back/forward cache](https://web.dev/articles/bfcache) — comprehensive guide
- [MDN: Back/forward cache](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/bfcache) — reference
- [WHATWG HTML #12085](https://github.com/whatwg/html/issues/12085) — WebSocket bfcache standards proposal
- [WebKit/standards-positions #648](https://github.com/WebKit/standards-positions/issues/648) — WebKit's position on WebSocket + bfcache
- [Flarum #4588](https://github.com/flarum/framework/issues/4588) — real-world iOS Safari WebSocket + bfcache bug
- [Flarum PR #4590](https://github.com/flarum/framework/pull/4590) — fix implementation
- [Chrome Platform Status: Disconnect WebSockets on BFCache entry](https://chromestatus.com/feature/5068439115923456) — Chrome matching Safari behavior
- [MDN: Monitoring bfcache blocking reasons](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Monitoring_bfcache_blocking_reasons)
