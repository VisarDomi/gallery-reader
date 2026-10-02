# PC backups

Hitomi and Imhen (and the userscript) back up their favorites, saved searches,
pagination and scroll positions to this repository's PC server, on HTTPS port
7722. Favorites sync to Gallery Downloader (port 7777) is separate.

- On first use the app compares its data with the PC backups and offers **Back up
  this phone** or **Restore from PC**; later home visits back up silently. An
  unreachable PC is silent, and no setup prompt appears until it answers.
- `GET /api/reader-backups/gallery-reader/<provider>` lists the phones' backups;
  `PUT …/<provider>/<installation-id>` saves one.
- Each phone has its own file, `<provider>/<installation-id>.json`, holding the
  current and at most one previous snapshot in one atomic file. Identical retries
  do not rotate; a stale revision gets 409; unexpectedly empty data cannot replace
  a nonempty backup.
- Restore writes a new, independent backup ID; the restored-from backup is never
  modified.

The service is the systemd user unit `gallery-reader-backups.service` (a copy is in this folder); it runs
`server/backups.mjs` with the PC's mkcert certificate
(`~/.local/share/mkcert/pwa`). Data and the access key live in
`~/.local/share/gallery-reader/backups/` (mode 0700/0600, never in Git). The server
creates the key on first start; builds read it from there unless
`VITE_READER_BACKUP_KEY` is set (see `.env.example`). Built bundles contain the
key: never publish them. Keep that folder, key included, when moving the service
to another PC; a new key means rebuilding the apps.

```sh
systemctl --user status gallery-reader-backups.service --no-pager
npm run backups:status   # what each phone saved (counts, labels and dates only)
npm run test:server
```

Every response is `no-store`; requests without the key get 401, and CORS allows
only hitomi.la and imhentai.xxx. Files are written durably: temporary file, fsync, rename,
directory fsync. This is a local-PC backup, not protection against losing the PC.
