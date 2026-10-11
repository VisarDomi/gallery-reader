# Gallery provider apps

One codebase and one Xcode target build **Hitomi** (`hitomi`) and **Imhen**
(`imhentai`). `providers.json` is the product registry. Both are ordinary native
paid-team installations with no custom icons.

## Implementation

Native UIKit and Swift 6 (iOS 26), no WebKit: see `../../notes.md` for the parts. The
provider is chosen at build time (`ReaderProvider` in Info.plist, from
`build/<provider>/provider.xcconfig`); nothing else differs between the apps.

Screens live in NativeKit's `LiveNavigationController`: Back from the left edge,
Forward from the right edge, both interactive. The stack, each screen's route and
its state (list anchor and strip offsets, open details, reader position) are saved
in `navigation.json` and rebuilt at launch. Positions are anchors (the item at the
screen's middle and how far down it), so they survive different heights.

Each app keeps its own data in `Library/Application Support/GalleryReader`:
`state.json` (favorites, saved searches, positions), `navigation.json`,
`galleries/`, `search-cache/`, `cache/` (images), `cookies.json` and
`backup-identity.json`. Backups use the `gallery-reader:hitomi` and
`gallery-reader:imhentai` scopes on this repository's server (`server/BACKUPS.md`);
favorites sync to Gallery Downloader on port 7777.

## Build and deploy

Read `/home/visar/Documents/environment/mac-access.md` first. Mac SSH is
`visar@192.168.1.198`, using the dedicated trusted known-hosts file; when Ethernet is
down, SSH falls back to the Mac's Wi-Fi automatically (`mac-connect --check`). USB wireless
stays DHCP. Phone UDID: `00008101-000639912881401E`; paid team: `65U58U86DD`.
The Mac mirror is `/Users/visar/Developer/gallery-reader/apps/ios`.

For each provider, sequentially:

```sh
python apps/ios/scripts/deploy.py sync hitomi
python apps/ios/scripts/deploy.py build hitomi
python apps/ios/scripts/deploy.py install hitomi
```

Use `imhentai` for Imhen. `sync` writes the provider's settings
(`npm run build:ios -- <provider> --prepare-only`: name, bundle ID, PC addresses and
the backup key read from this repository's server, `server/BACKUPS.md`) into the
ignored `build/<provider>/`, then mirrors `apps/ios` to the Mac (build output
excluded). Copy only the existing PUBLIC LAN CA to `apps/ios/Resources/LocalCA.cer`
before deployment. The build stays attached to SSH and uses
`sudo launchctl asuser 501 sudo -u visar` for the logged-in Keychain, without
registering a LaunchAgent; it must report BUILD SUCCEEDED. Install verifies the
signed entitlement, provider, product name, no icon keys, paid team, profile
validity and inclusion of the phone, then updates the same app, keeping its data.
Never uninstall to update.

Simulator builds (unsigned, no signing lock) for checks on the Mac:

```sh
SIMULATOR=1 /usr/bin/python3 scripts/build-provider.py hitomi
# build/hitomi/native/Release-iphonesimulator/Hitomi.app
```

## Inspection and checks

`bash scripts/test.sh` on the Mac runs the provider and cache tests. Simulator
builds include NativeKit's test hooks on `127.0.0.1:8765` (`/state`, `/tap`,
`/scroll`, `/back`, `/forward`, `/action?name=search&query=...`); ios-tools'
`native/scripts/sim` drives them from Linux. Run one app at a time and shut the
simulator down afterwards: it loads the Mac heavily. Gestures, feel and the real
sites' behaviour are checked on the phone.

## Renewal

Both apps renew monthly through this repository's scheduler,
`com.visar.renewal.gallery-reader` ([ios-tools renewal](../../../../ios-tools/renewal/PAID-REFRESH.md));
`scripts/renewal.py` lists one entry per `providers.json` provider. `deploy.py
install` approves the installed build as that app's renewal baseline, keeping its
renewal date, when neither its inputs nor the app changed since `deploy.py build`;
otherwise it prints why approval was skipped.
