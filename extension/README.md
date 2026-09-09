# Gallery Reader — Safari extension

Gallery Reader is one of four independent extensions inside
[Reader Extensions](https://github.com/VisarDomi/reader-extensions). The Apple
host and suite deployment tools live there, not in this repo. This repo owns
Gallery's runtime, manifest/rules generation and behavior tests. It uses the same
page-origin IndexedDB as its userscript; do not clear website data or run both.

## Startup contract

1. Preinstalled `declarativeNetRequest` rules request a script CSP on supported
   top-level Hitomi/IMHentai documents. This policy works in the isolated Chromium
   fixture, but **enforcement is not established on the iPhone**. Do not claim
   that initial site scripts are guaranteed blocked (see validation below).
2. The bundled content script runs in `MAIN` at `document_start`, matches the
   provider route, replaces the document, then creates the UI and lazy worker.
3. No Hitomi JavaScript is reloaded. Autocomplete binds immediately to our input;
   its worker fetches Hitomi's source JSON suggestion index as data. The response
   policy requests `script-src 'none'` and permits the bundled blob worker.

Metadata files ending in `.js` are still fetched and parsed as **data** in our
worker. Thumbnails, full images, IDB, backup and favorites sync stay unchanged.
No cache headers, navigation UI or background extension process were added.

The extension guards initialization before replacing the document: Safari can
reinject document-start scripts synchronously inside `document.close()`. Without
that guard, native traces showed recursive initialization and duplicate scripts.
The replacement shell also owns its mobile viewport (`width=device-width,
initial-scale=1`); an early takeover cannot rely on the original site's meta tag.
Safari's per-site page zoom remains a user setting; no zoom lock is imposed.

The default is `guarded-replace`, the variant used in the confirmed real swipe
test. `READER_TAKEOVER_MODE` selects controlled experiments: `guarded-stop` keeps the
userscript's stop/open/close, `guarded-replace` stops then replaces the DOM,
`guarded-open` uses open/close without stop, and `guarded-write` stops and writes
an explicit empty HTML document. `guarded-deferred-close` delays its close by one
task; it did not resolve the loading-state observation. **iPhone Safari is the
acceptance target.**

This does not prevent the initial HTML request or promise zero image/CSS bytes.
This is still a startup takeover experiment, not a claim that Safari enforces
every response-header rule before any original site code can execute.
Cloudflare/challenge pages on owned routes may require disabling the extension
to run their scripts. Unowned routes retain their normal behavior.

## Build

```sh
npm run build:extension
```

Private output is `dist/extension/{manifest.json,rules.json,content.js}`. It
contains the PC backup access key: **do not publish artifacts**. Keep all three
files together so the takeover code and response policy stay aligned.

For fresh-machine setup, signing and installation, follow the
[containing-app guide](https://github.com/VisarDomi/reader-extensions#fresh-machine-setup).
The default sibling checkout is `../../reader-extensions`. From that repo,
`npm run stage -- gallery-reader` stages this existing bundle, or
`npm run build -- gallery-reader` rebuilds/stages it without changing the other
extensions. The host identity remains `com.visar.galleryreader.extensiontest`;
Gallery's remains `.Extension`. No provider data or signing identity was migrated.

## On-phone test

Enable **Gallery Reader** under Settings → Apps → Safari → Extensions.
Allow `hitomi.la` and `imhentai.xxx`, disable AdGuard on those two sites, and
disable the Gallery Reader userscript. Keep Gallery Reader's extension enabled.
Reload after granting access;
first-time permission activation is not a document-start timing test.

AdGuard caused the confirmed multi-second startup slowdown on the iPhone:
setting 100 image URLs cost about 174ms with it enabled versus 13ms without it.
Native `loading="lazy"` does not defer that synchronous URL-assignment cost.
The chosen solution is the per-site AdGuard exception, not a custom image loader.
Version 515 retains native image loading and removes the experiment. Home scroll
restoration no longer waits for page persistence and is cancelled by user input,
so a delayed startup cannot overwrite an intervening scroll. See `../test.md`.

Check home, search suggestions/search, source thumbnail strips, reader images,
favorites persistence, and native Back. Then repeat after force-quitting Safari.
Do not inject the userscript to make a failed extension test pass. Existing IDB
and PC backups should remain intact; no automatic data migration is introduced.

For timing evidence, inspect the navigation response CSP, earliest site-script
requests/execution, and data requests. Version 516 inserts no site script elements.
Fast UI alone is not proof that original scripts never ran.

## Validation status

- September 9, version 516: native inspection caught `jQuery.isReady === false`
  with zero autocomplete event handlers even after the document reported complete.
  Replaced the four site libraries with direct source-JSON suggestions in the
  worker. This also removes common.js's unrelated ad/periodic-script startup.
- Native inspection also caught reader transaction timeouts; independent disposable
  workers could open the same database but not read it within five seconds.
  The PC's last successful snapshot still contained 548 favorites and 67 searches.
  Removed pagehide/background scroll writes; active scrollend still persists.
  State/identity transactions now explicitly commit once requests are queued, and
  timed-out/closed connections are discarded without replaying ambiguous writes.
  This mitigates the suspension race; it cannot prove every Safari hang is fixed.
  Never delete website data as recovery. A Safari restart clears the captured
  stalled state so the new build can be tested.
- Large queries now fetch up to six term lists concurrently, deduplicate requests,
  and remove excluded IDs in place. Result order follows the final positive term
  regardless of response order. Query caches remain worker-lifetime only.
- On-phone worker comparison of the real 56-term saved query: old serial path
  10,119ms, then new path 135ms; both returned the same 1,915 IDs in the same order.
  The second run benefited from the first run warming Safari's HTTP cache, so
  this is **not** a controlled 75× speedup claim. No HTTP cache policy was changed.
- Installed the signed version 516 bundle and reloaded real Safari: no inserted
  site scripts/jQuery remained, search UI completed 120ms after takeover, images
  loaded, and no new database error appeared in that observed reload.
- After the Mac/Safari restart, the installed extension passed the native
  `tests/ios/hitomi-flow.py` smoke test: source autocomplete accepted
  `language:japanese`, the real 56-term saved query displayed 1,915 results,
  reader images decoded, and home still read 548 favorites/68 searches without
  a database or backup warning. The PC snapshot matched those counts at
  07:57 UTC. Home shell-to-ready was 17–34ms; the large query's full search
  startup took about 3.2s and reader shell-to-ready 142ms (first image at 1.43s
  from navigation). These are individual observed runs, not benchmark guarantees.
- Scripted `history.back()` skipped a search entry created by synthetic clicks;
  it is **not** counted as a bfcache pass. `hitomi-flow.py --manual-navigation`
  observes real taps/swipes and records `pageshow.persisted` plus DOM identity.
  The rare physical reader → search → home failure remains unverified; the
  captured IndexedDB stall is mitigated, not proof that every history bug is gone.
- 46 unit tests and real worker/home-backup browser tests pass. The full Chromium
  extension fixture still stalls on lazy reader image fetching, as documented for
  earlier builds; its new source-JSON autocomplete check passed before that stall.
  Do not count this fixture as a complete extension pass.

The observations below concern earlier builds; references to intentionally loaded
scripts and nonces are historical, not the current autocomplete architecture.

- September 8, 2026 suite: renamed the containing product to Reader Extensions
  without changing its bundle identity; added Manga Reader as the fourth iOS
  extension. Signed and installed successfully. Existing Gallery/KM/Stream
  bundles preserved. See [Manga validation](https://github.com/VisarDomi/manga-reader/blob/main/extension/README.md).

- iOS app built, signed and installed on the attached iPhone.
- Actual iOS Safari: enabled and inspected over the trusted Mac USB connection.
- Fixed recursive document-close reinjection with a window-lifetime guard.
- Fixed missing viewport in the shared shell. At Safari's 100% page zoom, native
  inspection reports viewport/body/reader width 428, visual scale 1, body font
  16px. User confirmed correct visuals. No CSS sizes or stored reader data changed.
- `guarded-replace` reader measurement: takeover 42ms, shell 43ms, data ready
  615ms, first image 632ms after navigation (one warm run, not a benchmark).
- Stop-based variants can leave `document.readyState` at `loading`. The
  no-stop variant completes, but a native trace showed an unwanted ad script;
  it must not be considered a successful before-site-JS guarantee.
- Actual physical thumbnail tap + swipe Back with `guarded-replace`: native
  console recorded `pageshow.persisted === true`, the exact same grid DOM node,
  and the same boot object. User confirmed immediate-feeling navigation/back.
  Scripted `history.back()` was inconclusive and is not substituted for this
  physical-gesture result. Two-rAF timing during a swipe is not the first visible
  cached snapshot or the gesture's duration.
- A separate instrumented warm home run: shell 33ms, first thumbnail 462ms.
  Reader navigation: response 260ms, data/URLs ready 621ms, first image 1756ms.
  These are navigation-relative samples, not cold-start guarantees or medians.
- Home frame/timer gaps reached roughly 400ms. Native sampling attributed most
  samples to `populateRow`, which creates thumbnail DOM concurrently across rows;
  lazy loading does not defer DOM creation. Reader was smoother (95th percentile
  frame gap 17ms), with one 337ms frame gap in that run. User reported no visible
  slowness in the real tap/swipe test and explicitly requested leaving
  `populateRow` unchanged. **No thumbnail rendering change was made.**
- Native rule parsing/loading succeeds in the Mac's disposable WKWebExtension
  context. The phone's unnonced inline-script probe still executes. This remains
  a separate policy investigation, not evidence that the viewport fix failed.
- Converter warned about `world`; MDN compatibility data lists support since
  Safari 18. The phone's behavior is authoritative, not that warning or MDN alone.
- `npm run test:extension`: preliminary real Chromium extension tests pass for
  both sites, worker/IDB, reader image decode, intentional suggestions, and
  unaffected routes. A separate policy-only installation verifies that initial
  inline/external scripts are blocked even without a takeover content script.
- Version 514 scroll audit: 29 unit tests pass. The current Chromium extension
  fixture stalls at lazy reader image loading, also reproduced with the original
  fixture and old delayed reader; the preliminary pass above is historical,
  not a claim that this run passed. See `../test.md` for the current checks.
- TypeScript checks
  include the extension entry/Hitomi adapter. Userscript build preserved.

`tests/ios/native-inspector.py` attaches to the real mobile Safari tab using
`pymobiledevice3` in the Mac mirror's `inspector-venv`. It does not inject a
userscript or clear storage. `--reload`, `--home`, and `--reader` navigate the live
tab; `--policy` runs a transient inline-script probe. Logs omit auth headers and
request bodies but may contain private gallery URLs; keep them local.
`tests/ios/check-rules.m` validates native rule loading separately. Old console
history can contain errors from previous builds: compare post-navigation events.

`READER_PERFORMANCE_PROBE=1 npm run build:extension` enables the temporary bounded
frame/timer probe in `extension/performance-probe.ts`. It never reads storage.
Run `tests/ios/startup-performance.py` on the Mac for the automatic sequence, or
`--profile-home` for native sampled stacks. `tests/ios/back-gesture.py` observes
a physical thumbnail tap and swipe, without navigating. **Rebuild/reinstall with
the flag omitted after testing**: normal bundles compile this probe out. The
normal boot timestamps remain available in `window.__galleryExtensionBoot`.

References:

- [Apple: declarative blocking](https://developer.apple.com/documentation/safariservices/blocking-content-with-your-safari-web-extension)
- [MDN: static content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)
- [MDN compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/content_scripts.json)
