# PC backups

Hitomi and Imhen back up their favorites and saved searches to this server, on HTTPS port
7722. The favorites sync to Gallery Downloader (port 7777) is separate. The app side is in
[apps/ios/README.md](../apps/ios/README.md) ("The PC").

- On first use the app compares its data with the PC backups and offers **Back up this
  phone** or **Restore from PC**; later visits to the favorites back up silently. An
  unreachable PC is silent, and no setup prompt appears until it answers.
- `GET /api/reader-backups/gallery-reader/<provider>` lists the phones' backups, newest
  first; `PUT …/<provider>/<installation-id>` saves one (`{label, data, baseRevision}`).
  Providers: `hitomi`, `imhentai`.
- `data` is `{version: 1, indexedDB: {favorites, searches, page, scroll}}` (the web
  version's record, which the apps still send). Malformed data is rejected; bodies over
  5 MB get 413.
- Each phone has its own file, `<provider>/<installation-id>.json`, holding the current and
  at most one previous snapshot in one atomic file. Identical retries do not rotate; a stale
  revision gets 409; unexpectedly empty data cannot replace a nonempty backup.
- Restore writes a new, independent backup ID; the restored-from backup is never modified.

The service is the systemd user unit `gallery-reader-backups.service` (a copy is in this
folder; its `ExecStart` names the nvm Node binary). It runs `server/backups.mjs` with the
PC's mkcert certificate (`~/.local/share/mkcert/pwa`). Data and the access key live in
`~/.local/share/gallery-reader/backups/` (mode 0700/0600, never in Git). The server creates
the key on first start; builds read it from there unless `VITE_READER_BACKUP_KEY` is set (see
`.env.example`). Built app bundles contain the key: never publish them. Keep that folder,
key included, when moving the service to another PC; a new key means rebuilding the apps.

```sh
systemctl --user status gallery-reader-backups.service --no-pager
npm run backups:status   # what each phone saved (counts, labels and dates only)
npm run test:server
```

Requests carry the key in `X-Reader-Backup-Key`; without it they get 401. Every response is
`no-store`. Files are written durably: temporary file, fsync, rename, directory fsync. This
is a local-PC backup, not protection against losing the PC. Check `npm run backups:status`
before formatting the phone.
