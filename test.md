# Behavior tests

`test.txt` remains user-owned and has not been changed.

## Local checks

```bash
npx tsc --noEmit
node scripts/build.mjs --no-increase-version
npm run test:unit
npm run test:browser
```

The browser tests run in disposable Chromium profiles with synthetic provider
responses and a real disposable PC backup store. They prove these outcomes:

- 560 existing favorites, saved searches and scroll positions survive migration.
- Repeating migration cannot overwrite committed data.
- A waiting/unavailable backup PC does not stop home rendering or typing.
- Initial setup confirms success; routine home backups save silently, including
  changed data. An offline PC/timeouts cause no dialog or notification on fresh
  or enrolled phones. Online rejection errors warn; successful retries clear them.
- Favorite edits survive a reload, with current and previous server snapshots.
- Source thumbnails open full-size originals in the reader, including native
  Hitomi hash formats that may be present before takeover.
- A fresh browser restores an independent copy without altering the source backup.
- Worker-only IndexedDB and restored data survive a browser reload.

Unit tests cover validation, setup choices and explicit startup boundaries; they
are not a substitute for the full UI and real Safari checks.

## Real iPhone UI and bfcache

Disable the installed readers, enable the universal debugger, and keep Safari
unlocked/foregrounded. Build first, then run:

```bash
npm run tests
```

This uses the existing migrated favorites, opens a decoded thumbnail, verifies
that an original renders, then uses real Back. Hitomi requires `pageshow.persisted`,
the original row/strip DOM objects, and unchanged vertical/horizontal positions.
IMHentai reports its known bfcache limitation separately, without failing the
reader test or claiming that a new document was a cache restoration.
It never reinjects after Back, so a reload cannot falsely pass as bfcache.
It does not toggle favorites, import data, change progress, or clear storage.
The controlled tab returns to example.com and the bridge closes in `finally`.

### Actual Safari results — 2026-09-07

Both provider homes rendered source thumbnails and both readers decoded full
originals (381 pages in the selected Hitomi gallery, 359 in IMHentai). Hitomi
passed native bfcache, original DOM identity, and exact scroll restoration.

IMHentai **failed** the bfcache assertion: Back loaded a new native home document.
The same happened without Gallery Reader, and with a minimal document takeover
containing no workers or storage. Safari's same-origin HTTP probe received
`Cache-Control: no-store, no-cache, must-revalidate` from IMHentai. This matches
[WebKit's HTTPS no-store exclusion](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/history/BackForwardCache.cpp#L144).
This is recorded as an explicit bfcache skip, not a pass, and is not hidden by
reinjecting after Back. If IMHentai does restore from bfcache in a future browser
or provider version, the same DOM/scroll assertions as Hitomi apply. Isolate it with:

```bash
npm run tests -- --site imhentai.xxx
node tests/ios/imhentai-back-diagnostic.mjs
```

The diagnostic compares the native home and a minimal takeover without touching
reader storage. A userscript cannot remove the main document's response header;
no custom navigation/back UI was introduced to work around this limitation.

## Explicitly authorized migration and PC backup

```bash
npm run phone:backup
# Or one provider:
npm run phone:backup -- --site imhentai
```

This is an operation, not a destructive restore test. It visits all eight
provider homes across Gallery Reader and Manga Reader, audits counts/hashes,
injects the builds, selects **Back up this phone** when necessary, and compares
the persisted PC snapshot with the actual phone data. It never clears phone
storage or chooses Restore. Its audit reads IndexedDB inside a temporary worker;
only hashes/counts return to the controller. Names and access keys stay private.

The old localStorage-mutating phone runners were retired because they could no
longer restore the application's authoritative IndexedDB state. Their previous
behavior remains in Git history; personal data and `test.txt` were not removed.

See [backup operations and the verified phone counts](../gallery-downloader/READER-BACKUPS.md).
