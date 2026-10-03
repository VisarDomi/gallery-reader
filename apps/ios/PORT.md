# Gallery provider apps

One codebase and one Xcode target build **Hitomi** (`hitomi`) and **Imhen**
(`imhentai`). `providers.json` is the product registry. Both are ordinary native
paid-team installations with no custom icons.

## Implementation

The web code lives in `src/`: routes, UI, storage, providers, CSS and the compute
worker, with the app's entry points and native bridge in `src/app/`. The builder
selects Hitomi or Imhentai for both the UI and the worker (`@selected-provider`,
`@selected-data-provider`); nothing else is swapped. Swift hosts WebKit, performs
URLSession requests, caches requested image bytes and persists WebKit's opaque
`interactionState` at navigation completion and app lifecycle checkpoints. It does
not parse galleries or render rows.

Routes create image elements with `loading="lazy"`, dimensions, URL resolution and
retry registration (`src/core/image-retry.ts`). Native `GalleryStore` is the sole
image-byte owner: a WebKit image request reads its file or joins the existing URL
download. Image routing is resolved per document; no resolved-URL manifest is
persisted. Images are cached on demand.

WebKit owns Back/Forward gestures, history, bfcache and cold session restoration.
Cold launches restore the reader URL and Back history but reset scroll positions
(accepted). There is no custom view-position file, anchor math, strip-scroll
restoration or reconstructed navigation stack; routes position a newly opened
reader and leave restored history to WebKit.

Each app keeps its own IDs, WebKit databases, favorites, saved searches and image
cache. Backups use the `gallery-reader:hitomi` and `gallery-reader:imhentai`
scopes on this repository's server (`server/BACKUPS.md`); favorites sync to
Gallery Downloader on port 7777.

## Build and deploy

Read `/home/visar/Documents/environment/mac-access.md` first. Mac SSH is
`visar@192.168.1.198`, using the dedicated trusted known-hosts file. USB wireless
stays DHCP. Phone UDID: `00008101-000639912881401E`; paid team: `65U58U86DD`.
The Mac mirror is `/Users/visar/Developer/gallery-reader/apps/ios`.

On Linux:

```sh
npm ci
npm run build:ios -- hitomi --prepare-only
npm run build:ios -- imhentai --prepare-only
npm run test:unit
npx tsc --noEmit -p apps/ios/tsconfig.json
```

The builder requires exactly one registered provider. The PC backup key is read
from this repository's server (`server/BACKUPS.md`) or an environment override.
Generated bundles, `.xcconfig`, build output and LocalCA.cer are ignored. Copy only
the existing PUBLIC LAN CA to `apps/ios/Resources/LocalCA.cer` before deployment.

For each provider, sequentially:

```sh
python apps/ios/scripts/deploy.py sync hitomi
python apps/ios/scripts/deploy.py build hitomi
python apps/ios/scripts/deploy.py install hitomi
```

Use `imhentai` for Imhen. The build stays attached to SSH and uses
`sudo launchctl asuser 501 sudo -u visar` for the logged-in Keychain, without
registering a LaunchAgent; it must report BUILD SUCCEEDED. Install verifies the
signed entitlement, provider, product name, no icon keys, paid team, profile
validity and inclusion of the phone, then updates the same app, keeping its data.
Never overlap builds: they share the target's Resources/Web staging directory.
On the Mac the prepared build needs only `bash scripts/build.sh <provider>` with
DEVELOPMENT_TEAM and SIGNING_DEVICE; Node is needed only to regenerate web assets.

## Inspection and checks

Use ios-tools' inspector on the Mac (`~/Developer/ios-tools/inspector`, see its
README) with `--url-prefix gallery://app/ --snapshot-file scripts/inspector-snapshot.js`
and `--bundle com.visar.HitomiReader.paid` or `com.visar.ImhenReader.paid`. Only
one inspector connection at a time; navigation may replace the inspected target,
so reconnect afterwards. Diagnostic evaluation is not a physical swipe/scroll
test: gestures are checked on the phone.

## Renewal

Both apps renew monthly through this repository's scheduler,
`com.visar.renewal.gallery-reader` ([ios-tools renewal](../../../../ios-tools/renewal/PAID-REFRESH.md));
`scripts/renewal.py` lists one entry per `providers.json` provider.
