# more info

Hitomi and Imhen are the only products: the native apps in `apps/ios` (read its
`PORT.md`), with their PC backup server in `server/`. Build exactly one provider
from `apps/ios/providers.json`; for shared changes, build and verify every
registered provider, then deploy both apps. Resolve image URLs through the provider
on each new reader document and reuse `src/core/image-retry.ts`. Do not persist
resolved URLs as offline manifests or carry gallery-downloader's offline-only
assumptions into these online apps.

## how

The main thread owns UI and navigation. A lazy compute worker owns IndexedDB,
gallery fetching/parsing, Nozomi intersection, favorite/search operations, backup
snapshots and HTTP sync. Provider matching and URL constructors stay on the UI
side; Hitomi's search-suggestion integration stays there too. Long image strips
are inserted in small batches so interaction can continue.

## Gallery Downloader sync

The apps send the complete local favorites list to Gallery Downloader after a
successful home backup and after every favorite/import change. Initial
backup/restore setup must succeed before favorites are published. An unavailable
PC never rolls back a local favorite action; a subsequent full snapshot repairs
missed changes. The default server is `https://192.168.1.197:7777`; override it
with `VITE_GALLERY_SERVER_URL` when running `npm run build:ios`.

## PC backup and restore

Each provider home offers **Back up this phone** or **Restore from PC** on first
use, with phone/backup counts, and confirms the initial choice. Later home visits
back up silently. An unreachable PC is silent: no setup prompt and no
notification; the next home visit retries. Access, validation and storage errors
stay visible until dismissed or a successful retry. A restored phone gets a new
independent ID; the original backup stays intact. Favorites, saved searches,
pagination and all reader scroll positions are included. Home content does not
wait for the PC, and backup networking never occupies the worker queue used for
favorite/progress writes. See [PC backups](server/BACKUPS.md); check
`npm run backups:status` before formatting the phone.

## Testing

```bash
npm run test:unit
npm run test:server
npx tsc --noEmit -p apps/ios/tsconfig.json
```

Physical checks run on the phone with ios-tools' inspector; see `apps/ios/PORT.md`.
