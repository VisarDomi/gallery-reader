# Gallery provider apps

One codebase and one Xcode target build **Hitomi** (`hitomi`) and **Imhen**
(`imhentai`). `providers.json` is the product registry. Apps are ordinary native
paid-team installations with no custom icons; they do not require LiveContainer.
Do not change the user's readme.md or test.txt.

## Reused behavior

- `web/gallery-app.js` and `gallery.css` originate from gallery-downloader's
  committed `gallery-server/downloader/public/offline` implementation at
  `a417a54513a9340fec75d3cc22a21c347d58be26` (reader restore commit `ff4dcbf`).
  Preserve its viewport image activation/release, work queues, stable image slots,
  horizontal strip positions, input cancellation of restore, bfcache handling,
  and native cold-launch library-to-reader history construction.
- AppDelegate, WebController's WebKit setup/restore, LocalFiles, ViewPosition,
  LocalTrust and TransferGate are ported from the same committed app. The paused
  APNs/background draft in gallery-downloader's working tree is NOT included.
- Provider parsing, search, metadata, dimensions, image and thumbnail URLs come
  directly from `src/provider`. No Swift provider copies or PC image manifests.
- Search controls, saved searches, info modal, favorite actions, import/export,
  storage, backup and favorites publication import the existing TypeScript.
  Small exports in the shared UI allow reuse without executing document takeover.
- The native adapter uses URLSession for Fetch requests and caches requested
  images in the app container. WebKit renders files through `gallery://app/image`.
  No upfront file-size requirement, full-favorites download, site script execution,
  SOC, custom swipe gesture or APNs was added.

Both products have separate iOS containers (including WebKit storage). PC backup
uses the existing provider scopes `gallery-reader:hitomi` and
`gallery-reader:imhentai`. Initial enrollment/restore is the existing gallery UI;
no real backup is selected automatically by deployment. The PC is optional.

## Build and deploy

Read `/home/visar/Documents/environment/mac-access.md` first. Mac SSH is
`visar@192.168.1.198`, using the dedicated trusted known-hosts file. USB wireless
stays DHCP. Phone UDID: `00008101-000639912881401E`; paid team: `65U58U86DD`.
The new Mac mirror is `/Users/visar/Developer/gallery-reader/apps/ios`.

On Linux, from gallery-reader:

```sh
npm ci
npm run build:ios -- hitomi --prepare-only
npm run build:ios -- imhentai --prepare-only
npm run test:ios
```

The builder requires exactly one registered provider. Private PC backup credentials
are read from the existing ignored gallery-downloader key or environment override.
Generated bundles, `.xcconfig`, build output and LocalCA.cer are ignored. Copy only
the existing PUBLIC LAN CA to `apps/ios/Resources/LocalCA.cer` before deployment.

For each provider, sequentially:

```sh
python apps/ios/scripts/deploy.py sync hitomi
python apps/ios/scripts/deploy.py build hitomi
python apps/ios/scripts/deploy.py status hitomi
# Wait for no PID, LastExitStatus 0 and BUILD SUCCEEDED.
python apps/ios/scripts/deploy.py install hitomi
python apps/ios/scripts/deploy.py finish hitomi
```

Use `imhentai` for Imhen. The GUI LaunchAgent makes the logged-in Keychain available.
Install preflight verifies the actual signed entitlement, provider, product name,
no icon keys, paid team, profile validity and inclusion of the physical phone.
A paid wildcard provisioning profile is valid; the app's signed entitlement must
still match its exact bundle ID. Installation updates the same app, retaining data.
Never overlap builds: they share the single target's Resources/Web staging directory.

On the Mac the prepared build needs only `bash scripts/build.sh <provider>` with
DEVELOPMENT_TEAM and SIGNING_DEVICE. Node is required only to regenerate web assets.

## Inspection and checks

Use `scripts/app-inspector.py` with the Mac's existing
`/Users/visar/Developer/gallery-reader-extension/inspector-venv/bin/python` and
`--host-bundle com.visar.HitomiReader.paid` or `com.visar.ImhenReader.paid`.
Only one inspector connection at a time. Navigation may replace the inspected
WebContent target: reconnect after navigating. The app intentionally enables
Web Inspector. Diagnostic evaluation is not a physical swipe/scroll test.

Browser tests execute the real compiled provider workers and UI with deterministic
network/native fixtures. They cover both providers, search, favorites, metadata,
reader navigation, back, and persisted cold restoration. Device signing and real
provider/image checks must also pass; Xcode success alone is not runtime acceptance.

## Verified delivery — September 12, 2026

Both products built and installed with the paid team, exact signed app identities,
no custom icon keys and the physical device in their provisioning profile. Real
iPhone searches displayed 25 Hitomi rows and 20 Imhentai rows with decoded
thumbnails. Reader checks decoded images in a four-page Hitomi gallery and a
300-page Imhentai gallery. Imhen's forced-kill/relaunch restored page 5 at y=1300.
These are functionality checks, not a claim of physical gesture smoothness.

Both apps passed the existing renewal runner over USB: profiles advanced from
2027-09-12 17:56:30 UTC to 18:05:27 UTC, preserving app data. The single monthly
scheduler is enabled again with ten apps. Its generator now accepts
`--gallery-reader-root /Users/visar/Developer/gallery-reader/apps/ios`.
Recovery scripts/configs and wired verification evidence are copied into
`/home/visar/Documents/environment/mac-renewal`.

The 50 shared unit tests pass. Six old assertions still expected the previously
removed 100ms scroll delay; their expectations now match the user's existing
immediate-scrollend implementation. That runtime file was already modified
before this app task. The existing Vite takeover changes were also preserved.

Hitomi also passed the physical forced-kill/relaunch check: page 3 at y=1300
returned with all four gallery images decoded. The actual iOS accessibility tree
showed the pending per-app Local Network permission prompt. Provider browsing
works; PC backup access awaits Allow in Hitomi and Imhen. This is not a PC server
outage (the Mac reached it). Do not bypass TLS, select a real backup, or create
a new backup identity automatically just to test access.

## Online image parity correction — build 8

The initial port incorrectly persisted fully resolved provider image URLs inside
GalleryStore manifests and reused them on future launches. Gallery Downloader's
offline-manifest assumption does not apply to an online provider. On the physical
phone, Hitomi gallery 556561 rendered 88 slots with zero decoded images: its saved
routing prefix `1789239601` returned HTTP 404, while current `gg.js` returned 200
and supplied prefix `1789282802`. No account/session dependency was involved.

The native adapter now builds document-local manifests from the shared provider,
as the userscript does on reader load. It no longer reads/writes disk manifests
or uses the extra indefinite metadata fallback on network failure. URLSession's
normal HTTP cache remains, as does the on-demand image byte cache. Existing
favorites and view-position storage are unchanged. Old manifest files are ignored;
no data reset or favorites reimport is needed.

The app also imports `src/core/image-retry.ts` for loaded image elements instead
of its copied three-retry limit. Viewport activation/release still bounds image
work; clearing src releases a slot, and the shared registry drops released images.
No retry, provider parsing or URL construction logic is copied into Swift.

The browser fixture now decodes actual image responses via an intercepted origin
that models WKURLSchemeHandler. It simulates a routing-prefix change between
launches and refuses stale image URLs. The old build fails to decode after that
change; build 8 passes. A four-failure image test verifies recovery beyond the
old retry cap. Both providers retain search, favorites, metadata, Back and cold
reading-position restoration. The old offline-manifest test described above is
superseded by this online behavior, matching the userscript.

Both paid provider builds were installed with their existing IDs/data. The same
previously failing 88-page Hitomi gallery decoded all three initially activated
images after the update. Imhen's 144-page gallery also decoded three activated
images. Remaining pages stay viewport-driven, as in the existing app shell.

Build 8 renewal completed for both providers, with input fingerprints matching
the delivered builds. The single monthly scheduler is enabled; updated evidence
and recovery checksums are in environment/mac-renewal.


## Fidelity pass — build 9

Home/search rows now request only the shared provider's thumbnails, matching
`src/ui/paginated-grid.ts`; full reader image resolution no longer gates Home,
and thumbnail resolution no longer gates the reader. In-memory preview and
reader metadata are separate and remain document-local.

The app now imports the source `onSettledScroll` instead of the inherited 150ms
position timer. Native lifecycle checkpoints and horizontal-strip scrollend
remain. Pagination again scrolls the grid into view after rendering.
Both provider browser fixtures pass, including a Home-only request check that
rejects premature Hitomi gg.js/image routing, and a no-mid-scroll-save check.
The broader four-codebase audit is in Manga Reader's
`investigation/port-fidelity-audit.md`. Gallery Downloader is not an audit target.

## Second fidelity pass — build 10

The userscript remains the behavioral specification. This pass fixes additional
app-only deviations; it does not change Gallery Downloader or provider parsing.

- Reader metadata/dimensions now create page slots and restore the requested page
  before Hitomi image routing completes, in the same order as source reader.ts.
  Image URL resolution remains document-local and shared between active slots.
  Empty readers use the source message. Large readers and thumbnail strips yield
  every 32 elements, matching the source's UI scheduling.
- User input is recorded before asynchronous loading completes. A touch, pointer,
  wheel or key event cancels delayed initial positioning as well as ongoing
  anchor adjustment; it can no longer be forgotten before restore starts.
- Removed an undefined `positionTimer` reference left in pagehide cleanup after
  the first pass removed that timer. Suspension now finishes rejecting pending
  work, releasing workers and retaining DOM/scroll axes for bfcache. Incomplete
  off-DOM render batches are not retained as active image slots.
- Favorites without an explicit page use the source's saved Home page. Catalog
  rendering no longer waits for storage writes; stale asynchronous results cannot
  replace a newer page. Pagination updates also consider total/page-size changes.
- Removed copied pagination/modal/row styling that overrode source CSS. The
  count is above the grid with the source's `~` prefix; the current page is an
  inactive span. Only native image-slot/status styles remain in gallery.css.
- Fetch cancellation now rejects promptly and forwards cancellation to the
  corresponding URLSession task. Worker shutdown cancels its native requests
  and releases its Blob URL. This restores the source's abort/timeout semantics
  for autocomplete and optional PC requests, rather than waiting for network
  completion before observing an already-aborted signal.
- Removed unreachable offline download-state and fallback UI branches from the
  online shell. The requested on-demand native image byte cache and Gallery-style
  cold restoration/viewport activation remain.

Both expanded provider browser fixtures pass delayed routing, early input,
explicit pagehide/pageshow, saved Favorites page, original pagination styling,
Fetch abort propagation, search/favorites/info, retry recovery, current URLs and
cold-reader restore. All 50 shared unit tests and TypeScript checks pass.
Physical delivery and renewal evidence: `second-pass-verification.json`.

Build 10 device checks passed with 88 Hitomi slots and 144 Imhen slots, decoded
images and no page errors. Both apps checkpointed y=1300 and returned to y=1300
after force termination/relaunch. Native Fetch cancellation reported AbortError
in both apps. These are actual-device functional checks, not physical scrolling
smoothness measurements. Existing identities/favorites were retained.

Both build-10 baselines completed monthly renewal; current input hashes match,
last errors are empty, and the scheduler is enabled/idle with exit 0. Each signed
app's app.js, style.css and index.html match the tested prepared assets. Recovery
contains `gallery-second-pass-verification.json` with the updated evidence.


## September 13: disable image selection and long-press menus

All `img` elements and image-containing links use `-webkit-touch-callout: none`,
`user-select: none` (including WebKit's prefix), and `-webkit-user-drag: none`.
This includes covers, thumbnails, previews and reader pages. Taps and native
scroll gestures remain enabled; no touch listener or gesture interception was
added. Apple's [Safari CSS reference](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariCSSRef/Articles/StandardCSSProperties.html)
documents the callout property.

The rule lives in `src/css/style.css`, shared by the userscript, extension and
both native provider builds. Userscript/extension version 518 was rebuilt; Hitomi
and Imhen use build 11. Browser checks verified both prepared provider styles,
image selection/drag, link taps, editable inputs and scrolling.
