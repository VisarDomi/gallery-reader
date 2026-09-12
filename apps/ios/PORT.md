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
