#!/usr/bin/env node
// PC backups for Hitomi and Imhen: HTTPS on port 7722, a private access key,
// and per-phone files holding the current and at most one previous snapshot.
//   node server/backups.mjs          serve
//   node server/backups.mjs status   print received backups (counts and labels only)
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PORT = 7722;
export const ROOT = path.join(os.homedir(), '.local/share/gallery-reader/backups');
const APP = 'gallery-reader';
const PROVIDERS = ['hitomi', 'imhentai'];
const LIMIT = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function privateDirectory(directory) {
    if (fs.existsSync(directory)) return;
    const parent = path.dirname(directory);
    privateDirectory(parent);
    fs.mkdirSync(directory, { mode: 0o700 });
    syncDirectory(parent);
}

function syncDirectory(directory) {
    const descriptor = fs.openSync(directory, 'r');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

/** Write, fsync, rename, and fsync the parent directory. */
function durableWrite(file, text) {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
        fs.writeFileSync(descriptor, text);
        fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    try { fs.renameSync(temporary, file); } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
    syncDirectory(path.dirname(file));
}

/** Favorites + saved searches; also rejects malformed snapshots. */
export function contentCount(data) {
    if (data?.version !== 1) throw new Error('Invalid snapshot version');
    const state = data.indexedDB;
    if (!state) throw new Error('Missing gallery IndexedDB snapshot');
    const ids = state.favorites;
    if (!Array.isArray(ids) || !ids.every(id => Number.isSafeInteger(id) && id > 0) || !Array.isArray(state.searches)) throw new Error('Invalid favorites/searches');
    if (!Number.isInteger(state.page) || Number(state.page) < 1 || !state.scroll || typeof state.scroll !== 'object') throw new Error('Invalid page/scroll positions');
    return ids.length + state.searches.length;
}

export class BackupStore {
    constructor(root) { this.root = root; privateDirectory(root); }
    directory(provider) {
        if (!PROVIDERS.includes(provider)) throw new Error('Unknown provider');
        return path.join(this.root, provider);
    }
    file(provider, id) {
        if (!uuid.test(id)) throw new Error('Invalid backup ID');
        return path.join(this.directory(provider), `${id}.json`);
    }
    read(provider, id) {
        try { return JSON.parse(fs.readFileSync(this.file(provider, id), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    list(provider) {
        const directory = this.directory(provider);
        if (!fs.existsSync(directory)) return [];
        return fs.readdirSync(directory).filter(name => name.endsWith('.json'))
            .map(name => this.read(provider, name.slice(0, -5)))
            .sort((a, b) => b.current.savedAt.localeCompare(a.current.savedAt));
    }
    put(provider, id, body) {
        const file = this.file(provider, id);
        if (typeof body?.label !== 'string' || !body.label.trim() || body.label.length > 80) throw new Error('Invalid backup name');
        const count = contentCount(body.data);
        const old = this.read(provider, id);
        // An idempotent retry after a lost acknowledgement must not rotate history.
        if (old && JSON.stringify(old.current.data) === JSON.stringify(body.data)) return old;
        if ((old?.current.revision ?? null) !== body.baseRevision) throw new Error('CONFLICT: backup changed; reload home before retrying');
        if (old && count === 0 && contentCount(old.current.data) > 0) throw new Error('CONFLICT: local data is now empty; revisit home to choose Backup or Restore. Existing backup preserved.');
        const backup = {
            id, label: body.label.trim(),
            current: { revision: randomUUID(), savedAt: new Date().toISOString(), data: body.data },
            previous: old?.current ?? null,
        };
        // Both generations live in ONE atomic file; a power loss cannot split rotation and publication.
        privateDirectory(path.dirname(file));
        durableWrite(file, JSON.stringify(backup));
        return backup;
    }
}

function send(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => { size += chunk.length; if (size <= LIMIT) chunks.push(chunk); });
        req.on('end', () => size > LIMIT ? reject(Object.assign(new Error('Backup too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** Request handler for /api/reader-backups/gallery-reader/<provider>[/<id>]. */
export function handler(root) {
    const store = new BackupStore(root);
    const keyFile = path.join(root, 'access-key');
    if (!fs.existsSync(keyFile)) durableWrite(keyFile, randomBytes(32).toString('hex'));
    const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim());
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const supplied = Buffer.from(String(req.headers['x-reader-backup-key'] ?? ''));
        if (key.length !== supplied.length || !timingSafeEqual(key, supplied)) return send(res, 401, { error: 'Backup access key required' });
        try {
            const parts = new URL(req.url, 'https://localhost').pathname.split('/').filter(Boolean).map(decodeURIComponent);
            if (parts[0] !== 'api' || parts[1] !== 'reader-backups' || parts[2] !== APP) return send(res, 404, { error: 'Not found' });
            const [provider, id] = parts.slice(3);
            if (req.method === 'GET' && parts.length === 4) return send(res, 200, store.list(provider));
            if (req.method === 'PUT' && parts.length === 5) {
                let body;
                try { body = JSON.parse(await readBody(req)); } catch (error) { return send(res, error.status ?? 400, { error: String(error) }); }
                return send(res, 200, store.put(provider, id, body));
            }
            return send(res, 404, { error: 'Not found' });
        } catch (error) {
            return send(res, String(error).includes('CONFLICT:') ? 409 : 400, { error: String(error) });
        }
    };
}

function status(root) {
    const store = new BackupStore(root);
    const rows = PROVIDERS.flatMap(provider => store.list(provider).map(backup => ({
        provider, phone: backup.label, id: backup.id.slice(0, 8), saved: backup.current.savedAt,
        records: `${backup.current.data.indexedDB.favorites.length} favorites; ${backup.current.data.indexedDB.searches.length} searches`,
        previous: backup.previous?.savedAt ?? 'none',
    })));
    if (rows.length) console.table(rows);
    else console.log('No phone backups received yet.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv[2] === 'status') status(ROOT);
    else {
        const tls = { key: fs.readFileSync(path.join(os.homedir(), '.local/share/mkcert/pwa/key.pem')),
                      cert: fs.readFileSync(path.join(os.homedir(), '.local/share/mkcert/pwa/cert.pem')) };
        const handle = handler(ROOT);
        https.createServer(tls, (req, res) => {
            res.on('finish', () => console.log(req.method, new URL(req.url, 'https://localhost').pathname.replace(/[0-9a-f-]{36}$/i, id => id.slice(0, 8)), res.statusCode));
            handle(req, res);
        }).listen(PORT, '0.0.0.0', () => console.log('Gallery Reader backups on port ' + PORT));
    }
}
