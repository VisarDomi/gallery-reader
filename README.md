# Gallery-reader
A userscript used for tampermonkey on pc and userscript on ios.

## What?
This script changes the UI of the providers supported by this script so that's it easies to navigate the site. 3 main features: favorites, search, reader.

## Why?
Native navigation is cumbersome.

## How?
[features.md](features.md) explain the flows that this app handles best.

The main thread owns UI and browser navigation. After route matching and
stop/open/close, a lazy compute worker owns IndexedDB, gallery fetching/parsing,
Nozomi intersection, favorite/search operations, backup snapshots and HTTP sync.
Provider matching and URL constructors stay on the UI side; Hitomi's existing
DOM-based search-suggestion integration stays there too. Long image strips are
inserted in small batches so interaction can continue.

On first home/search use, the storage bridge reads only the old reader keys from
localStorage, yielding between batches. The worker validates and atomically
imports them into `gallery-reader-data` IndexedDB. The old localStorage values
remain untouched as a safety copy, but are not read or updated after migration.
Do not switch back to an old build: it would see that now-stale safety copy.

## Combo
If you're on ios, you can use it's ocr and shirabe to translate kanjis you don't know:

```
https://www.icloud.com/shortcuts/44abd8aa02de42a5a5986c10385e0c33
```

Use that in the shortcuts app of ios and make the shortcut activate by going to: Settings - Accessibility - Touch - Back Tap - Double Tap - you select the japanese ocr shortcut here.

## Gallery Downloader sync

On Hitomi and IMHentai, the userscript sends the complete local favorites list to Gallery Downloader after a successful home backup and after every favorite/import change. Initial backup/restore setup must succeed before favorites are published. An unavailable PC never rolls back a local favorite action; a subsequent full snapshot repairs missed changes.

The default server is `https://192.168.1.197:7777`. Override it while building with `VITE_GALLERY_SERVER_URL`:

```bash
VITE_GALLERY_SERVER_URL=https://your-lan-host:7777 npm run build
```

## PC backup and restore

Initial Backup/Restore shows a success confirmation. Later automatic home backups
are silent, even when data changes. An unreachable PC, connection timeout, or
unavailable service is also silent: no setup prompt and no notification. The next
home visit retries normally. Online access/validation/storage errors remain
visible until dismissed or a successful retry. Check PC backup status before formatting—routine saves no
longer display a success toast.

Each provider home offers **Back up this phone** or **Restore from PC** on first use,
with phone/backup counts. Subsequent home visits back up automatically. A restored
phone gets a new independent ID; the original backup stays intact. The PC retains
current plus one previous snapshot per ID. Favorites, saved searches, pagination
and all reader scroll positions are included. No unrelated site storage is copied.

Before formatting, install the new build and visit **both** provider homes.
Initial setup shows a confirmation; verify later silent saves with `npm run backups:status` in the sibling
gallery-downloader repository. See [the complete backup guide](../gallery-downloader/READER-BACKUPS.md).
Builds read that server's private key automatically; see [.env.example](.env.example).
Built userscripts contain the key: do not publish them. Startup still matches the
route first, then stop/open/close, then UI paint and asynchronous storage work.
Home content does not wait for the PC. Backup networking never occupies the
worker queue used for favorite/progress writes.

## [Testing](test.md)
Install debug.user.js and change iphone display auto-lock to never (remember to change it back) then run npm run tests
