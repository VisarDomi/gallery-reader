# more info

Hitomi and Imhen are the only products: the native apps in `apps/ios` (read its
`PORT.md`), with their PC backup server in `server/`. Build exactly one provider
from `apps/ios/providers.json`; for shared changes, build and verify every
registered provider, then deploy both apps. Image addresses come from the provider
each time a reader opens (Hitomi's hosts move); only the image bytes are kept.
Do not carry gallery-downloader's offline-only assumptions into these online apps.

The web version they replaced is in Git history (before October 12, 2026).

## how

UIKit and Swift 6, no WebKit. The shared parts (live navigation stack, image
pipeline, strip reader, sideways thumbnail strips, HTTP client and cookie jar,
durable files, PC backups) come from ios-tools' NativeKit, vendored in
`apps/ios/Kit`. The app itself:

- `Providers.swift`: Hitomi (Nozomi index intersection, galleries/<id>.js, gg.js,
  tag suggestions) and Imhentai (its HTML pages), behind one `GalleryProvider`.
- `Library.swift`: the phone's copies: gallery details (`galleries/`), images
  (`cache/`, trimmed to 2 GB, least recently used first; one transfer per image,
  stopped once nobody waits for it) and searches (`search-cache/`).
- `ReaderState.swift`: favorites, saved searches, list and reader positions
  (`state.json`, written durably off the main thread).
- `ListScreen.swift`, `ListParts.swift`, `ReaderScreen.swift`, `Sheets.swift`: the
  screens.

Everything the app writes goes through atomic, synced files, so a kill or power
off leaves the previous or the new state, never a broken one.

## search cache

A search shows the phone's copy of its results first, then searches again in the
background and merges: Hitomi answers with every result, which replaces the copy;
Imhen's first page puts its new galleries in front of the kept ones (or replaces
them when nothing overlaps). The rows on screen stay where they are.

## Gallery Downloader sync

The apps send the complete local favorites list to Gallery Downloader after a
successful favorites backup and after every favorite/import change. Initial
backup/restore setup must succeed before favorites are published. An unavailable
PC never rolls back a local favorite action; a subsequent full snapshot repairs
missed changes. The default server is `https://192.168.1.197:7777`.

## PC backup and restore

On first use the favorites screen offers **Back up this phone** or **Restore from
PC**, with phone/backup counts. Later favorites visits back up silently. An
unreachable PC is silent: no setup prompt and no notification; the next visit
retries. Access, validation and storage errors stay visible until a successful
retry. A restored phone gets a new independent ID; the original backup stays
intact. Favorites, saved searches and all list and reader positions are included.
The lists never wait for the PC. See [PC backups](server/BACKUPS.md); check
`npm run backups:status` before formatting the phone.

The first launch of the native app moves the web version's data (favorites, saved
searches, positions, backup identity) out of WebKit's storage, once.

## Testing

```bash
npm run test:server                      # the backup server, on Linux
ssh mac 'cd ~/Developer/gallery-reader/apps/ios && bash scripts/test.sh'
```

`scripts/test.sh` checks the providers against saved responses (`Tests/Fixtures`)
and the image and search caches against a stub transport. Screens are checked in
the simulator and on the phone; see `apps/ios/PORT.md`.
