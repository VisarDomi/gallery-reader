# Hitomi and Imhen

One codebase and one Xcode target (`GalleryReader`) build two iPhone apps:

| Provider | App | Bundle ID | Site |
|---|---|---|---|
| `hitomi` | Hitomi | `com.visar.HitomiReader.paid` | hitomi.la |
| `imhentai` | Imhen | `com.visar.ImhenReader.paid` | imhentai.xxx |

`providers.json` is the registry. The provider is chosen at build time (`ReaderProvider` in
Info.plist, from the ignored `build/<provider>/provider.xcconfig`); nothing else differs
between the apps. Both are paid-team installations with no custom icons. Native UIKit,
Swift 6, iOS 26, no WebKit. The shared parts (live navigation stack, image pipeline, strip
reader, thumbnail strips, HTTP client and cookie jar, durable files, PC backups) are
NativeKit, vendored in `Kit/`: see the [NativeKit guide](../../../../ios-tools/native/README.md).
What the apps do for the owner: [features.md](../../features.md).

## Rules

- Never uninstall an app to update it. `deploy.py install` installs over the same bundle
  ID and keeps the app's data.
- Never commit or publish the PC backup key. `build/<provider>/provider.xcconfig` and every
  built `.app` contain it; `apps/ios/build/` and `Resources/LocalCA.cer` are ignored. Copy
  only the existing PUBLIC LAN CA to `Resources/LocalCA.cer`.
- Renewal inputs (`scripts/renewal.py`): `GalleryReader/`, `GalleryReader.xcodeproj`,
  `Kit/`, `Resources/Info.plist`, `Resources/LocalCA.cer`, `providers.json`,
  `build/<provider>/provider.xcconfig`, `scripts/build.sh`, `scripts/build-provider.py`.
  Any change there, even a comment, blocks the monthly renewal until that app is deployed
  again. Docs and the other scripts are free to change.
- Build one provider at a time. A shared change is built and checked for both providers,
  then both apps are deployed. Deploy the app the change is about first: the owner tests it
  as soon as it is on the phone.
- `Kit/` is a copy. Change NativeKit in ios-tools (`native/Kit`) and vendor it
  (`native/scripts/vendor-kit.py`); every repository carries the same Kit.
- These apps are online. Image addresses come from the provider each time a reader opens
  (Hitomi's hosts move); only the image bytes are kept. Do not carry Gallery Downloader's
  offline-only assumptions over.
- Every write is atomic and synced (`DurableFile`, `BackgroundWriter`): a kill or a power-off
  leaves the old or the new state, never a broken one.
- The main thread only shows (NativeKit's rule). Here: details and kept searches are read
  from disk on the main thread only during a relaunch's first frames
  (`pipeline.isRestoring`); search merges run off it; a list change waits while the list
  moves (setting the offset stops a fling), except more rows at the end; main-thread work
  sits in FrameMonitor spans (`list.set`, `list.cell`).
- Relaunch to the exact screen, first frame included: the kept results
  (`SearchCache.loadNow`), details (`GalleryDetails.infoNow`) and images on the phone
  (`localFile`, during `ImagePipeline.beginRestore`) are used before the first frame.
- The PC is optional. Lists never wait for it; an unreachable PC is silent.
- On the phone, the owner's favorites are real data: never import, replace or delete them
  while testing, and undo any favorite you toggle.

## Code

`GalleryReader/`:

| File | What it owns |
|---|---|
| `AppDelegate.swift` | The scene and its dark window. |
| `AppController.swift` | The provider, data folder and HTTP clients; routes (`favorites`, `search(query)`, `reader(gallery, page)`) and the navigation stack; image sources; the PC backup flow and the Gallery Downloader sync; the one-time WebKit migration; DebugState reporters and the simulator hook actions. |
| `Providers.swift` | `GalleryProvider` and its two providers, `Hitomi` (with `GGCache`) and `Imhentai`. |
| `ImageTransferGate.swift` | Admission queues across image hosts, visible-page priority, speculation budgets, shared 429/503 cooldowns and diagnostic counters. |
| `Library.swift` | The phone's copies: `GalleryDetails` (`galleries/`), `ImageCache` (`cache/`), `SearchCache` (`search-cache/`, the merge rules). |
| `Prefetch.swift` | Everything fetched ahead of the screen, by priority (below). |
| `ReaderState.swift` | `state.json`: favorites, saved searches, list and reader positions; the backup record. |
| `ListScreen.swift` | Favorites and search results: one list, the floating header, positions, merges, the details. |
| `ListParts.swift` | `SearchHeader` (search box, Hitomi's suggestions, saved searches, count, Favs), `ListRowCell` (a gallery's strip, "i" and heart), `FavoritesFooter` (import/merge, export). |
| `ReaderScreen.swift` | The reader: NativeKit's strip reader over a gallery's pages. |
| `Sheets.swift` | `InfoSheet` (details), `BackupSetupSheet` (first-use backup or restore), `Toasts`. |

Also: `Tests/` (provider tests on saved responses in `Tests/Fixtures`, cache tests on a stub
transport), `scripts/` (below), `Resources/Info.plist`.

## Data on the phone

Each app keeps its data in `Library/Application Support/GalleryReader`:

- `state.json`: favorites (newest first), saved searches (most recent first), list anchors
  (`favorites`, `search:<query>`: the row at the screen's middle and how far down it, so they
  survive different heights), reader positions (the page and how far down it; the last 500
  galleries). `page`, `scroll` and a saved search's `page` belong to the backup record's
  format; the app does not use them (its positions are the anchors above).
- `navigation.json`: the screen stack, back and forward, with each screen's state (list
  anchor, strip offsets and open details; reader position).
- `galleries/<id>.json`: gallery details (they do not change once published).
- `search-cache/<sha256(provider:query)>.json`: each search's results.
- `cache/<sha256(key)>` and `.mime`: images and thumbnails, trimmed at launch to 2 GB (down
  to 1.5 GB, least recently used first).
- `cookies.json`, `backup-identity.json`, `debug-state.json` (written when the app leaves the
  screen), `webkit-migrated` (the one-time migration ran).

## Providers

### Hitomi

No site JavaScript runs; the app reads Hitomi's data files. Every host derives from
`Hitomi.domain` (`gold-usergeneratedcontent.net`). Not behind Cloudflare.

- Search: terms split on spaces; `-term` excludes. Each term's Nozomi index
  (`https://ltn.<domain>/n/<path>-<language>.nozomi`, big-endian 32-bit gallery IDs) is
  fetched, six at a time: positive terms are intersected, negative ones removed, in the last
  positive term's order. `female:x` and `male:x` read `tag/female:x`, `language:x` reads
  `index-x`, `ns:value` reads `ns/value`, a bare word `tag/word`; `_` becomes a space. No
  positive term: `language:japanese`. One answer holds every result.
- Gallery: `https://ltn.<domain>/galleries/<id>.js` (the JSON after the first `=`), Referer
  `https://hitomi.la/reader/<id>.html`. Page sizes come with it.
- Thumbnails: `https://tn.<domain>/webpsmalltn/<last hex digit>/<two before it>/<hash>.webp`.
- Images: `gg.js` (`https://ltn.<domain>/gg.js`, parsed with regular expressions) gives each
  hash's host `w<n>` and the current base path. It is kept in memory only, never on disk, and
  refreshed every 30 minutes (as the site does), or after a failed image (at most every 5 s).
- Suggestions: `https://tagindex.hitomi.la/<field>/<characters>.json` for the word at the
  cursor (404: none).
  The native autocomplete rows center full-height labels with the existing fonts; they do
  not use the system content configuration's vertical margins inside a compact row. Long
  names truncate horizontally and leave room for the count.

### Imhentai

HTML pages. Behind Cloudflare: curl from this PC gets a challenge, Apple's network stack
passes (for fixtures, see the NativeKit guide). Prefetching is gentler here (below).

- Search: terms separated by commas, all required (the site has AND, no NOT). `language:x`
  alone opens `/language/x/`; one `namespace:value` alone opens
  `/<namespace>/<value-with-dashes>/`; anything else opens `/search/?key=<terms>` with every
  category on (`m d w i a g`: manga, doujinshi, western, image set, artist CG, game CG), the
  chosen language's flag on (`jp en es fr kr de ru`; all on when none is given) and
  `lt=1 pp=0 dl=0 tr=0 apply=Search`. Pages of 20 (`?page=N`); the page count comes from the
  pagination links.
- Gallery: `/gallery/<id>/`. Details from the `galleries_info` block; pages from the inline
  `$.parseJSON('…')` (extension letter, width and height per page), on the base URL of the
  page's first `data-src`; thumbnails from the ones the page lists. Image Referer
  `/view/<id>/1/`.
- No suggestions.

### Both

Every value in the details except pages and date is a search made by `tagQuery`, in the
gallery's language: Hitomi `language:<lang> ns:value_with_underscores`, Imhen
`language:<lang>,value`.

Why these two sites: the search needs AND, ideally NOT. Hitomi has both and no Cloudflare;
Imhentai has AND and a big Japanese library. Passed over in an earlier survey: nhentai (AND
and NOT, but Cloudflare blocks it and its library is smaller), hentaipaw (biggest library,
neither), asmhentai (neither), exhentai (its Japanese galleries were purged).

## Caching and priorities

- A search shows the kept copy at once, searches again in the background and merges off
  the main thread: Hitomi's full answer replaces the copy; Imhen's first page puts its new
  galleries in front of the kept ones (or replaces them when nothing overlaps). Imhen's next
  page loads when the screen is within 100 rows of the end.
- Details: a row asks for its gallery when it shows (a failure is asked again after 5 s
  while on screen); 400 are kept in memory, all on disk.
- Images: visible and speculative callers share one transfer. A visible caller promotes a
  queued transfer without restarting its bytes; cancelling the last caller, including a
  cancelled prefetch worker, stops the actual request. Up to three attempts, then the screen
  says why and retries itself. Routing is resolved after admission, and asked again on retry.
- **Hitomi admission limits:** four image requests total, shared across original hosts AND
  thumbnails, of which at most two are speculative. Visible pages take the next slot ahead
  of speculation. These are explicit conservative app budgets, not published provider
  quotas. Imhen keeps a twelve-transfer budget per category, at most four speculative.
  URLSession's per-host connection setting is not this budget: image hosts and thumbnails
  exert shared upstream pressure, and HTTP/2 multiplexes requests.
- A 429 or 503 pauses the whole Hitomi image queue (Imhen: the affected category), including
  new requests, for at least `Retry-After`, otherwise 2 s, doubling up to 30 s. Each image makes
  one network attempt per admission; no independent URLSession retry loop bypasses the
  cooldown. Network errors return to the reader's retry loop. Image resource timeout is 45 s.
  `debug-state.json` includes `downloads`: limits, active/queued requests, peaks, throttle
  count and remaining cooldown (`shared` for Hitomi, separate categories for Imhen).
- Priorities, highest first (the worker widths below feed the admission budgets above):
  1. What is on screen asks for itself, at high priority. A list covered by a reader stops
     asking.
  2. An open reader's gallery, from its page outwards the way it reads: the nearest 6 high,
     the rest normal, 4 at a time. The list's work waits until the whole gallery is on the
     phone.
  3. A strip being swiped, from where it is, the way it moves: the nearest 12 high, the rest
     normal, 4 at a time.
  4. The list ahead, low priority: details outwards from the row at the screen's middle
     (below first; within 150 rows for Hitomi, 60 for Imhen; 4 or 2 at a time), each with
     the first 6 thumbnails from where its strip was left; then the whole strips of the
     nearest 20 rows on each side (Imhen 10). It follows the list (at most every 0.5 s) and
     pauses under a reader.

  A thumbnail on screen promotes and joins a download already coming ahead, preserving its
  bytes; a queued thumbnail is promoted ahead of speculation. Rows about to appear get their first five
  thumbnails decoded from the phone.

## The PC

- Backups: NativeKit's `KitBackup` on this repository's server
  ([server/README.md](../../server/README.md)), scopes `gallery-reader:hitomi` and
  `gallery-reader:imhentai`. Each visit to the favorites backs up silently or, on first use
  with the PC answering, offers **Back up this phone** or **Restore from PC** with the counts
  on each side. An unreachable PC is silent: no prompt, no message; the next visit retries.
  Access, validation and storage errors stay on screen until a backup succeeds or they are
  tapped. A restore replaces favorites and saved searches and becomes a new, independent
  backup; the one restored from is never changed.
- What is backed up: favorites and saved searches, in the record
  `{version: 1, indexedDB: {favorites, searches, page, scroll}}`, which the server validates
  (`page` and `scroll` are carried, unused). List and reader positions are not backed up.
- Gallery Downloader sync: after every favorite or import change (0.1 s later) and after
  each successful backup, the complete favorites list goes to
  `PUT <GalleryServerURL>/api/favorites/<provider>` as `{ids}`, newest first; only once this
  phone has a backup on the PC. A failure never undoes a local change; the next full list
  repairs it.
- Addresses: `GalleryServerURL` (`https://192.168.1.197:7777`) is fixed in
  `Resources/Info.plist`; the backup URL (`https://192.168.1.197:7722`, or
  `VITE_READER_BACKUP_URL`) and key come from the xcconfig. Both trust the PC through
  `Resources/LocalCA.cer`.
- The first launch moves the web version's favorites, saved searches, positions and backup
  identity out of WebKit's IndexedDB, once (`migrateFromWebKit`, `KitMigration`); removing it
  is a NativeKit open item.

## Build and deploy

Read [mac-access.md](../../../../../environment/mac-access.md) first. `deploy.py` reaches the
Mac as `visar@192.168.1.198` with the trusted known-hosts file (`mac-connect` finds it on
Ethernet or Wi-Fi). Phone UDID `00008101-000639912881401E`; paid team `65U58U86DD`; Mac
mirror `/Users/visar/Developer/gallery-reader/apps/ios`.

For each provider, one after the other (`imhentai` for Imhen):

```sh
python3 apps/ios/scripts/deploy.py sync hitomi
python3 apps/ios/scripts/deploy.py build hitomi
python3 apps/ios/scripts/deploy.py install hitomi
```

- `sync` writes the provider's settings into `build/<provider>/provider.xcconfig`
  (`npm run build:ios -- <provider> --prepare-only`: name, bundle ID, backup URL, and the key
  from `~/.local/share/gallery-reader/backups/access-key` unless `VITE_READER_BACKUP_KEY` is
  set; see `.env.example`), mirrors `apps/ios` to the Mac (`build/` excluded) and copies the
  xcconfig there.
- `build` stays attached to SSH and runs `scripts/build.sh` as the logged-in user
  (`sudo launchctl asuser 501 sudo -u visar`, for the Keychain) without registering a
  LaunchAgent. It logs to `build/<provider>/xcode.log` on the Mac (`deploy.py status
  <provider>` prints the end) and must report BUILD SUCCEEDED.
- `install` checks the bundle ID, display name, provider, absence of icon keys, signature,
  paid team, the phone in the profile and more than 45 days of profile validity, then
  installs over the same app (data kept) and launches it.
- Signed builds hold the signing lock that renewal also takes
  (`~/Library/Caches/ios-app-refresh/signing.lock`): while another build holds it, a build
  fails at once. Wait and retry.
- On the Mac, a prepared build needs only `DEVELOPMENT_TEAM=… SIGNING_DEVICE=… bash
  scripts/build.sh <provider>` from the GUI session.

Simulator builds (unsigned, no lock), on the Mac mirror after `sync`:

```sh
SIMULATOR=1 /usr/bin/python3 scripts/build-provider.py hitomi
# build/hitomi/native/Release-iphonesimulator/Hitomi.app
```

## Test and inspect

```sh
npm run test:server                                                        # the backup server, here
ssh mac 'cd ~/Developer/gallery-reader/apps/ios && bash scripts/test.sh'   # after deploy.py sync
```

`scripts/test.sh` checks the providers against saved responses (`Tests/Fixtures`: a Nozomi
index, gg.js, a Hitomi gallery, Imhentai gallery and search pages, suggestions) and the image
and search caches against a stub transport. This includes shared/prefetched transfer
promotion and cancellation, admission limits, reserved visible slots and shared Retry-After.
When a site changes its format, take a new fixture and fix the parser.

`bash scripts/test.sh --live` on the Mac also checks real Nozomi intersection, two galleries,
24 originals and 24 thumbnails, plus a mixed batch from a third gallery, through the
production provider/cache and Apple's URLSession, then verifies disk reuse without another network request. All files are temporary; it never
reads or modifies the phone's data.

### Measured Hitomi behavior (2026-10-20)

Bounded tests on the home connection reproduced HTTP 503 (no Retry-After), rather than a
permanent block. Four simultaneous originals succeeded in repeated Linux and Mac URLSession
batches; six on the Mac returned four 200s and two 503s. Linux batches of eight returned
four to five 200s, including when split between w1 and w2. Five succeeded in one Linux batch;
that is not a reliable advertised ceiling. The pattern is consistent with a shared client/IP
or upstream admission limit; these tests cannot establish its scope or promise a fixed quota.
Other devices or PC downloads can still compete for it, hence the shared cooldown.

Thumbnails at 1/2/4/8 concurrent and gallery metadata at 1/4/6 all succeeded in these samples.
An expired gg.js base path returned 404, while the current route returned 200. The site's
common.js refreshes routing every 30 minutes. Search terms are still fetched six at a time;
the metadata session retains its six connections per host setting. There was no evidence here for imposing an invented
requests-per-minute quota.

A first candidate with separate four-original/eight-thumbnail budgets passed isolated
batches, but the mixed batch produced 14 original-image 503s and took 78.93 s. Sharing **one
four-request budget across originals and thumbnails** removed those errors. The final Mac
URLSession run saved 24 fresh originals in 6.98 s, 24 thumbnails in 1.89 s, then 12 originals
and 12 thumbnails together from another gallery in 1.40 s: **zero 503/429s in all 72
transfers**, peak admission four, queues drained. Reopening 24 originals took 0.013 s with
no network. These are samples, not guarantees of every page's latency. The cache ownership
tests also reproduce and prevent orphaned prefetch transfers and cancel/restart promotion,
both of which previously inflated traffic.

Both signed phone builds were installed over their existing apps and approved for renewal.
The final iOS simulator build also passed, but this run could not check rendering/restoration:
CoreSimulator installation exceeded 90 seconds on the Intel Mac, and the simulator was shut
down. The live transfer tests above ran directly on the Mac without CoreSimulator.

- Simulator: simulator builds include NativeKit's test hooks on `127.0.0.1:8765` (`/state`,
  `/tap`, `/scroll`, `/back`, `/forward`, `/layout`, `/timeline`) and this app's actions
  `/action?name=search&query=…`, `/action?name=open&gallery=…&page=…`,
  `/action?name=downloads` (refreshes the diagnostic counters), and `/action?name=favorite&id=…`. From this PC, use ios-tools'
  `native/scripts/sim` (`install <app path on the Mac>`, `launch <bundle>`, `hook <path>`,
  `shot <out.png>`) and `native/scripts/restore-check <bundle>` (relaunch exactness; `--warm`
  for background and back). One app at a time; shut the simulator down afterwards: it loads
  the Mac heavily.
- Phone: gestures, feel and the real sites are checked on the phone. Use the app, leave it,
  then read its frame report (FrameMonitor) and state from `debug-state.json`:
  `/home/visar/Documents/work/ios-tools/native/scripts/frames com.visar.HitomiReader.paid 'Library/Application Support/GalleryReader'`.
  The file's `navigation`, `state`, `list` and `reader` keys show the stack, the counts, the
  list's anchor and the reader's gallery.
- Backups: `npm run backups:status` shows what each phone saved; check it before formatting
  the phone.

## Renewal

Both apps renew monthly through this repository's Mac scheduler,
`com.visar.renewal.gallery-reader` ([renewal](../../../../ios-tools/renewal/README.md));
`scripts/renewal.py` lists one entry per `providers.json` provider with its build inputs.
`deploy.py install` approves the installed build as that app's renewal baseline, keeping its
renewal date, when neither its inputs nor the app changed since `deploy.py build`; otherwise
it prints why approval was skipped.

## Gotchas

- In a zoomed reader the left edge pans the picture; Back works again at normal zoom.
- Opening a new screen clears the forward list, as in a browser. Favs on the favorites goes
  forward only when there is a screen to go forward to.
- A list restores its place only once the table has its frame (earlier, it lands too low).
  When the kept results lack the anchor row, it waits for the fresh ones; if they lack it
  too, the list starts at the top.
- Imhen: a `namespace:value` term counts only alone, or with a lone `language:` term (then
  as a keyword); next to other terms it is dropped (`Imhentai.searchURL`). This is intended:
  the owner's long-standing search rules, kept exactly; do not change them unasked. The
  result count (`~N`) is pages times 20, an estimate.
- xcconfig treats `//` as a comment: `build.mjs` writes URLs as `https:/$()/…`.
- The backup record is shared with the server: a change to `ReaderState.backupData` or
  `validate` needs the same change in `server/backups.mjs` (`contentCount`), and the PC's
  existing backups must stay readable.
- `GalleryServerURL` is in Info.plist, a renewal input: moving Gallery Downloader's server
  means redeploying both apps.
